import { isInMalaysiaBBox, type LatLng } from "./geo";
import type { Route } from "./route";
import { simplifyLine } from "./routeStats";
import { snapToRoute } from "./snap";

/**
 * Extra things worth seeing along a route, asked of OpenStreetMap only when they matter:
 *  - rain shelters, for a motorcycle rider caught in a downpour
 *  - pedestrian overbridges and mapped height limits, for a truck driver
 *
 * Everything is what OpenStreetMap volunteers mapped. A missing mark means "not mapped", never
 * "not there". A footbridge's clearance is almost never mapped, so the screen says "clearance
 * not mapped, check the sign" unless a height tag exists.
 */
export type ExtraKind = "shelter" | "overbridge" | "heightlimit";

export interface RouteExtra {
  kind: ExtraKind;
  lat: number;
  lng: number;
  distanceAlongM: number;
  /** Raw OpenStreetMap `maxheight` text (for example "4.2" or "4.5 m"), if the mapper added one. */
  maxheight?: string;
  name?: string;
}

export const EXTRAS_SOURCE = "https://wiki.openstreetmap.org/wiki/Key:maxheight";
export const EXTRAS_MAX_ROUTE_M = 120_000;

/** Which kinds to ask for: shelters for a motorcycle, bridges and height limits for a truck. */
export function extraKindsFor(vehicle: "car" | "motorcycle" | "truck"): ExtraKind[] {
  return vehicle === "motorcycle" ? ["shelter"] : vehicle === "truck" ? ["overbridge", "heightlimit"] : [];
}

const FOOT = "^(footway|pedestrian|steps|path|cycleway)$";

/** One Overpass question for the chosen route and kinds. */
export function buildExtrasQuery(route: Route, kinds: readonly ExtraKind[], maxPoints = 400): string {
  let tol = 8;
  let line = simplifyLine(route.points, tol);
  while (line.length > maxPoints && tol < 2000) {
    tol *= 1.6;
    line = simplifyLine(route.points, tol);
  }
  const coords = line.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(",");
  const near = Math.ceil(35 + tol);
  const parts: string[] = [];
  if (kinds.includes("shelter")) parts.push(`  nwr["amenity"="shelter"](around:${Math.ceil(50 + tol)},${coords});`);
  if (kinds.includes("overbridge")) parts.push(`  way["bridge"="yes"]["highway"~"${FOOT}"](around:${near},${coords});`);
  if (kinds.includes("heightlimit")) {
    parts.push(`  nwr["maxheight"](around:${near},${coords});`, `  node["barrier"="height_restrictor"](around:${near},${coords});`);
  }
  return `[out:json][timeout:25];\n(\n${parts.join("\n")}\n);\nout center tags;`;
}

interface El {
  type?: string;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** A height limit from a `maxheight` value, in metres, or null if it is not a plain number. */
export function parseMaxHeightM(text: string | undefined): number | null {
  if (!text) return null;
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(m|metre|meter|meters|metres)?\s*$/i.exec(text);
  if (m) return Number(m[1]!.replace(",", "."));
  const ft = /^\s*(\d+)\s*'\s*(\d+)?\s*"?\s*$/.exec(text);
  return ft ? Math.round((Number(ft[1]) * 0.3048 + Number(ft[2] ?? 0) * 0.0254) * 100) / 100 : null;
}

/** Reads an Overpass answer, keeps what is on this route, orders it along the route. */
export function readExtras(route: Route, json: unknown, kinds: readonly ExtraKind[]): RouteExtra[] {
  const els = (json as { elements?: El[] } | null)?.elements;
  if (!Array.isArray(els)) return [];
  const out: RouteExtra[] = [];
  for (const el of els) {
    const t = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (typeof lat !== "number" || typeof lng !== "number" || !isInMalaysiaBBox({ lat, lng })) continue;
    let kind: ExtraKind | null = null;
    let limit = 40;
    if (t.amenity === "shelter" && kinds.includes("shelter")) {
      kind = "shelter";
      limit = 50;
    } else if (t.barrier === "height_restrictor" || (t.maxheight && !(t.bridge === "yes" && /^(footway|pedestrian|steps|path|cycleway)$/.test(t.highway ?? "")))) {
      if (kinds.includes("heightlimit")) {
        kind = "heightlimit";
        limit = 30;
      }
    }
    if (!kind && t.bridge === "yes" && /^(footway|pedestrian|steps|path|cycleway)$/.test(t.highway ?? "") && kinds.includes("overbridge")) {
      kind = "overbridge";
      limit = 30;
    }
    if (!kind) continue;
    const s = snapToRoute(route, { lat, lng }, 0, route.points.length);
    if (s.offRouteM > limit) continue;
    out.push({ kind, lat, lng, distanceAlongM: s.distanceAlongM, maxheight: t.maxheight ?? t["maxheight:physical"], name: t.name });
  }
  out.sort((a, b) => a.distanceAlongM - b.distanceAlongM);
  // One mark per spot: stairs and ramps of the same footbridge, or neighbouring shelters, merge within 35 m.
  const merged: RouteExtra[] = [];
  for (const e of out) {
    const last = merged[merged.length - 1];
    if (last && last.kind === e.kind && e.distanceAlongM - last.distanceAlongM < 35) {
      if (!last.maxheight && e.maxheight) last.maxheight = e.maxheight;
      continue;
    }
    merged.push(e);
  }
  return merged;
}

/** The truck's own height against a mapped limit: "over" only when the limit is a number and lower. */
export function heightWarning(truckHeightM: number | undefined, maxheight: string | undefined): "over" | "ok" | "unknown" {
  const limit = parseMaxHeightM(maxheight);
  if (limit === null || truckHeightM === undefined) return "unknown";
  return truckHeightM >= limit ? "over" : "ok";
}

export type { LatLng };
