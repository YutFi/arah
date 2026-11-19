import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// MapLibre 6 runs map parsing in a separate worker file. Bundlers do not copy it
// next to the app code on their own, so we give MapLibre its address explicitly.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { haversine, type LatLng, type Poi, type Route } from "@arah/core";
import { config } from "../lib/config";
import { CATEGORY_UI, iconSvg } from "../lib/categories";
import type { RouteMarks } from "../lib/routeMarks";

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
  /** Traffic lights, cameras and toll plazas on the chosen route (route preview only). */
  marks: RouteMarks | null;
  /** Numbered pins for the stops of a multi-stop trip. */
  stops: { lat: number; lng: number; n: number; done: boolean }[];
}

maplibregl.setWorkerUrl(workerUrl);

/** Lights are small dots; draw at most this many so a very long route stays smooth. */
const MAX_LIGHT_MARKERS = 400;

/** Traffic light: dark housing with red, amber and green lamps (sized by CSS). */
const lightSvg =
  '<svg viewBox="0 0 16 26" aria-hidden="true"><rect x="1" y="1" width="14" height="24" rx="5" fill="#1f2937" stroke="#fff" stroke-width="1.6"/><circle cx="8" cy="7" r="3" fill="#ef4444"/><circle cx="8" cy="13" r="3" fill="#fbbf24"/><circle cx="8" cy="19" r="3" fill="#22c55e"/></svg>';

const markSvgAttrs = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

/**
 * Room kept for a sheet earlier (place card) is still on the camera. fitBounds
 * adds its own padding on top, and when the two together are taller than the
 * screen MapLibre refuses to move at all ("cannot fit within canvas"). Start clean.
 */
function clearCameraPadding(m: maplibregl.Map) {
  m.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
}

const angleDiff = (from: number, to: number) => ((((to - from) % 360) + 540) % 360) - 180;

const toLine = (r: Route) => r.points.map((p) => [p.lng, p.lat] as [number, number]);

export const MapView = forwardRef<MapHandle, Props>(function MapView(
  { routes, selected, dest, user, navigating, follow, onUserMove, pois, selectedPoiId, onPoiClick, onLongPress, onMoveEnd, marks, stops },
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
  const motion = useRef({
    shown: { lat: 0, lng: 0, heading: 0 },
    from: { lat: 0, lng: 0, heading: 0 },
    to: { lat: 0, lng: 0, heading: 0 },
    t0: 0,
    dur: 1000,
    lastFixAt: 0,
    last: 0,
    camBearing: 0,
    raf: 0,
  });
  const poiMarkers = useRef(new Map<string, maplibregl.Marker>());
  const markMarkers = useRef<Map<string, maplibregl.Marker>>(new Map());
  const lastRoutes = useRef<Route[] | null>(null);
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
      clearCameraPadding(m);
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
        id: "routes-glow",
        type: "line",
        source: "routes",
        filter: ["==", ["get", "sel"], 1],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#2f7bff", "line-width": 22, "line-opacity": 0.3, "line-blur": 12 },
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
      if (motion.current.raf) cancelAnimationFrame(motion.current.raf);
      motion.current.raf = 0;
      userMarker.current?.remove();
      userMarker.current = null;
      destMarker.current?.remove();
      for (const mk of poiMarkers.current.values()) mk.remove();
      poiMarkers.current.clear();
      for (const mk of markMarkers.current.values()) mk.remove();
      markMarkers.current.clear();
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

  // ---- routes: draw them. New routes: frame all of them. Picking one: zoom to it ----
  useEffect(() => {
    pushRoutes();
    const m = map.current;
    const routesChanged = lastRoutes.current !== routes;
    lastRoutes.current = routes;
    if (!m || navigating || routes.length === 0) return;
    const chosen = routes[selected] ?? routes[0];
    const shown = routesChanged || !chosen ? routes : [chosen];
    const b = new maplibregl.LngLatBounds();
    for (const r of shown) for (const p of r.points) b.extend([p.lng, p.lat]);
    clearCameraPadding(m);
    // The route sheet is at most 52% of the screen tall; keep the route above it.
    const bottom = Math.round(window.innerHeight * 0.52) + 24;
    m.fitBounds(b, { padding: { top: 90, bottom, left: 36, right: 36 }, maxZoom: 17, duration: 700 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routes, selected]);

  // ---- route marks: traffic light icons, cameras and toll plazas (pins) -----
  // Marks are matched by position so that moving the window along the route while
  // driving only adds or removes the few that changed (no flicker, no extra work).
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const have = markMarkers.current;
    const want = new Map<string, { lat: number; lng: number; make: () => HTMLElement }>();
    if (marks) {
      const sizeClass = navigating ? " nav" : "";
      for (const p of marks.signals.slice(0, MAX_LIGHT_MARKERS)) {
        want.set(`s${navigating ? "n" : "p"}:${p.lat},${p.lng}`, {
          ...p,
          make: () => {
            const node = document.createElement("div");
            node.className = `mark signal${sizeClass}`;
            node.setAttribute("role", "img");
            node.setAttribute("aria-label", "Traffic light");
            node.innerHTML = lightSvg;
            return node;
          },
        });
      }
      for (const c of marks.cameras) {
        want.set(`c:${c.lat},${c.lng}`, {
          ...c,
          make: () => {
            const node = document.createElement("div");
            node.className = "mark camera";
            node.setAttribute("role", "img");
            node.setAttribute("aria-label", c.maxspeed ? `Speed camera mapped on OpenStreetMap, limit ${c.maxspeed}` : "Speed camera mapped on OpenStreetMap");
            node.innerHTML = `<svg ${markSvgAttrs} width="15" height="15"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>`;
            return node;
          },
        });
      }
      for (const a of marks.awas) {
        want.set(`a:${a.id}`, {
          ...a,
          make: () => {
            const node = document.createElement("div");
            node.className = "mark camera awas";
            node.setAttribute("role", "img");
            node.setAttribute("aria-label", a.speedLimitKph ? `AwAS speed camera from the JPJ list, approximate position, limit ${a.speedLimitKph}` : "AwAS speed camera from the JPJ list, approximate position");
            node.innerHTML = `<svg ${markSvgAttrs} width="15" height="15"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg><span>AwAS</span>`;
            return node;
          },
        });
      }
      for (const t of marks.tolls) {
        want.set(`t:${t.lat},${t.lng}`, {
          ...t,
          make: () => {
            const node = document.createElement("div");
            node.className = `mark toll${t.rm != null ? " priced" : ""}`;
            node.setAttribute("role", "img");
            node.setAttribute("aria-label", t.rm != null ? `Toll plaza ${t.name}, about RM ${t.rm.toFixed(2)}` : `Toll plaza ${t.name}, price not available`);
            node.innerHTML = `<svg ${markSvgAttrs} width="14" height="14"><path d="M3 20h18M6 20V9l6-5 6 5v11M10 20v-6h4v6"/></svg>${t.rm != null ? `<span>RM ${t.rm.toFixed(2)}</span>` : ""}`;
            return node;
          },
        });
      }
    }
    for (const [k, mk] of have) {
      if (!want.has(k)) {
        mk.remove();
        have.delete(k);
      }
    }
    for (const [k, w] of want) {
      if (have.has(k)) continue;
      have.set(k, new maplibregl.Marker({ element: w.make() }).setLngLat([w.lng, w.lat]).addTo(m));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marks, navigating]);

  // ---- numbered pins for the stops of a trip -------------------------------
  const stopMarkers = useRef<maplibregl.Marker[]>([]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const mk of stopMarkers.current) mk.remove();
    stopMarkers.current = stops.map((s) => {
      const node = document.createElement("div");
      node.className = `stop-pin${s.done ? " done" : ""}`;
      node.setAttribute("role", "img");
      node.setAttribute("aria-label", `Stop ${s.n}`);
      node.textContent = s.done ? "✓" : String(s.n);
      return new maplibregl.Marker({ element: node }).setLngLat([s.lng, s.lat]).addTo(m);
    });
  }, [stops]);

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

  // ---- your position: glide between GPS fixes ---------------------------------
  // A GPS fix arrives about once a second. Setting the arrow to each fix makes it jump,
  // and easing the camera separately makes the arrow wobble on screen. Instead, one
  // animation loop moves the arrow, its heading and the camera together every frame.
  const uLat = user?.lat;
  const uLng = user?.lng;
  const uHead = user?.heading;
  useEffect(() => {
    const m = map.current;
    if (!m || uLat == null || uLng == null) return;
    const mo = motion.current;
    const now = performance.now();
    const head = uHead != null && !Number.isNaN(uHead) ? uHead : mo.to.heading;

    if (!userMarker.current) {
      const node = document.createElement("div");
      node.className = "user-marker";
      node.innerHTML = '<div class="user-pulse"></div><svg viewBox="0 0 40 40" width="40" height="40"><path d="M20 4 L31 33 L20 26 L9 33 Z" fill="#2f7bff" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg>';
      userMarker.current = new maplibregl.Marker({ element: node, rotationAlignment: "map", pitchAlignment: "map" }).setLngLat([uLng, uLat]).addTo(m);
      mo.shown = { lat: uLat, lng: uLng, heading: head };
      mo.from = { ...mo.shown };
      mo.to = { ...mo.shown };
      mo.camBearing = head;
      userMarker.current.setRotation(head);
    } else {
      // Far from where the arrow is (new route snap, GPS jump): move at once. Otherwise glide.
      const far = haversine(mo.shown, { lat: uLat, lng: uLng }) > 400;
      mo.from = far ? { lat: uLat, lng: uLng, heading: head } : { ...mo.shown };
      mo.dur = Math.min(1400, Math.max(350, now - mo.lastFixAt));
      mo.t0 = now;
      mo.to = { lat: uLat, lng: uLng, heading: head };
      if (far) mo.shown = { ...mo.to };
    }
    mo.lastFixAt = now;

    if (!navigating && !centered.current && routes.length === 0) {
      centered.current = true;
      m.jumpTo({ center: [uLng, uLat], zoom: 15 });
    }
    startLoop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uLat, uLng, uHead, navigating, follow]);

  function startLoop() {
    const mo = motion.current;
    if (mo.raf) return;
    mo.last = performance.now();
    mo.raf = requestAnimationFrame(frame);
  }

  function frame(ts: number) {
    const mo = motion.current;
    const m = map.current;
    const marker = userMarker.current;
    mo.raf = 0;
    if (!m || !marker) return;
    const dt = Math.min(0.1, Math.max(0.001, (ts - mo.last) / 1000));
    mo.last = ts;

    const p = Math.min(1, Math.max(0, (ts - mo.t0) / mo.dur));
    mo.shown.lat = mo.from.lat + (mo.to.lat - mo.from.lat) * p;
    mo.shown.lng = mo.from.lng + (mo.to.lng - mo.from.lng) * p;
    mo.shown.heading = mo.from.heading + angleDiff(mo.from.heading, mo.to.heading) * p;
    marker.setLngLat([mo.shown.lng, mo.shown.lat]);
    marker.setRotation(mo.shown.heading);

    let busy = p < 1;
    const { navigating: nav, follow: fol } = latest.current;
    if (nav && fol) {
      // Camera follows the arrow itself, and eases its zoom, tilt and bearing (no stop-start).
      const k = 1 - Math.exp(-dt / 0.45);
      mo.camBearing += angleDiff(mo.camBearing, mo.shown.heading) * k;
      const z = m.getZoom();
      const pt = m.getPitch();
      const pad = m.getPadding().top ?? 0;
      const nz = z + (17 - z) * k;
      const np = pt + (55 - pt) * k;
      const npad = pad + (240 - pad) * k;
      m.jumpTo({ center: [mo.shown.lng, mo.shown.lat], bearing: mo.camBearing, zoom: nz, pitch: np, padding: { top: npad, bottom: 0, left: 0, right: 0 } });
      if (Math.abs(17 - nz) > 0.01 || Math.abs(55 - np) > 0.2 || Math.abs(240 - npad) > 0.5 || Math.abs(angleDiff(mo.camBearing, mo.shown.heading)) > 0.2) busy = true;
    }
    if (busy) mo.raf = requestAnimationFrame(frame);
  }

  // ---- leaving navigation: flatten the view ---------------------------------
  useEffect(() => {
    const m = map.current;
    if (!m || navigating) return;
    m.easeTo({ pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 500 });
  }, [navigating]);

  return <div ref={el} className="map" />;
});
