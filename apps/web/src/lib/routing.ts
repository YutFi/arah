import {
  avoidAheadPolygon,
  costingRequest,
  DEFAULT_VEHICLE,
  motorcycleOrder,
  parseValhallaTrip,
  routeOverlap,
  type LatLng,
  type Route,
  type ValhallaTrip,
  type Vehicle,
} from "@arah/core";
import { config } from "./config";
import { t } from "./i18n";

export interface RouteRequest {
  from: LatLng;
  to: LatLng;
  /** Avoid toll roads (car, truck) or stay off expressways (motorcycle). */
  avoidTolls: boolean;
  /** Car when left out. */
  vehicle?: Vehicle;
  /**
   * Which way you are driving now (degrees from north), for a reroute. The server then
   * starts on the road in that direction instead of telling you to turn round.
   */
  heading?: number;
  /** How many alternative routes to ask for besides the main one. */
  alternates?: number;
  /** An area the route must not go through (a closed ring of points). */
  avoid?: LatLng[];
  /** Extra costing options for a differently-styled route (for example shortest). */
  options?: Record<string, number | boolean>;
}

interface ValhallaResponse {
  trip?: ValhallaTrip;
  alternates?: { trip: ValhallaTrip }[];
  error?: string;
}

/** Ask the routing server for routes. Returns the main route first. */
export async function fetchRoutes(req: RouteRequest, signal?: AbortSignal): Promise<Route[]> {
  const vehicle = req.vehicle ?? DEFAULT_VEHICLE;
  const body = {
    locations: [
      {
        lat: req.from.lat,
        lon: req.from.lng,
        ...(req.heading !== undefined && Number.isFinite(req.heading) ? { heading: Math.round(((req.heading % 360) + 360) % 360), heading_tolerance: 60 } : {}),
      },
      { lat: req.to.lat, lon: req.to.lng },
    ],
    ...costingRequest(vehicle, req.avoidTolls, req.options),
    alternates: req.alternates ?? 2,
    directions_options: { units: "kilometers", language: "en-US" },
    // Valhalla: "exclude_polygons" is a list of rings of [lon, lat] points.
    ...(req.avoid && req.avoid.length > 3 ? { exclude_polygons: [req.avoid.map((p) => [p.lng, p.lat])] } : {}),
  };
  const url = `${config.routingUrl}/route?json=${encodeURIComponent(JSON.stringify(body))}`;

  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new Error(t("route.err.reach"));
  }

  let data: ValhallaResponse | null = null;
  try {
    data = (await res.json()) as ValhallaResponse;
  } catch {
    /* handled below */
  }
  if (!res.ok || !data?.trip) {
    // The public server may not offer every vehicle type: say so instead of "no route".
    if (vehicle.type !== "car" && res.status === 400 && /costing/i.test(data?.error ?? "")) throw new Error(t("route.err.vehicle"));
    throw new Error(data?.error ? t("route.err.noRoute", { e: data.error }) : t("route.err.server", { s: res.status }));
  }

  const trips = [data.trip, ...(data.alternates ?? []).map((a) => a.trip)];
  return trips.map(parseValhallaTrip);
}

/** How many different routes the preview always tries to offer. */
export const ROUTE_CHOICES = 3;

/** Two routes are "the same road" when almost every point of each lies on the other. */
function sameRoad(a: Route, b: Route): boolean {
  const samples = Math.min(300, Math.max(16, Math.round(Math.min(a.lengthM, b.lengthM) / 250)));
  return routeOverlap(a, b, 45, samples) > 0.95 && routeOverlap(b, a, 45, samples) > 0.95;
}

/**
 * Up to three genuinely different routes, fastest first. The server often returns fewer
 * than three alternatives, so when it does we ask in other styles (no tolls, shortest, no
 * highways, toll roads preferred), and if that is still not enough we block a stretch of
 * the fastest route to force a different road. Copies of one another are dropped.
 * Returns fewer than three only when the map really has no more different roads.
 */
export async function fetchRouteChoices(
  req: { from: LatLng; to: LatLng; avoidTolls: boolean; vehicle?: Vehicle },
  signal?: AbortSignal,
): Promise<Route[]> {
  const vehicle = req.vehicle ?? DEFAULT_VEHICLE;
  const have: Route[] = [];
  const add = (rs: Route[]) => {
    for (const r of rs) if (have.length < ROUTE_CHOICES && !have.some((h) => sameRoad(r, h))) have.push(r);
  };
  const ask = async (extra: Partial<RouteRequest>): Promise<Route[]> => {
    try {
      return await fetchRoutes({ from: req.from, to: req.to, avoidTolls: req.avoidTolls, vehicle, alternates: 0, ...extra }, signal);
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      return [];
    }
  };

  // The first ask decides success or failure, with its own error message.
  add(await fetchRoutes({ from: req.from, to: req.to, avoidTolls: req.avoidTolls, vehicle, alternates: 2 }, signal));

  if (have.length < ROUTE_CHOICES) {
    // A motorcycle pays no toll, so its styles are about expressways: off them, or on the ones with a lane.
    const styles: Record<string, number | boolean>[] =
      vehicle.type === "motorcycle"
        ? [{ shortest: true }, ...(req.avoidTolls ? [] : [{ use_highways: 0 }, { use_highways: 1 }])]
        : [
            ...(req.avoidTolls ? [] : [{ use_tolls: 0 }]),
            { shortest: true },
            { use_highways: 0 },
            ...(req.avoidTolls ? [] : [{ use_tolls: 1 }]),
          ];
    const results = await Promise.all(styles.map((options) => ask({ options })));
    for (const rs of results) add(rs);
  }

  const main = have[0];
  if (main && main.lengthM > 1500) {
    for (const frac of [0.5, 0.3, 0.7]) {
      if (have.length >= ROUTE_CHOICES) break;
      add(await ask({ avoid: avoidAheadPolygon(main, main.lengthM * frac - 500, 0, 1000, 60) }));
    }
  }
  const byTime = have.sort((a, b) => a.durationS - b.durationS);
  // Motorcycle: a route along an expressway with no known lane goes last, so the first one is the likeliest to be allowed.
  return vehicle.type === "motorcycle" ? motorcycleOrder(byTime) : byTime;
}

/**
 * A new route after a wrong turn. First asks for a route that carries on in the direction
 * you are driving (so the first instruction is not "make a U-turn" when you can simply
 * continue); if the server finds nothing that way, asks again without the direction.
 */
export async function fetchReroute(
  req: { from: LatLng; to: LatLng; avoidTolls: boolean; vehicle?: Vehicle; heading?: number | null; speedMps?: number | null },
  signal?: AbortSignal,
): Promise<Route> {
  const base = { from: req.from, to: req.to, avoidTolls: req.avoidTolls, vehicle: req.vehicle, alternates: 0 };
  // The phone's heading means little when almost stopped.
  const heading = req.heading != null && Number.isFinite(req.heading) && (req.speedMps ?? 0) >= 2.5 ? req.heading : undefined;
  if (heading !== undefined) {
    try {
      const rs = await fetchRoutes({ ...base, heading }, signal);
      if (rs[0]) return rs[0];
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      // fall through: ask again without a direction
    }
  }
  const rs = await fetchRoutes(base, signal);
  if (!rs[0]) throw new Error(t("route.err.reach"));
  return rs[0];
}

export type RerouteKind = "avoid" | "alt";
export interface RerouteOption {
  route: Route;
  kind: RerouteKind;
}

/**
 * Other ways to your destination from where you are. Two asks in parallel: ordinary
 * alternatives, and one that must not use the stretch of road ahead. A failed ask is
 * simply left out; we only fail if nothing at all came back.
 */
export async function fetchRerouteOptions(
  req: { from: LatLng; to: LatLng; avoidTolls: boolean; vehicle?: Vehicle; avoidArea: LatLng[]; current: Route },
  signal?: AbortSignal,
): Promise<RerouteOption[]> {
  const [plain, avoided] = await Promise.allSettled([
    fetchRoutes({ from: req.from, to: req.to, avoidTolls: req.avoidTolls, vehicle: req.vehicle, alternates: 2 }, signal),
    req.avoidArea.length > 3
      ? fetchRoutes({ from: req.from, to: req.to, avoidTolls: req.avoidTolls, vehicle: req.vehicle, alternates: 0, avoid: req.avoidArea }, signal)
      : Promise.reject(new Error("no area")),
  ]);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const out: RerouteOption[] = [];
  const seen: Route[] = [];
  const add = (r: Route, kind: RerouteKind) => {
    // skip the road we are already on, and copies of one another
    if (routeOverlap(r, req.current) > 0.9 && kind === "alt") return;
    if (seen.some((s) => routeOverlap(r, s) > 0.9 && routeOverlap(s, r) > 0.9)) return;
    seen.push(r);
    out.push({ route: r, kind });
  };
  if (avoided.status === "fulfilled" && avoided.value[0]) add(avoided.value[0], "avoid");
  if (plain.status === "fulfilled") for (const r of plain.value) add(r, "alt");
  if (out.length === 0 && plain.status === "rejected" && avoided.status === "rejected") {
    throw plain.reason instanceof Error ? plain.reason : new Error(t("reroute.err"));
  }
  return out;
}

/**
 * Length and time of the whole trip, from here through every stop, at normal speeds.
 * One ask with all stops. Returns null when the server cannot do it (the trip still works,
 * each leg is routed when you get to it).
 */
export async function fetchTripTotals(
  from: LatLng,
  stops: LatLng[],
  avoidTolls: boolean,
  vehicle: Vehicle,
  signal?: AbortSignal,
): Promise<{ lengthM: number; durationS: number } | null> {
  if (stops.length < 2) return null;
  const body = {
    locations: [from, ...stops].map((p) => ({ lat: p.lat, lon: p.lng, type: "break" })),
    ...costingRequest(vehicle, avoidTolls),
    directions_options: { units: "kilometers", language: "en-US" },
  };
  try {
    const res = await fetch(`${config.routingUrl}/route?json=${encodeURIComponent(JSON.stringify(body))}`, { signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { trip?: { summary?: { length?: number; time?: number } } };
    const s = data.trip?.summary;
    if (!s || typeof s.length !== "number" || typeof s.time !== "number") return null;
    return { lengthM: s.length * 1000, durationS: s.time };
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    return null;
  }
}
