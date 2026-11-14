import { useSyncExternalStore } from "react";

/** Places you saved. Kept only on this phone (localStorage). Never uploaded. */
export type SavedKind = "home" | "work" | "parked" | "fav";

export interface SavedPlace {
  id: string;
  kind: SavedKind;
  name: string;
  lat: number;
  lng: number;
  savedAt: number;
}

const KEY = "arah.saved";
const MAX = 60;

function load(): SavedPlace[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter(
      (p): p is SavedPlace =>
        !!p &&
        typeof p.id === "string" &&
        typeof p.name === "string" &&
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lng) &&
        (p.kind === "home" || p.kind === "work" || p.kind === "parked" || p.kind === "fav"),
    );
  } catch {
    return [];
  }
}

let items: SavedPlace[] = load();
const listeners = new Set<() => void>();

function commit(next: SavedPlace[]) {
  items = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked: the list still works until the page closes */
  }
  for (const l of listeners) l();
}

/** Same spot (about 10 m) counts as the same place. */
export const sameSpot = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  Math.abs(a.lat - b.lat) < 0.0001 && Math.abs(a.lng - b.lng) < 0.0001;

export function getSaved(): SavedPlace[] {
  return items;
}

/** Home, Work and Parked are single slots; saving again replaces the old one. Favourites stack up. */
export function savePlace(kind: SavedKind, name: string, lat: number, lng: number) {
  const rest = items.filter((p) => (kind === "fav" ? !(p.kind === "fav" && sameSpot(p, { lat, lng })) : p.kind !== kind));
  const entry: SavedPlace = { id: `${kind}-${Date.now()}`, kind, name, lat, lng, savedAt: Date.now() };
  commit([entry, ...rest].slice(0, MAX));
}

export function removeSaved(id: string) {
  commit(items.filter((p) => p.id !== id));
}

/** Which saved entries sit at this spot. */
export function savedAt(list: SavedPlace[], p: { lat: number; lng: number }): SavedPlace[] {
  return list.filter((s) => sameSpot(s, p));
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSaved(): SavedPlace[] {
  return useSyncExternalStore(subscribe, getSaved, getSaved);
}
