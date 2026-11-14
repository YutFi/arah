import { isInMalaysiaBBox, MAX_TRIP_STOPS } from "@arah/core";
import type { Place } from "./geocode";

/**
 * The stops of the trip being planned, kept only on this phone (localStorage) so that a
 * phone that closes the page in the background does not lose them. Never uploaded.
 * Cleared when the trip ends or is cleared.
 */
const KEY = "arah.trip";

export function loadTrip(): Place[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    const out: Place[] = [];
    for (const p of data) {
      if (!p || typeof p.id !== "string" || typeof p.name !== "string" || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
      if (!isInMalaysiaBBox({ lat: p.lat, lng: p.lng })) continue;
      out.push({ id: p.id, name: p.name.slice(0, 120), detail: typeof p.detail === "string" ? p.detail.slice(0, 160) : "", lat: p.lat, lng: p.lng, kind: p.kind === "pin" ? "pin" : "search" });
    }
    return out.slice(0, MAX_TRIP_STOPS);
  } catch {
    return [];
  }
}

export function saveTrip(stops: Place[]): void {
  try {
    if (stops.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(stops.map((p) => ({ id: p.id, name: p.name, detail: p.detail, lat: p.lat, lng: p.lng, kind: p.kind }))));
  } catch {
    /* storage can be blocked (private mode); the trip just will not survive a reload */
  }
}
