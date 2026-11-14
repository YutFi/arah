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
process.exit(issues.length > 0 ? 1 : 0);
