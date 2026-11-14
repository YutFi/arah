import {
  cellsAlongRoute,
  cellsForCircle,
  haversine,
  POI_CELL_DEG,
  roadTileToElements,
  rowToPoi,
  ROAD_CELL_DEG,
  type CategoryId,
  type LatLng,
  type Manifest,
  type Poi,
  type PoiRow,
  type Route,
  type RoadTile,
} from "@arah/core";
import { t } from "./i18n";

/**
 * Reads the pre-built map data (see scripts/build-osm-data.sh). These are small
 * static files served next to the app, so they load in a fraction of a second
 * and the browser keeps them for next time.
 */
const BASE = `${import.meta.env.BASE_URL}data/osm/`;

let manifestP: Promise<Manifest | null> | null = null;

/** The list of available tiles, or null if the data has not been built (then callers use a live server). */
export function getManifest(): Promise<Manifest | null> {
  if (!manifestP) {
    const p: Promise<Manifest | null> = fetch(`${BASE}manifest.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
      .then((m) => (m && m.version === 1 ? m : null))
      .catch(() => null);
    manifestP = p;
    // A miss should not stick for the whole session: look again after 30 s.
    void p.then((m) => {
      if (!m) setTimeout(() => manifestP === p && (manifestP = null), 30_000);
    });
  }
  return manifestP;
}

const tileCache = new Map<string, Promise<unknown>>();

function tile<T>(path: string, signal: AbortSignal): Promise<T> {
  let p = tileCache.get(path) as Promise<T> | undefined;
  if (!p) {
    p = fetch(`${BASE}${path}`, { signal }).then((r) => {
      if (!r.ok) throw new Error(t("err.dataFile", { p: path, s: r.status }));
      return r.json() as Promise<T>;
    });
    tileCache.set(path, p);
    p.catch(() => tileCache.delete(path));
    if (tileCache.size > 80) tileCache.delete(tileCache.keys().next().value as string);
  }
  return p;
}

/** Run `fn` over items, a few at a time. */
async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i] as T);
      }
    }),
  );
  return out;
}

/** Places within a radius, from the pre-built data. Returns null when that data is not available. */
export async function staticNearby(
  center: LatLng,
  radiusM: number,
  ids: readonly CategoryId[],
  signal: AbortSignal,
): Promise<Partial<Record<CategoryId, Poi[]>> | null> {
  const m = await getManifest();
  if (!m) return null;
  const have = new Set(m.poiCells);
  const cells = cellsForCircle(center, radiusM, POI_CELL_DEG).filter((c) => have.has(c));
  const rows = (await pool(cells, 4, (c) => tile<PoiRow[]>(`poi/${c}.json`, signal))).flat();
  const want = new Set<CategoryId>(ids);
  const out: Partial<Record<CategoryId, Poi[]>> = {};
  for (const id of ids) out[id] = [];
  for (const r of rows) {
    if (!want.has(r.c)) continue;
    const p = rowToPoi(r);
    if (haversine(center, p) <= radiusM) out[r.c]!.push(p);
  }
  return out;
}

/** Traffic lights, cameras and toll booths near the routes, from the pre-built data. Null if not available. */
export async function staticRouteElements(routes: Route[], signal: AbortSignal) {
  const m = await getManifest();
  if (!m) return null;
  const have = new Set(m.roadCells);
  const cells = new Set<string>();
  for (const r of routes) for (const c of cellsAlongRoute(r.points, ROAD_CELL_DEG)) if (have.has(c)) cells.add(c);
  const tiles = await pool([...cells], 6, (c) => tile<RoadTile>(`road/${c}.json`, signal));
  return tiles.flatMap(roadTileToElements);
}
