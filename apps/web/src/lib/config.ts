/**
 * Where the app talks to the outside world. All three default to free public
 * demo servers so the app works on day one, but those are NOT meant for real
 * traffic: for a public launch, host your own (see docs/DEPLOYMENT.md) and set
 * these in a .env file. Nothing here is a secret or an API key.
 */
const env = import.meta.env;

export const config = {
  /** MapLibre style (basemap). OpenFreeMap is free, open and needs no key. */
  styleUrl: (env.VITE_STYLE_URL as string | undefined) ?? "https://tiles.openfreemap.org/styles/liberty",
  /** Valhalla routing server (public demo run by FOSSGIS e.V.). */
  routingUrl: (env.VITE_ROUTING_URL as string | undefined) ?? "https://valhalla1.openstreetmap.de",
  /** Photon search server (public demo run by komoot). */
  geocoderUrl: (env.VITE_GEOCODER_URL as string | undefined) ?? "https://photon.komoot.io",
  /** Photon is tried first for search; Nominatim (OpenStreetMap) is the fallback for full street addresses. */
  addressUrl: (env.VITE_ADDRESS_URL as string | undefined) ?? "https://nominatim.openstreetmap.org",
  /** Overpass API for "what is near me" (public demo servers, tried in this order). */
  poiUrls: ((env.VITE_POI_URL as string | undefined)?.split(",").map((s) => s.trim()).filter(Boolean)) ?? [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
  ],
  /** Where the map opens before we know your location: Kuala Lumpur. */
  defaultCenter: { lat: 3.139, lng: 101.6869 },
  defaultZoom: 11,
} as const;
