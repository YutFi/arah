import { parseValhallaTrip, type LatLng, type Route, type ValhallaTrip } from "@arah/core";
import { config } from "./config";

export interface RouteRequest {
  from: LatLng;
  to: LatLng;
  avoidTolls: boolean;
  /** How many alternative routes to ask for besides the main one. */
  alternates?: number;
}

interface ValhallaResponse {
  trip?: ValhallaTrip;
  alternates?: { trip: ValhallaTrip }[];
  error?: string;
}

/** Ask the routing server for routes. Returns the main route first. */
export async function fetchRoutes(req: RouteRequest, signal?: AbortSignal): Promise<Route[]> {
  const body = {
    locations: [
      { lat: req.from.lat, lon: req.from.lng },
      { lat: req.to.lat, lon: req.to.lng },
    ],
    costing: "auto",
    // use_tolls: 0 = avoid tolls as much as possible, 0.5 = neutral (the default).
    costing_options: { auto: { use_tolls: req.avoidTolls ? 0 : 0.5 } },
    alternates: req.alternates ?? 2,
    directions_options: { units: "kilometers", language: "en-US" },
  };
  const url = `${config.routingUrl}/route?json=${encodeURIComponent(JSON.stringify(body))}`;

  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new Error("Could not reach the routing server. Check your connection.");
  }

  let data: ValhallaResponse | null = null;
  try {
    data = (await res.json()) as ValhallaResponse;
  } catch {
    /* handled below */
  }
  if (!res.ok || !data?.trip) {
    throw new Error(data?.error ? `No route: ${data.error}` : `Routing server error (${res.status})`);
  }

  const trips = [data.trip, ...(data.alternates ?? []).map((a) => a.trip)];
  return trips.map(parseValhallaTrip);
}
