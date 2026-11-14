// Writes the list of OpenStreetMap tags the extractor must keep, from the same
// rules the app uses, so the data build and the app can never disagree.
import { writeFileSync } from "node:fs";
import { OSM_EXTRACT_RULES, OSM_KEEP_TAGS } from "../packages/core/src/tiles";

const out = process.argv[2];
if (!out) throw new Error("usage: export-osm-rules.ts <out.json>");
writeFileSync(out, JSON.stringify({ rules: OSM_EXTRACT_RULES, keepTags: OSM_KEEP_TAGS }));
console.log(`Wrote ${OSM_EXTRACT_RULES.length} rules to ${out}`);
