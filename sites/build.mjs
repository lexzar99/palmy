// Bygger en sajt till dist/. Varje restaurang är ett eget Vercel-projekt med miljövariabeln SITE.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const STATUS_URL = "https://www.viaeats.se/api/restaurant-status/";
const name = process.env.SITE;
if (!name) throw new Error("SITE saknas, till exempel SITE=freds");

const { default: site } = await import(join(ROOT, name, "site.config.js"));
const out = join(ROOT, "dist");
rmSync(out, { recursive: true, force: true });
execFileSync("npx", ["vite", "build", "--logLevel", "warn", `--outDir=${out}`, "--emptyOutDir", join(ROOT, name)], { cwd: ROOT, stdio: "inherit" });

const menu = readFileSync(join(ROOT, "_kit/menu-page.html"), "utf8")
  .replaceAll("{{name}}", site.name).replaceAll("{{slug}}", site.slug).replaceAll("{{theme}}", site.theme);
mkdirSync(join(out, "meny"), { recursive: true });
writeFileSync(join(out, "meny/index.html"), menu);
writeFileSync(join(out, "manifest.webmanifest"), JSON.stringify({
  name: site.name, short_name: site.shortName, lang: "sv", start_url: "/", scope: "/", display: "standalone",
  background_color: site.theme, theme_color: site.theme,
  icons: [{ src: "/img/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/img/icon-512.png", sizes: "512x512", type: "image/png" }],
}));
const home = `https://${site.domains[0]}`;
writeFileSync(join(out, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${home}/sitemap.xml\n`);
writeFileSync(join(out, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${home}/</loc></url><url><loc>${home}/meny</loc></url></urlset>\n`);

// Sista kända tider, som reserv om viaeats inte svarar
const status = await fetch(STATUS_URL + site.slug, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
if (status?.ok) writeFileSync(join(out, "status.json"), await status.text());
console.log(`Byggde ${name}`);
