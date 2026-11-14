// Turns the extracted places into the small tile files the app loads.
// usage: build-osm-tiles.ts <elements.ndjson> <out dir> "<source description>"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildAllTiles } from "../packages/core/src/tiles";

const [input, outDir, source = "OpenStreetMap"] = process.argv.slice(2);
if (!input || !outDir) throw new Error('usage: build-osm-tiles.ts <elements.ndjson> <out dir> "<source>"');

const elements = readFileSync(input, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => JSON.parse(l));
const { poi, road, manifest } = buildAllTiles(elements, new Date().toISOString(), source);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, "poi"), { recursive: true });
mkdirSync(join(outDir, "road"), { recursive: true });
let biggest = 0;
for (const [k, rows] of poi) {
  const s = JSON.stringify(rows);
  biggest = Math.max(biggest, s.length);
  writeFileSync(join(outDir, "poi", `${k}.json`), s);
}
for (const [k, tile] of road) writeFileSync(join(outDir, "road", `${k}.json`), JSON.stringify(tile));
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest));
console.log(
  `Built ${poi.size} place tiles and ${road.size} road tiles (largest place tile ${(biggest / 1024).toFixed(0)} KB). ` +
    `${manifest.counts.places} places, ${manifest.counts.signals} traffic lights, ${manifest.counts.cameras} cameras, ${manifest.counts.tolls} toll booths.`,
);
