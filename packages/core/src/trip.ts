import { haversine, type LatLng } from "./geo";

/**
 * Multi-stop trips: pure list helpers (no map, no network).
 * A stop is any place with an id and a position.
 */
export interface StopLike extends LatLng {
  id: string;
}

/** Most stops in one trip (the public routing server allows more, but a trip that long is a day plan). */
export const MAX_TRIP_STOPS = 10;

/** Two places closer than this are treated as the same spot. */
export const SAME_SPOT_M = 30;

export const sameSpot = (a: LatLng, b: LatLng, withinM = SAME_SPOT_M): boolean => haversine(a, b) <= withinM;

export const hasStop = <T extends StopLike>(list: readonly T[], p: StopLike): boolean => list.some((s) => s.id === p.id || sameSpot(s, p));

export type AddResult<T> = { ok: true; list: T[] } | { ok: false; reason: "duplicate" | "full"; list: T[] };

/** Add a stop at the end. Refuses a place already in the trip, or a trip that is full. */
export function addStop<T extends StopLike>(list: readonly T[], p: T): AddResult<T> {
  if (hasStop(list, p)) return { ok: false, reason: "duplicate", list: list.slice() };
  if (list.length >= MAX_TRIP_STOPS) return { ok: false, reason: "full", list: list.slice() };
  return { ok: true, list: [...list, p] };
}

export function removeStop<T>(list: readonly T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

/** Move one stop up (-1) or down (+1). Out-of-range moves leave the list as it is. */
export function moveStop<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list.slice();
  const out = list.slice();
  const [item] = out.splice(index, 1);
  out.splice(to, 0, item as T);
  return out;
}

/**
 * Re-order stops so each next stop is the closest remaining one, starting from `from`.
 * This uses straight-line distance, NOT road distance, so it is a rough guide only.
 * The first `keep` stops (already done, or the one being driven to) stay where they are.
 */
export function nearestFirst<T extends LatLng>(from: LatLng, stops: readonly T[], keep = 0): T[] {
  const fixed = stops.slice(0, keep);
  const rest = stops.slice(keep);
  let at: LatLng = fixed.length > 0 ? (fixed[fixed.length - 1] as LatLng) : from;
  const out: T[] = [];
  while (rest.length > 0) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < rest.length; i++) {
      const d = haversine(at, rest[i] as LatLng);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    const [next] = rest.splice(best, 1);
    out.push(next as T);
    at = next as LatLng;
  }
  return [...fixed, ...out];
}

/** Sum of straight-line hops from `from` through the stops (a rough size of the trip, not a road distance). */
export function straightLineTotalM(from: LatLng, stops: readonly LatLng[]): number {
  let total = 0;
  let at = from;
  for (const s of stops) {
    total += haversine(at, s);
    at = s;
  }
  return total;
}
