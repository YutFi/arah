import { describe, expect, it } from "vitest";
import {
  buildExtrasQuery,
  extraKindsFor,
  haversine,
  heightWarning,
  parseMaxHeightM,
  readExtras,
  type LatLng,
  type Route,
} from "./index";

// A straight 3 km road heading east near Shah Alam.
const points: LatLng[] = Array.from({ length: 31 }, (_, i) => ({ lat: 3.07, lng: 101.5 + i * 0.001 }));
const cumDist: number[] = [0];
for (let i = 1; i < points.length; i++) cumDist.push(cumDist[i - 1]! + haversine(points[i - 1]!, points[i]!));
const route: Route = { points, cumDist, lengthM: cumDist[cumDist.length - 1]!, durationS: 300, maneuvers: [], hasToll: false };

const node = (lat: number, lng: number, tags: Record<string, string>) => ({ type: "node", lat, lon: lng, tags });
// 0.0001 degrees of latitude is about 11 m.
const ON = 3.07;
const NEAR = 3.07 + 0.0001;
const FAR = 3.07 + 0.002; // ~220 m away

describe("route extras: which kinds per vehicle", () => {
  it("asks for shelters on a motorcycle, bridges and limits on a truck, nothing for a car", () => {
    expect(extraKindsFor("motorcycle")).toEqual(["shelter"]);
    expect(extraKindsFor("truck")).toEqual(["overbridge", "heightlimit"]);
    expect(extraKindsFor("car")).toEqual([]);
  });
});

describe("route extras: query", () => {
  it("is one Overpass question that hugs the route and only asks for the chosen kinds", () => {
    const q = buildExtrasQuery(route, ["shelter"]);
    expect(q).toContain('"amenity"="shelter"');
    expect(q).not.toContain("maxheight");
    expect(q).toContain("around:");
    const t = buildExtrasQuery(route, ["overbridge", "heightlimit"]);
    expect(t).toContain('"bridge"="yes"');
    expect(t).toContain("maxheight");
    expect(t).toContain("height_restrictor");
    expect(t).not.toContain("shelter");
  });
});

describe("route extras: reading", () => {
  it("keeps shelters on the route, drops far ones, and orders along the route", () => {
    const json = {
      elements: [
        node(NEAR, 101.52, { amenity: "shelter", shelter_type: "public_transport" }),
        node(FAR, 101.51, { amenity: "shelter" }),
        node(ON, 101.505, { amenity: "shelter", name: "Pondok" }),
      ],
    };
    const out = readExtras(route, json, ["shelter"]);
    expect(out.map((e) => e.kind)).toEqual(["shelter", "shelter"]);
    expect(out[0]!.name).toBe("Pondok");
    expect(out[0]!.distanceAlongM).toBeLessThan(out[1]!.distanceAlongM);
  });

  it("finds footbridges for a truck, and merges the stairs and ramps of one bridge into one mark", () => {
    const json = {
      elements: [
        { type: "way", center: { lat: NEAR, lon: 101.515 }, tags: { bridge: "yes", highway: "footway" } },
        { type: "way", center: { lat: NEAR, lon: 101.5151 }, tags: { bridge: "yes", highway: "steps" } },
        { type: "way", center: { lat: NEAR, lon: 101.52 }, tags: { bridge: "yes", highway: "residential" } },
      ],
    };
    const out = readExtras(route, json, ["overbridge", "heightlimit"]);
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe("overbridge");
  });

  it("does not report a footbridge to a motorcycle rider, or a shelter to a truck", () => {
    const json = {
      elements: [
        { type: "way", center: { lat: NEAR, lon: 101.515 }, tags: { bridge: "yes", highway: "footway" } },
        node(ON, 101.52, { amenity: "shelter" }),
      ],
    };
    expect(readExtras(route, json, ["shelter"]).map((e) => e.kind)).toEqual(["shelter"]);
    expect(readExtras(route, json, ["overbridge"]).map((e) => e.kind)).toEqual(["overbridge"]);
  });

  it("keeps a mapped height limit with its number, and a height_restrictor barrier", () => {
    const json = {
      elements: [
        node(ON, 101.505, { maxheight: "4.2" }),
        node(ON, 101.52, { barrier: "height_restrictor", "maxheight:physical": "3.5" }),
      ],
    };
    const out = readExtras(route, json, ["heightlimit"]);
    expect(out.map((e) => e.maxheight)).toEqual(["4.2", "3.5"]);
    expect(out.every((e) => e.kind === "heightlimit")).toBe(true);
  });

  it("ignores junk, points outside Malaysia, and a missing elements list", () => {
    expect(readExtras(route, null, ["shelter"])).toEqual([]);
    expect(readExtras(route, { elements: "nope" }, ["shelter"])).toEqual([]);
    expect(readExtras(route, { elements: [node(51.5, -0.1, { amenity: "shelter" }), { tags: { amenity: "shelter" } }] }, ["shelter"])).toEqual([]);
  });
});

describe("height limits", () => {
  it("reads metres and feet, and refuses text it cannot read", () => {
    expect(parseMaxHeightM("4.2")).toBe(4.2);
    expect(parseMaxHeightM("4,5 m")).toBe(4.5);
    expect(parseMaxHeightM("13'6\"")).toBe(4.11);
    expect(parseMaxHeightM("default")).toBeNull();
    expect(parseMaxHeightM(undefined)).toBeNull();
  });

  it("warns only when the limit is a number and the truck is at or over it", () => {
    expect(heightWarning(4.5, "4.2")).toBe("over");
    expect(heightWarning(4.2, "4.2")).toBe("over");
    expect(heightWarning(3.8, "4.2")).toBe("ok");
    expect(heightWarning(undefined, "4.2")).toBe("unknown");
    expect(heightWarning(4.5, undefined)).toBe("unknown");
    expect(heightWarning(4.5, "none")).toBe("unknown");
  });
});
