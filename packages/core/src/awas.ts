import { angleDiff, bearing, isInMalaysiaBBox, projectToSegment, type LatLng } from "./geo";
import type { Route } from "./route";

/**
 * AWAS (speed camera) data model.
 *
 * Rule of this project: a camera record is only used in the app if it carries
 * a source URL and the date someone last verified it. Nothing is guessed.
 */
export type CameraType = "fixed" | "red-light" | "average-speed";

export interface CameraRecord {
  id: string;
  type: CameraType;
  lat: number;
  lng: number;
  /** Direction of travel being enforced, degrees from north. Optional. */
  directionDeg?: number;
  /** Posted speed limit at the camera in km/h, if known. */
  speedLimitKph?: number;
  roadName?: string;
  /** Where this record came from (a URL). Required. */
  sourceUrl: string;
  /** ISO date (YYYY-MM-DD) when a person last checked this record. Required. */
  verifiedOn: string;
  notes?: string;
  /**
   * True when the position was matched from a community map (OpenStreetMap) to an
   * official list that has no coordinates, so it is close but not surveyed.
   */
  approximate?: boolean;
}

export interface ValidationIssue {
  id: string;
  problem: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TYPES: readonly string[] = ["fixed", "red-light", "average-speed"];

export function validateCamera(r: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const rec = r as Partial<CameraRecord> | null;
  const id = typeof rec?.id === "string" && rec.id ? rec.id : "(no id)";
  const bad = (problem: string) => issues.push({ id, problem });

  if (!rec || typeof rec !== "object") {
    bad("record is not an object");
    return issues;
  }
  if (id === "(no id)") bad("missing id");
  if (typeof rec.type !== "string" || !TYPES.includes(rec.type)) bad("type must be fixed, red-light or average-speed");
  if (typeof rec.lat !== "number" || typeof rec.lng !== "number" || !Number.isFinite(rec.lat) || !Number.isFinite(rec.lng)) {
    bad("lat and lng must be numbers");
  } else if (!isInMalaysiaBBox({ lat: rec.lat, lng: rec.lng })) {
    bad("coordinates are outside Malaysia");
  }
  if (typeof rec.sourceUrl !== "string" || !/^https?:\/\//.test(rec.sourceUrl)) bad("sourceUrl is required (http/https link)");
  if (typeof rec.verifiedOn !== "string" || !ISO_DATE.test(rec.verifiedOn) || Number.isNaN(Date.parse(rec.verifiedOn))) {
    bad("verifiedOn is required (YYYY-MM-DD)");
  }
  if (rec.directionDeg !== undefined && !(rec.directionDeg >= 0 && rec.directionDeg < 360)) bad("directionDeg must be 0 to <360");
  if (rec.speedLimitKph !== undefined && !(rec.speedLimitKph > 0 && rec.speedLimitKph <= 130)) bad("speedLimitKph must be 1 to 130");
  if (rec.approximate !== undefined && typeof rec.approximate !== "boolean") bad("approximate must be true or false");
  return issues;
}

export interface DatasetCheck {
  valid: CameraRecord[];
  issues: ValidationIssue[];
}

/** Split a raw dataset into records that pass the data gate and problems. */
export function validateDataset(raw: unknown): DatasetCheck {
  if (!Array.isArray(raw)) return { valid: [], issues: [{ id: "(file)", problem: "dataset must be a JSON array" }] };
  const valid: CameraRecord[] = [];
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const found = validateCamera(item);
    const id = (item as { id?: string } | null)?.id;
    if (typeof id === "string" && seen.has(id)) found.push({ id, problem: "duplicate id" });
    if (typeof id === "string") seen.add(id);
    if (found.length === 0) valid.push(item as CameraRecord);
    else issues.push(...found);
  }
  return { valid, issues };
}

export interface CameraOnRoute {
  camera: CameraRecord;
  /** Distance from the start of the route to the camera (m). */
  distanceAlongM: number;
}

/**
 * Find which cameras lie on this route and in the direction of travel.
 * Run once per route, then use {@link upcomingCameras} on every GPS fix.
 */
export function matchCamerasToRoute(
  route: Route,
  cameras: CameraRecord[],
  opts: { maxOffRouteM?: number; maxBearingDiffDeg?: number } = {},
): CameraOnRoute[] {
  const maxOff = opts.maxOffRouteM ?? 25;
  const maxBearing = opts.maxBearingDiffDeg ?? 60;
  const out: CameraOnRoute[] = [];

  for (const camera of cameras) {
    const p: LatLng = { lat: camera.lat, lng: camera.lng };
    let best: { d: number; along: number; seg: number } | null = null;
    for (let i = 0; i < route.points.length - 1; i++) {
      const a = route.points[i] as LatLng;
      const b = route.points[i + 1] as LatLng;
      const pr = projectToSegment(p, a, b);
      if (pr.distance <= maxOff && (!best || pr.distance < best.d)) {
        const segLen = (route.cumDist[i + 1] ?? 0) - (route.cumDist[i] ?? 0);
        best = { d: pr.distance, along: (route.cumDist[i] ?? 0) + pr.t * segLen, seg: i };
      }
    }
    if (!best) continue;
    if (camera.directionDeg !== undefined) {
      const a = route.points[best.seg] as LatLng;
      const b = route.points[best.seg + 1] as LatLng;
      if (angleDiff(bearing(a, b), camera.directionDeg) > maxBearing) continue;
    }
    out.push({ camera, distanceAlongM: best.along });
  }
  return out.sort((x, y) => x.distanceAlongM - y.distanceAlongM);
}

export interface CameraAlert extends CameraOnRoute {
  distanceAheadM: number;
}

/** Cameras still ahead within the look-ahead distance, nearest first. */
export function upcomingCameras(
  matches: CameraOnRoute[],
  distanceAlongM: number,
  lookAheadM = 1000,
): CameraAlert[] {
  return matches
    .map((m) => ({ ...m, distanceAheadM: m.distanceAlongM - distanceAlongM }))
    .filter((m) => m.distanceAheadM >= -10 && m.distanceAheadM <= lookAheadM)
    .sort((a, b) => a.distanceAheadM - b.distanceAheadM);
}
