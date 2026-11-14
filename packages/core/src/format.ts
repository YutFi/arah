/** Display helpers. Kept free of any UI code so they are easy to test. */

export function formatDistance(m: number): string {
  if (!Number.isFinite(m) || m < 0) return "–";
  if (m < 1000) return `${Math.round(m / 10) * 10 || (m > 0 ? 10 : 0)} m`;
  const km = m / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export function formatDuration(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "–";
  const mins = Math.max(1, Math.round(s / 60));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Local arrival time as HH:MM (24h). */
export function formatArrival(now: Date, remainingS: number): string {
  const t = new Date(now.getTime() + remainingS * 1000);
  return `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}

/** Convert m/s to whole km/h. */
export function mpsToKph(mps: number): number {
  return Math.round(mps * 3.6);
}
