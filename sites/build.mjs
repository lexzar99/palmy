// Bygger alla sajter till dist/<sajt>/ och skriver vercel.json, så att domänen avgör vilken sajt som visas.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const STATUS_URL = "https://www.viaeats.se/api/restaurant-status/";
const sites = readdirSync(ROOT).filter((name) => {
  try { return statSync(join(ROOT, name, "site.config.js")).isFile(); } catch { return false; }
});

rmSync(join(ROOT, "dist"), { recursive: true, force: true });
const routes = [];

for (const name of sites) {
  const { default: site } = await import(join(ROOT, name, "site.config.js"));
  const out = join(ROOT, "dist", name);
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
  writeFileSync(join(out, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: https://${site.domains[0]}/sitemap.xml\n`);
  writeFileSync(join(out, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://${site.domains[0]}/</loc></url><url><loc>https://${site.domains[0]}/meny</loc></url></urlset>\n`);

  // Sista kända tider, som reserv om viaeats inte svarar
  const status = await fetch(STATUS_URL + site.slug).catch(() => null);
  if (status?.ok) writeFileSync(join(out, "status.json"), await status.text());

  for (const host of site.domains) {
    const has = [{ type: "host", value: host }];
    routes.push({ source: "/", has, destination: `/${name}/index.html` }, { source: "/meny", has, destination: `/${name}/meny/index.html` }, { source: "/:path*", has, destination: `/${name}/:path*` });
  }
}

const SECURITY = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
];
writeFileSync(join(ROOT, "dist/404.html"), '<!doctype html><meta charset="utf-8"><title>Sidan finns inte</title><p>Sidan finns inte.</p>');
writeFileSync(join(ROOT, "vercel.json"), `${JSON.stringify({
  buildCommand: "npm run check && npm run build",
  outputDirectory: "dist",
  rewrites: routes,
  headers: [
    { source: "/(.*)", headers: SECURITY },
    { source: "/:site/assets/(.*)", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    { source: "/assets/(.*)", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
  ],
}, null, 2)}\n`);
console.log(`Byggde ${sites.join(", ")}`);
