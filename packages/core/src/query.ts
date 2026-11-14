import { isInMalaysiaBBox, type LatLng } from "./geo";

/**
 * Helpers for what people type into the search box: coordinates, and long
 * street addresses that a place-name search engine cannot match as written.
 */

/**
 * "3.0366, 101.5416" or "3.0366 101.5416" -> a point. Also accepts the pair
 * the other way round ("101.54, 3.03"). Only points inside Malaysia count.
 */
export function parseCoordinates(text: string): LatLng | null {
  const m = text.trim().match(/^(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  // A bare "12 34" is far more likely a house number than a coordinate pair.
  if (!m[1]?.includes(".") && !m[2]?.includes(".")) return null;
  for (const p of [{ lat: a, lng: b }, { lat: b, lng: a }]) {
    if (isInMalaysiaBBox(p)) return p;
  }
  return null;
}

const POSTCODE = /\b\d{5}\b/;
const COUNTRY = /^(malaysia|my)$/i;
// "No 12", "Lot 5", "Unit 3-2", "Level 4", "Blok B", "B-3-2", "12A"
const UNIT_PART = /^((no|lot|unit|level|tingkat|blok|block|bangunan unit)\.?\s*[\w-]+|[a-z]?-?\d+[a-z]?(-\d+[a-z]?)*|\d+[a-z]?)$/i;

function splitParts(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  let parts = clean.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
  // No commas but a postcode, e.g. "Jalan X 40460 Kota Kemuning Shah Alam":
  // the postcode splits the street from the area.
  if (parts.length === 1) {
    const m = clean.match(POSTCODE);
    if (m && m.index !== undefined) {
      const before = clean.slice(0, m.index).trim();
      const after = clean.slice(m.index + 5).trim();
      parts = [before, after].filter(Boolean);
    }
  }
  return parts;
}

/** Does this look like a street address rather than a place name? */
export function looksLikeAddress(text: string): boolean {
  return /\d/.test(text) || text.includes(",");
}

/**
 * Simpler versions of an address, most specific first, for when the full text
 * finds nothing: drop the postcode and country, then drop the house or street
 * part by part until only the area is left.
 *
 *   "No 1, Jalan Plumbum, 40460 Kota Kemuning, Shah Alam Selangor"
 *   -> "Jalan Plumbum, Kota Kemuning, Shah Alam Selangor"
 *   -> "Kota Kemuning, Shah Alam Selangor"
 *   -> "Shah Alam Selangor"
 *
 * The caller must tell the person when a simplified match was used.
 */
export function addressFallbacks(text: string): string[] {
  let parts = splitParts(text)
    .filter((p) => !COUNTRY.test(p))
    .map((p) => p.replace(POSTCODE, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  // Leading unit / house number parts carry no information for a place search.
  while (parts.length > 1 && UNIT_PART.test(parts[0] as string)) parts = parts.slice(1);

  const original = text.replace(/\s+/g, " ").trim().toLowerCase();
  const out: string[] = [];
  const add = (s: string) => {
    const v = s.trim();
    if (v.length >= 3 && v.toLowerCase() !== original && !out.some((o) => o.toLowerCase() === v.toLowerCase())) out.push(v);
  };
  for (let i = 0; i < parts.length; i++) add(parts.slice(i).join(", "));
  return out;
}
