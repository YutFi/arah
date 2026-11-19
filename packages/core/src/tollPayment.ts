import { isInMalaysiaBBox, type LatLng } from "./geo";

/**
 * Which toll booths take Touch 'n Go, SmartTAG or RFID, as far as OpenStreetMap volunteers have
 * mapped it. Malaysian toll booths can carry `payment:touchngo`, `payment:touchngo_smarttag` and
 * `payment:touchngo_rfid` (see TOLL_PAYMENT_SOURCE). How many plazas are tagged this way is not
 * known to us, and no booth-by-booth dataset that is free exists, so everything here says "tagged
 * on OpenStreetMap" and the screen says what to do when nothing is tagged: read the overhead signs.
 */
export const TOLL_PAYMENT_SOURCE = "https://wiki.openstreetmap.org/wiki/Key:payment:*/Road_tolls_data";
/** Why the screen says "read the signs": RFID is installed in some existing lanes instead of its own (news report). */
export const TOLL_LANE_SHARING_SOURCE = "https://soyacincau.com/2019/02/12/tng-rfid-share-lane-with-touch-n-go/";
export const TOLL_PAYMENT_CHECKED_ON = "2026-11-19";

export interface TollBooth {
  lat: number;
  lng: number;
  /** Lane or booth number if the mapper added one. */
  ref?: string;
  name?: string;
  /** true = tagged "yes", false = tagged "no", undefined = not tagged at all. */
  tng?: boolean;
  smarttag?: boolean;
  rfid?: boolean;
}

export interface TollPaymentSummary {
  /** Booths of this plaza mapped on OpenStreetMap. */
  booths: number;
  /** Booths with at least one payment tag. */
  tagged: number;
  tng: number;
  smarttag: number;
  rfid: number;
}

/** Overpass question for the booths around one plaza. */
export function tollBoothQuery(center: LatLng, radiusM = 250): string {
  if (!Number.isFinite(center.lat) || !Number.isFinite(center.lng)) throw new Error("Bad coordinates");
  const r = Math.round(Math.min(600, Math.max(60, radiusM)));
  return `[out:json][timeout:10];\nnwr["barrier"="toll_booth"](around:${r},${center.lat.toFixed(5)},${center.lng.toFixed(5)});\nout tags center 80;`;
}

const flag = (v: string | undefined): boolean | undefined => (v === "yes" ? true : v === "no" ? false : undefined);

/** Reads an Overpass answer into booths. Skips anything with no position. */
export function readTollBooths(json: unknown): TollBooth[] {
  const els = (json as { elements?: { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] } | null)?.elements;
  if (!Array.isArray(els)) return [];
  const out: TollBooth[] = [];
  for (const el of els) {
    const t = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (typeof lat !== "number" || typeof lng !== "number" || !isInMalaysiaBBox({ lat, lng })) continue;
    out.push({
      lat,
      lng,
      ref: t.ref,
      name: t.name,
      tng: flag(t["payment:touchngo"]),
      smarttag: flag(t["payment:touchngo_smarttag"]),
      rfid: flag(t["payment:touchngo_rfid"]),
    });
  }
  return out;
}

export function summarizeBooths(booths: readonly TollBooth[]): TollPaymentSummary {
  const s: TollPaymentSummary = { booths: booths.length, tagged: 0, tng: 0, smarttag: 0, rfid: 0 };
  for (const b of booths) {
    if (b.tng !== undefined || b.smarttag !== undefined || b.rfid !== undefined) s.tagged++;
    if (b.tng) s.tng++;
    if (b.smarttag) s.smarttag++;
    if (b.rfid) s.rfid++;
  }
  return s;
}

/** True when at least one booth says which payments it takes. When false, show nothing but the "read the signs" note. */
export const hasPaymentInfo = (s: TollPaymentSummary) => s.tagged > 0;
