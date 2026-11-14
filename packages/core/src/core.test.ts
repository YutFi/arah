import { describe, expect, it } from "vitest";
import {
  addStop,
  angleDiff,
  MAX_TRIP_STOPS,
  moveStop,
  nearestFirst,
  removeStop,
  straightLineTotalM,
  countRouteFeatures,
  signalsAhead,
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

// ---- jam detection ----------------------------------------------------------
import { avoidAheadPolygon, createJamDetector, typicalSpeedKph } from "./jam";
import { haversine as hv } from "./geo";

describe("jam detector", () => {
  const feed = (det: ReturnType<typeof createJamDetector>, fn: (sec: number) => number, secs: number, typical = 60, remaining = 5000) => {
    let last = det.push({ t: 0, alongM: fn(0), typicalKph: typical, remainingM: remaining });
    for (let s = 1; s <= secs; s++) last = det.push({ t: s * 1000, alongM: fn(s), typicalKph: typical, remainingM: remaining });
    return last;
  };

  it("flags a long crawl on a road that normally flows", () => {
    const r = feed(createJamDetector(), (s) => s * 1, 160); // 3.6 km/h for 160 s
    expect(r.stuck).toBe(true);
    expect(r.avgKph).toBeCloseTo(3.6, 1);
  });

  it("does not flag normal driving", () => {
    expect(feed(createJamDetector(), (s) => s * 14, 160).stuck).toBe(false);
  });

  it("ignores a red light: a stop followed by moving again", () => {
    const along = (s: number) => (s < 130 ? 0 : (s - 130) * 12);
    expect(feed(createJamDetector(), along, 160).stuck).toBe(false);
  });

  it("does not ask before the slow spell has lasted long enough", () => {
    expect(feed(createJamDetector(), () => 0, 60).stuck).toBe(false);
  });

  it("ignores roads that are normally slow, and the last stretch before the destination", () => {
    expect(feed(createJamDetector(), (s) => s, 160, 20).stuck).toBe(false);
    expect(feed(createJamDetector(), (s) => s, 160, 60, 400).stuck).toBe(false);
  });

  it("stays quiet after 'stay on route', then may ask again", () => {
    const det = createJamDetector({ cooldownS: 300 });
    expect(feed(det, (s) => s, 160).stuck).toBe(true);
    det.snooze(160_000);
    let last = det.push({ t: 161_000, alongM: 161, typicalKph: 60, remainingM: 5000 });
    expect(last.stuck).toBe(false);
    for (let s = 162; s <= 520; s++) last = det.push({ t: s * 1000, alongM: s, typicalKph: 60, remainingM: 5000 });
    expect(last.stuck).toBe(true);
  });
});

describe("typical speed and avoid-ahead area", () => {
  const route = parseValhallaTrip({
    summary: { length: 4, time: 240 },
    legs: [
      {
        shape: encodePolyline([
          { lat: 3.1, lng: 101.6 },
          { lat: 3.118, lng: 101.6 },
          { lat: 3.136, lng: 101.6 },
        ]),
        maneuvers: [
          { instruction: "Drive north.", type: 1, begin_shape_index: 0, length: 2, time: 120 },
          { instruction: "Arrive.", type: 4, begin_shape_index: 2, length: 0, time: 0 },
        ],
      },
    ],
  });

  it("uses the road's own length and time", () => {
    expect(typicalSpeedKph(route, 500)).toBeCloseTo(60, 0);
  });

  it("builds a thin closed area along the road ahead, not on top of you", () => {
    const poly = avoidAheadPolygon(route, 200, 150, 1500, 30);
    expect(poly.length).toBeGreaterThan(8);
    expect(poly[0]).toEqual(poly[poly.length - 1]);
    // nowhere near the start point 200 m along the road
    const you = { lat: 3.1 + 200 / 111195, lng: 101.6 };
    expect(Math.min(...poly.map((p) => hv(p, you)))).toBeGreaterThan(100);
    // and about 60 m wide
    const widths = poly.slice(0, 3).map((p) => Math.abs(p.lng - 101.6) * 111195 * Math.cos((3.1 * Math.PI) / 180));
    expect(Math.max(...widths)).toBeLessThan(40);
  });

  it("returns nothing when there is no road left ahead", () => {
    expect(avoidAheadPolygon(route, route.lengthM - 50)).toEqual([]);
  });
});

describe("route overlap", () => {
  const mk = (pts: { lat: number; lng: number }[]) =>
    parseValhallaTrip({
      summary: { length: 3, time: 200 },
      legs: [{ shape: encodePolyline(pts), maneuvers: [{ instruction: "Go.", type: 1, begin_shape_index: 0, length: 3, time: 200 }, { instruction: "Arrive.", type: 4, begin_shape_index: pts.length - 1, length: 0, time: 0 }] }],
    });
  const a = mk([{ lat: 3.1, lng: 101.6 }, { lat: 3.125, lng: 101.6 }]);
  it("is high for the same road and low for a parallel road 600 m away", async () => {
    const { routeOverlap } = await import("./jam");
    const same = mk([{ lat: 3.1, lng: 101.60001 }, { lat: 3.125, lng: 101.60001 }]);
    const other = mk([{ lat: 3.1, lng: 101.6055 }, { lat: 3.125, lng: 101.6055 }]);
    expect(routeOverlap(same, a)).toBeGreaterThan(0.9);
    expect(routeOverlap(other, a)).toBeLessThan(0.2);
  });
});


// ---- traffic light counting ------------------------------------------------
describe("traffic light counting", () => {
  // A straight 2.2 km road going north. 0.00001 degrees of latitude is about 1.1 m.
  const pts: LatLng[] = [];
  for (let i = 0; i <= 22; i++) pts.push({ lat: 3.1 + i * 0.0009, lng: 101.7 });
  const cum = pts.map((p, i) => (i === 0 ? 0 : haversine(pts[0] as LatLng, p)));
  const straight = { points: pts, cumDist: cum, lengthM: cum[cum.length - 1] as number, durationS: 300, maneuvers: [], hasToll: false };
  const node = (lat: number, lng: number) => ({ type: "node", lat, lon: lng, tags: { highway: "traffic_signals" } });

  it("counts a junction mapped as several nodes once, and drops lights that are not on this road", () => {
    const json = {
      elements: [
        node(3.103, 101.7), // junction, on the road
        node(3.1033, 101.70005), // same junction, other carriageway node ~35 m on
        node(3.1043, 101.7), // still the same junction (about 140 m on) is a different light: kept below
        node(3.108, 101.7002), // ~22 m to the side: a parallel service road, not ours
        node(3.112, 101.7), // a separate light further on
        node(3.1124, 101.7), // 44 m after it: same junction as the one before
      ],
    };
    const f = countRouteFeatures(straight, json);
    expect(f.signals.length).toBe(3);
    const d = f.signals.map((s) => Math.round(s.distanceAlongM));
    expect(d[0]).toBeGreaterThan(320);
    expect(d[0]).toBeLessThan(345);
    expect(d[1]).toBeGreaterThan(460);
    expect(d[1]).toBeLessThan(480);
    expect(d[2]).toBeGreaterThan(1320);
    expect(d[2]).toBeLessThan(1345);
  });

  it("ignores lights well off the road and outside Malaysia", () => {
    const f = countRouteFeatures(straight, { elements: [node(3.105, 101.7003), node(51.5, -0.1)] });
    expect(f.signals.length).toBe(0);
  });

  it("tells how many lights are left and how far the next one is", () => {
    const sig = [{ distanceAlongM: 300 }, { distanceAlongM: 900 }, { distanceAlongM: 1500 }];
    expect(signalsAhead(sig, 0)).toEqual({ nextM: 300, left: 3 });
    expect(signalsAhead(sig, 330)).toEqual({ nextM: 570, left: 2 });
    expect(signalsAhead(sig, 305).left).toBe(3); // a few metres past it: GPS error, still shown as 'now'
    expect(signalsAhead(sig, 1600)).toEqual({ nextM: null, left: 0 });
  });
});


// ---- multi-stop trips ------------------------------------------------------
describe("trip helpers", () => {
  const stop = (id: string, lat: number, lng: number) => ({ id, name: id, lat, lng });
  const me: LatLng = { lat: 3.1, lng: 101.7 };
  const A = stop("A", 3.2, 101.7); // ~11 km north
  const B = stop("B", 3.11, 101.7); // ~1 km north
  const C = stop("C", 3.15, 101.7); // ~5.5 km north

  it("adds stops in order and refuses duplicates and a full trip", () => {
    let r = addStop([], A);
    expect(r.ok).toBe(true);
    r = addStop(r.list, stop("A", 3.5, 101.9)); // same id
    expect(r).toMatchObject({ ok: false, reason: "duplicate" });
    r = addStop(r.list, stop("A2", 3.20001, 101.70001)); // another id, same spot (a few metres away)
    expect(r).toMatchObject({ ok: false, reason: "duplicate" });
    let list = r.list;
    for (let i = 0; i < MAX_TRIP_STOPS; i++) {
      const next = addStop(list, stop("x" + i, 4 + i * 0.1, 102));
      list = next.list;
    }
    expect(list.length).toBe(MAX_TRIP_STOPS);
    expect(addStop(list, stop("one-more", 6, 103))).toMatchObject({ ok: false, reason: "full" });
  });

  it("moves and removes stops without touching the original list", () => {
    const list = [A, B, C];
    expect(moveStop(list, 0, 1).map((s) => s.id)).toEqual(["B", "A", "C"]);
    expect(moveStop(list, 2, -1).map((s) => s.id)).toEqual(["A", "C", "B"]);
    expect(moveStop(list, 0, -1).map((s) => s.id)).toEqual(["A", "B", "C"]); // already first
    expect(moveStop(list, 2, 1).map((s) => s.id)).toEqual(["A", "B", "C"]); // already last
    expect(removeStop(list, 1).map((s) => s.id)).toEqual(["A", "C"]);
    expect(list.map((s) => s.id)).toEqual(["A", "B", "C"]);
  });

  it("sorts nearest first from where you are, and can keep the first stops fixed", () => {
    expect(nearestFirst(me, [A, C, B]).map((s) => s.id)).toEqual(["B", "C", "A"]);
    // heading to A already: keep it first, then nearest from A
    expect(nearestFirst(me, [A, B, C], 1).map((s) => s.id)).toEqual(["A", "C", "B"]);
    expect(nearestFirst(me, []).length).toBe(0);
  });

  it("adds up straight-line hops", () => {
    const total = straightLineTotalM(me, [B, A]);
    expect(total).toBeGreaterThan(10_900);
    expect(total).toBeLessThan(11_300);
  });
});
