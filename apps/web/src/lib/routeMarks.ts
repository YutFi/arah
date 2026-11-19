import { findTollRate, haversine, heightWarning, pointAtDistance, type CameraOnRoute, type HighwaySpan, type Route, type RouteExtra, type RouteFeatures } from "@arah/core";

/** What to draw on the map for the chosen route. */
export interface RouteMarks {
  signals: { lat: number; lng: number }[];
  /** Speed cameras mapped on OpenStreetMap (NOT the official AWAS list). */
  cameras: { lat: number; lng: number; maxspeed?: string }[];
  /** Cameras from the JPJ AwAS list (position approximate). */
  awas: { id: string; lat: number; lng: number; speedLimitKph?: number }[];
  /** Toll plazas, with a price only when our sourced list has one. */
  tolls: { lat: number; lng: number; name: string; rm?: number }[];
  /** Motorcycle: where the route reaches a stretch with a motorcycle lane (start of the named highway stretch). */
  lanes: { lat: number; lng: number; name: string }[];
  /** Motorcycle: rain shelters mapped on OpenStreetMap near the route. */
  shelters: { lat: number; lng: number; name?: string }[];
  /** Truck: footbridges over the route and mapped height limits. `warn` is "over" only when a number is mapped and the truck is not lower. */
  bridges: { lat: number; lng: number; kind: "overbridge" | "heightlimit"; maxheight?: string; warn: "over" | "ok" | "unknown" }[];
}

/** Only marks between `fromM` and `toM` along the route (used while driving, to keep the map light). */
export interface MarkWindow {
  fromM: number;
  toM: number;
}

export interface ExtraInput {
  route: Route | null;
  lanes: readonly HighwaySpan[];
  extras: readonly RouteExtra[];
  truckHeightM?: number;
}

export function buildMarks(f: RouteFeatures, win?: MarkWindow, awas: CameraOnRoute[] = [], more?: ExtraInput): RouteMarks {
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
    lanes: more?.route
      ? more.lanes.filter((l) => inWin({ distanceAlongM: l.fromM })).map((l) => ({ ...pointAtDistance(more.route!, l.fromM).point, name: l.name }))
      : [],
    shelters: (more?.extras ?? []).filter((e) => e.kind === "shelter" && inWin(e)).map(({ lat, lng, name }) => ({ lat, lng, name })),
    bridges: (more?.extras ?? [])
      .filter((e) => e.kind !== "shelter" && inWin(e))
      .map((e) => ({ lat: e.lat, lng: e.lng, kind: e.kind as "overbridge" | "heightlimit", maxheight: e.maxheight, warn: heightWarning(more?.truckHeightM, e.maxheight) })),
  };
}
