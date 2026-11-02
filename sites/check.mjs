// Stoppar bygget om en sajt bryter reglerna i docs/RESTAURANGSAJTER-PLATTFORM.md.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const BANNED = [
  [/from\s+["']lenis["']|from\s+["']three["']/, "Lenis och three.js är förbjudna"],
  [/scrollclock/, "scrollclock är förbjudet"],
  [/backdrop-filter/, "backdrop-filter är förbjudet"],
  [/clip-path|mask-size/, "clip-path och mask får inte animeras"],
  [/Intl\.DateTimeFormat/, "sajten får inte räkna ut öppettider"],
  [/\b(?:0\d{1,3}[- ]\d{2,3}[ -]?\d{2}[ -]?\d{2})\b/, "telefonnummer ska komma från viaeats"],
  [/\b\d{2}:\d{2}\b.*\b\d{2}:\d{2}\b/, "öppettider ska komma från viaeats"],
];
const errors = [];
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (name === "public" || name === "node_modules") return [];
  return statSync(path).isDirectory() ? walk(path) : /\.(js|css|html)$/.test(name) ? [path] : [];
});

// På Vercel kontrolleras projektets egen sajt, lokalt alla.
const sites = process.env.SITE ? [process.env.SITE] : readdirSync(ROOT).filter((name) => {
  try { return statSync(join(ROOT, name, "site.config.js")).isFile(); } catch { return false; }
});
for (const name of sites) {
  const { default: site } = await import(join(ROOT, name, "site.config.js"));
  for (const key of ["name", "shortName", "slug", "cuisine", "theme"]) if (!site[key]) errors.push(`${name}: ${key} saknas i site.config.js`);
  if (!site.domains?.length) errors.push(`${name}: domän saknas i site.config.js`);
  const status = await fetch(`https://www.viaeats.se/api/restaurant-status/${site.slug}`, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!site.notInViaeats && status && status.status === 404) errors.push(`${name}: ${site.slug} finns inte i viaeats`);
  for (const file of walk(join(ROOT, name))) {
    const text = readFileSync(file, "utf8");
    for (const [pattern, message] of BANNED) if (pattern.test(text)) errors.push(`${file.replace(`${ROOT}/`, "")}: ${message}`);
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`Reglerna håller för ${sites.join(", ")}`);
