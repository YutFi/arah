import { bearing, projectToSegment, type LatLng } from "./geo";
import type { Route } from "./route";
import { pointAtDistance } from "./simulate";

/**
 * Notices that YOU are stuck, from how little you moved. This is not a traffic map:
 * Arah has no live traffic data (see docs/LIVE-TRAFFIC.md). It only looks at your own
 * progress along the route compared with how fast that road normally flows.
 */

export interface JamOptions {
  /** How long a slow stretch must last before we ask (s). Long enough to ignore a red light. */
  windowS?: number;
  /** The recent part of the window must also be slow, so we do not ask once traffic is moving again (s). */
  recentS?: number;
  /** Moved less than this share of the normal distance for that time. */
  slowFraction?: number;
  /** Also slower than this average speed (km/h). */
  slowKph?: number;
  /** Only roads that normally flow at least this fast count (km/h). Not car parks or crawling streets. */
  minTypicalKph?: number;
  /** Do not ask this close to the destination (m). */
  minRemainingM?: number;
  /** After "Stay on route", stay quiet for this long (s). */
  cooldownS?: number;
}

export interface JamSample {
  /** Milliseconds, any clock that only goes up. */
  t: number;
  alongM: number;
  typicalKph: number;
  remainingM: number;
}

export interface JamStatus {
  stuck: boolean;
  /** Distance covered during the window (m). */
  movedM: number;
  spanS: number;
  avgKph: number;
  typicalKph: number;
}

export interface JamDetector {
  push(s: JamSample): JamStatus;
  /** The person said "stay on this route". */
  snooze(nowMs: number): void;
  reset(): void;
}

const NOT_STUCK: JamStatus = { stuck: false, movedM: 0, spanS: 0, avgKph: 0, typicalKph: 0 };

export function createJamDetector(options: JamOptions = {}): JamDetector {
  const windowS = options.windowS ?? 150;
  const recentS = options.recentS ?? 25;
  const slowFraction = options.slowFraction ?? 0.15;
  const slowKph = options.slowKph ?? 15;
  const minTypicalKph = options.minTypicalKph ?? 30;
  const minRemainingM = options.minRemainingM ?? 600;
  const cooldownS = options.cooldownS ?? 600;

  let samples: JamSample[] = [];
  let quietUntil = 0;

  return {
    push(s) {
      samples.push(s);
      // keep a little more than the window
      const cutoff = s.t - (windowS + 10) * 1000;
      while (samples.length > 2 && (samples[1] as JamSample).t < cutoff) samples.shift();

      const first = samples.find((x) => x.t >= s.t - windowS * 1000);
      if (!first) return { ...NOT_STUCK, typicalKph: s.typicalKph };
      const spanS = (s.t - first.t) / 1000;
      if (spanS < windowS * 0.9) return { ...NOT_STUCK, spanS, typicalKph: s.typicalKph };

      const movedM = Math.max(0, s.alongM - first.alongM);
      const avgKph = (movedM / spanS) * 3.6;

      const recentFirst = samples.find((x) => x.t >= s.t - recentS * 1000) ?? first;
      const recentSpan = Math.max(1, (s.t - recentFirst.t) / 1000);
      const recentKph = (Math.max(0, s.alongM - recentFirst.alongM) / recentSpan) * 3.6;

      const normalM = (s.typicalKph / 3.6) * spanS;
      const stuck =
        s.t >= quietUntil &&
        s.typicalKph >= minTypicalKph &&
        s.remainingM > minRemainingM &&
        movedM < normalM * slowFraction &&
        avgKph < slowKph &&
        recentKph < s.typicalKph * 0.35;
      return { stuck, movedM, spanS, avgKph, typicalKph: s.typicalKph };
    },
    snooze(nowMs) {
      quietUntil = nowMs + cooldownS * 1000;
    },
    reset() {
      samples = [];
      quietUntil = 0;
    },
  };
}

/** How fast the road you are on normally flows (km/h), from the route's own time estimate. */
export function typicalSpeedKph(route: Route, alongM: number): number {
  let cur = route.maneuvers[0];
  for (const m of route.maneuvers) {
    if (m.distanceFromStartM <= alongM) cur = m;
    else break;
  }
  if (cur && cur.lengthM >= 200 && cur.timeS > 0) return (cur.lengthM / cur.timeS) * 3.6;
  return route.durationS > 0 ? (route.lengthM / route.durationS) * 3.6 : 0;
}

const R = 6371000;
function offset(p: LatLng, bearingDeg: number, distM: number): LatLng {
  const br = (bearingDeg * Math.PI) / 180;
  const lat1 = (p.lat * Math.PI) / 180;
  const lng1 = (p.lng * Math.PI) / 180;
  const d = distM / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
  const lng2 = lng1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: (lat2 * 180) / Math.PI, lng: (((lng2 * 180) / Math.PI + 540) % 360) - 180 };
}

/**
 * A thin area around the stretch of road ahead, from `startAheadM` to `endAheadM` beyond
 * your position. Sent to the routing server as "do not route through here", so the new
 * route has to use a different road. Starts a little ahead so you are not inside it.
 */
export function avoidAheadPolygon(route: Route, alongM: number, startAheadM = 150, endAheadM = 1500, halfWidthM = 30): LatLng[] {
  const from = Math.min(route.lengthM, alongM + startAheadM);
  const to = Math.min(route.lengthM, alongM + endAheadM);
  if (to - from < 100) return [];
  const left: LatLng[] = [];
  const right: LatLng[] = [];
  const steps = Math.max(2, Math.ceil((to - from) / 60));
  for (let i = 0; i <= steps; i++) {
    const d = from + ((to - from) * i) / steps;
    const here = pointAtDistance(route, d);
    const ahead = pointAtDistance(route, Math.min(route.lengthM, d + 20));
    const behind = pointAtDistance(route, Math.max(0, d - 20));
    const b = bearing(behind.point, ahead.point);
    left.push(offset(here.point, b - 90, halfWidthM));
    right.push(offset(here.point, b + 90, halfWidthM));
  }
  return [...left, ...right.reverse(), left[0] as LatLng];
}

/** Share (0 to 1) of route `a` that runs within `withinM` of route `b`. Used to tell "same road" from a different road. */
export function routeOverlap(a: Route, b: Route, withinM = 45): number {
  const n = 16;
  let near = 0;
  for (let i = 0; i < n; i++) {
    const p = pointAtDistance(a, (a.lengthM * i) / (n - 1)).point;
    let best = Infinity;
    for (let j = 0; j < b.points.length - 1; j++) {
      const s = projectToSegment(p, b.points[j] as LatLng, b.points[j + 1] as LatLng);
      if (s.distance < best) best = s.distance;
      if (best <= withinM) break;
    }
    if (best <= withinM) near++;
  }
  return near / n;
}
