/**
 * Earlier warnings for the turns that are easy to miss on fast roads: exits, ramps, forks
 * ("keep left / keep right") and merges. Klang Valley flyovers stack these close together, so a
 * warning only a few hundred metres ahead is often too late to change lane.
 *
 * This is timing only. It does not know which lane to be in: that needs per-junction lane data
 * that the free routing server and OpenStreetMap only partly have.
 */

/** Valhalla manoeuvre types: ramps 17 to 19, exits 20 and 21, stay 22 to 24, merges 25, 37 and 38. */
const FORK_TYPES = new Set([17, 18, 19, 20, 21, 22, 23, 24, 25, 37, 38]);

export const isForkManeuver = (type: number): boolean => FORK_TYPES.has(type);

/**
 * How far ahead (m) to give the early warning: about 45 s of driving, never under 900 m and
 * never over 2 km. Below 900 m the ordinary "in 600 metres" warning is used instead.
 */
export function headsUpDistanceM(speedMps: number): number {
  const v = Number.isFinite(speedMps) && speedMps > 0 ? speedMps : 0;
  return Math.round(Math.min(2000, Math.max(900, v * 45)));
}

/** Round to a spoken figure: 1.5 for 1480 m. */
export const spokenKm = (m: number): string => (Math.round(m / 100) / 10).toFixed(1).replace(/\.0$/, "");
