import { describe, expect, it } from "vitest";
import {
  cleanTruck,
  cleanVehicle,
  costingFor,
  costingRequest,
  estimateRouteToll,
  estimateTolls,
  laneHighwayOf,
  laneStatus,
  motorcycleNotes,
  motorcycleOrder,
  tollClassFor,
  NSE_CLASS_FACTOR,
  NSE_RM_PER_KM,
  type Vehicle,
} from "./index";

const car: Vehicle = { type: "car", truck: { axles: 2 } };
const moto: Vehicle = { type: "motorcycle", truck: { axles: 2 } };
const lorry = (o: Partial<Vehicle["truck"]> = {}): Vehicle => ({ type: "truck", truck: { axles: 2, ...o } });

describe("vehicle costing", () => {
  it("maps each vehicle to its own Valhalla costing", () => {
    expect(costingFor("car")).toBe("auto");
    expect(costingFor("motorcycle")).toBe("motorcycle");
    expect(costingFor("truck")).toBe("truck");
  });

  it("car: tolls neutral, or avoided on request", () => {
    expect(costingRequest(car, false).costing_options.auto).toEqual({ use_tolls: 0.5 });
    expect(costingRequest(car, true).costing_options.auto).toEqual({ use_tolls: 0 });
  });

  it("motorcycle: 'avoid' means stay off expressways, and sends no toll setting otherwise", () => {
    expect(costingRequest(moto, false).costing_options.motorcycle).toEqual({});
    expect(costingRequest(moto, true).costing_options.motorcycle).toEqual({ use_highways: 0, use_tolls: 0 });
  });

  it("truck: sends axle count and only the sizes that were given", () => {
    const o = costingRequest(lorry({ axles: 3, heightM: 3.8, weightT: 18 }), false).costing_options.truck;
    expect(o).toEqual({ use_tolls: 0.5, axle_count: 3, height: 3.8, weight: 18 });
    expect(o).not.toHaveProperty("width");
  });

  it("extra route styles win over the defaults", () => {
    const o = costingRequest(moto, false, { use_highways: 1 }).costing_options.motorcycle;
    expect(o).toEqual({ use_highways: 1 });
  });

  it("drops silly truck sizes instead of sending them", () => {
    const t = cleanTruck({ axles: 9 as never, heightM: 40, widthM: -1, lengthM: Number.NaN, weightT: 12 });
    expect(t).toEqual({ axles: 2, heightM: undefined, widthM: undefined, lengthM: undefined, weightT: 12 });
  });

  it("cleans a stored vehicle of unknown shape", () => {
    expect(cleanVehicle(null).type).toBe("car");
    expect(cleanVehicle({ type: "boat" as never }).type).toBe("car");
    expect(cleanVehicle({ type: "truck", truck: { axles: 4 } }).truck.axles).toBe(4);
  });

  it("toll class: car 1, 2-axle lorry 2, 3+ axles 3, motorcycle free", () => {
    expect(tollClassFor(car)).toBe(1);
    expect(tollClassFor(lorry())).toBe(2);
    expect(tollClassFor(lorry({ axles: 3 }))).toBe(3);
    expect(tollClassFor(lorry({ axles: 4 }))).toBe(3);
    expect(tollClassFor(moto)).toBe("free");
  });
});

describe("class-aware tolls", () => {
  it("prices a lorry only where a lorry price is published", () => {
    const e = estimateTolls([{ name: "Gombak" }], 2);
    expect(e.priced).toHaveLength(1);
    expect(e.priced[0]?.rm).toBe(12);
    expect(estimateTolls([{ name: "Gombak" }], 3).priced[0]?.rm).toBe(18);
    expect(estimateTolls([{ name: "Gombak" }], 1).priced[0]?.rm).toBe(6);
  });

  it("never falls back to the car price for a lorry", () => {
    // Find a plaza with a car price but no lorry price.
    const e = estimateTolls([{ name: "Sungai Besi" }, { name: "Not A Plaza" }], 2);
    expect(e.priced.every((p) => p.rm > 0)).toBe(true);
    expect(e.complete).toBe(false);
    const car1 = estimateTolls([{ name: "Sungai Besi" }], 1);
    const truck = estimateTolls([{ name: "Sungai Besi" }], 2);
    if (car1.priced.length) expect(truck.priced).toHaveLength(0);
  });

  it("scales the NSE per-km estimate by class factor", () => {
    const route = { maneuvers: [{ streetNames: ["Lebuhraya Utara Selatan"], toll: true, distanceFromStartM: 0, lengthM: 10000 }] };
    const c1 = estimateRouteToll(route, [], 1);
    const c3 = estimateRouteToll(route, [], 3);
    expect(c1.tollClass).toBe(1);
    expect(c3.tollClass).toBe(3);
    expect(c3.totalRm).toBeCloseTo(Math.round(10 * NSE_RM_PER_KM * NSE_CLASS_FACTOR[3] * 100) / 100, 2);
    expect(c3.totalRm).toBeGreaterThan(c1.totalRm);
  });
});

describe("motorcycle lanes", () => {
  it("matches listed highways by whole name", () => {
    expect(laneHighwayOf(["Federal Highway"])?.id).toBe("federal");
    expect(laneHighwayOf(["Lebuhraya Persekutuan"])?.id).toBe("federal");
    expect(laneHighwayOf(["Federal Highway Service Road"])?.id).toBe("federal");
    expect(laneHighwayOf(["Federal Hill Road"])).toBeNull();
    expect(laneHighwayOf(["Jalan Ampang"])).toBeNull();
    expect(laneHighwayOf([])).toBeNull();
  });

  const m = (names: string[], from: number, len: number, toll = false) => ({ streetNames: names, toll, distanceFromStartM: from, lengthM: len });

  it("joins stretches of the same lane highway and flags an expressway with no known lane", () => {
    const n = motorcycleNotes({
      maneuvers: [
        m(["Jalan A"], 0, 1000),
        m(["Federal Highway"], 1000, 2000),
        m(["Federal Highway"], 3000, 1500),
        m(["E1", "Lebuhraya Utara Selatan"], 4500, 8000, true),
      ],
    });
    expect(n.lanes).toEqual([{ name: "Federal Highway", fromM: 1000, toM: 4500 }]);
    expect(n.laneM).toBe(3500);
    expect(n.expressways).toHaveLength(1);
    expect(n.expressways[0]?.name).toBe("Lebuhraya Utara Selatan");
  });

  it("reports where you are against the lane stretches", () => {
    const lanes = [{ name: "Federal Highway", fromM: 1000, toM: 4000 }];
    expect(laneStatus(lanes, 2000).inside?.name).toBe("Federal Highway");
    const ahead = laneStatus(lanes, 400);
    expect(ahead.inside).toBeNull();
    expect(ahead.next?.distanceM).toBe(600);
    expect(laneStatus(lanes, 5000)).toEqual({ inside: null, next: null });
    expect(laneStatus(lanes, -3000).next).toBeNull(); // too far ahead
  });

  it("orders routes with an unlaned expressway last and keeps the rest in order", () => {
    const a = { id: "a", maneuvers: [m(["E1"], 0, 5000, true)] };
    const b = { id: "b", maneuvers: [m(["Jalan B"], 0, 5000)] };
    const c = { id: "c", maneuvers: [m(["Federal Highway"], 0, 5000)] };
    expect(motorcycleOrder([a, b, c]).map((r) => r.id)).toEqual(["b", "c", "a"]);
  });
});
