import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateDataset } from "../packages/core/src/awas";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(root, "data", "awas", "cameras.json");

let raw: unknown;
try {
  raw = JSON.parse(readFileSync(file, "utf8"));
} catch (e) {
  console.error(`Cannot read ${file}: ${(e as Error).message}`);
  process.exit(1);
}

const { valid, issues } = validateDataset(raw);
console.log(`AWAS cameras: ${valid.length} valid, ${issues.length} problem(s)`);
for (const i of issues) console.error(`  - ${i.id}: ${i.problem}`);
if (valid.length === 0 && issues.length === 0) console.log("  (dataset is empty: no verified records yet)");

// House rules for the shipped file (the JPJ list has no coordinates, so every pin must say it is approximate).
const policy: string[] = [];
for (const c of valid) {
  if (c.approximate !== true) policy.push(`${c.id}: must be marked approximate`);
  if (c.directionDeg === undefined) policy.push(`${c.id}: needs a direction so the other carriageway does not trigger it`);
  if (!c.sourceUrl.includes("jpj.gov.my")) policy.push(`${c.id}: source must be the JPJ list`);
  const no = /JPJ list no\. (\d+)/.exec(c.roadName ?? "")?.[1];
  if (!no) policy.push(`${c.id}: roadName must carry the JPJ list number`);
  else if (["47", "48", "49"].includes(no)) policy.push(`${c.id}: entries 47 to 49 are suspended on the JPJ list and must not be pinned`);
}
for (const p of policy) console.error(`  - ${p}`);
process.exit(issues.length > 0 || policy.length > 0 ? 1 : 0);
