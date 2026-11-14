import type { LatLng } from "@arah/core";
import { config } from "./config";

export interface Place {
  id: string;
  name: string;
  detail: string;
  lat: number;
  lng: number;
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

export async function searchPlaces(query: string, near: LatLng | null, signal?: AbortSignal): Promise<Place[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({ q, limit: "7", bbox: MALAYSIA_BBOX });
  if (near) {
    params.set("lat", String(near.lat));
    params.set("lon", String(near.lng));
  }
  const res = await fetch(`${config.geocoderUrl}/api/?${params}`, { signal });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const data = (await res.json()) as { features?: PhotonFeature[] };

  return (data.features ?? []).map((f, i) => {
    const p = f.properties;
    const street = [p.housenumber, p.street].filter(Boolean).join(" ");
    const name = p.name ?? (street || "Unnamed place");
    const detail = [p.name ? street : "", p.district, p.city, p.state].filter(Boolean).join(", ");
    const [lng, lat] = f.geometry.coordinates;
    return { id: `${p.osm_type ?? "x"}${p.osm_id ?? i}-${i}`, name, detail, lat, lng };
  });
}
