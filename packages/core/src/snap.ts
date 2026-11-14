import { projectToSegment, type LatLng } from "./geo";
import type { Route } from "./route";

export interface Snap {
  /** Distance travelled along the route to the snapped point (m). */
  distanceAlongM: number;
  /** How far the position is from the route line (m). */
  offRouteM: number;
  segmentIndex: number;
  point: LatLng;
}

/**
 * Snap a position onto the route. Searches a window of segments around
 * `hintIndex` first (cheap, and avoids jumping to a nearby loop of the same
 * road); falls back to the whole route if nothing close is found there.
 */
export function snapToRoute(route: Route, pos: LatLng, hintIndex = 0, windowSize = 60): Snap {
  const n = route.points.length - 1;
  const scan = (from: number, to: number): Snap | null => {
    let best: Snap | null = null;
    for (let i = Math.max(0, from); i < Math.min(n, to); i++) {
      const a = route.points[i] as LatLng;
      const b = route.points[i + 1] as LatLng;
      const pr = projectToSegment(pos, a, b);
      if (!best || pr.distance < best.offRouteM) {
        const segLen = (route.cumDist[i + 1] ?? 0) - (route.cumDist[i] ?? 0);
        best = {
          distanceAlongM: (route.cumDist[i] ?? 0) + pr.t * segLen,
          offRouteM: pr.distance,
          segmentIndex: i,
          point: pr.point,
        };
      }
    }
    return best;
  };

  const local = scan(hintIndex - 5, hintIndex + windowSize);
  if (local && local.offRouteM < 100) return local;
  return scan(0, n) ?? { distanceAlongM: 0, offRouteM: Infinity, segmentIndex: 0, point: pos };
}
