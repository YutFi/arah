import { haversine, isInMalaysiaBBox, type LatLng } from "./geo";
import { CATEGORIES, parseOverpass, type CategoryId, type Poi } from "./places";

/**
 * Pre-built map data, cut into small square "tiles" so the phone only loads
 * the few files around where it is looking, from the same place the app itself
 * is served. This replaces slow live calls to a public server.
 *
 * Built from an OpenStreetMap extract by scripts/build-osm-data.sh.
 */

/** Places of interest: ~11 km squares. */
export const POI_CELL_DEG = 0.1;
/** Traffic lights, cameras, toll booths: ~28 km squares. */
export const ROAD_CELL_DEG = 0.25;

export const cellX = (lng: number, size: number) => Math.floor(lng / size + 1e-9);
export const cellY = (lat: number, size: number) => Math.floor(lat / size + 1e-9);
export const cellKey = (p: LatLng, size: number) => `${cellX(p.lng, size)}_${cellY(p.lat, size)}`;

const M_PER_DEG = 111_320;

/** Every tile a circle touches. */
export function cellsForCircle(center: LatLng, radiusM: number, size: number): string[] {
  const dLat = radiusM / M_PER_DEG;
  const dLng = radiusM / (M_PER_DEG * Math.max(0.2, Math.cos((center.lat * Math.PI) / 180)));
  const out: string[] = [];
  for (let y = cellY(center.lat - dLat, size); y <= cellY(center.lat + dLat, size); y++) {
    for (let x = cellX(center.lng - dLng, size); x <= cellX(center.lng + dLng, size); x++) out.push(`${x}_${y}`);
  }
  return out;
}

/**
 * Every tile a route passes through or comes within `bufferM` of. The route is
 * sampled every `stepM` (routes on motorways have very long straight pieces).
 */
export function cellsAlongRoute(points: readonly LatLng[], size: number, stepM = 400, bufferM = 40): string[] {
  const set = new Set<string>();
  const add = (p: LatLng) => {
    const dLat = bufferM / M_PER_DEG;
    const dLng = bufferM / (M_PER_DEG * Math.max(0.2, Math.cos((p.lat * Math.PI) / 180)));
    for (const [a, b] of [[0, 0], [dLat, 0], [-dLat, 0], [0, dLng], [0, -dLng]] as const) {
      set.add(cellKey({ lat: p.lat + a, lng: p.lng + b }, size));
    }
  };
  for (let i = 0; i < points.length; i++) {
    const a = points[i] as LatLng;
    add(a);
    const b = points[i + 1];
    if (!b) break;
    const n = Math.floor(haversine(a, b) / stepM);
    for (let k = 1; k <= n; k++) {
      const t = k / (n + 1);
      add({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
    }
  }
  return [...set];
}

// ---- the compact file formats ------------------------------------------------

/** One place in a tile file. Short keys keep the files small. */
export interface PoiRow {
  i: string; // id, "node/123"
  n: string; // name
  c: CategoryId;
  s: string; // short kind
  a: number; // lat
  o: number; // lng
  h?: string; // opening hours text
  d?: string; // address
  p?: string; // phone
}

export interface RoadTile {
  /** traffic lights [lat, lng] */
  s: [number, number][];
  /** speed cameras [lat, lng, maxspeed?] */
  c: [number, number, string?][];
  /** toll booths [lat, lng, name?] */
  t: [number, number, string?][];
}

export interface Manifest {
  version: 1;
  /** When the files were built (ISO). */
  builtAt: string;
  /** Where the data came from, for the About screen. */
  source: string;
  poiCells: string[];
  roadCells: string[];
  counts: { places: number; signals: number; cameras: number; tolls: number };
}

const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

export function poiToRow(p: Poi): PoiRow {
  const row: PoiRow = { i: p.id, n: p.name, c: p.category, s: p.sub, a: r5(p.lat), o: r5(p.lng) };
  if (p.hours) row.h = p.hours;
  if (p.address) row.d = p.address;
  if (p.phone) row.p = p.phone;
  return row;
}

export const rowToPoi = (r: PoiRow): Poi => ({
  id: r.i,
  name: r.n,
  category: r.c,
  sub: r.s,
  lat: r.a,
  lng: r.o,
  hours: r.h,
  address: r.d,
  phone: r.p,
});

export function groupPoiTiles(pois: readonly Poi[]): Map<string, PoiRow[]> {
  const out = new Map<string, PoiRow[]>();
  for (const p of pois) {
    const k = cellKey(p, POI_CELL_DEG);
    (out.get(k) ?? out.set(k, []).get(k)!).push(poiToRow(p));
  }
  return out;
}

interface RawElement {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Sort traffic lights, cameras and toll booths into road tiles. */
export function groupRoadTiles(elements: readonly RawElement[]): Map<string, RoadTile> {
  const out = new Map<string, RoadTile>();
  for (const el of elements) {
    const t = el.tags;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!t || typeof lat !== "number" || typeof lng !== "number" || !isInMalaysiaBBox({ lat, lng })) continue;
    const kind = t.highway === "traffic_signals" ? "s" : t.highway === "speed_camera" ? "c" : t.barrier === "toll_booth" ? "t" : null;
    if (!kind) continue;
    const k = cellKey({ lat, lng }, ROAD_CELL_DEG);
    const tile = out.get(k) ?? out.set(k, { s: [], c: [], t: [] }).get(k)!;
    if (kind === "s") tile.s.push([r5(lat), r5(lng)]);
    else if (kind === "c") tile.c.push(t.maxspeed ? [r5(lat), r5(lng), t.maxspeed] : [r5(lat), r5(lng)]);
    else tile.t.push([r5(lat), r5(lng), t.name ?? t.operator ?? ""]);
  }
  return out;
}

/** Turn road tiles back into the element shape countRouteFeatures reads. */
export function roadTileToElements(tile: RoadTile): { type: string; lat: number; lon: number; tags: Record<string, string> }[] {
  const el = (lat: number, lon: number, tags: Record<string, string>) => ({ type: "node", lat, lon, tags });
  return [
    ...tile.s.map(([lat, lon]) => el(lat, lon, { highway: "traffic_signals" })),
    ...tile.c.map(([lat, lon, m]) => el(lat, lon, m ? { highway: "speed_camera", maxspeed: m } : { highway: "speed_camera" })),
    ...tile.t.map(([lat, lon, name]) => el(lat, lon, name ? { barrier: "toll_booth", name } : { barrier: "toll_booth" })),
  ];
}

// ---- what the extraction step must keep ------------------------------------

/** [key, value] pairs the extractor keeps: every category rule plus the road features. */
export const OSM_EXTRACT_RULES: readonly (readonly [string, string])[] = [
  ...CATEGORIES.flatMap((c) => c.rules.map(([k, v]) => [k, v] as const)),
  ["highway", "traffic_signals"],
  ["highway", "speed_camera"],
  ["barrier", "toll_booth"],
];

/** Tags worth keeping on kept objects (everything else is dropped to save space). */
export const OSM_KEEP_TAGS: readonly string[] = [
  ...new Set([
    "name", "name:en", "brand", "operator", "opening_hours", "phone", "contact:phone",
    "addr:housenumber", "addr:street", "addr:suburb", "addr:city", "maxspeed",
    ...OSM_EXTRACT_RULES.map(([k]) => k),
  ]),
];

/** From extracted elements to every tile file. Pure: no files are touched here. */
export function buildAllTiles(elements: readonly RawElement[], builtAt: string, source: string) {
  const pois = parseOverpass({ elements });
  const poi = groupPoiTiles(pois);
  const road = groupRoadTiles(elements);
  let signals = 0, cameras = 0, tolls = 0;
  for (const t of road.values()) {
    signals += t.s.length;
    cameras += t.c.length;
    tolls += t.t.length;
  }
  const manifest: Manifest = {
    version: 1,
    builtAt,
    source,
    poiCells: [...poi.keys()].sort(),
    roadCells: [...road.keys()].sort(),
    counts: { places: pois.length, signals, cameras, tolls },
  };
  return { poi, road, manifest };
}
