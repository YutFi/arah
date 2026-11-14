import { parseValhallaTrip, routeOverlap, type LatLng, type Route, type ValhallaTrip } from "@arah/core";
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
    costing_options: { auto: { use_tolls: req.avoidTolls ? 0 : 0.5 } },
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
