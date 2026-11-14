/** Basic geometry helpers. All distances in metres, angles in degrees. */

export interface LatLng {
  lat: number;
  lng: number;
}

const R = 6371008.8; // mean Earth radius (m)
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Great-circle distance between two points. */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Initial compass bearing from a to b, 0..360 (0 = north). */
export function bearing(a: LatLng, b: LatLng): number {
  const dLng = rad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dLng);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Smallest absolute difference between two bearings, 0..180. */
export function angleDiff(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

export interface SegmentProjection {
  /** Closest point on the segment. */
  point: LatLng;
  /** Distance from the query point to that closest point (m). */
  distance: number;
  /** Position of the closest point along the segment, 0..1. */
  t: number;
}

/**
 * Project p onto segment a-b using a local flat-earth approximation.
 * Accurate to well under a metre for segments a few kilometres long,
 * which is all we need for road geometry.
 */
export function projectToSegment(p: LatLng, a: LatLng, b: LatLng): SegmentProjection {
  const cosLat = Math.cos(rad(a.lat));
  const mPerDegLat = (Math.PI / 180) * R;
  const mPerDegLng = mPerDegLat * cosLat;
  const ax = 0;
  const ay = 0;
  const bx = (b.lng - a.lng) * mPerDegLng;
  const by = (b.lat - a.lat) * mPerDegLat;
  const px = (p.lng - a.lng) * mPerDegLng;
  const py = (p.lat - a.lat) * mPerDegLat;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : (px * dx + py * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return {
    point: { lat: a.lat + cy / mPerDegLat, lng: a.lng + cx / mPerDegLng },
    distance: Math.hypot(px - cx, py - cy),
    t,
  };
}

/** Rough bounding box of Malaysia (Peninsular + Borneo), used for sanity checks only. */
export const MALAYSIA_BBOX = { minLat: 0.8, maxLat: 7.5, minLng: 99.5, maxLng: 119.5 } as const;

export function isInMalaysiaBBox(p: LatLng): boolean {
  return (
    p.lat >= MALAYSIA_BBOX.minLat &&
    p.lat <= MALAYSIA_BBOX.maxLat &&
    p.lng >= MALAYSIA_BBOX.minLng &&
    p.lng <= MALAYSIA_BBOX.maxLng
  );
}
