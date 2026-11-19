import { haversine, isInMalaysiaBBox, type LatLng } from "./geo";

/**
 * "What is near me": categories of places, the question we ask OpenStreetMap
 * (through the Overpass API), and how we read the answer.
 *
 * Everything here comes from OpenStreetMap tags. We do NOT have ratings,
 * reviews, opening-now status or "how busy" data, so nothing here ranks places
 * by popularity. Results are simply the nearest named places of each kind.
 */

export type CategoryId = "fuel" | "worship" | "food" | "fun" | "hot" | "see" | "ev" | "health" | "money" | "shop" | "parking" | "shelter";

/** [osm key, osm value, short label shown to the person] */
type TagRule = readonly [key: string, value: string, label: string];

export interface PlaceCategory {
  id: CategoryId;
  label: string;
  rules: readonly TagRule[];
}

/**
 * Order matters: a place that matches two categories is filed under the first
 * one listed here.
 */
export const CATEGORIES: readonly PlaceCategory[] = [
  {
    id: "fuel",
    label: "Petrol",
    rules: [["amenity", "fuel", "Petrol station"]],
  },
  {
    // "Rumah ibadah": mosques, suraus, churches and temples. OpenStreetMap tags
    // them all as amenity=place_of_worship; the `religion` tag tells them apart
    // (see worshipKind below).
    id: "worship",
    label: "Worship",
    rules: [["amenity", "place_of_worship", "Place of worship"]],
  },
  {
    id: "fun",
    label: "Entertainment",
    rules: [
      ["amenity", "cinema", "Cinema"],
      ["amenity", "theatre", "Theatre"],
      ["amenity", "nightclub", "Nightclub"],
      ["amenity", "karaoke_box", "Karaoke"],
      ["leisure", "bowling_alley", "Bowling"],
      ["leisure", "amusement_arcade", "Arcade"],
      ["leisure", "water_park", "Water park"],
      ["leisure", "escape_game", "Escape game"],
      ["leisure", "ice_rink", "Ice rink"],
      ["leisure", "trampoline_park", "Trampoline park"],
      ["leisure", "miniature_golf", "Mini golf"],
      ["tourism", "theme_park", "Theme park"],
    ],
  },
  {
    id: "see",
    label: "Attractions",
    rules: [
      ["tourism", "attraction", "Attraction"],
      ["tourism", "museum", "Museum"],
      ["tourism", "gallery", "Gallery"],
      ["tourism", "viewpoint", "Viewpoint"],
      ["tourism", "zoo", "Zoo"],
      ["tourism", "aquarium", "Aquarium"],
      ["historic", "monument", "Monument"],
      ["historic", "fort", "Fort"],
      ["historic", "castle", "Castle"],
      ["natural", "waterfall", "Waterfall"],
      ["natural", "beach", "Beach"],
    ],
  },
  {
    id: "food",
    label: "Restaurants",
    rules: [
      ["amenity", "restaurant", "Restaurant"],
      ["amenity", "fast_food", "Fast food"],
      ["amenity", "food_court", "Food court"],
    ],
  },
  {
    // "Hotspots" = places people usually hang out. This is a plain list of
    // cafes, malls, markets and parks from OpenStreetMap, not a popularity ranking.
    id: "hot",
    label: "Hotspots",
    rules: [
      ["amenity", "cafe", "Cafe"],
      ["shop", "mall", "Shopping mall"],
      ["amenity", "marketplace", "Market"],
      ["leisure", "park", "Park"],
    ],
  },
  {
    id: "ev",
    label: "EV charging",
    rules: [["amenity", "charging_station", "EV charging"]],
  },
  {
    id: "health",
    label: "Health",
    rules: [
      ["amenity", "hospital", "Hospital"],
      ["amenity", "clinic", "Clinic"],
      ["amenity", "pharmacy", "Pharmacy"],
    ],
  },
  {
    id: "money",
    label: "ATM & bank",
    rules: [
      ["amenity", "atm", "ATM"],
      ["amenity", "bank", "Bank"],
    ],
  },
  {
    id: "shop",
    label: "Shops",
    rules: [
      ["shop", "convenience", "Convenience store"],
      ["shop", "supermarket", "Supermarket"],
    ],
  },
  {
    id: "parking",
    label: "Parking",
    rules: [["amenity", "parking", "Parking"]],
  },
  {
    // Rain cover for riders (tempat berteduh): shelters mapped on OpenStreetMap, such as bus
    // shelters and pavilions. Whether one is dry, safe or fits a motorcycle is not in the data.
    id: "shelter",
    label: "Shelter",
    rules: [["amenity", "shelter", "Shelter"]],
  },
];

/** These may be unnamed on the map (a brand or operator is enough to show them). */
const UNNAMED_OK: readonly CategoryId[] = ["fuel", "ev", "money", "shelter"];

export interface Poi {
  id: string;
  name: string;
  category: CategoryId;
  /** Short kind, e.g. "Cinema". */
  sub: string;
  lat: number;
  lng: number;
  /** Raw OpenStreetMap opening_hours text, if the mapper added one. */
  hours?: string;
  address?: string;
  phone?: string;
}

/** How far "nearby" reaches. */
export const DEFAULT_RADIUS_M = 5000;
const MIN_RADIUS_M = 300;
const MAX_RADIUS_M = 5000;

/** Overpass regex for a list of values: ^(a|b|c)$ */
function valueRegex(values: string[]): string {
  return `^(${values.join("|")})$`;
}

/** Build the Overpass QL question for the chosen categories around a point. */
export function buildOverpassQuery(
  center: LatLng,
  radiusM: number,
  ids: readonly CategoryId[],
  limitPerCategory = 60,
): string {
  if (!Number.isFinite(center.lat) || !Number.isFinite(center.lng)) throw new Error("Bad coordinates");
  const r = Math.round(Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, radiusM)));
  const around = `(around:${r},${center.lat.toFixed(5)},${center.lng.toFixed(5)})`;
  const parts: string[] = ["[out:json][timeout:12];"];
  for (const id of ids) {
    const cat = CATEGORIES.find((c) => c.id === id);
    if (!cat) continue;
    // Group the values by key so that each key becomes one filter.
    const byKey = new Map<string, string[]>();
    for (const [k, v] of cat.rules) byKey.set(k, [...(byKey.get(k) ?? []), v]);
    // Petrol, EV chargers and ATMs may be unnamed (they often only carry a brand or operator).
    const named = UNNAMED_OK.includes(id) ? "" : '["name"]';
    const lines = [...byKey.entries()].map(([k, vs]) => `  nwr["${k}"~"${valueRegex(vs)}"]${named}${around};`);
    parts.push(`(\n${lines.join("\n")}\n)->.${id};`, `.${id} out center ${limitPerCategory};`);
  }
  return parts.join("\n");
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Short kind for a place of worship, from the mapper's `religion` tag (and the name for Muslim places). */
export function worshipKind(tags: Record<string, string>): string {
  const name = (tags["name:en"] ?? tags.name ?? "").toLowerCase();
  switch ((tags.religion ?? "").toLowerCase()) {
    case "muslim":
      if (/\bsurau\b/.test(name)) return "Surau";
      if (/\bmasjid\b|\bmosque\b/.test(name)) return "Mosque";
      return "Mosque / surau";
    case "christian":
      return "Church";
    case "buddhist":
      return "Buddhist temple";
    case "taoist":
    case "chinese_folk":
    case "confucian":
      return "Chinese temple";
    case "hindu":
      return "Hindu temple";
    case "sikh":
      return "Gurdwara";
    default:
      return "Place of worship";
  }
}

/** Which category (and short kind) do these tags belong to? */
export function classify(tags: Record<string, string>): { category: CategoryId; sub: string } | null {
  for (const cat of CATEGORIES) {
    for (const [k, v, label] of cat.rules) {
      if (tags[k] === v) return { category: cat.id, sub: cat.id === "worship" ? worshipKind(tags) : label };
    }
  }
  return null;
}

function addressOf(t: Record<string, string>): string | undefined {
  const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  const parts = [street, t["addr:suburb"] ?? t["addr:city"]].filter(Boolean);
  return parts.length ? parts.join(", ") : undefined;
}

/** Read an Overpass answer into places. Skips anything we cannot name or locate. */
export function parseOverpass(json: unknown): Poi[] {
  const elements = (json as { elements?: OverpassElement[] } | null)?.elements;
  if (!Array.isArray(elements)) return [];
  const seen = new Set<string>();
  const out: Poi[] = [];
  for (const el of elements) {
    const tags = el.tags;
    if (!tags) continue;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (typeof lat !== "number" || typeof lng !== "number") continue;
    if (!isInMalaysiaBBox({ lat, lng })) continue;
    const cls = classify(tags);
    if (!cls) continue;
    const name =
      tags["name:en"] ?? tags.name ?? tags.brand ?? tags.operator ?? (cls.category === "ev" ? tags.network : undefined) ?? (cls.category === "shelter" ? cls.sub : undefined);
    if (!name) continue;
    const id = `${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name,
      category: cls.category,
      sub: cls.sub,
      lat,
      lng,
      hours: tags.opening_hours,
      address: addressOf(tags),
      phone: tags.phone ?? tags["contact:phone"],
    });
  }
  return out;
}

/** Nearest first, at most `limit` per category. */
export function nearestPerCategory(pois: readonly Poi[], from: LatLng, limit: number): Poi[] {
  const counts = new Map<CategoryId, number>();
  return pois
    .map((p) => ({ p, d: haversine(from, p) }))
    .sort((a, b) => a.d - b.d)
    .filter(({ p }) => {
      const n = counts.get(p.category) ?? 0;
      if (n >= limit) return false;
      counts.set(p.category, n + 1);
      return true;
    })
    .map(({ p }) => p);
}
