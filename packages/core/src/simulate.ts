import { bearing, type LatLng } from "./geo";
import type { Route } from "./route";

export interface PointOnRoute {
  point: LatLng;
  /** Direction of travel at that point, degrees from north. */
  bearing: number;
}

/**
 * Where you are after travelling `distanceM` along the route. Used by the
 * "simulate drive" mode so the app can be tested without driving anywhere.
 */
export function pointAtDistance(route: Route, distanceM: number): PointOnRoute {
  const last = route.points.length - 1;
  const d = Math.max(0, Math.min(route.lengthM, distanceM));

  // Binary search for the segment containing d.
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((route.cumDist[mid] ?? 0) <= d) lo = mid;
    else hi = mid;
  }
  const a = route.points[lo] as LatLng;
  const b = route.points[Math.min(lo + 1, last)] as LatLng;
  const segLen = (route.cumDist[lo + 1] ?? 0) - (route.cumDist[lo] ?? 0);
  const t = segLen > 0 ? (d - (route.cumDist[lo] ?? 0)) / segLen : 0;
  return {
    point: { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t },
    bearing: bearing(a, b),
  };
}
