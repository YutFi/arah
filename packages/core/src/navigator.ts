import { angleDiff, bearing, haversine, type LatLng } from "./geo";
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
  /** Direction the route runs at the snapped point, degrees from north. */
  routeBearing: number;
  /** This fix was moving against the direction of the route (a wrong way in, or a U-turn). */
  wrongWay: boolean;
}

export interface NavOptions {
  /** Base distance from the route that counts as "off route" (m). */
  offRouteThresholdM?: number;
  /** How many fixes in a row must be off route before we say so. */
  offRouteFixes?: number;
  /** Heading this far from the route's direction, while off the line, counts as going the wrong way (degrees). */
  wrongWayDeg?: number;
  /** Distance from the end that counts as arrived (m). */
  arrivalRadiusM?: number;
}

export interface Navigator {
  update(fix: Fix): NavUpdate;
}

/** Slower than this, a phone's compass heading is not trustworthy (m/s). */
const MIN_HEADING_SPEED_MPS = 2.5;

export function createNavigator(route: Route, options: NavOptions = {}): Navigator {
  const baseThreshold = options.offRouteThresholdM ?? 40;
  const needFixes = options.offRouteFixes ?? 2;
  const wrongWayDeg = options.wrongWayDeg ?? 110;
  const arrivalRadius = options.arrivalRadiusM ?? 30;

  let segmentHint = 0;
  let nextIdx = 0;
  /** Evidence that we have left the route: 1 for each fix beyond the limit, more for a clear wrong way. */
  let score = 0;
  let arrived = false;
  let prev: Fix | null = null;

  return {
    update(fix) {
      const snap = snapToRoute(route, fix, segmentHint);
      segmentHint = snap.segmentIndex;
      const a = route.points[snap.segmentIndex] as LatLng;
      const b = route.points[Math.min(route.points.length - 1, snap.segmentIndex + 1)] as LatLng;
      const routeBearing = bearing(a, b);

      const remainingM = Math.max(0, route.lengthM - snap.distanceAlongM);
      const remainingS = route.lengthM > 0 ? route.durationS * (remainingM / route.lengthM) : 0;

      // Speed and heading from the device when it gives them, else from the last two positions.
      let speed = fix.speedMps ?? null;
      let heading = fix.heading ?? null;
      if (prev && fix.timestamp - prev.timestamp > 200) {
        const moved = haversine(prev, fix);
        if (speed === null) speed = moved / ((fix.timestamp - prev.timestamp) / 1000);
        if ((heading === null || Number.isNaN(heading)) && moved >= 8) heading = bearing(prev, fix);
      }
      prev = fix;

      // Poor GPS accuracy widens the "off route" threshold so a wobbly fix
      // does not trigger a reroute, but never beyond 150 m.
      const acc = fix.accuracyM ?? 0;
      const threshold = Math.min(150, Math.max(baseThreshold, acc * 2));
      const far = snap.offRouteM > threshold;
      const wrongWay =
        heading !== null &&
        !Number.isNaN(heading) &&
        (speed ?? 0) >= MIN_HEADING_SPEED_MPS &&
        snap.offRouteM > Math.max(15, acc) &&
        angleDiff(heading, routeBearing) > wrongWayDeg;

      if (snap.offRouteM > threshold * 2.5) score = needFixes; // clearly somewhere else: no need to wait
      else if (wrongWay) score += 2;
      else if (far) score += 1;
      else score = 0;

      if (remainingM <= arrivalRadius && snap.offRouteM <= threshold) arrived = true;

      while (
        nextIdx < route.maneuvers.length &&
        (route.maneuvers[nextIdx]?.distanceFromStartM ?? 0) < snap.distanceAlongM - 10
      ) {
        nextIdx++;
      }
      const next = route.maneuvers[nextIdx];

      const status: NavStatus = arrived ? "arrived" : score >= needFixes ? "off-route" : "on-route";

      return {
        status,
        distanceAlongM: snap.distanceAlongM,
        remainingM,
        remainingS,
        offRouteM: snap.offRouteM,
        nextManeuverIndex: next ? nextIdx : null,
        distanceToNextM: next ? Math.max(0, next.distanceFromStartM - snap.distanceAlongM) : null,
        snapped: snap.point,
        routeBearing,
        wrongWay,
      };
    },
  };
}
