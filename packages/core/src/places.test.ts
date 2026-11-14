import { describe, expect, it } from "vitest";
import {
  addressFallbacks,
  buildOverpassQuery,
  buildRouteQuery,
  countRouteFeatures,
  encodePolyline,
  parseValhallaTrip,
  simplifyLine,
  classify,
  looksLikeAddress,
  nearestPerCategory,
  parseCoordinates,
  parseOverpass,
  DEFAULT_RADIUS_M,
  OSM_EXTRACT_RULES,
  OSM_KEEP_TAGS,
  TOLL_RATES,
  estimateTolls,
  findTollRate,
} from "./index";

describe("nearby places", () => {
  it("builds a query with one block per category and a limit", () => {
    const q = buildOverpassQuery({ lat: 3.1, lng: 101.7 }, 2000, ["fuel", "food"]);
    expect(q).toContain("[out:json]");
    expect(q).toContain('nwr["amenity"~"^(fuel)$"](around:2000,3.10000,101.70000);');
    expect(q).toContain('nwr["amenity"~"^(restaurant|fast_food|food_court)$"]["name"]');
    expect(q).toContain(".food out center 60;");
    // petrol stations may be unnamed, restaurants may not
    expect(q.split("\n").find((l) => l.includes("fuel)$"))).not.toContain('["name"]');
  });

  it("clamps the radius and rejects bad coordinates", () => {
    expect(buildOverpassQuery({ lat: 3, lng: 101 }, 999999, ["fuel"])).toContain("around:5000,");
    expect(buildOverpassQuery({ lat: 3, lng: 101 }, 1, ["fuel"])).toContain("around:300,");
    expect(() => buildOverpassQuery({ lat: NaN, lng: 101 }, 2000, ["fuel"])).toThrow();
  });

  it("files a place under the first matching category", () => {
    expect(classify({ amenity: "cafe" })).toEqual({ category: "hot", sub: "Cafe" });
    expect(classify({ tourism: "theme_park" })?.category).toBe("fun");
    expect(classify({ amenity: "cafe", tourism: "attraction" })?.category).toBe("see");
    expect(classify({ shop: "bakery" })).toBeNull();
  });

  it("reads nodes and ways, skips unnamed, duplicates and out-of-Malaysia points", () => {
    const pois = parseOverpass({
      elements: [
        { type: "node", id: 1, lat: 3.1, lon: 101.7, tags: { amenity: "fuel", brand: "TestBrand" } },
        { type: "way", id: 2, center: { lat: 3.11, lon: 101.71 }, tags: { shop: "mall", name: "Test Mall", opening_hours: "Mo-Su 10:00-22:00" } },
        { type: "node", id: 3, lat: 3.1, lon: 101.7, tags: { amenity: "cafe" } }, // no name
        { type: "node", id: 1, lat: 3.1, lon: 101.7, tags: { amenity: "fuel", brand: "TestBrand" } }, // duplicate
        { type: "node", id: 4, lat: 51.5, lon: -0.1, tags: { amenity: "cafe", name: "Far away" } }, // not Malaysia
        { type: "node", id: 5, tags: { amenity: "cafe", name: "No position" } },
        { type: "node", id: 6, lat: 3.1, lon: 101.7, tags: { shop: "bakery", name: "Not a category" } },
      ],
    });
    expect(pois.map((p) => p.id)).toEqual(["node/1", "way/2"]);
    expect(pois[0]).toMatchObject({ name: "TestBrand", category: "fuel" });
    expect(pois[1]).toMatchObject({ name: "Test Mall", category: "hot", hours: "Mo-Su 10:00-22:00" });
    expect(parseOverpass(null)).toEqual([]);
    expect(parseOverpass({ remark: "runtime error" })).toEqual([]);
  });

  it("sorts nearest first with a cap per category", () => {
    const mk = (id: string, lat: number, category: "fuel" | "food") => ({ id, name: id, category, sub: "x", lat, lng: 101.7 });
    const out = nearestPerCategory(
      [mk("far", 3.2, "fuel"), mk("near", 3.101, "fuel"), mk("mid", 3.15, "fuel"), mk("food1", 3.3, "food")],
      { lat: 3.1, lng: 101.7 },
      2,
    );
    expect(out.map((p) => p.id)).toEqual(["near", "mid", "food1"]);
  });
});

describe("search text helpers", () => {
  it("reads coordinates in either order and only inside Malaysia", () => {
    expect(parseCoordinates("3.0366, 101.5416")).toEqual({ lat: 3.0366, lng: 101.5416 });
    expect(parseCoordinates("3.0366 101.5416")).toEqual({ lat: 3.0366, lng: 101.5416 });
    expect(parseCoordinates("101.5416, 3.0366")).toEqual({ lat: 3.0366, lng: 101.5416 });
    expect(parseCoordinates("51.5, -0.12")).toBeNull();
    expect(parseCoordinates("12 34")).toBeNull();
    expect(parseCoordinates("Kota Kemuning")).toBeNull();
  });

  it("knows an address from a place name", () => {
    expect(looksLikeAddress("Jalan Plumbum 7/100, Kota Kemuning")).toBe(true);
    expect(looksLikeAddress("Sunway Pyramid")).toBe(false);
  });

  it("simplifies a long address step by step", () => {
    const f = addressFallbacks("No 1, Jalan Plumbum, 40460 Kota Kemuning, Shah Alam Selangor");
    expect(f).toEqual([
      "Jalan Plumbum, Kota Kemuning, Shah Alam Selangor",
      "Kota Kemuning, Shah Alam Selangor",
      "Shah Alam Selangor",
    ]);
  });

  it("splits at the postcode when there are no commas, and drops the country", () => {
    const f = addressFallbacks("Jalan Plumbum 7/100 40460 Kota Kemuning Shah Alam Selangor Malaysia");
    expect(f[0]).toBe("Jalan Plumbum 7/100, Kota Kemuning Shah Alam Selangor Malaysia");
    expect(f).toContain("Kota Kemuning Shah Alam Selangor Malaysia");
    expect(addressFallbacks("Sunway Pyramid")).toEqual([]);
  });
});

describe("route features", () => {
  // ~2.2 km: 1.1 km north, then 1.1 km east (synthetic, not a real road)
  const route = parseValhallaTrip({
    summary: { length: 2.2, time: 240 },
    legs: [
      {
        shape: encodePolyline([
          { lat: 3.1, lng: 101.7 },
          { lat: 3.11, lng: 101.7 },
          { lat: 3.11, lng: 101.71 },
        ]),
        maneuvers: [{ instruction: "x", type: 1, begin_shape_index: 0 }],
      },
    ],
  });
  const node = (id: number, lat: number, lon: number, tags: Record<string, string>) => ({ type: "node", id, lat, lon, tags });

  it("simplifies a straight line to its end points", () => {
    const line = Array.from({ length: 50 }, (_, i) => ({ lat: 3.1 + i * 0.0002, lng: 101.7 }));
    expect(simplifyLine(line, 5)).toHaveLength(2);
  });

  it("asks for lights, cameras and toll booths around every route", () => {
    const q = buildRouteQuery([route]);
    expect(q).toContain('node["highway"="traffic_signals"](around:');
    expect(q).toContain('node["highway"="speed_camera"](around:');
    expect(q).toContain('nwr["barrier"="toll_booth"](around:');
    expect(q).toContain("out center;");
  });

  it("counts only what is on the route and merges duplicates", () => {
    const f = countRouteFeatures(route, {
      elements: [
        node(1, 3.103, 101.70005, { highway: "traffic_signals" }),
        node(2, 3.10302, 101.7001, { highway: "traffic_signals" }), // same junction (other side)
        node(3, 3.11, 101.7050, { highway: "traffic_signals" }),
        node(4, 3.105, 101.7006, { highway: "traffic_signals" }), // ~66 m off the road: not on this route
        node(5, 3.107, 101.70002, { highway: "speed_camera", maxspeed: "90" }),
        node(6, 3.108, 101.70002, { barrier: "toll_booth", name: "Test Plaza" }),
        node(7, 3.10805, 101.70002, { barrier: "toll_booth", name: "Test Plaza" }), // second lane
        node(8, 3.109, 101.7, { amenity: "cafe" }),
      ],
    });
    expect(f.signals).toHaveLength(2);
    expect(f.cameras).toEqual([expect.objectContaining({ maxspeed: "90" })]);
    expect(f.tolls).toHaveLength(1);
    expect(f.tolls[0]?.name).toBe("Test Plaza");
    expect(countRouteFeatures(route, null)).toEqual({ signals: [], cameras: [], tolls: [] });
  });
});

import {
  buildAllTiles,
  cellKey,
  cellsAlongRoute,
  cellsForCircle,
  POI_CELL_DEG,
  roadTileToElements,
  rowToPoi,
  poiToRow,
  ROAD_CELL_DEG,
} from "./index";

describe("places of worship", () => {
  it("tells mosque, church and temples apart from the religion tag", () => {
    const base = { amenity: "place_of_worship" };
    expect(classify({ ...base, religion: "muslim", name: "Masjid Negeri" })).toEqual({ category: "worship", sub: "Mosque" });
    expect(classify({ ...base, religion: "muslim", name: "Surau Al-Hidayah" })?.sub).toBe("Surau");
    expect(classify({ ...base, religion: "muslim", name: "Al-Ikhlas" })?.sub).toBe("Mosque / surau");
    expect(classify({ ...base, religion: "christian", name: "St Mary" })?.sub).toBe("Church");
    expect(classify({ ...base, religion: "buddhist", name: "Kek Lok Si" })?.sub).toBe("Buddhist temple");
    expect(classify({ ...base, religion: "taoist", name: "X" })?.sub).toBe("Chinese temple");
    expect(classify({ ...base, religion: "hindu", name: "Sri Maha" })?.sub).toBe("Hindu temple");
    expect(classify({ ...base, religion: "sikh", name: "Gurdwara" })?.sub).toBe("Gurdwara");
    expect(classify({ ...base, name: "No religion tag" })?.sub).toBe("Place of worship");
  });

  it("searches places of worship, requires a name, and covers 5 km", () => {
    expect(DEFAULT_RADIUS_M).toBe(5000);
    const q = buildOverpassQuery({ lat: 3.1, lng: 101.7 }, DEFAULT_RADIUS_M, ["worship"]);
    expect(q).toContain('"amenity"~"^(place_of_worship)$"]["name"]');
    expect(q).toContain("around:5000");
  });

  it("the data pipeline keeps the religion tag", () => {
    expect(OSM_KEEP_TAGS).toContain("religion");
    expect(OSM_EXTRACT_RULES).toContainEqual(["amenity", "place_of_worship"]);
  });
});

describe("toll estimate", () => {
  it("every price has two sources and a check date", () => {
    for (const r of TOLL_RATES) {
      expect(r.sourceUrl).toMatch(/^https:\/\//);
      expect(r.checkedWith).toMatch(/^https:\/\//);
      expect(r.checkedWith).not.toBe(r.sourceUrl);
      expect(r.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.rm).toBeGreaterThan(0);
    }
  });

  it("no two records can match the same plaza name", () => {
    for (const r of TOLL_RATES) expect(findTollRate(`Plaza Tol ${r.plaza}`)?.plaza).toBe(r.plaza);
  });

  it("matches common ways the map names a plaza", () => {
    expect(findTollRate("Plaza Tol Penchala")?.rm).toBe(2.1);
    expect(findTollRate("Penchala Toll Plaza")?.rm).toBe(2.1);
    expect(findTollRate("Gombak Toll")?.rm).toBe(6);
    expect(findTollRate("Plaza Tol Mines (North & South)")?.rm).toBe(1.85);
    expect(findTollRate("Plaza Tol Salak Selatan")?.rm).toBe(2);
  });

  it("refuses to guess: unknown, ambiguous or look-alike names get no price", () => {
    expect(findTollRate("Plaza Tol Damansara")).toBeNull(); // shared by several highways
    expect(findTollRate("Plaza Tol Sungai Besi")).toBeNull();
    expect(findTollRate("Penchala Link")).toBeNull();
    expect(findTollRate("Salak")).toBeNull();
    expect(findTollRate("")).toBeNull();
    expect(findTollRate("Toll plaza")).toBeNull();
  });

  it("adds up only what is priced and says what is missing", () => {
    const e = estimateTolls([{ name: "Plaza Tol Penchala" }, { name: "Plaza Tol Sungai Besi" }, { name: "Gombak" }]);
    expect(e.totalRm).toBe(8.1);
    expect(e.priced.map((p) => p.name)).toEqual(["Penchala", "Gombak"]);
    expect(e.unpriced).toEqual(["Plaza Tol Sungai Besi"]);
    expect(e.complete).toBe(false);
    expect(estimateTolls([{ name: "Gombak" }]).complete).toBe(true);
    expect(estimateTolls([]).complete).toBe(false);
  });
});

describe("map data tiles", () => {
  it("gives the same cell for the same point and covers a circle", () => {
    const p = { lat: 3.139, lng: 101.6869 };
    expect(cellKey(p, POI_CELL_DEG)).toBe("1016_31");
    expect(cellsForCircle(p, 2000, POI_CELL_DEG)).toContain("1016_31");
    // a point right on a cell edge needs both cells
    expect(cellsForCircle({ lat: 3.1, lng: 101.6 }, 1500, POI_CELL_DEG).length).toBeGreaterThan(1);
  });

  it("lists the tiles along a long straight route even with no points in between", () => {
    const cells = cellsAlongRoute([{ lat: 3.0, lng: 101.0 }, { lat: 3.0, lng: 101.6 }], ROAD_CELL_DEG);
    // 0.6 degrees of longitude is about 66 km: at least 3 tiles of 0.25 degrees
    expect(cells.length).toBeGreaterThanOrEqual(3);
  });

  it("builds tiles and a manifest from extracted elements, then reads them back", () => {
    const el = (id: number, lat: number, lon: number, tags: Record<string, string>) => ({ type: "node", id, lat, lon, tags });
    const { poi, road, manifest } = buildAllTiles(
      [
        el(1, 3.1, 101.7, { amenity: "fuel", brand: "Test Petrol" }),
        el(2, 3.1, 101.7, { amenity: "cafe" }), // no name: dropped
        el(3, 3.1, 101.7, { highway: "traffic_signals" }),
        el(4, 3.11, 101.71, { highway: "speed_camera", maxspeed: "90" }),
        el(5, 3.12, 101.72, { barrier: "toll_booth", name: "Test Plaza" }),
        el(6, 51.5, -0.1, { highway: "traffic_signals" }), // outside Malaysia
      ],
      "2026-01-01T00:00:00Z",
      "test",
    );
    expect(manifest.counts).toEqual({ places: 1, signals: 1, cameras: 1, tolls: 1 });
    const row = poi.get(cellKey({ lat: 3.1, lng: 101.7 }, POI_CELL_DEG))![0]!;
    expect(rowToPoi(row)).toMatchObject({ name: "Test Petrol", category: "fuel", lat: 3.1, lng: 101.7 });
    expect(poiToRow(rowToPoi(row))).toEqual(row);
    const tile = road.get(cellKey({ lat: 3.1, lng: 101.7 }, ROAD_CELL_DEG))!;
    const back = roadTileToElements(tile);
    expect(back.map((e) => e.tags.highway ?? e.tags.barrier).sort()).toEqual(["speed_camera", "toll_booth", "traffic_signals"]);
    expect(manifest.poiCells).toEqual([cellKey({ lat: 3.1, lng: 101.7 }, POI_CELL_DEG)]);
  });
});
