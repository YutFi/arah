import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createNavigator,
  haversine,
  matchCamerasToRoute,
  nearestPerCategory,
  pointAtDistance,
  upcomingCameras,
  type CategoryId,
  type Fix,
  type LatLng,
  type NavUpdate,
  type Poi,
  type Route,
  DEFAULT_RADIUS_M,
} from "@arah/core";
import { MapView, type MapHandle } from "./components/MapView";
import { buildMarks } from "./lib/routeMarks";
import { SearchPanel } from "./components/SearchPanel";
import { RoutePreview } from "./components/RoutePreview";
import { NavHud } from "./components/NavHud";
import { AboutSheet } from "./components/AboutSheet";
import { PlaceCard } from "./components/PlaceCard";
import { NearbySheet } from "./components/NearbySheet";
import { PrayerSheet } from "./components/PrayerSheet";
import { Splash } from "./components/Splash";
import { LocationHelp, LocationPrimer } from "./components/LocationHelp";
import { onLocationPermissionChange, queryLocationPermission } from "./lib/permission";
import { useGeolocation } from "./lib/useGeolocation";
import { fetchRoutes } from "./lib/routing";
import { loadAwas, type AwasState } from "./lib/awasData";
import { voice, wakeLock } from "./lib/device";
import { reversePlace, type Place } from "./lib/geocode";
import { useNearby } from "./lib/useNearby";
import { fetchRouteFeatures, type StatsState } from "./lib/routeStats";
import { config } from "./lib/config";
import { maneuverText, useT } from "./lib/i18n";
import { hhmm, nextPrayer } from "./lib/prayer";
import { readShared } from "./lib/share";
import { savePlace, type SavedPlace } from "./lib/saved";

type Phase = "browse" | "preview" | "navigating";
const SIM_SPEEDS = [50, 120, 300];
const ARRIVAL_TYPES = new Set([4, 5, 6]);
const MAX_PER_CATEGORY = 35;

const poiToPlace = (p: Poi): Place => ({
  id: p.id,
  name: p.name,
  detail: p.address ?? "",
  lat: p.lat,
  lng: p.lng,
  kind: "poi",
  category: p.category,
  sub: p.sub,
  hours: p.hours,
  phone: p.phone,
});

export default function App() {
  const { t, lang } = useT();
  const geo = useGeolocation();
  const mapRef = useRef<MapHandle>(null);
  const selPlaceRef = useRef<Place | null>(null);

  const [phase, setPhase] = useState<Phase>("browse");
  const [dest, setDest] = useState<Place | null>(null);
  const [origin, setOrigin] = useState<{ pos: LatLng; fromGps: boolean } | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [sel, setSel] = useState(0);
  const [avoidTolls, setAvoidTolls] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [follow, setFollow] = useState(true);
  const [simulate, setSimulate] = useState(false);
  const [simSpeed, setSimSpeed] = useState(0); // index into SIM_SPEEDS
  const [simFix, setSimFix] = useState<Fix | null>(null);
  const [nav, setNav] = useState<NavUpdate | null>(null);
  const [rerouting, setRerouting] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [about, setAbout] = useState(false);
  const [prayerOpen, setPrayerOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60000));
  const [splashDone, setSplashDone] = useState(false);
  const [locUI, setLocUI] = useState<"none" | "primer" | "help">("none");
  const [awas, setAwas] = useState<AwasState>({ status: "loading", cameras: [], skipped: 0 });
  const [selPlace, setSelPlace] = useState<Place | null>(null);
  const [naming, setNaming] = useState(false);
  const [stats, setStats] = useState<StatsState>({ status: "idle" });
  const [viewCenter, setViewCenter] = useState<LatLng | null>(null);

  const announced = useRef(new Set<string>());
  const rerouteBusy = useRef(false);
  const lastReroute = useRef(0);
  const simSpeedRef = useRef(SIM_SPEEDS[0] as number);
  simSpeedRef.current = SIM_SPEEDS[simSpeed] as number;

  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  selPlaceRef.current = selPlace;
  const fitNext = useRef(false);
  const geoFixRef = useRef(geo.fix);
  geoFixRef.current = geo.fix;

  const nearby = useNearby((found, center) => {
    if (!fitNext.current) return;
    fitNext.current = false;
    const from = geoFixRef.current ?? center;
    const near = nearestPerCategory(found, from, 6).slice(0, 15);
    if (near.length === 0) return;
    const pts: LatLng[] = [...near];
    if (geoFixRef.current) pts.push({ lat: geoFixRef.current.lat, lng: geoFixRef.current.lng });
    mapRef.current?.fit(pts, Math.round(window.innerHeight * 0.4));
  });

  const route: Route | null = routes[sel] ?? null;
  const live: Fix | null = phase === "navigating" && simulate ? simFix : geo.fix;

  useEffect(() => {
    void loadAwas().then(setAwas);
  }, []);

  // Spoken language follows the language setting.
  useEffect(() => {
    voice.lang = lang === "ms" ? "ms-MY" : "en-US";
  }, [lang]);

  // Keeps the "next prayer" chip current.
  useEffect(() => {
    const id = setInterval(() => setMinute(Math.floor(Date.now() / 60000)), 30000);
    return () => clearInterval(id);
  }, []);

  const flash = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg((cur) => (cur === msg ? null : cur)), 3500);
  }, []);

  // ---- location permission: explain first, then ask, then guide if blocked ---
  const startGeo = geo.start;
  useEffect(() => {
    if (!splashDone) return;
    let cancelled = false;
    void queryLocationPermission().then((p) => {
      if (cancelled) return;
      if (p === "granted") startGeo(false);
      else if (p === "denied") setLocUI("help");
      else setLocUI("primer");
    });
    const off = onLocationPermissionChange((p) => {
      if (p === "granted") {
        setLocUI("none");
        startGeo(false);
      }
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [splashDone, startGeo]);

  useEffect(() => {
    if (geo.status === "active") setLocUI("none");
    else if (geo.status === "denied") setLocUI((u) => (u === "primer" ? "help" : u));
  }, [geo.status]);

  // ---- routes for the chosen destination ------------------------------------
  useEffect(() => {
    if (phase !== "preview" || !dest || !origin) return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetchRoutes({ from: origin.pos, to: dest, avoidTolls }, ac.signal)
      .then((rs) => {
        setRoutes(rs);
        setSel(0);
      })
      .catch((e: Error) => {
        if (e.name === "AbortError") return;
        setRoutes([]);
        setError(e.message);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [phase, dest, origin, avoidTolls]);

  // Count traffic lights, cameras and toll plazas on the routes being previewed.
  useEffect(() => {
    if (phase !== "preview" || routes.length === 0) {
      setStats({ status: "idle" });
      return;
    }
    const ac = new AbortController();
    setStats({ status: "loading" });
    fetchRouteFeatures(routes, ac.signal)
      .then((list) => !ac.signal.aborted && setStats({ status: "loaded", list }))
      .catch((e: Error) => {
        if (e.name !== "AbortError") setStats({ status: "error", message: e.message });
      });
    return () => ac.abort();
  }, [phase, routes]);

  // If we started from the map centre and a GPS fix then arrives, switch to it.
  useEffect(() => {
    if (phase === "preview" && origin && !origin.fromGps && geo.fix) {
      setOrigin({ pos: { lat: geo.fix.lat, lng: geo.fix.lng }, fromGps: true });
    }
  }, [phase, origin, geo.fix]);

  /** Show a place on the map first (pin + details), like other map apps. */
  const showPlace = useCallback((p: Place) => {
    setSelPlace(p);
    mapRef.current?.focus(p, 300);
  }, []);

  // Opened from a share link (?to=lat,lng&n=Name): show that place once.
  const sharedHandled = useRef(false);
  useEffect(() => {
    if (!splashDone || sharedHandled.current) return;
    sharedHandled.current = true;
    if (!window.location.search.includes("to=")) return;
    const s = readShared(window.location.search);
    if (!s) {
      flash(t("toast.sharedBad"));
      return;
    }
    try {
      window.history.replaceState(null, "", window.location.pathname);
    } catch {
      /* ignore */
    }
    showPlace({ id: `shared-${s.lat}-${s.lng}`, name: s.name ?? t("search.pinned"), detail: "", lat: s.lat, lng: s.lng, kind: "pin", unnamed: !s.name });
  }, [splashDone, showPlace, flash, t]);

  const closePlace = useCallback(() => {
    setSelPlace(null);
    mapRef.current?.clearPadding();
  }, []);

  /** "Directions" on the place card: ask for routes to it. */
  const startRoute = useCallback(
    (p: Place) => {
      geo.start(false); // user just tapped: a good moment for the permission prompt
      setSelPlace(null);
      setDest(p);
      setRoutes([]);
      setError(null);
      setOrigin(
        geo.fix
          ? { pos: { lat: geo.fix.lat, lng: geo.fix.lng }, fromGps: true }
          : { pos: mapRef.current?.getCenter() ?? { lat: 3.139, lng: 101.6869 }, fromGps: false },
      );
      setPhase("preview");
    },
    [geo],
  );

  // A pin the person dropped, or typed as coordinates: ask what is there.
  const pinId = selPlace?.kind === "pin" && selPlace.unnamed ? selPlace.id : null;
  useEffect(() => {
    if (!pinId) {
      setNaming(false);
      return;
    }
    const ac = new AbortController();
    setNaming(true);
    const at = selPlaceRef.current;
    if (!at) return;
    reversePlace(at, ac.signal)
      .then((r) => {
        if (!r || ac.signal.aborted) return;
        setSelPlace((cur) => (cur && cur.id === pinId ? { ...cur, name: r.name, detail: r.detail, unnamed: false } : cur));
      })
      .catch(() => {
        /* keep the generic pin name and the coordinates */
      })
      .finally(() => {
        if (!ac.signal.aborted) setNaming(false);
      });
    return () => ac.abort();
  }, [pinId]);

  const searchOrigin = (): LatLng => {
    const c = mapRef.current?.getCenter() ?? config.defaultCenter;
    const u = geo.fix;
    return u && haversine(u, c) < 1500 ? { lat: u.lat, lng: u.lng } : c;
  };

  const toggleCategory = (id: CategoryId) => {
    geo.start(false);
    if (!nearby.active.includes(id)) fitNext.current = true;
    nearby.toggle(id, searchOrigin());
  };

  const dropPin = useCallback(
    (at: LatLng) => {
      if (phaseRef.current !== "browse") return;
      showPlace({ id: `pin-${at.lat.toFixed(6)}-${at.lng.toFixed(6)}`, name: t("search.pinned"), detail: "", lat: at.lat, lng: at.lng, kind: "pin", unnamed: true });
    },
    [showPlace, t],
  );

  const cancelPreview = useCallback(() => {
    setPhase("browse");
    setDest(null);
    setRoutes([]);
    setOrigin(null);
    setError(null);
  }, []);

  // ---- navigation -------------------------------------------------------------
  const tracker = useMemo(() => (phase === "navigating" && route ? createNavigator(route) : null), [phase, route]);

  const startNavigation = (sim: boolean) => {
    voice.unlock();
    voice.enabled = voiceOn;
    announced.current.clear();
    setSimulate(sim);
    setSimFix(null);
    setNav(null);
    setFollow(true);
    setPhase("navigating");
    if (!sim) geo.start(true);
    void wakeLock.on();
  };

  const stopNavigation = () => {
    setPhase("browse");
    setDest(null);
    setRoutes([]);
    setOrigin(null);
    setNav(null);
    setSimulate(false);
    setSimFix(null);
    voice.cancel();
    void wakeLock.off();
    geo.start(false);
  };

  // Simulated GPS: walk along the route at the chosen speed.
  useEffect(() => {
    if (phase !== "navigating" || !simulate || !route) return;
    let dist = 0;
    const tick = () => {
      const mps = simSpeedRef.current / 3.6;
      const p = pointAtDistance(route, dist);
      setSimFix({ ...p.point, heading: p.bearing, speedMps: mps, accuracyM: 5, timestamp: Date.now() });
      if (dist >= route.lengthM) clearInterval(id); // the last fix is clamped to the end of the route
      dist += mps;
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [phase, simulate, route]);

  // Every new position: update progress.
  useEffect(() => {
    if (phase !== "navigating" || !tracker || !live) return;
    setNav(tracker.update(live));
  }, [live, tracker, phase]);

  // Off route for a few fixes in a row: ask for a new route from here.
  useEffect(() => {
    if (nav?.status !== "off-route" || simulate || !dest || !live || rerouteBusy.current) return;
    if (Date.now() - lastReroute.current < 8000) return;
    rerouteBusy.current = true;
    lastReroute.current = Date.now();
    setRerouting(true);
    fetchRoutes({ from: live, to: dest, avoidTolls, alternates: 0 })
      .then((rs) => {
        if (rs[0]) {
          announced.current.clear();
          setRoutes([rs[0]]);
          setSel(0);
          voice.speak(t("voice.updated"));
        }
      })
      .catch(() => {
        /* try again on a later fix */
      })
      .finally(() => {
        rerouteBusy.current = false;
        setRerouting(false);
      });
  }, [nav, simulate, dest, live, avoidTolls, t]);

  // ---- speed cameras on this route -------------------------------------------
  const cameraMatches = useMemo(
    () => (route && awas.cameras.length > 0 && phase === "navigating" ? matchCamerasToRoute(route, awas.cameras) : []),
    [route, awas.cameras, phase],
  );
  const alerts = nav && cameraMatches.length > 0 ? upcomingCameras(cameraMatches, nav.distanceAlongM, 1000) : [];
  const alert = alerts[0] ?? null;

  // ---- voice -----------------------------------------------------------------
  useEffect(() => {
    if (phase !== "navigating" || !nav || !route) return;
    const said = announced.current;

    if (nav.status === "arrived") {
      if (!said.has("arrived")) {
        said.add("arrived");
        voice.speak(t("voice.arrived"));
      }
      return;
    }
    if (alert && alert.distanceAheadM <= 500 && !said.has(`cam:${alert.camera.id}`)) {
      said.add(`cam:${alert.camera.id}`);
      const limit = alert.camera.speedLimitKph ? t("voice.camLimit", { n: alert.camera.speedLimitKph }) : "";
      voice.speak(t("voice.cam", { limit }));
      return;
    }
    const idx = nav.nextManeuverIndex;
    const m = idx != null ? route.maneuvers[idx] : undefined;
    if (idx == null || !m || ARRIVAL_TYPES.has(m.type)) return;
    const d = nav.distanceToNextM ?? Infinity;
    const near = Math.min(250, Math.max(100, ((live?.speedMps ?? 0) || 0) * 7));
    const text = lang === "ms" ? maneuverText(m) : (m.verbalPre ?? m.instruction);
    if (d <= near && !said.has(`${idx}:near`)) {
      said.add(`${idx}:near`);
      said.add(`${idx}:far`);
      voice.speak(text);
    } else if (d <= 600 && d > near && !said.has(`${idx}:far`)) {
      said.add(`${idx}:far`);
      voice.speak(t("voice.in", { n: Math.max(100, Math.round(d / 100) * 100), text: `${text.charAt(0).toLowerCase()}${text.slice(1)}` }));
    }
  }, [nav, route, phase, alert, live?.speedMps, lang, t]);

  const onLocate = () => {
    if (geo.status === "denied") {
      setLocUI("help");
      return;
    }
    geo.start(false);
    mapRef.current?.recenter();
  };

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    voice.enabled = next;
  };

  // ---- prayer times: from your position, else the map centre ------------------
  const prayerPos: LatLng = geo.fix ? { lat: geo.fix.lat, lng: geo.fix.lng } : (viewCenter ?? config.defaultCenter);
  const prayerLabel = useMemo(() => {
    try {
      const n = nextPrayer(prayerPos.lat, prayerPos.lng, new Date());
      return `${t(`prayer.${n.id}`)} ${hhmm(n.at)}`;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.round(prayerPos.lat * 10), Math.round(prayerPos.lng * 10), minute, lang]);

  const pickSaved = (s: SavedPlace) => showPlace({ id: s.id, name: s.name, detail: "", lat: s.lat, lng: s.lng, kind: "search" });
  const parkHere = () => {
    if (!geo.fix) {
      geo.start(false);
      flash(t("saved.parkNoGps"));
      return;
    }
    savePlace("parked", t("saved.parked"), geo.fix.lat, geo.fix.lng);
    flash(t("toast.parked"));
    showPlace({ id: `parked-${Date.now()}`, name: t("saved.parked"), detail: "", lat: geo.fix.lat, lng: geo.fix.lng, kind: "search" });
  };

  const maneuver = nav && route && nav.nextManeuverIndex != null ? (route.maneuvers[nav.nextManeuverIndex] ?? null) : null;
  const navigating = phase === "navigating";
  const userForMap =
    navigating && nav && nav.status === "on-route" && live
      ? { ...nav.snapped, heading: live.heading }
      : live
        ? { lat: live.lat, lng: live.lng, heading: live.heading }
        : null;

  // ---- nearby places: what to draw and list --------------------------------
  const nearbyFrom: LatLng | null = geo.fix ?? nearby.center;
  const fromYou = !!(geo.fix && nearby.center && haversine(geo.fix, nearby.center) < 600);
  const listFrom: LatLng | null = fromYou && geo.fix ? geo.fix : nearby.center;
  const visiblePois = useMemo(
    () => (listFrom ? nearestPerCategory(nearby.pois, listFrom, MAX_PER_CATEGORY) : []),
    [nearby.pois, listFrom],
  );
  const browse = phase === "browse";
  const showSearchHere =
    browse && !selPlace && nearby.active.length > 0 && nearby.status !== "loading" && !!viewCenter && !!nearby.center && haversine(viewCenter, nearby.center) > DEFAULT_RADIUS_M / 2;
  const routeMarks = useMemo(() => {
    if (phase !== "preview" || stats.status !== "loaded") return null;
    const f = stats.list[sel];
    return f ? buildMarks(f) : null;
  }, [phase, stats, sel]);
  const placeDistance = selPlace && nearbyFrom !== null && geo.fix ? haversine(geo.fix, selPlace) : null;

  return (
    <div className="app">
      <MapView
        ref={mapRef}
        routes={routes}
        selected={sel}
        dest={dest ?? (selPlace?.kind === "poi" ? null : selPlace)}
        user={userForMap}
        navigating={navigating}
        follow={follow}
        onUserMove={() => setFollow(false)}
        pois={browse ? visiblePois : []}
        selectedPoiId={selPlace?.kind === "poi" ? selPlace.id : null}
        onPoiClick={(p) => showPlace(poiToPlace(p))}
        onLongPress={dropPin}
        marks={routeMarks}
        onMoveEnd={(c) => {
          if (phaseRef.current === "browse") setViewCenter(c);
        }}
      />

      {phase === "browse" && (
        <SearchPanel
          near={geo.fix}
          onPick={showPlace}
          onAbout={() => setAbout(true)}
          active={nearby.active}
          onToggleCategory={toggleCategory}
          onPrayer={() => setPrayerOpen(true)}
          prayerLabel={prayerLabel}
          onPickSaved={pickSaved}
          onParkHere={parkHere}
        />
      )}

      {browse && (
        <div className="stack">
          <div className="stack-tools">
            {showSearchHere && viewCenter && (
              <button className="pill" onClick={() => nearby.searchHere(viewCenter)}>{t("nearby.searchHere")}</button>
            )}
            <button className="round" aria-label={t("loc.showMine")} onClick={onLocate}>◎</button>
          </div>
          {geo.status === "denied" && locUI === "none" && (
            <button className="toast" onClick={() => setLocUI("help")}>
              {t("loc.off")} <u>{t("loc.turnOn")}</u>
            </button>
          )}
          {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
          {selPlace ? (
            <PlaceCard
              place={selPlace}
              distanceM={placeDistance}
              naming={naming}
              onDirections={() => startRoute(selPlace)}
              onClose={closePlace}
            />
          ) : nearby.active.length > 0 && listFrom ? (
            <NearbySheet
              pois={visiblePois}
              from={listFrom}
              fromYou={fromYou}
              status={nearby.status}
              error={nearby.error}
              activeCount={nearby.active.length}
              onPick={(p) => showPlace(poiToPlace(p))}
              onRetry={nearby.retry}
              onClose={nearby.clear}
            />
          ) : nearby.active.length > 0 ? (
            <div className="sheet nearby"><div className="note">{nearby.status === "error" ? nearby.error : t("nearby.loading")}</div></div>
          ) : null}
        </div>
      )}
      {phase === "preview" && (
        <button
          className="round locate top"
          aria-label={t("loc.showMine")}
          onClick={onLocate}
        >
          ◎
        </button>
      )}

      {phase === "preview" && dest && (
        <RoutePreview
          dest={dest}
          routes={routes}
          selected={sel}
          onSelect={setSel}
          loading={loading}
          error={error}
          avoidTolls={avoidTolls}
          onToggleTolls={setAvoidTolls}
          startsFromGps={origin?.fromGps ?? false}
          onUseLocation={() => geo.start(false)}
          onStart={startNavigation}
          onCancel={cancelPreview}
          stats={stats}
          awasCounts={awas.cameras.length > 0 ? routes.map((r) => matchCamerasToRoute(r, awas.cameras).length) : null}
        />
      )}

      {navigating && (
        <NavHud
          nav={nav}
          maneuver={maneuver}
          speedMps={live?.speedMps}
          simulating={simulate}
          simSpeedKph={SIM_SPEEDS[simSpeed] as number}
          onSimSpeed={() => setSimSpeed((i) => (i + 1) % SIM_SPEEDS.length)}
          alert={alert}
          rerouting={rerouting}
          gpsWeak={(geo.fix?.accuracyM ?? 0) > 50}
          voiceOn={voiceOn}
          onVoice={toggleVoice}
          showRecenter={!follow}
          onRecenter={() => setFollow(true)}
          onStop={stopNavigation}
        />
      )}

      {about && <AboutSheet awas={awas} onClose={() => setAbout(false)} />}
      {prayerOpen && <PrayerSheet lat={prayerPos.lat} lng={prayerPos.lng} fromYou={!!geo.fix} onClose={() => setPrayerOpen(false)} />}

      {locUI === "primer" && (
        <LocationPrimer
          onAllow={() => geo.start(false)}
          onSkip={() => setLocUI("none")}
        />
      )}
      {locUI === "help" && (
        <LocationHelp
          onRetry={() => {
            geo.start(false);
            void queryLocationPermission().then((p) => p === "granted" && setLocUI("none"));
          }}
          onClose={() => setLocUI("none")}
        />
      )}

      {!splashDone && <Splash onDone={() => setSplashDone(true)} />}
    </div>
  );
}
