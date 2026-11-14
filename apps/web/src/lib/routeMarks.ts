import { findTollRate, type RouteFeatures } from "@arah/core";

/** What to draw on the map for the chosen route. */
export interface RouteMarks {
  signals: { lat: number; lng: number }[];
  /** Speed cameras mapped on OpenStreetMap (NOT the official AWAS list). */
  cameras: { lat: number; lng: number; maxspeed?: string }[];
  /** Toll plazas, with a price only when our sourced list has one. */
  tolls: { lat: number; lng: number; name: string; rm?: number }[];
}

/** Only marks between `fromM` and `toM` along the route (used while driving, to keep the map light). */
export interface MarkWindow {
  fromM: number;
  toM: number;
}

export function buildMarks(f: RouteFeatures, win?: MarkWindow): RouteMarks {
  const inWin = <T extends { distanceAlongM: number }>(x: T) => !win || (x.distanceAlongM >= win.fromM && x.distanceAlongM <= win.toM);
  return {
    signals: f.signals.filter(inWin).map(({ lat, lng }) => ({ lat, lng })),
    cameras: f.cameras.filter(inWin).map(({ lat, lng, maxspeed }) => ({ lat, lng, maxspeed })),
    tolls: f.tolls.filter(inWin).map(({ lat, lng, name }) => ({ lat, lng, name, rm: findTollRate(name)?.rm })),
  };
}
