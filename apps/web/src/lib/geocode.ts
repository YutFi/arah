import { addressFallbacks, looksLikeAddress, type CategoryId, type LatLng } from "@arah/core";
import { config } from "./config";
import { t } from "./i18n";

export interface Place {
  id: string;
  name: string;
  detail: string;
  lat: number;
  lng: number;
  /** Set when the exact thing typed was not found and this is the closest match. */
  approximate?: boolean;
  /** The simpler text that was actually matched (shown with a translated explanation). */
  approxFor?: string;
  /** "pin" = a point the person chose themselves (long-press or coordinates). */
  kind?: "search" | "poi" | "pin";
  /** A pin that has no name yet: the app looks up what is there. */
  unnamed?: boolean;
  category?: CategoryId;
  sub?: string;
  hours?: string;
  phone?: string;
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_id?: number;
    osm_type?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    district?: string;
    city?: string;
    state?: string;
    postcode?: string;
  };
}

// Search is limited to Malaysia: minLng,minLat,maxLng,maxLat.
const MALAYSIA_BBOX = "99.5,0.8,119.5,7.5";

function fromPhoton(features: PhotonFeature[]): Place[] {
  return features.map((f, i) => {
    const p = f.properties;
    const street = [p.housenumber, p.street].filter(Boolean).join(" ");
    const name = p.name ?? (street || t("place.unnamed"));
    const detail = [p.name ? street : "", p.district, p.city, p.state].filter(Boolean).join(", ");
    const [lng, lat] = f.geometry.coordinates;
    return { id: `${p.osm_type ?? "x"}${p.osm_id ?? i}-${i}`, name, detail, lat, lng, kind: "search" as const };
  });
}

async function photon(q: string, near: LatLng | null, signal?: AbortSignal): Promise<Place[]> {
  const params = new URLSearchParams({ q, limit: "7", bbox: MALAYSIA_BBOX });
  if (near) {
    params.set("lat", String(near.lat));
    params.set("lon", String(near.lng));
  }
  const res = await fetch(`${config.geocoderUrl}/api/?${params}`, { signal });
  if (!res.ok) throw new Error(t("search.unavailable"));
  const data = (await res.json()) as { features?: PhotonFeature[] };
  return fromPhoton(data.features ?? []);
}

interface NominatimHit {
  osm_type?: string;
  osm_id?: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
}

/** Street-address search. Only used on an explicit search (Enter), never while typing. */
async function nominatim(q: string, signal?: AbortSignal): Promise<Place[]> {
  const params = new URLSearchParams({ q, format: "jsonv2", countrycodes: "my", limit: "5" });
  const res = await fetch(`${config.addressUrl}/search?${params}`, { signal });
  if (!res.ok) throw new Error(t("search.unavailable"));
  const hits = (await res.json()) as NominatimHit[];
  return hits.map((h, i) => {
    const parts = h.display_name.split(",").map((s) => s.trim());
    const name = h.name || parts[0] || t("place.unnamed");
    const rest = parts.slice(1).filter((s) => s !== "Malaysia");
    return {
      id: `n${h.osm_type ?? "x"}${h.osm_id ?? i}-${i}`,
      name,
      detail: rest.slice(0, 4).join(", "),
      lat: Number(h.lat),
      lng: Number(h.lon),
      kind: "search" as const,
    };
  });
}

function approx(places: Place[], tried: string): Place[] {
  return places.map((p) => ({
    ...p,
    approximate: true,
    approxFor: tried,
  }));
}

/**
 * Find places for what was typed. If the full text finds nothing and it looks
 * like a street address, try simpler versions of it (area, town) and say so.
 * `deep` is for an explicit search (Enter): it also asks the address service.
 */
export async function searchPlaces(
  query: string,
  near: LatLng | null,
  signal?: AbortSignal,
  opts: { deep?: boolean } = {},
): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const direct = await photon(q, near, signal);
  if (direct.length) return direct;
  if (!looksLikeAddress(q)) return [];

  const fallbacks = addressFallbacks(q);
  if (opts.deep) {
    try {
      const exact = await nominatim(q, signal);
      if (exact.length) return exact;
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      /* fall through to the simpler searches */
    }
  }
  for (const v of fallbacks.slice(0, opts.deep ? 5 : 3)) {
    const r = await photon(v, near, signal);
    if (r.length) return approx(r, v);
  }
  return [];
}

/** What is at this point? Used to name a pin the person dropped. */
export async function reversePlace(p: LatLng, signal?: AbortSignal): Promise<{ name: string; detail: string } | null> {
  const params = new URLSearchParams({ lat: String(p.lat), lon: String(p.lng), limit: "1" });
  const res = await fetch(`${config.geocoderUrl}/reverse?${params}`, { signal });
  if (!res.ok) return null;
  const data = (await res.json()) as { features?: PhotonFeature[] };
  const f = data.features?.[0];
  if (!f) return null;
  const pr = f.properties;
  const street = [pr.housenumber, pr.street].filter(Boolean).join(" ");
  const name = pr.name ?? street;
  if (!name) return null;
  const detail = [pr.name ? street : "", pr.district, pr.city, pr.state].filter(Boolean).join(", ");
  return { name, detail };
}
