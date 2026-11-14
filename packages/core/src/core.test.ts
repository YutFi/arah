import { describe, expect, it } from "vitest";
import {
  angleDiff,
  bearing,
  createNavigator,
  decodePolyline,
  encodePolyline,
  formatArrival,
  formatDistance,
  formatDuration,
  haversine,
  matchCamerasToRoute,
  mpsToKph,
  parseValhallaTrip,
  pointAtDistance,
  projectToSegment,
  snapToRoute,
  upcomingCameras,
  validateCamera,
  validateDataset,
  type CameraRecord,
  type LatLng,
  type ValhallaTrip,
} from "./index";

// ---- Synthetic test geometry (NOT real roads, NOT app data) ---------------
// Leg 1: ~1.1 km due north. Leg 2: ~1.1 km due east.
const A: LatLng = { lat: 3.1, lng: 101.7 };
const B: LatLng = { lat: 3.11, lng: 101.7 };
const C: LatLng = { lat: 3.11, lng: 101.71 };
const shape = encodePolyline([A, B, C]);

const trip: ValhallaTrip = {
  summary: { length: 2.2, time: 240, has_toll: false },
  legs: [
    {
      shape,
      maneuvers: [
        { instruction: "Drive north.", type: 1, begin_shape_index: 0, length: 1.1, time: 120 },
        { instruction: "Turn right.", type: 10, begin_shape_index: 1, length: 1.1, time: 120, toll: true },
        { instruction: "You have arrived.", type: 4, begin_shape_index: 2, length: 0, time: 0 },
      ],
    },
  ],
};

describe("geo", () => {
  it("measures about 1112 m per 0.01 degrees of latitude", () => {
    expect(haversine(A, B)).toBeGreaterThan(1110);
    expect(haversine(A, B)).toBeLessThan(1114);
  });
  it("computes bearings", () => {
    expect(bearing(A, B)).toBeCloseTo(0, 1);
    expect(bearing(B, C)).toBeGreaterThan(89.9);
    expect(bearing(B, C)).toBeLessThan(90.1);
  });
  it("wraps angle differences", () => {
    expect(angleDiff(350, 10)).toBe(20);
    expect(angleDiff(10, 350)).toBe(20);
    expect(angleDiff(0, 180)).toBe(180);
  });
  it("projects a point onto a segment", () => {
    const p = { lat: 3.105, lng: 101.7003 }; // ~33 m east of the northbound leg
    const pr = projectToSegment(p, A, B);
    expect(pr.t).toBeGreaterThan(0.49);
    expect(pr.t).toBeLessThan(0.51);
    expect(pr.distance).toBeGreaterThan(30);
    expect(pr.distance).toBeLessThan(36);
  });
});

describe("polyline", () => {
  it("round-trips at precision 6", () => {
    const pts = decodePolyline(shape, 6);
    expect(pts).toHaveLength(3);
    expect(pts[1]?.lat).toBeCloseTo(3.11, 6);
    expect(pts[2]?.lng).toBeCloseTo(101.71, 6);
  });
  it("rejects a truncated string", () => {
    expect(() => decodePolyline("_p~iF~ps|U_ulL", 5)).toThrow(); // ends mid-point
    expect(() => decodePolyline("_", 6)).toThrow();
  });
});

describe("route parsing", () => {
  const route = parseValhallaTrip(trip);
  it("builds cumulative distances and manoeuvre positions", () => {
    expect(route.lengthM).toBeGreaterThan(2150);
    expect(route.lengthM).toBeLessThan(2250);
    expect(route.maneuvers[0]?.distanceFromStartM).toBe(0);
    expect(route.maneuvers[1]?.distanceFromStartM).toBeCloseTo(1112, -1);
    expect(route.maneuvers[1]?.lengthM).toBeCloseTo(1100, 0);
  });
  it("carries the toll flag but not a price", () => {
    expect(route.hasToll).toBe(true);
    expect(route.maneuvers[1]?.toll).toBe(true);
  });
  it("joins multiple legs without repeating the shared point", () => {
    const two = parseValhallaTrip({
      summary: { length: 2.2, time: 240 },
      legs: [
        { shape: encodePolyline([A, B]), maneuvers: [{ instruction: "a", begin_shape_index: 0 }] },
        { shape: encodePolyline([B, C]), maneuvers: [{ instruction: "b", begin_shape_index: 0 }] },
      ],
    });
    expect(two.points).toHaveLength(3);
    expect(two.maneuvers[1]?.beginShapeIndex).toBe(1);
  });
  it("refuses a route with no geometry", () => {
    expect(() => parseValhallaTrip({ summary: { length: 0, time: 0 }, legs: [] })).toThrow();
  });
});

describe("snapToRoute", () => {
  const route = parseValhallaTrip(trip);
  it("snaps to the second leg", () => {
    const s = snapToRoute(route, { lat: 3.1101, lng: 101.705 });
    expect(s.segmentIndex).toBe(1);
    expect(s.distanceAlongM).toBeGreaterThan(1112 + 540);
    expect(s.offRouteM).toBeLessThan(15);
  });
});

describe("navigator", () => {
  const route = parseValhallaTrip(trip);
  const fix = (p: LatLng, extra = {}) => ({ ...p, timestamp: 0, ...extra });

  it("reports progress, remaining distance and the next turn", () => {
    const nav = createNavigator(route);
    const u = nav.update(fix({ lat: 3.105, lng: 101.7 }));
    expect(u.status).toBe("on-route");
    expect(u.remainingM).toBeGreaterThan(1600);
    expect(u.remainingM).toBeLessThan(1700);
    expect(u.nextManeuverIndex).toBe(1);
    expect(u.distanceToNextM).toBeGreaterThan(540);
    expect(u.distanceToNextM).toBeLessThan(570);
  });

  it("moves to the next manoeuvre only after passing the turn", () => {
    const nav = createNavigator(route);
    nav.update(fix({ lat: 3.1095, lng: 101.7 }));
    expect(nav.update(fix({ lat: 3.1099, lng: 101.7 })).nextManeuverIndex).toBe(1);
    expect(nav.update(fix({ lat: 3.11, lng: 101.70004 })).nextManeuverIndex).toBe(1); // ~4 m past the corner
    expect(nav.update(fix({ lat: 3.1101, lng: 101.702 })).nextManeuverIndex).toBe(2);
  });

  it("needs three bad fixes in a row before calling off-route", () => {
    const nav = createNavigator(route);
    const off = fix({ lat: 3.105, lng: 101.7025 }); // ~275 m east of the road
    expect(nav.update(off).status).toBe("on-route");
    expect(nav.update(off).status).toBe("on-route");
    expect(nav.update(off).status).toBe("off-route");
    expect(nav.update(fix({ lat: 3.105, lng: 101.7 })).status).toBe("on-route");
  });

  it("is more forgiving when GPS accuracy is poor", () => {
    const nav = createNavigator(route);
    const wobbly = fix({ lat: 3.105, lng: 101.70065 }, { accuracyM: 60 }); // ~72 m off
    for (let i = 0; i < 5; i++) expect(nav.update(wobbly).status).toBe("on-route");
  });

  it("detects arrival and stays arrived", () => {
    const nav = createNavigator(route);
    expect(nav.update(fix({ lat: 3.11, lng: 101.7099 })).status).toBe("arrived");
    expect(nav.update(fix({ lat: 3.11, lng: 101.7 })).status).toBe("arrived");
  });
});

describe("AWAS data gate", () => {
  const good: CameraRecord = {
    id: "test-1",
    type: "fixed",
    lat: 3.105,
    lng: 101.7,
    directionDeg: 0,
    sourceUrl: "https://example.test/source",
    verifiedOn: "2026-11-01",
  };

  it("accepts a complete record", () => {
    expect(validateCamera(good)).toEqual([]);
  });
  it("rejects a record without a source or verification date", () => {
    const { sourceUrl: _s, ...noSource } = good;
    const { verifiedOn: _v, ...noDate } = good;
    expect(validateCamera(noSource).length).toBeGreaterThan(0);
    expect(validateCamera(noDate).length).toBeGreaterThan(0);
  });
  it("rejects coordinates outside Malaysia and bad types", () => {
    expect(validateCamera({ ...good, lat: 51.5, lng: -0.1 }).length).toBeGreaterThan(0);
    expect(validateCamera({ ...good, type: "speed-trap" }).length).toBeGreaterThan(0);
  });
  it("splits a dataset into usable records and problems, and flags duplicates", () => {
    const res = validateDataset([good, { ...good }, { id: "x", type: "fixed" }]);
    expect(res.valid).toHaveLength(1);
    expect(res.issues.some((i) => i.problem === "duplicate id")).toBe(true);
    expect(res.issues.some((i) => i.id === "x")).toBe(true);
  });
  it("treats a non-array file as invalid", () => {
    expect(validateDataset({}).valid).toEqual([]);
    expect(validateDataset({}).issues).toHaveLength(1);
  });
  it("accepts an empty dataset (nothing verified yet)", () => {
    expect(validateDataset([])).toEqual({ valid: [], issues: [] });
  });
});

describe("AWAS route matching", () => {
  const route = parseValhallaTrip(trip);
  const base = {
    type: "fixed" as const,
    sourceUrl: "https://example.test/s",
    verifiedOn: "2026-11-01",
  };
  const onRoadNorthbound: CameraRecord = { ...base, id: "a", lat: 3.105, lng: 101.70005, directionDeg: 0 };
  const wrongDirection: CameraRecord = { ...base, id: "b", lat: 3.105, lng: 101.70005, directionDeg: 180 };
  const offRoad: CameraRecord = { ...base, id: "c", lat: 3.105, lng: 101.703 };
  const noDirection: CameraRecord = { ...base, id: "d", lat: 3.11, lng: 101.705 };

  it("keeps cameras on the route in our direction and drops the rest", () => {
    const m = matchCamerasToRoute(route, [offRoad, wrongDirection, onRoadNorthbound, noDirection]);
    expect(m.map((x) => x.camera.id)).toEqual(["a", "d"]);
    expect(m[0]?.distanceAlongM).toBeGreaterThan(550);
    expect(m[0]?.distanceAlongM).toBeLessThan(565);
  });

  it("lists only cameras still ahead and within range", () => {
    const m = matchCamerasToRoute(route, [onRoadNorthbound, noDirection]);
    expect(upcomingCameras(m, 0, 1000).map((x) => x.camera.id)).toEqual(["a"]);
    expect(upcomingCameras(m, 100, 1000).map((x) => x.camera.id)).toEqual(["a"]);
    expect(upcomingCameras(m, 700, 1000).map((x) => x.camera.id)).toEqual(["d"]); // 'a' is behind us
  });
});

describe("format", () => {
  it("formats distance", () => {
    expect(formatDistance(0)).toBe("0 m");
    expect(formatDistance(347)).toBe("350 m");
    expect(formatDistance(1234)).toBe("1.2 km");
    expect(formatDistance(23400)).toBe("23 km");
    expect(formatDistance(-5)).toBe("–");
  });
  it("formats duration", () => {
    expect(formatDuration(20)).toBe("1 min");
    expect(formatDuration(25 * 60)).toBe("25 min");
    expect(formatDuration(3600)).toBe("1 h");
    expect(formatDuration(3900)).toBe("1 h 5 min");
  });
  it("formats arrival time and speed", () => {
    const now = new Date(2026, 10, 14, 9, 50, 0);
    expect(formatArrival(now, 20 * 60)).toBe("10:10");
    expect(mpsToKph(27.78)).toBe(100);
  });
});

describe("pointAtDistance (simulation)", () => {
  const route = parseValhallaTrip(trip);
  it("starts at the start, ends at the end, and heads the right way", () => {
    const start = pointAtDistance(route, 0);
    expect(start.point.lat).toBeCloseTo(3.1, 6);
    expect(start.bearing).toBeCloseTo(0, 1);
    const mid = pointAtDistance(route, route.cumDist[1]! + 500);
    expect(mid.point.lat).toBeCloseTo(3.11, 4);
    expect(mid.bearing).toBeGreaterThan(89);
    const end = pointAtDistance(route, 1e9);
    expect(end.point.lng).toBeCloseTo(101.71, 6);
  });
});
