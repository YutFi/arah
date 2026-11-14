// Copies the reference datasets into the web app's public folder so they are
// served as plain static files (and can be cached by the service worker).
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "apps", "web", "public", "data");
mkdirSync(out, { recursive: true });
copyFileSync(join(root, "data", "awas", "cameras.json"), join(out, "awas.json"));
console.log("Copied datasets to apps/web/public/data");
