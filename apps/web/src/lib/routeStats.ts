import { buildRouteQuery, countRouteFeatures, MAX_STATS_ROUTE_M, type Route, type RouteFeatures } from "@arah/core";
import { askOverpass } from "./nearby";
import { staticRouteElements } from "./osmData";

export type StatsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; list: (RouteFeatures | null)[] };

/**
 * Count lights, cameras and toll plazas on each route. Uses the pre-built data
 * (instant). Without it, asks a live server, which is slow, so very long routes
 * are skipped there (null).
 */
export async function fetchRouteFeatures(routes: Route[], signal: AbortSignal): Promise<(RouteFeatures | null)[]> {
  const elements = await staticRouteElements(routes, signal);
  if (elements) return routes.map((r) => countRouteFeatures(r, { elements }));

  const usable = routes.filter((r) => r.lengthM <= MAX_STATS_ROUTE_M);
  if (usable.length === 0) return routes.map(() => null);
  const json = await askOverpass(buildRouteQuery(usable, 150), signal, 20000);
  const remark = (json as { remark?: string }).remark;
  if (remark && !(json as { elements?: unknown[] }).elements?.length) throw new Error("The map data server is busy.");
  return routes.map((r) => (r.lengthM <= MAX_STATS_ROUTE_M ? countRouteFeatures(r, json) : null));
}
