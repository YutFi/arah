import {
  buildOverpassQuery,
  DEFAULT_RADIUS_M,
  parseOverpass,
  type CategoryId,
  type LatLng,
  type Poi,
} from "@arah/core";
import { config } from "./config";

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; pois: Poi[] }>();

/** Snap to ~110 m so nearby taps share one cached answer (and the server sees less precise points). */
export const snap = (p: LatLng): LatLng => ({
  lat: Math.round(p.lat * 1000) / 1000,
  lng: Math.round(p.lng * 1000) / 1000,
});

const key = (c: CategoryId, p: LatLng) => `${c}:${p.lat}:${p.lng}`;

export async function askOverpass(query: string, signal: AbortSignal): Promise<unknown> {
  let lastErr: Error = new Error("No server");
  for (const url of config.poiUrls) {
    try {
      // A plain form POST keeps this a "simple" cross-site request (no preflight).
      const res = await fetch(url, { method: "POST", body: new URLSearchParams({ data: query }), signal });
      if (!res.ok) throw new Error(`Places server said ${res.status}`);
      return await res.json();
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      lastErr = e as Error;
    }
  }
  throw lastErr;
}

/** Places of the given kinds near a point, grouped by kind. Answers are cached for 10 minutes. */
export async function fetchNearby(
  center: LatLng,
  ids: readonly CategoryId[],
  signal: AbortSignal,
): Promise<Partial<Record<CategoryId, Poi[]>>> {
  const c = snap(center);
  const now = Date.now();
  const out: Partial<Record<CategoryId, Poi[]>> = {};
  const missing: CategoryId[] = [];
  for (const id of ids) {
    const hit = cache.get(key(id, c));
    if (hit && now - hit.at < TTL_MS) out[id] = hit.pois;
    else missing.push(id);
  }
  if (missing.length) {
    const json = await askOverpass(buildOverpassQuery(c, DEFAULT_RADIUS_M, missing), signal);
    if ((json as { remark?: string }).remark && !(json as { elements?: unknown[] }).elements?.length) {
      throw new Error("The places server is busy. Try again in a moment.");
    }
    const pois = parseOverpass(json);
    for (const id of missing) {
      const list = pois.filter((p) => p.category === id);
      cache.set(key(id, c), { at: now, pois: list });
      out[id] = list;
    }
  }
  return out;
}
