import { findTollRate, type RouteFeatures } from "@arah/core";

/** What to draw on the map for the chosen route. */
export interface RouteMarks {
  signals: { lat: number; lng: number }[];
  /** Speed cameras mapped on OpenStreetMap (NOT the official AWAS list). */
  cameras: { lat: number; lng: number; maxspeed?: string }[];
  /** Toll plazas, with a price only when our sourced list has one. */
  tolls: { lat: number; lng: number; name: string; rm?: number }[];
}

export function buildMarks(f: RouteFeatures): RouteMarks {
  return {
    signals: f.signals.map(({ lat, lng }) => ({ lat, lng })),
    cameras: f.cameras.map(({ lat, lng, maxspeed }) => ({ lat, lng, maxspeed })),
    tolls: f.tolls.map(({ lat, lng, name }) => ({ lat, lng, name, rm: findTollRate(name)?.rm })),
  };
}
