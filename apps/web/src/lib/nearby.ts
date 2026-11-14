import {
  buildOverpassQuery,
  DEFAULT_RADIUS_M,
  parseOverpass,
  type CategoryId,
  type LatLng,
  type Poi,
} from "@arah/core";
import { config } from "./config";
import { staticNearby } from "./osmData";
import { t } from "./i18n";

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; pois: Poi[] }>();

/** Snap to ~110 m so nearby taps share one cached answer (and a server sees a less precise point). */
export const snap = (p: LatLng): LatLng => ({
  lat: Math.round(p.lat * 1000) / 1000,
  lng: Math.round(p.lng * 1000) / 1000,
});

const key = (c: CategoryId, p: LatLng) => `${c}:${p.lat}:${p.lng}`;

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

/**
 * Ask a public Overpass server. The public servers are often slow or busy, so:
 * the second server is asked too if the first has not answered in 2 s, the
 * first good answer wins, and everything gives up after `timeoutMs`.
 */
export async function askOverpass(query: string, signal: AbortSignal, timeoutMs = 15000): Promise<unknown> {
  const ctl = new AbortController();
  const stop = () => ctl.abort();
  signal.addEventListener("abort", stop);
  const timer = setTimeout(stop, timeoutMs);
  const attempts = config.poiUrls.map(async (url, i) => {
    if (i > 0) await sleep(i * 2000, ctl.signal);
    // A plain form POST keeps this a "simple" cross-site request (no preflight).
    const res = await fetch(url, { method: "POST", body: new URLSearchParams({ data: query }), signal: ctl.signal });
    if (!res.ok) throw new Error(t("err.server", { s: res.status }));
    return res.json();
  });
  try {
    return await Promise.any(attempts);
  } catch (e) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const first = (e as AggregateError).errors?.[0] as Error | undefined;
    throw new Error(
      ctl.signal.aborted ? t("err.slow") : (first?.message ?? t("err.unreachable")),
    );
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", stop);
    ctl.abort();
  }
}

/**
 * Places of the given kinds near a point, grouped by kind. Uses the pre-built
 * data (instant) and only falls back to a live server if that is not available.
 */
export async function fetchNearby(
  center: LatLng,
  ids: readonly CategoryId[],
  signal: AbortSignal,
): Promise<Partial<Record<CategoryId, Poi[]>>> {
  const c = snap(center);
  const fast = await staticNearby(c, DEFAULT_RADIUS_M, ids, signal);
  if (fast) return fast;

  const now = Date.now();
  const out: Partial<Record<CategoryId, Poi[]>> = {};
  const missing: CategoryId[] = [];
  for (const id of ids) {
    const hit = cache.get(key(id, c));
    if (hit && now - hit.at < TTL_MS) out[id] = hit.pois;
    else missing.push(id);
  }
  if (missing.length) {
    const json = await askOverpass(buildOverpassQuery(c, DEFAULT_RADIUS_M, missing), signal, 9000);
    if ((json as { remark?: string }).remark && !(json as { elements?: unknown[] }).elements?.length) {
      throw new Error(t("err.busy"));
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
