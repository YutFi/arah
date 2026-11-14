import { isInMalaysiaBBox, projectToSegment, type LatLng } from "./geo";
import type { Route } from "./route";
import { snapToRoute } from "./snap";

/**
 * Things to know about along a route, counted from OpenStreetMap.
 *
 * OpenStreetMap is mapped by volunteers, so these counts can be LOWER than
 * reality (missing items) and occasionally higher (old items). They are
 * a guide, never a guarantee. Toll PRICES are not in this data at all.
 */
export interface RouteFeatures {
  signals: { distanceAlongM: number }[];
  /** Speed cameras mapped on OpenStreetMap. NOT the official AWAS list. */
  cameras: { distanceAlongM: number; maxspeed?: string }[];
  /** Toll plazas the route passes through, one entry per plaza. */
  tolls: { distanceAlongM: number; name: string }[];
}

export const MAX_STATS_ROUTE_M = 250_000;

/** Douglas-Peucker: keep the shape of a line with fewer points. */
export function simplifyLine(points: LatLng[], toleranceM: number): LatLng[] {
  const n = points.length;
  if (n <= 2) return points.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    let worst = -1;
    let worstD = toleranceM;
    for (let i = a + 1; i < b; i++) {
      const d = projectToSegment(points[i] as LatLng, points[a] as LatLng, points[b] as LatLng).distance;
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst > 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Simplify until the line has at most `maxPoints`; returns the line and the tolerance used. */
function simplifyTo(points: LatLng[], maxPoints: number): { line: LatLng[]; tolM: number } {
  let tol = 8;
  let line = simplifyLine(points, tol);
  while (line.length > maxPoints && tol < 2000) {
    tol *= 1.6;
    line = simplifyLine(points, tol);
  }
  return { line, tolM: tol };
}

/** One Overpass question that covers every alternative route. */
export function buildRouteQuery(routes: Route[], maxPointsPerRoute = 400): string {
  const blocks: string[] = [];
  for (const r of routes) {
    const { line, tolM } = simplifyTo(r.points, maxPointsPerRoute);
    const coords = line.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(",");
    const near = Math.ceil(30 + tolM);
    const wide = Math.ceil(50 + tolM);
    blocks.push(
      `  node["highway"="traffic_signals"](around:${near},${coords});`,
      `  node["highway"="speed_camera"](around:${near},${coords});`,
      `  nwr["barrier"="toll_booth"](around:${wide},${coords});`,
    );
  }
  return `[out:json][timeout:40];\n(\n${blocks.join("\n")}\n);\nout center;`;
}

interface Element {
  type: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Merge hits that are the same junction or plaza (several nodes within `gapM` along the route). */
function dedupe<T extends { distanceAlongM: number }>(items: T[], gapM: number): T[] {
  const sorted = items.slice().sort((a, b) => a.distanceAlongM - b.distanceAlongM);
  const out: T[] = [];
  for (const it of sorted) {
    const last = out[out.length - 1];
    if (!last || it.distanceAlongM - last.distanceAlongM > gapM) out.push(it);
  }
  return out;
}

/** Keep only what is really on this route, then count it. */
export function countRouteFeatures(route: Route, json: unknown): RouteFeatures {
  const els = (json as { elements?: Element[] } | null)?.elements;
  const res: RouteFeatures = { signals: [], cameras: [], tolls: [] };
  if (!Array.isArray(els)) return res;

  for (const el of els) {
    const t = el.tags;
    if (!t) continue;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    const p = { lat, lng };
    if (!isInMalaysiaBBox(p)) continue;

    const kind = t.highway === "traffic_signals" ? "signal" : t.highway === "speed_camera" ? "camera" : t.barrier === "toll_booth" ? "toll" : null;
    if (!kind) continue;
    const s = snapToRoute(route, p, 0, route.points.length);
    const limit = kind === "toll" ? 45 : 25;
    if (s.offRouteM > limit) continue;

    if (kind === "signal") res.signals.push({ distanceAlongM: s.distanceAlongM });
    else if (kind === "camera") res.cameras.push({ distanceAlongM: s.distanceAlongM, maxspeed: t.maxspeed });
    else res.tolls.push({ distanceAlongM: s.distanceAlongM, name: t.name ?? t.operator ?? "Toll plaza" });
  }
  return {
    signals: dedupe(res.signals, 40),
    cameras: dedupe(res.cameras, 40),
    tolls: dedupe(res.tolls, 400),
  };
}
