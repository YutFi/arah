import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre 6 runs map parsing in a separate worker file. Bundlers do not copy it
// next to the app code on their own, so we give MapLibre its address explicitly.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import type { LatLng, Poi, Route } from "@arah/core";
import { config } from "../lib/config";
import { CATEGORY_UI, iconSvg } from "../lib/categories";

export interface MapHandle {
  getCenter(): LatLng;
  recenter(): void;
  /** Frame these points, leaving `bottom` pixels free for a sheet. */
  fit(points: LatLng[], bottom: number): void;
  /** Bring one point into view above a sheet of `bottom` pixels. */
  focus(point: LatLng, bottom: number): void;
  /** Remove the room kept for a sheet. */
  clearPadding(): void;
}

interface Props {
  routes: Route[];
  selected: number;
  dest: LatLng | null;
  user: (LatLng & { heading?: number | null }) | null;
  navigating: boolean;
  follow: boolean;
  /** Called when the person drags or rotates the map by hand. */
  onUserMove: () => void;
  /** Places of interest to show as icons. */
  pois: Poi[];
  selectedPoiId: string | null;
  onPoiClick: (p: Poi) => void;
  /** Long-press (or right-click) on the map: the person wants to drop a pin. */
  onLongPress: (p: LatLng) => void;
  /** The map stopped moving. */
  onMoveEnd: (center: LatLng) => void;
}

maplibregl.setWorkerUrl(workerUrl);

const toLine = (r: Route) => r.points.map((p) => [p.lng, p.lat] as [number, number]);

export const MapView = forwardRef<MapHandle, Props>(function MapView(
  { routes, selected, dest, user, navigating, follow, onUserMove, pois, selectedPoiId, onPoiClick, onLongPress, onMoveEnd },
  ref,
) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const userMarker = useRef<maplibregl.Marker | null>(null);
  const destMarker = useRef<maplibregl.Marker | null>(null);
  const centered = useRef(false);
  const latest = useRef({ routes, selected, user, navigating, follow });
  latest.current = { routes, selected, user, navigating, follow };
  const onMove = useRef(onUserMove);
  onMove.current = onUserMove;
  const poiMarkers = useRef(new Map<string, maplibregl.Marker>());
  const cb = useRef({ onPoiClick, onLongPress, onMoveEnd });
  cb.current = { onPoiClick, onLongPress, onMoveEnd };

  useImperativeHandle(ref, () => ({
    getCenter() {
      const c = map.current?.getCenter();
      return c ? { lat: c.lat, lng: c.lng } : config.defaultCenter;
    },
    recenter() {
      const u = latest.current.user;
      if (u && map.current) map.current.easeTo({ center: [u.lng, u.lat], zoom: Math.max(map.current.getZoom(), 15), duration: 600 });
    },
    fit(points, bottom) {
      const m = map.current;
      if (!m || points.length === 0) return;
      const b = new maplibregl.LngLatBounds();
      for (const p of points) b.extend([p.lng, p.lat]);
      m.fitBounds(b, { padding: { top: 190, bottom: bottom + 30, left: 40, right: 40 }, maxZoom: 16, duration: 700 });
    },
    focus(point, bottom) {
      const m = map.current;
      if (!m) return;
      m.easeTo({
        center: [point.lng, point.lat],
        zoom: Math.max(m.getZoom(), 15),
        padding: { top: 120, bottom, left: 0, right: 0 },
        duration: 600,
      });
    },
    clearPadding() {
      map.current?.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 300 });
    },
  }));

  // ---- create the map once --------------------------------------------------
  useEffect(() => {
    if (!el.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: config.styleUrl,
      center: [config.defaultCenter.lng, config.defaultCenter.lat],
      zoom: config.defaultZoom,
      attributionControl: { compact: true },
      // Keep the pitch gesture for navigation, but stop accidental two-finger tilting.
      pitchWithRotate: false,
    });
    map.current = m;

    m.on("load", () => {
      m.addSource("routes", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "routes-alt",
        type: "line",
        source: "routes",
        filter: ["==", ["get", "sel"], 0],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#8a94a6", "line-width": 6, "line-opacity": 0.9 },
      });
      m.addLayer({
        id: "routes-casing",
        type: "line",
        source: "routes",
        filter: ["==", ["get", "sel"], 1],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#0a3fa8", "line-width": 11 },
      });
      m.addLayer({
        id: "routes-main",
        type: "line",
        source: "routes",
        filter: ["==", ["get", "sel"], 1],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#2f7bff", "line-width": 7 },
      });
      ready.current = true;
      pushRoutes();
    });

    m.on("dragstart", (e) => {
      if ((e as { originalEvent?: unknown }).originalEvent) onMove.current();
    });
    m.on("rotatestart", (e) => {
      if ((e as { originalEvent?: unknown }).originalEvent) onMove.current();
    });
    m.on("moveend", () => {
      const c = m.getCenter();
      cb.current.onMoveEnd({ lat: c.lat, lng: c.lng });
    });

    // Long-press to drop a pin (right-click on a computer). A drag, a second
    // finger or a zoom cancels it, so panning never drops a pin by accident.
    let pressTimer: ReturnType<typeof setTimeout> | undefined;
    let pressStart: maplibregl.Point | undefined;
    const cancelPress = () => {
      if (pressTimer) clearTimeout(pressTimer);
      pressTimer = undefined;
    };
    m.on("touchstart", (e) => {
      cancelPress();
      if (latest.current.navigating || e.points.length !== 1) return;
      pressStart = e.point;
      const at = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      pressTimer = setTimeout(() => {
        pressTimer = undefined;
        navigator.vibrate?.(15);
        cb.current.onLongPress(at);
      }, 600);
    });
    m.on("touchmove", (e) => {
      if (pressStart && e.point.dist(pressStart) > 10) cancelPress();
    });
    for (const ev of ["touchend", "touchcancel", "dragstart", "zoomstart", "rotatestart"] as const) m.on(ev, cancelPress);
    m.on("contextmenu", (e) => {
      if (!latest.current.navigating) cb.current.onLongPress({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    // A missing tile or style hiccup must never crash the app.
    m.on("error", () => {});

    return () => {
      cancelPress();
      userMarker.current?.remove();
      destMarker.current?.remove();
      for (const mk of poiMarkers.current.values()) mk.remove();
      poiMarkers.current.clear();
      m.remove();
      map.current = null;
      ready.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pushRoutes() {
    const m = map.current;
    if (!m || !ready.current) return;
    const { routes: rs, selected: sel } = latest.current;
    const src = m.getSource("routes") as maplibregl.GeoJSONSource | undefined;
    src?.setData({
      type: "FeatureCollection",
      features: rs.map((r, i) => ({
        type: "Feature" as const,
        properties: { sel: i === sel ? 1 : 0 },
        geometry: { type: "LineString" as const, coordinates: toLine(r) },
      })),
    });
  }

  // ---- routes: draw, and frame them when previewing -------------------------
  useEffect(() => {
    pushRoutes();
    const m = map.current;
    if (!m || navigating || routes.length === 0) return;
    const b = new maplibregl.LngLatBounds();
    for (const r of routes) for (const p of r.points) b.extend([p.lng, p.lat]);
    m.fitBounds(b, { padding: { top: 90, bottom: 380, left: 36, right: 36 }, maxZoom: 16, duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, selected]);

  // ---- destination pin ------------------------------------------------------
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    destMarker.current?.remove();
    destMarker.current = null;
    if (dest) destMarker.current = new maplibregl.Marker({ color: "#e5484d" }).setLngLat([dest.lng, dest.lat]).addTo(m);
  }, [dest]);

  // ---- places of interest: icon markers ------------------------------------
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const markers = poiMarkers.current;
    const keep = new Set(pois.map((p) => p.id));
    for (const [id, mk] of markers) {
      if (!keep.has(id)) {
        mk.remove();
        markers.delete(id);
      }
    }
    for (const p of pois) {
      if (markers.has(p.id)) continue;
      const node = document.createElement("button");
      node.type = "button";
      node.className = "poi-marker";
      node.setAttribute("aria-label", `${p.name}, ${p.sub}`);
      node.style.setProperty("--cat", CATEGORY_UI[p.category].color);
      node.innerHTML = iconSvg(p.category, 17);
      node.addEventListener("click", (ev) => {
        ev.stopPropagation();
        cb.current.onPoiClick(p);
      });
      markers.set(p.id, new maplibregl.Marker({ element: node }).setLngLat([p.lng, p.lat]).addTo(m));
    }
  }, [pois]);

  useEffect(() => {
    for (const [id, mk] of poiMarkers.current) mk.getElement().classList.toggle("selected", id === selectedPoiId);
  }, [selectedPoiId, pois]);

  // ---- your position --------------------------------------------------------
  useEffect(() => {
    const m = map.current;
    if (!m || !user) return;
    if (!userMarker.current) {
      const node = document.createElement("div");
      node.className = "user-marker";
      node.innerHTML = '<div class="user-pulse"></div><svg viewBox="0 0 40 40" width="40" height="40"><path d="M20 4 L31 33 L20 26 L9 33 Z" fill="#2f7bff" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg>';
      userMarker.current = new maplibregl.Marker({ element: node, rotationAlignment: "map", pitchAlignment: "map" })
        .setLngLat([user.lng, user.lat])
        .addTo(m);
    }
    userMarker.current.setLngLat([user.lng, user.lat]);
    if (user.heading != null && !Number.isNaN(user.heading)) userMarker.current.setRotation(user.heading);

    if (navigating && follow) {
      m.easeTo({
        center: [user.lng, user.lat],
        zoom: 17,
        pitch: 55,
        bearing: user.heading != null && !Number.isNaN(user.heading) ? user.heading : m.getBearing(),
        padding: { top: 240, bottom: 0, left: 0, right: 0 },
        duration: 900,
        easing: (t) => t,
      });
    } else if (!centered.current && routes.length === 0 && !navigating) {
      centered.current = true;
      m.jumpTo({ center: [user.lng, user.lat], zoom: 15 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, navigating, follow]);

  // ---- leaving navigation: flatten the view ---------------------------------
  useEffect(() => {
    const m = map.current;
    if (!m || navigating) return;
    m.easeTo({ pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 500 });
  }, [navigating]);

  return <div ref={el} className="map" />;
});
