import { buildExtrasQuery, EXTRAS_MAX_ROUTE_M, readExtras, type ExtraKind, type Route, type RouteExtra } from "@arah/core";
import { askOverpass } from "./nearby";

const cache = new Map<string, Promise<RouteExtra[] | null>>();

/**
 * Rain shelters (motorcycle) or footbridges and height limits (truck) along one route, from the same
 * free Overpass servers the app already uses. One question per route, cached. Resolves to null when
 * the server cannot be reached, and to [] for a route too long to ask about in one go.
 */
export function fetchRouteExtras(route: Route, kinds: readonly ExtraKind[], signal: AbortSignal): Promise<RouteExtra[] | null> {
  if (kinds.length === 0 || route.lengthM > EXTRAS_MAX_ROUTE_M) return Promise.resolve([]);
  const a = route.points[0];
  const b = route.points[route.points.length - 1];
  if (!a || !b) return Promise.resolve([]);
  const key = `${kinds.join("+")}|${Math.round(route.lengthM)}|${a.lat.toFixed(4)},${a.lng.toFixed(4)}|${b.lat.toFixed(4)},${b.lng.toFixed(4)}`;
  let p = cache.get(key);
  if (!p) {
    p = askOverpass(buildExtrasQuery(route, kinds), signal, 20000)
      .then((json) => readExtras(route, json, kinds))
      .catch(() => null);
    cache.set(key, p);
    void p.then((r) => {
      if (r === null) cache.delete(key);
    });
  }
  return p;
}
