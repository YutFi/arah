/**
 * Which vehicle the route is for, and what to ask the routing server.
 *
 * The routing server (Valhalla) has a separate "costing" for each kind of vehicle:
 * `auto`, `motorcycle` and `truck`. It follows the access tags in OpenStreetMap, so
 * a road mapped as closed to motorcycles is not used for a motorcycle and a road
 * with a height or weight limit is not used for a truck that is too big. That is
 * only as good as the map data: a missing tag means a missing restriction.
 */

export type VehicleType = "car" | "motorcycle" | "truck";

/** Malaysian toll classes (LLM). Class 1 car, 2 = two axles with 5 or 6 wheels, 3 = three or more axles. */
export type TollClass = 1 | 2 | 3;

export interface TruckSpec {
  /** Axles: 2 (a lorry, toll class 2), 3 or 4 (toll class 3). */
  axles: 2 | 3 | 4;
  /** Metres. Left out = the routing server's own default. */
  heightM?: number;
  widthM?: number;
  lengthM?: number;
  /** Tonnes, fully loaded. */
  weightT?: number;
}

export interface Vehicle {
  type: VehicleType;
  truck: TruckSpec;
}

export const DEFAULT_VEHICLE: Vehicle = { type: "car", truck: { axles: 2 } };

export type Costing = "auto" | "motorcycle" | "truck";

export function costingFor(type: VehicleType): Costing {
  return type === "motorcycle" ? "motorcycle" : type === "truck" ? "truck" : "auto";
}

/** Limits the routing server accepts (anything outside is dropped, not sent). */
export const TRUCK_LIMITS = {
  heightM: { min: 1, max: 5 },
  widthM: { min: 1, max: 3.5 },
  lengthM: { min: 3, max: 25 },
  weightT: { min: 1, max: 60 },
} as const;

const inRange = (v: number | undefined, lim: { min: number; max: number }): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && v >= lim.min && v <= lim.max ? Math.round(v * 100) / 100 : undefined;

/** Keep only usable numbers; a blank or silly entry becomes "use the server default". */
export function cleanTruck(t: Partial<TruckSpec> | undefined): TruckSpec {
  const axles = t?.axles === 3 || t?.axles === 4 ? t.axles : 2;
  return {
    axles,
    heightM: inRange(t?.heightM, TRUCK_LIMITS.heightM),
    widthM: inRange(t?.widthM, TRUCK_LIMITS.widthM),
    lengthM: inRange(t?.lengthM, TRUCK_LIMITS.lengthM),
    weightT: inRange(t?.weightT, TRUCK_LIMITS.weightT),
  };
}

export function cleanVehicle(v: Partial<Vehicle> | null | undefined): Vehicle {
  const type: VehicleType = v?.type === "motorcycle" || v?.type === "truck" ? v.type : "car";
  return { type, truck: cleanTruck(v?.truck) };
}

/** Toll class for the vehicle, or "free" for a motorcycle (motorcycles pay no highway toll). */
export function tollClassFor(v: Vehicle): TollClass | "free" {
  if (v.type === "motorcycle") return "free";
  if (v.type === "truck") return v.truck.axles >= 3 ? 3 : 2;
  return 1;
}

export interface CostingRequest {
  costing: Costing;
  costing_options: Record<string, Record<string, number | boolean>>;
}

/**
 * The `costing` and `costing_options` parts of a Valhalla request.
 * `avoid` = "avoid toll roads" for a car or truck, "stay off expressways" for a motorcycle
 * (a motorcycle pays no toll, but is mostly not allowed on an expressway without its own lane).
 * `extra` is a differently-styled route, such as `{ shortest: true }`; it wins over the defaults.
 */
export function costingRequest(v: Vehicle, avoid: boolean, extra: Record<string, number | boolean> = {}): CostingRequest {
  const costing = costingFor(v.type);
  let opts: Record<string, number | boolean>;
  if (costing === "motorcycle") {
    opts = avoid ? { use_highways: 0, use_tolls: 0 } : {};
  } else {
    // use_tolls: 0 = avoid tolls as much as possible, 0.5 = neutral (the default).
    opts = { use_tolls: avoid ? 0 : 0.5 };
    if (costing === "truck") {
      const t = cleanTruck(v.truck);
      opts.axle_count = t.axles;
      if (t.heightM !== undefined) opts.height = t.heightM;
      if (t.widthM !== undefined) opts.width = t.widthM;
      if (t.lengthM !== undefined) opts.length = t.lengthM;
      if (t.weightT !== undefined) opts.weight = t.weightT;
    }
  }
  return { costing, costing_options: { [costing]: { ...opts, ...extra } } };
}
