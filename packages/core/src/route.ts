import { haversine, type LatLng } from "./geo";
import { decodePolyline } from "./polyline";

export interface Maneuver {
  /** Written instruction, e.g. "Turn left onto Jalan Ampang." */
  instruction: string;
  /** Spoken instruction to give shortly before the manoeuvre. */
  verbalPre?: string;
  /** Spoken instruction to give just after the manoeuvre. */
  verbalPost?: string;
  /** Valhalla manoeuvre type number (kept for icon selection). */
  type: number;
  streetNames: string[];
  /** For roundabouts: which exit to take (1 = first). */
  roundaboutExitCount?: number;
  /** Index into Route.points where this manoeuvre happens. */
  beginShapeIndex: number;
  /** Distance from the start of the route to the manoeuvre point (m). */
  distanceFromStartM: number;
  /** Length of the road section that follows this manoeuvre (m). */
  lengthM: number;
  timeS: number;
  /** OSM says this section is a toll road. Says nothing about the price. */
  toll: boolean;
}

export interface Route {
  points: LatLng[];
  /** Cumulative distance (m) from the start to each point. */
  cumDist: number[];
  lengthM: number;
  durationS: number;
  maneuvers: Maneuver[];
  /** True if any section is flagged as toll road in the map data. */
  hasToll: boolean;
}

/** Shapes we read from a Valhalla /route response (only the fields we use). */
export interface ValhallaManeuver {
  instruction?: string;
  verbal_pre_transition_instruction?: string;
  verbal_post_transition_instruction?: string;
  type?: number;
  street_names?: string[];
  roundabout_exit_count?: number;
  begin_shape_index: number;
  length?: number; // km
  time?: number; // s
  toll?: boolean;
}
export interface ValhallaTrip {
  legs: { shape: string; maneuvers: ValhallaManeuver[] }[];
  summary: { length: number; time: number; has_toll?: boolean };
}

export function cumulativeDistances(points: LatLng[]): number[] {
  const out: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    out.push((out[i - 1] ?? 0) + haversine(points[i - 1] as LatLng, points[i] as LatLng));
  }
  return out;
}

/** Convert a Valhalla trip into our own Route type. Legs are joined end to end. */
export function parseValhallaTrip(trip: ValhallaTrip): Route {
  const points: LatLng[] = [];
  const raw: { m: ValhallaManeuver; offset: number }[] = [];

  for (const leg of trip.legs) {
    const shape = decodePolyline(leg.shape, 6);
    // Drop the first point of later legs: it repeats the last point of the previous one.
    const offset = points.length === 0 ? 0 : points.length - 1;
    points.push(...(points.length === 0 ? shape : shape.slice(1)));
    for (const m of leg.maneuvers) raw.push({ m, offset });
  }
  if (points.length < 2) throw new Error("Route has fewer than two points");

  const cumDist = cumulativeDistances(points);
  const lengthM = cumDist[cumDist.length - 1] ?? 0;

  const maneuvers: Maneuver[] = raw.map(({ m, offset }) => {
    const idx = Math.min(points.length - 1, Math.max(0, m.begin_shape_index + offset));
    return {
      instruction: m.instruction ?? "",
      verbalPre: m.verbal_pre_transition_instruction,
      verbalPost: m.verbal_post_transition_instruction,
      type: m.type ?? 0,
      streetNames: m.street_names ?? [],
      roundaboutExitCount: m.roundabout_exit_count,
      beginShapeIndex: idx,
      distanceFromStartM: cumDist[idx] ?? 0,
      lengthM: (m.length ?? 0) * 1000,
      timeS: m.time ?? 0,
      toll: m.toll === true,
    };
  });

  return {
    points,
    cumDist,
    lengthM,
    durationS: trip.summary.time,
    maneuvers,
    hasToll: trip.summary.has_toll === true || maneuvers.some((m) => m.toll),
  };
}
