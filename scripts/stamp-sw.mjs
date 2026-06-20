// Generate `public/sw.js` from `scripts/sw.template.js` with a fresh BUILD_ID.
// Runs as `prebuild` so the result is included in `next build` output.
// Replacing the cache key on every build forces clients to fetch new assets.
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

const projectRoot = process.cwd();
const templatePath = path.join(projectRoot, "scripts", "sw.template.js");
const outPath = path.join(projectRoot, "public", "sw.js");

const buildId = process.env.BUILD_ID || randomUUID();
const template = await readFile(templatePath, "utf8");
const stamped = template.replace(/__BUILD_ID__/g, buildId);

await writeFile(outPath, stamped);
console.log(`[stamp-sw] Wrote public/sw.js with BUILD_ID=${buildId}`);
