/**
 * Motorcycle lanes, and expressways that are closed to motorcycles.
 *
 * Malaysia has motorcycle lanes beside the main carriageway on some highways. The
 * routing server only knows about them if someone mapped them on OpenStreetMap, so
 * on top of the server's own motorcycle routing this file keeps a short, SOURCED list
 * of highways that are known to have one, and reads the street names of a route against
 * it. That lets the app say "this route uses the Federal Highway motorcycle lane" and
 * warn when a route goes along an expressway where no lane is known.
 *
 * Rules, same as the camera and toll data: nothing here is a guess. A highway is on the
 * list only with a source and the date it was checked. The list is partial ("all major
 * highways in Putrajaya" is not a name we can match, for example), so "no lane known" is
 * worded as "check the signs", never as "not allowed".
 */
export interface LaneHighway {
  id: string;
  /** Name as people say it. */
  name: string;
  /** Names the map and the routing server use, lower case, without punctuation. */
  aliases: readonly string[];
}

export const LANE_SOURCE = "https://en.wikipedia.org/wiki/Motorcycle_lane";
/** Second source: the Federal Highway, Shah Alam Expressway and Guthrie Corridor Expressway are named as having dedicated lanes. */
export const LANE_CHECKED_WITH = "https://fmtv5.freemalaysiatoday.com/category/nation/2025/04/24/improve-motorcycle-lane-design-to-boost-usage-reduce-accidents-govt-told";
export const LANE_DATA_CHECKED_ON = "2026-11-19";

export const LANE_HIGHWAYS: readonly LaneHighway[] = [
  { id: "federal", name: "Federal Highway", aliases: ["federal highway", "lebuhraya persekutuan"] },
  { id: "kesas", name: "Shah Alam Expressway (KESAS)", aliases: ["shah alam expressway", "lebuhraya shah alam", "kesas"] },
  { id: "gce", name: "Guthrie Corridor Expressway", aliases: ["guthrie corridor expressway", "lebuhraya koridor guthrie"] },
  { id: "bke", name: "Butterworth-Kulim Expressway", aliases: ["butterworth kulim expressway", "lebuhraya butterworth kulim"] },
  { id: "lpcc", name: "Putrajaya-Cyberjaya Expressway", aliases: ["putrajaya cyberjaya expressway", "lebuhraya putrajaya cyberjaya"] },
  { id: "ptp", name: "Port of Tanjung Pelepas Highway", aliases: ["port of tanjung pelepas highway", "lebuhraya pelabuhan tanjung pelepas"] },
  { id: "mahmud", name: "Sultan Mahmud Bridge", aliases: ["sultan mahmud bridge", "jambatan sultan mahmud"] },
  { id: "ismail", name: "Sultan Ismail Bridge", aliases: ["sultan ismail bridge", "jambatan sultan ismail"] },
];

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** The listed highway these street names belong to, or null. Whole-word match, so "Federal Highway Service Road" still matches but "Federal Hill" does not. */
export function laneHighwayOf(streetNames: readonly string[]): LaneHighway | null {
  const names = streetNames.map(norm).filter(Boolean);
  for (const h of LANE_HIGHWAYS) {
    for (const a of h.aliases) {
      const re = new RegExp(`(^| )${a}( |$)`);
      if (names.some((n) => re.test(n))) return h;
    }
  }
  return null;
}

/** An expressway ref such as "E1", "E12". */
const EXPRESSWAY_REF = /^e\d{1,3}$/i;

export interface HighwaySpan {
  /** Highway name to show. */
  name: string;
  fromM: number;
  toM: number;
}

export interface MotorcycleNotes {
  /** Stretches on a highway known to have a motorcycle lane. */
  lanes: HighwaySpan[];
  /** Total length on those (m). */
  laneM: number;
  /** Stretches on a toll road or numbered expressway with no known motorcycle lane. */
  expressways: HighwaySpan[];
}

type ManeuverLike = { streetNames: readonly string[]; toll: boolean; distanceFromStartM: number; lengthM: number };

function push(list: HighwaySpan[], name: string, fromM: number, toM: number) {
  const last = list[list.length - 1];
  // Joined when the same highway continues (a short gap at a ramp or junction is fine).
  if (last && last.name === name && fromM - last.toM < 300) last.toM = Math.max(last.toM, toM);
  else list.push({ name, fromM, toM });
}

/** Reads a route's turn-by-turn sections for motorcycle lanes and expressways. */
export function motorcycleNotes(route: { maneuvers: readonly ManeuverLike[] }): MotorcycleNotes {
  const lanes: HighwaySpan[] = [];
  const expressways: HighwaySpan[] = [];
  for (const m of route.maneuvers) {
    const from = m.distanceFromStartM;
    const to = from + m.lengthM;
    const lane = laneHighwayOf(m.streetNames);
    if (lane) {
      push(lanes, lane.name, from, to);
      continue;
    }
    const ref = m.streetNames.find((n) => EXPRESSWAY_REF.test(n.trim()));
    if (m.toll || ref) {
      const label = m.streetNames.find((n) => n.trim() && !EXPRESSWAY_REF.test(n.trim())) ?? ref ?? "";
      push(expressways, label, from, to);
    }
  }
  return { lanes, laneM: lanes.reduce((a, s) => a + (s.toM - s.fromM), 0), expressways };
}

export interface LaneStatus {
  /** The lane highway you are on now. */
  inside: HighwaySpan | null;
  /** The next one within `aheadM`, and how far away it starts. */
  next: { span: HighwaySpan; distanceM: number } | null;
}

/** Where `alongM` stands against the lane stretches (for the driving screen). */
export function laneStatus(lanes: readonly HighwaySpan[], alongM: number, aheadM = 1500): LaneStatus {
  const inside = lanes.find((s) => alongM >= s.fromM - 20 && alongM <= s.toM) ?? null;
  let next: LaneStatus["next"] = null;
  for (const s of lanes) {
    const d = s.fromM - alongM;
    if (d > 20 && d <= aheadM && (!next || d < next.distanceM)) next = { span: s, distanceM: d };
  }
  return { inside, next };
}

/**
 * Motorcycle routes: those that run along an expressway with no known lane go last, so the
 * first (recommended) one is the one most likely to be allowed. Otherwise the order is kept.
 */
export function motorcycleOrder<T extends { maneuvers: readonly ManeuverLike[] }>(routes: readonly T[]): T[] {
  const ok: T[] = [];
  const flagged: T[] = [];
  for (const r of routes) (motorcycleNotes(r).expressways.length > 0 ? flagged : ok).push(r);
  return [...ok, ...flagged];
}
