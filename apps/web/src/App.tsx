import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addStop,
  avoidAheadPolygon,
  bearing,
  createJamDetector,
  createNavigator,
  hasStop,
  haversine,
  laneStatus,
  matchCamerasToRoute,
  motorcycleNotes,
  moveStop,
  movePoint,
  nearestFirst,
  nearestPerCategory,
  pointAtDistance,
  removeStop,
  sameSpot,
  signalsAhead,
  typicalSpeedKph,
  upcomingCameras,
  type CategoryId,
  type Fix,
  type LatLng,
  type NavUpdate,
  type RouteFeatures,
  type Poi,
  type Route,
  DEFAULT_RADIUS_M,
  MAX_TRIP_STOPS,
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
import { RerouteSheet, type RerouteState } from "./components/RerouteSheet";
import { TrafficSheet } from "./components/TrafficSheet";
import { NextStopPrompt, TripBar, TripSheet } from "./components/TripSheet";
import { Splash } from "./components/Splash";
import { LocationHelp, LocationPrimer } from "./components/LocationHelp";
import { onLocationPermissionChange, queryLocationPermission } from "./lib/permission";
import { useGeolocation } from "./lib/useGeolocation";
import { fetchReroute, fetchRerouteOptions, fetchRouteChoices, fetchRoutes, fetchTripTotals } from "./lib/routing";
import { setVehicle, useVehicle } from "./lib/vehicleStore";
import { AWAS_LOOKAHEAD_M, AWAS_MATCH, loadAwas, type AwasState } from "./lib/awasData";
import { voice, wakeLock } from "./lib/device";
import { reversePlace, type Place } from "./lib/geocode";
import { useNearby } from "./lib/useNearby";
import { fetchRouteFeatures, type StatsState } from "./lib/routeStats";
import { config } from "./lib/config";
import { maneuverText, useT } from "./lib/i18n";
import { hhmm, nextPrayer } from "./lib/prayer";
import { readShared } from "./lib/share";
import { savePlace, type SavedPlace } from "./lib/saved";
import { loadTrip, saveTrip } from "./lib/tripStore";
import { LocateIcon } from "./components/icons";

type Phase = "browse" | "preview" | "navigating";
const SIM_SPEEDS = [50, 120, 300, 5]; // 5 km/h is a crawl, to try the slow-traffic prompt
/** Driving map: how far ahead lights/cameras are drawn, and how often the set is refreshed. */
const MARK_AHEAD_M = 1500;
const MARK_STEP_M = 150;
const AVOID_AHEAD_M = 1500;
// Only the test build sets this (a shorter wait before the slow-traffic prompt).
const JAM_WINDOW_S = Number(import.meta.env.VITE_JAM_WINDOW_S) || undefined;
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
  // idle: on route. busy: asking for a new route. retry: the last ask failed, trying again.
  const [rerouteStatus, setRerouteStatus] = useState<"idle" | "busy" | "retry">("idle");
  const [retryTick, setRetryTick] = useState(0);
  const [voiceOn, setVoiceOn] = useState(true);
  const [about, setAbout] = useState(false);
  const [prayerOpen, setPrayerOpen] = useState(false);
  const [trafficOpen, setTrafficOpen] = useState(false);
  const [jam, setJam] = useState<{ movedM: number; spanS: number } | null>(null);
  const [reroute, setReroute] = useState<RerouteState | null>(null);
  const rerouteAc = useRef<AbortController | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60000));
  const [splashDone, setSplashDone] = useState(false);
  const [locUI, setLocUI] = useState<"none" | "primer" | "help">("none");
  const [awas, setAwas] = useState<AwasState>({ status: "loading", cameras: [], skipped: 0 });
  const [selPlace, setSelPlace] = useState<Place | null>(null);
  const [naming, setNaming] = useState(false);
  const [stats, setStats] = useState<StatsState>({ status: "idle" });
  /** Lights, cameras and toll plazas on the route being driven (looked up again after a reroute). */
  const [navFeatures, setNavFeatures] = useState<RouteFeatures | null>(null);
  const [viewCenter, setViewCenter] = useState<LatLng | null>(null);
  // ---- multi-stop trip: stops in order, which one we are heading to, and the arrival popup ----
  const [trip, setTrip] = useState<Place[]>(() => loadTrip());
  const [tripRun, setTripRun] = useState(false);
  const [stopIdx, setStopIdx] = useState(0);
  const [tripOpen, setTripOpen] = useState(false);
  const [tripTotals, setTripTotals] = useState<{ lengthM: number; durationS: number } | null | undefined>(undefined);
  const [arrivalPrompt, setArrivalPrompt] = useState<"ask" | "busy" | "error" | null>(null);

  const vehicle = useVehicle();
  /** The vehicle the routes on screen were asked for. Clicks apply at once; typing a size waits a moment. */
  const [routeVehicle, setRouteVehicle] = useState(vehicle);
  const announced = useRef(new Set<string>());
  const rerouteBusy = useRef(false);
  const lastReroute = useRef(0);
  const rerouteFails = useRef(0);
  const rerouteSpoken = useRef(false);
  const rerouteAbort = useRef<AbortController | null>(null);
  const prevFix = useRef<Fix | null>(null);
  /** Simulated drive: the next tick leaves the route (to try the wrong-turn reroute). */
  const wrongTurnReq = useRef(false);
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

  // The vehicle changed: ask again at once for a new type or axle count, after a short pause while a size is being typed.
  useEffect(() => {
    if (vehicle === routeVehicle) return;
    if (vehicle.type !== routeVehicle.type || vehicle.truck.axles !== routeVehicle.truck.axles) {
      setRouteVehicle(vehicle);
      return;
    }
    const id = setTimeout(() => setRouteVehicle(vehicle), 800);
    return () => clearTimeout(id);
  }, [vehicle, routeVehicle]);

  // ---- routes for the chosen destination ------------------------------------
  useEffect(() => {
    if (phase !== "preview" || !dest || !origin) return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetchRouteChoices({ from: origin.pos, to: dest, avoidTolls, vehicle: routeVehicle }, ac.signal)
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
  }, [phase, dest, origin, avoidTolls, routeVehicle]);

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

  useEffect(() => saveTrip(trip), [trip]);

  // Whole-trip length and time, shown while previewing a multi-stop trip.
  useEffect(() => {
    if (!tripRun || phase !== "preview" || !origin || trip.length - stopIdx < 2) {
      setTripTotals(undefined);
      return;
    }
    const ac = new AbortController();
    setTripTotals(undefined);
    fetchTripTotals(origin.pos, trip.slice(stopIdx), avoidTolls, routeVehicle, ac.signal)
      .then((r) => !ac.signal.aborted && setTripTotals(r))
      .catch(() => {
        /* no total shown; the trip itself is not affected */
      });
    return () => ac.abort();
  }, [tripRun, phase, origin, trip, stopIdx, avoidTolls, routeVehicle]);

  // Reached a stop that is not the last: ask, and keep asking until answered.
  useEffect(() => {
    if (phase !== "navigating" || !tripRun || nav?.status !== "arrived") return;
    if (stopIdx >= trip.length - 1) return; // the last stop is an ordinary arrival
    setArrivalPrompt((cur) => cur ?? "ask");
  }, [phase, tripRun, nav?.status, stopIdx, trip.length]);

  // While driving: the same lookup for the route in use, so lights can be drawn and counted ahead.
  useEffect(() => {
    if (phase !== "navigating" || !route) {
      setNavFeatures(null);
      return;
    }
    const ac = new AbortController();
    setNavFeatures(null);
    fetchRouteFeatures([route], ac.signal)
      .then((list) => !ac.signal.aborted && setNavFeatures(list[0] ?? null))
      .catch(() => {
        /* no icons then; driving is not affected */
      });
    return () => ac.abort();
  }, [phase, route]);

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

  /** Open the route preview for a place. */
  const beginPreview = useCallback(
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

  /** "Directions" on the place card: a one-off route to just that place. */
  const startRoute = useCallback(
    (p: Place) => {
      setTripRun(false);
      beginPreview(p);
    },
    [beginPreview],
  );

  // ---- multi-stop trip ----------------------------------------------------------
  const tripToggle = (p: Place) => {
    if (hasStop(trip, p)) {
      setTrip(trip.filter((s) => s.id !== p.id && !sameSpot(s, p)));
      return;
    }
    const r = addStop(trip, p);
    if (!r.ok) {
      flash(r.reason === "full" ? t("trip.full", { n: MAX_TRIP_STOPS }) : t("trip.dup"));
      return;
    }
    setTrip(r.list);
    flash(t("trip.added", { n: r.list.length }));
    closePlace();
  };

  const startTrip = () => {
    const first = trip[0];
    if (!first) return;
    setTripOpen(false);
    setTripRun(true);
    setStopIdx(0);
    beginPreview(first);
  };

  /** Route from where you are to stop `idx`, then drive to it. Used by the arrival popup and by "go to this stop now". */
  const goToStop = (idx: number) => {
    const target = trip[idx];
    if (!target) return;
    const from: LatLng = live ? { lat: live.lat, lng: live.lng } : (dest ?? target);
    setArrivalPrompt((cur) => (cur ? "busy" : cur));
    fetchRoutes({ from, to: target, avoidTolls, vehicle: routeVehicle, alternates: 0 })
      .then((rs) => {
        const next = rs[0];
        if (!next) throw new Error("no route");
        announced.current.clear();
        setStopIdx(idx);
        setDest(target);
        setRoutes([next]);
        setSel(0);
        setNav(null);
        setJam(null);
        setArrivalPrompt(null);
        setTripOpen(false);
      })
      .catch(() => {
        setArrivalPrompt((cur) => (cur ? "error" : cur));
        flash(t("trip.err"));
      });
  };

  const nearestForTrip = () => {
    const from: LatLng = live ?? mapRef.current?.getCenter() ?? { lat: 3.139, lng: 101.6869 };
    setTrip(nearestFirst(from, trip, phase === "navigating" && tripRun ? stopIdx + 1 : 0));
  };

  const clearTrip = () => {
    if (phase === "navigating" && tripRun) {
      stopNavigation();
      return;
    }
    setTrip([]);
    setTripOpen(false);
    if (phase === "preview") cancelPreview();
  };

  /** Closing the list while previewing: make sure the preview is still for the first stop. */
  const closeTripSheet = () => {
    setTripOpen(false);
    if (phase !== "preview" || !tripRun) return;
    const first = trip[0];
    if (!first) cancelPreview();
    else if (first.id !== dest?.id) beginPreview(first);
  };

  const addMoreStops = () => {
    setTripOpen(false);
    if (phase === "preview") cancelPreview();
    flash(t("trip.hint"));
  };

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
    setTripRun(false); // the stops stay in the trip bar; only the route preview closes
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
    setTrip([]);
    setTripRun(false);
    setStopIdx(0);
    setArrivalPrompt(null);
    setTripOpen(false);
    setPhase("browse");
    setDest(null);
    setRoutes([]);
    setOrigin(null);
    setNav(null);
    setSimulate(false);
    setSimFix(null);
    rerouteAc.current?.abort();
    rerouteAbort.current?.abort();
    rerouteBusy.current = false;
    rerouteFails.current = 0;
    rerouteSpoken.current = false;
    setRerouteStatus("idle");
    setReroute(null);
    setJam(null);
    voice.cancel();
    void wakeLock.off();
    geo.start(false);
  };

  // Simulated GPS: walk along the route at the chosen speed. "Test a wrong turn" steers off it at a right angle.
  useEffect(() => {
    if (phase !== "navigating" || !simulate || !route) return;
    let dist = 0;
    let detour: { from: LatLng; bearing: number; dist: number } | null = null;
    wrongTurnReq.current = false;
    const tick = () => {
      const mps = simSpeedRef.current / 3.6;
      const p = pointAtDistance(route, dist);
      if (wrongTurnReq.current && !detour) {
        wrongTurnReq.current = false;
        detour = { from: p.point, bearing: (p.bearing + 90) % 360, dist: 0 };
      }
      if (detour) {
        const v = Math.max(mps, 8); // a wrong turn is not taken at a crawl
        detour.dist += v;
        const at = movePoint(detour.from, detour.bearing, detour.dist);
        setSimFix({ ...at, heading: detour.bearing, speedMps: v, accuracyM: 5, timestamp: Date.now() });
        return;
      }
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

  // Off route: ask for a new route from here, carrying on the way you are facing. At once the first time,
  // then with growing pauses if the server cannot be reached, and say so on screen.
  useEffect(() => {
    if (phase !== "navigating") return;
    if (nav?.status !== "off-route") {
      rerouteFails.current = 0;
      rerouteSpoken.current = false;
      if (!rerouteBusy.current) setRerouteStatus("idle");
      return;
    }
    if (!dest || !live || rerouteBusy.current) return;
    const since = Date.now() - lastReroute.current;
    const wait = rerouteFails.current === 0 ? 1200 : Math.min(15000, 2500 * 2 ** (rerouteFails.current - 1));
    if (since < wait) {
      const id = setTimeout(() => setRetryTick((n) => n + 1), wait - since);
      return () => clearTimeout(id);
    }
    // Heading: the phone's, else worked out from the last position.
    const before = prevFix.current;
    const derived = before && haversine(before, live) >= 8 ? bearing(before, live) : null;
    const heading = live.heading != null && Number.isFinite(live.heading) ? live.heading : derived;
    rerouteBusy.current = true;
    lastReroute.current = Date.now();
    setRerouteStatus("busy");
    if (!rerouteSpoken.current) {
      rerouteSpoken.current = true;
      voice.speak(t("voice.rerouting"));
    }
    const ac = new AbortController();
    rerouteAbort.current = ac;
    fetchReroute({ from: live, to: dest, avoidTolls, vehicle: routeVehicle, heading, speedMps: live.speedMps }, ac.signal)
      .then((r) => {
        if (ac.signal.aborted) return;
        announced.current.clear();
        rerouteFails.current = 0;
        rerouteSpoken.current = false;
        setRoutes([r]);
        setSel(0);
        setNav(null); // wait for the new route's first position before judging again
        setRerouteStatus("idle");
        voice.speak(t("voice.updated"));
      })
      .catch((e: Error) => {
        if (e.name === "AbortError") return;
        rerouteFails.current += 1;
        setRerouteStatus("retry");
        setRetryTick((n) => n + 1);
      })
      .finally(() => {
        rerouteBusy.current = false;
      });
    // not cancelled when the position changes: one ask at a time, finished or abandoned with the trip
  }, [phase, nav, dest, live, avoidTolls, routeVehicle, retryTick, t]);

  // Keeps the last position for working out the direction of travel.
  useEffect(() => {
    prevFix.current = live;
  }, [live?.lat, live?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- stuck in slow traffic? Judged only from your own progress along the route ----
  const detector = useMemo(() => createJamDetector({ windowS: JAM_WINDOW_S }), [route]);
  useEffect(() => {
    if (phase !== "navigating" || !nav || !route || nav.status !== "on-route") return;
    const st = detector.push({
      t: performance.now(),
      alongM: nav.distanceAlongM,
      typicalKph: typicalSpeedKph(route, nav.distanceAlongM),
      remainingM: nav.remainingM,
    });
    setJam((j) => (st.stuck ? (j ?? { movedM: st.movedM, spanS: st.spanS }) : null));
  }, [nav, route, phase, detector]);

  const openReroute = useCallback(() => {
    if (!route || !dest || !live || !nav) return;
    rerouteAc.current?.abort();
    const ac = new AbortController();
    rerouteAc.current = ac;
    setReroute({ status: "loading" });
    fetchRerouteOptions(
      { from: live, to: dest, avoidTolls, vehicle: routeVehicle, avoidArea: avoidAheadPolygon(route, nav.distanceAlongM, 150, AVOID_AHEAD_M), current: route },
      ac.signal,
    )
      .then((options) => !ac.signal.aborted && setReroute({ status: "ready", options }))
      .catch((e: Error) => {
        if (e.name !== "AbortError") setReroute({ status: "error", message: e.message });
      });
  }, [route, dest, live, nav, avoidTolls, routeVehicle]);

  const closeReroute = useCallback(() => {
    rerouteAc.current?.abort();
    setReroute(null);
  }, []);

  const chooseReroute = (r: Route) => {
    rerouteAc.current?.abort();
    announced.current.clear();
    setRoutes([r]);
    setSel(0);
    setReroute(null);
    setJam(null);
    voice.speak(t("voice.updated"));
  };

  const jamFind = () => {
    detector.snooze(performance.now());
    setJam(null);
    openReroute();
  };
  const jamStay = () => {
    detector.snooze(performance.now());
    setJam(null);
  };

  // ---- motorcycle lane on this route ------------------------------------------
  const laneStretches = useMemo(() => (routeVehicle.type === "motorcycle" && route ? motorcycleNotes(route).lanes : []), [routeVehicle.type, route]);
  const laneNow = phase === "navigating" && nav && laneStretches.length > 0 && nav.status !== "arrived" ? laneStatus(laneStretches, nav.distanceAlongM) : null;

  // ---- speed cameras on this route -------------------------------------------
  // Matched on the preview too (to draw the pins); alerts only while navigating.
  const cameraMatches = useMemo(
    () => (route && awas.cameras.length > 0 && (phase === "navigating" || phase === "preview") ? matchCamerasToRoute(route, awas.cameras, AWAS_MATCH) : []),
    [route, awas.cameras, phase],
  );
  const alerts = nav && phase === "navigating" && cameraMatches.length > 0 ? upcomingCameras(cameraMatches, nav.distanceAlongM, AWAS_LOOKAHEAD_M) : [];
  const alert = alerts[0] ?? null;

  // ---- voice -----------------------------------------------------------------
  useEffect(() => {
    if (phase !== "navigating" || !nav || !route) return;
    const said = announced.current;

    if (nav.status === "arrived") {
      if (!said.has("arrived")) {
        said.add("arrived");
        const here = trip[stopIdx];
        const next = trip[stopIdx + 1];
        voice.speak(tripRun && here && next ? t("trip.voice", { a: here.name, b: next.name }) : t("voice.arrived"));
      }
      return;
    }
    // Speak earlier at motorway speed (about 20 s ahead), never closer than 500 m, never farther than the banner.
    const camSpeakM = Math.min(AWAS_LOOKAHEAD_M, Math.max(500, ((live?.speedMps ?? 0) || 0) * 20));
    if (alert && alert.distanceAheadM <= camSpeakM && !said.has(`cam:${alert.camera.id}`)) {
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
  }, [nav, route, phase, alert, live?.speedMps, lang, t, trip, tripRun, stopIdx]);

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
  // While driving, only the next stretch is drawn (and redrawn every ~150 m) so the map stays smooth.
  const alongBucket = nav ? Math.floor(nav.distanceAlongM / MARK_STEP_M) * MARK_STEP_M : 0;
  const routeMarks = useMemo(() => {
    if (phase === "navigating") {
      return navFeatures ? buildMarks(navFeatures, { fromM: alongBucket - 100, toM: alongBucket + MARK_AHEAD_M }, cameraMatches) : null;
    }
    if (phase !== "preview" || stats.status !== "loaded") return null;
    const f = stats.list[sel];
    return f ? buildMarks(f, undefined, cameraMatches) : null;
  }, [phase, stats, sel, navFeatures, alongBucket, cameraMatches]);
  const lightsInfo = useMemo(
    () => (phase === "navigating" && navFeatures && nav && nav.status !== "arrived" ? signalsAhead(navFeatures.signals, nav.distanceAlongM) : null),
    [phase, navFeatures, nav],
  );
  const placeDistance = selPlace && nearbyFrom !== null && geo.fix ? haversine(geo.fix, selPlace) : null;

  const mapStops = useMemo(
    () =>
      trip
        .map((p, i) => ({ lat: p.lat, lng: p.lng, n: i + 1, done: tripRun && phase === "navigating" && i < stopIdx }))
        // the stop being driven to already has the red destination pin
        .filter((s) => !(dest && phase !== "browse" && sameSpot(s, dest))),
    [trip, tripRun, phase, stopIdx, dest],
  );
  const arrivedStop = tripRun ? trip[stopIdx] : undefined;
  const nextStop = tripRun ? trip[stopIdx + 1] : undefined;
  const nextAwayM = arrivedStop && nextStop ? haversine(arrivedStop, nextStop) : null;

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
        stops={mapStops}
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
          onTraffic={() => setTrafficOpen(true)}
        />
      )}

      {browse && (
        <div className="stack">
          <div className="stack-tools">
            {showSearchHere && viewCenter && (
              <button className="pill" onClick={() => nearby.searchHere(viewCenter)}>{t("nearby.searchHere")}</button>
            )}
            <button className="round" aria-label={t("loc.showMine")} onClick={onLocate}><LocateIcon size={24} /></button>
          </div>
          {geo.status === "denied" && locUI === "none" && (
            <button className="toast" onClick={() => setLocUI("help")}>
              {t("loc.off")} <u>{t("loc.turnOn")}</u>
            </button>
          )}
          {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
          {trip.length > 0 && <TripBar count={trip.length} onEdit={() => setTripOpen(true)} onStart={startTrip} />}
          {selPlace ? (
            <PlaceCard
              place={selPlace}
              distanceM={placeDistance}
              naming={naming}
              onDirections={() => startRoute(selPlace)}
              onClose={closePlace}
              inTrip={hasStop(trip, selPlace)}
              onToggleTrip={() => tripToggle(selPlace)}
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
          <LocateIcon size={24} />
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
          vehicle={vehicle}
          onVehicle={setVehicle}
          avoidTolls={avoidTolls}
          onToggleTolls={setAvoidTolls}
          startsFromGps={origin?.fromGps ?? false}
          onUseLocation={() => geo.start(false)}
          onStart={startNavigation}
          onCancel={cancelPreview}
          stats={stats}
          awasCounts={awas.cameras.length > 0 ? routes.map((r) => matchCamerasToRoute(r, awas.cameras, AWAS_MATCH).length) : null}
          trip={
            tripRun
              ? { index: stopIdx, total: trip.length, later: trip.slice(stopIdx + 1).map((p) => p.name), totals: tripTotals, onEdit: () => setTripOpen(true) }
              : null
          }
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
          offRoute={nav?.status === "off-route"}
          rerouteStatus={rerouteStatus}
          lane={laneNow}
          onWrongTurn={() => {
            wrongTurnReq.current = true;
          }}
          jam={reroute ? null : jam}
          onJamFind={jamFind}
          onJamStay={jamStay}
          onReroute={openReroute}
          gpsWeak={(geo.fix?.accuracyM ?? 0) > 50}
          voiceOn={voiceOn}
          onVoice={toggleVoice}
          showRecenter={!follow}
          onRecenter={() => setFollow(true)}
          onStop={stopNavigation}
          lights={lightsInfo}
          tripPill={tripRun && trip[stopIdx] ? { i: stopIdx + 1, n: trip.length, name: trip[stopIdx]!.name } : null}
          onTrip={() => setTripOpen(true)}
        />
      )}

      {reroute && nav && (
        <RerouteSheet
          state={reroute}
          currentLeftS={nav.remainingS}
          avoidKm={AVOID_AHEAD_M / 1000}
          at={live ? { lat: live.lat, lng: live.lng } : prayerPos}
          onUse={chooseReroute}
          onClose={closeReroute}
        />
      )}
      {tripOpen && (
        <TripSheet
          stops={trip}
          current={phase === "navigating" && tripRun ? stopIdx : null}
          onMove={(i, d) => setTrip((l) => moveStop(l, i, d))}
          onRemove={(i) => setTrip((l) => removeStop(l, i))}
          onNearest={nearestForTrip}
          onClear={clearTrip}
          onAddMore={addMoreStops}
          onGoTo={goToStop}
          onClose={closeTripSheet}
        />
      )}
      {arrivalPrompt && phase === "navigating" && arrivedStop && nextStop && (
        <NextStopPrompt
          arrivedAt={arrivedStop}
          next={nextStop}
          awayM={nextAwayM}
          busy={arrivalPrompt === "busy"}
          error={arrivalPrompt === "error"}
          onGo={() => goToStop(stopIdx + 1)}
          onFinish={stopNavigation}
        />
      )}
      {trafficOpen && <TrafficSheet at={prayerPos} onClose={() => setTrafficOpen(false)} />}
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
