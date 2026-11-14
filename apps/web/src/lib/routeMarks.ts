import { findTollRate, haversine, type CameraOnRoute, type RouteFeatures } from "@arah/core";

/** What to draw on the map for the chosen route. */
export interface RouteMarks {
  signals: { lat: number; lng: number }[];
  /** Speed cameras mapped on OpenStreetMap (NOT the official AWAS list). */
  cameras: { lat: number; lng: number; maxspeed?: string }[];
  /** Cameras from the JPJ AwAS list (position approximate). */
  awas: { id: string; lat: number; lng: number; speedLimitKph?: number }[];
  /** Toll plazas, with a price only when our sourced list has one. */
  tolls: { lat: number; lng: number; name: string; rm?: number }[];
}

/** Only marks between `fromM` and `toM` along the route (used while driving, to keep the map light). */
export interface MarkWindow {
  fromM: number;
  toM: number;
}

export function buildMarks(f: RouteFeatures, win?: MarkWindow, awas: CameraOnRoute[] = []): RouteMarks {
  const inWin = <T extends { distanceAlongM: number }>(x: T) => !win || (x.distanceAlongM >= win.fromM && x.distanceAlongM <= win.toM);
  const awasHere = awas.filter(inWin);
  return {
    signals: f.signals.filter(inWin).map(({ lat, lng }) => ({ lat, lng })),
    // An OpenStreetMap camera that is the same spot as an AwAS pin is drawn once (as the AwAS pin).
    cameras: f.cameras
      .filter(inWin)
      .filter((c) => !awasHere.some((a) => haversine(c, a.camera) < 60))
      .map(({ lat, lng, maxspeed }) => ({ lat, lng, maxspeed })),
    awas: awasHere.map(({ camera: c }) => ({ id: c.id, lat: c.lat, lng: c.lng, speedLimitKph: c.speedLimitKph })),
    tolls: f.tolls.filter(inWin).map(({ lat, lng, name }) => ({ lat, lng, name, rm: findTollRate(name)?.rm })),
  };
}
