import { avoidAheadPolygon, parseValhallaTrip, routeOverlap, type LatLng, type Route, type ValhallaTrip } from "@arah/core";
import { config } from "./config";
import { t } from "./i18n";

export interface RouteRequest {
  from: LatLng;
  to: LatLng;
  avoidTolls: boolean;
  /** How many alternative routes to ask for besides the main one. */
  alternates?: number;
  /** An area the route must not go through (a closed ring of points). */
  avoid?: LatLng[];
  /** Extra Valhalla "auto" costing options for a differently-styled route (for example shortest). */
  options?: Record<string, number | boolean>;
}

interface ValhallaResponse {
  trip?: ValhallaTrip;
  alternates?: { trip: ValhallaTrip }[];
  error?: string;
}

/** Ask the routing server for routes. Returns the main route first. */
export async function fetchRoutes(req: RouteRequest, signal?: AbortSignal): Promise<Route[]> {
  const body = {
    locations: [
      { lat: req.from.lat, lon: req.from.lng },
      { lat: req.to.lat, lon: req.to.lng },
    ],
    costing: "auto",
    // use_tolls: 0 = avoid tolls as much as possible, 0.5 = neutral (the default).
    costing_options: { auto: { use_tolls: req.avoidTolls ? 0 : 0.5, ...(req.options ?? {}) } },
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
  req: { from: LatLng; to: LatLng; avoidTolls: boolean },
  signal?: AbortSignal,
): Promise<Route[]> {
  const have: Route[] = [];
  const add = (rs: Route[]) => {
    for (const r of rs) if (have.length < ROUTE_CHOICES && !have.some((h) => sameRoad(r, h))) have.push(r);
  };
  const ask = async (extra: Partial<RouteRequest>): Promise<Route[]> => {
    try {
      return await fetchRoutes({ from: req.from, to: req.to, avoidTolls: req.avoidTolls, alternates: 0, ...extra }, signal);
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      return [];
    }
  };

  // The first ask decides success or failure, with its own error message.
  add(await fetchRoutes({ from: req.from, to: req.to, avoidTolls: req.avoidTolls, alternates: 2 }, signal));

  if (have.length < ROUTE_CHOICES) {
    const styles: Record<string, number | boolean>[] = [
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
  return have.sort((a, b) => a.durationS - b.durationS);
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
  req: { from: LatLng; to: LatLng; avoidTolls: boolean; avoidArea: LatLng[]; current: Route },
  signal?: AbortSignal,
): Promise<RerouteOption[]> {
  const [plain, avoided] = await Promise.allSettled([
    fetchRoutes({ from: req.from, to: req.to, avoidTolls: req.avoidTolls, alternates: 2 }, signal),
    req.avoidArea.length > 3
      ? fetchRoutes({ from: req.from, to: req.to, avoidTolls: req.avoidTolls, alternates: 0, avoid: req.avoidArea }, signal)
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
  signal?: AbortSignal,
): Promise<{ lengthM: number; durationS: number } | null> {
  if (stops.length < 2) return null;
  const body = {
    locations: [from, ...stops].map((p) => ({ lat: p.lat, lon: p.lng, type: "break" })),
    costing: "auto",
    costing_options: { auto: { use_tolls: avoidTolls ? 0 : 0.5 } },
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
