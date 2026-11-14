import type { LatLng } from "./geo";
import type { Route } from "./route";
import { snapToRoute } from "./snap";

/** A GPS reading, shaped like (a subset of) the browser's GeolocationPosition. */
export interface Fix extends LatLng {
  accuracyM?: number;
  /** Metres per second, if the device reports it. */
  speedMps?: number | null;
  /** Degrees clockwise from north, if the device reports it. */
  heading?: number | null;
  /** Milliseconds since epoch. */
  timestamp: number;
}

export type NavStatus = "on-route" | "off-route" | "arrived";

export interface NavUpdate {
  status: NavStatus;
  distanceAlongM: number;
  remainingM: number;
  /** Remaining time: the route's own estimate, scaled by distance left. */
  remainingS: number;
  offRouteM: number;
  /** Index into route.maneuvers of the next manoeuvre, or null if none left. */
  nextManeuverIndex: number | null;
  distanceToNextM: number | null;
  /** The position snapped onto the route line (for drawing the car icon). */
  snapped: LatLng;
}

export interface NavOptions {
  /** Base distance from the route that counts as "off route" (m). */
  offRouteThresholdM?: number;
  /** How many fixes in a row must be off route before we say so. */
  offRouteFixes?: number;
  /** Distance from the end that counts as arrived (m). */
  arrivalRadiusM?: number;
}

export interface Navigator {
  update(fix: Fix): NavUpdate;
}

export function createNavigator(route: Route, options: NavOptions = {}): Navigator {
  const baseThreshold = options.offRouteThresholdM ?? 50;
  const needFixes = options.offRouteFixes ?? 3;
  const arrivalRadius = options.arrivalRadiusM ?? 30;

  let segmentHint = 0;
  let nextIdx = 0;
  let offCount = 0;
  let arrived = false;

  return {
    update(fix) {
      const snap = snapToRoute(route, fix, segmentHint);
      segmentHint = snap.segmentIndex;

      const remainingM = Math.max(0, route.lengthM - snap.distanceAlongM);
      const remainingS = route.lengthM > 0 ? route.durationS * (remainingM / route.lengthM) : 0;

      // Poor GPS accuracy widens the "off route" threshold so a wobbly fix
      // does not trigger a reroute, but never beyond 150 m.
      const threshold = Math.min(150, Math.max(baseThreshold, (fix.accuracyM ?? 0) * 2));
      if (snap.offRouteM > threshold) offCount++;
      else offCount = 0;

      if (remainingM <= arrivalRadius && snap.offRouteM <= threshold) arrived = true;

      while (
        nextIdx < route.maneuvers.length &&
        (route.maneuvers[nextIdx]?.distanceFromStartM ?? 0) < snap.distanceAlongM - 10
      ) {
        nextIdx++;
      }
      const next = route.maneuvers[nextIdx];

      const status: NavStatus = arrived ? "arrived" : offCount >= needFixes ? "off-route" : "on-route";

      return {
        status,
        distanceAlongM: snap.distanceAlongM,
        remainingM,
        remainingS,
        offRouteM: snap.offRouteM,
        nextManeuverIndex: next ? nextIdx : null,
        distanceToNextM: next ? Math.max(0, next.distanceFromStartM - snap.distanceAlongM) : null,
        snapped: snap.point,
      };
    },
  };
}
