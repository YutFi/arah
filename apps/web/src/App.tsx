import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createNavigator,
  matchCamerasToRoute,
  pointAtDistance,
  upcomingCameras,
  type Fix,
  type LatLng,
  type NavUpdate,
  type Route,
} from "@arah/core";
import { MapView, type MapHandle } from "./components/MapView";
import { SearchPanel } from "./components/SearchPanel";
import { RoutePreview } from "./components/RoutePreview";
import { NavHud } from "./components/NavHud";
import { AboutSheet } from "./components/AboutSheet";
import { useGeolocation } from "./lib/useGeolocation";
import { fetchRoutes } from "./lib/routing";
import { loadAwas, type AwasState } from "./lib/awasData";
import { voice, wakeLock } from "./lib/device";
import type { Place } from "./lib/geocode";

type Phase = "browse" | "preview" | "navigating";
const SIM_SPEEDS = [50, 120, 300];
const ARRIVAL_TYPES = new Set([4, 5, 6]);

export default function App() {
  const geo = useGeolocation();
  const mapRef = useRef<MapHandle>(null);

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
  const [awas, setAwas] = useState<AwasState>({ status: "loading", cameras: [], skipped: 0 });

  const announced = useRef(new Set<string>());
  const rerouteBusy = useRef(false);
  const lastReroute = useRef(0);
  const simSpeedRef = useRef(SIM_SPEEDS[0] as number);
  simSpeedRef.current = SIM_SPEEDS[simSpeed] as number;

  const route: Route | null = routes[sel] ?? null;
  const live: Fix | null = phase === "navigating" && simulate ? simFix : geo.fix;

  useEffect(() => {
    void loadAwas().then(setAwas);
  }, []);

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

  // If we started from the map centre and a GPS fix then arrives, switch to it.
  useEffect(() => {
    if (phase === "preview" && origin && !origin.fromGps && geo.fix) {
      setOrigin({ pos: { lat: geo.fix.lat, lng: geo.fix.lng }, fromGps: true });
    }
  }, [phase, origin, geo.fix]);

  const pickPlace = useCallback(
    (p: Place) => {
      geo.start(false); // user just tapped: a good moment for the permission prompt
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
          voice.speak("Route updated.");
        }
      })
      .catch(() => {
        /* try again on a later fix */
      })
      .finally(() => {
        rerouteBusy.current = false;
        setRerouting(false);
      });
  }, [nav, simulate, dest, live, avoidTolls]);

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
        voice.speak("You have arrived at your destination.");
      }
      return;
    }
    if (alert && alert.distanceAheadM <= 500 && !said.has(`cam:${alert.camera.id}`)) {
      said.add(`cam:${alert.camera.id}`);
      const limit = alert.camera.speedLimitKph ? `, limit ${alert.camera.speedLimitKph}` : "";
      voice.speak(`Speed camera ahead${limit}.`);
      return;
    }
    const idx = nav.nextManeuverIndex;
    const m = idx != null ? route.maneuvers[idx] : undefined;
    if (idx == null || !m || ARRIVAL_TYPES.has(m.type)) return;
    const d = nav.distanceToNextM ?? Infinity;
    const near = Math.min(250, Math.max(100, ((live?.speedMps ?? 0) || 0) * 7));
    const text = m.verbalPre ?? m.instruction;
    if (d <= near && !said.has(`${idx}:near`)) {
      said.add(`${idx}:near`);
      said.add(`${idx}:far`);
      voice.speak(text);
    } else if (d <= 600 && d > near && !said.has(`${idx}:far`)) {
      said.add(`${idx}:far`);
      voice.speak(`In ${Math.max(100, Math.round(d / 100) * 100)} metres, ${text.charAt(0).toLowerCase()}${text.slice(1)}`);
    }
  }, [nav, route, phase, alert, live?.speedMps]);

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceOn(next);
    voice.enabled = next;
  };

  const maneuver = nav && route && nav.nextManeuverIndex != null ? (route.maneuvers[nav.nextManeuverIndex] ?? null) : null;
  const navigating = phase === "navigating";
  const userForMap =
    navigating && nav && nav.status === "on-route" && live
      ? { ...nav.snapped, heading: live.heading }
      : live
        ? { lat: live.lat, lng: live.lng, heading: live.heading }
        : null;

  return (
    <div className="app">
      <MapView
        ref={mapRef}
        routes={routes}
        selected={sel}
        dest={dest}
        user={userForMap}
        navigating={navigating}
        follow={follow}
        onUserMove={() => setFollow(false)}
      />

      {phase === "browse" && (
        <SearchPanel near={geo.fix} onPick={pickPlace} onAbout={() => setAbout(true)} />
      )}

      {phase !== "navigating" && (
        <button
          className="round locate"
          aria-label="Show my location"
          onClick={() => {
            geo.start(false);
            mapRef.current?.recenter();
          }}
          style={{ bottom: phase === "preview" ? "auto" : "max(24px, env(safe-area-inset-bottom))", top: phase === "preview" ? "max(16px, env(safe-area-inset-top))" : "auto" }}
        >
          ◎
        </button>
      )}
      {geo.status === "denied" && phase !== "navigating" && (
        <div className="toast">Location is blocked. Allow it in your browser settings to see where you are.</div>
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
    </div>
  );
}
