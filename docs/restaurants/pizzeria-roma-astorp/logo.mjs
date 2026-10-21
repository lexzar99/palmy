#!/usr/bin/env node
// Romas logga omritad som vektor (originalet finns bara i 200 px): "Roma" i båge, guld med mörk kontur
// och röd skugga, i samma anda som skylten på Nya Torg. Bokstäverna görs om till vektorbanor med
// opentype.js, så logo.svg behöver inga typsnitt och rastreras likadant överallt.
//
//   node docs/restaurants/pizzeria-roma-astorp/logo.mjs --opentype <sökväg till opentype.js> \
//     --shrikhand Shrikhand-Regular.ttf --archivo ArchivoBlack-Regular.ttf [--cover cover.jpg]
// (Shrikhand och Archivo Black: OFL, github.com/google/fonts)
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../../..");
const sharp = createRequire(join(repo, "packages/api/package.json"))("sharp");
const OUT = join(repo, "apps/web/public/demo/pizzeria-roma/img");
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };

const opentype = createRequire(import.meta.url)(opt("opentype"));
const load = async (p) => opentype.parse((await readFile(p)).buffer);
const shrikhand = await load(opt("shrikhand"));
const archivo = await load(opt("archivo"));

// Varje tecken placeras längs en cirkelbåge (centrum cx,cy, radie r) och roteras med bågen.
function arcPaths(font, text, { cx, cy, r, size, tracking = 0 }) {
  const glyphs = font.stringToGlyphs(text);
  const scale = size / font.unitsPerEm;
  const widths = glyphs.map((g, i) => g.advanceWidth * scale + (i < glyphs.length - 1 ? tracking : 0));
  const total = widths.reduce((a, b) => a + b, 0);
  let pos = -total / 2, d = "";
  glyphs.forEach((g, i) => {
    const w = g.advanceWidth * scale;
    const ang = (pos + w / 2) / r;
    const x = cx + r * Math.sin(ang), y = cy - r * Math.cos(ang);
    const path = g.getPath(-w / 2, 0, size);
    const c = Math.cos(ang), s = Math.sin(ang);
    path.commands.forEach((cmd) => {
      for (const [kx, ky] of [["x", "y"], ["x1", "y1"], ["x2", "y2"]]) {
        if (cmd[kx] === undefined) continue;
        const px = cmd[kx], py = cmd[ky];
        cmd[kx] = x + px * c - py * s;
        cmd[ky] = y + px * s + py * c;
      }
    });
    d += path.toPathData(1);
    pos += widths[i];
  });
  return d;
}
function linePath(font, text, { x, y, size, tracking = 0 }) {
  const glyphs = font.stringToGlyphs(text);
  const scale = size / font.unitsPerEm;
  const total = glyphs.reduce((a, g, i) => a + g.advanceWidth * scale + (i < glyphs.length - 1 ? tracking : 0), 0);
  let pos = x - total / 2, d = "";
  glyphs.forEach((g) => { d += g.getPath(pos, y, size).toPathData(1); pos += g.advanceWidth * scale + tracking; });
  return d;
}

const roma = arcPaths(shrikhand, "Roma", { cx: 320, cy: 640, r: 420, size: 176 });
const romaShadow = arcPaths(shrikhand, "Roma", { cx: 327, cy: 649, r: 420, size: 176 });
const top = arcPaths(archivo, "RESTAURANG & PIZZERIA", { cx: 320, cy: 640, r: 560, size: 24, tracking: 4.5 });
const bottom = linePath(archivo, "ÅSTORP · SEDAN 2003", { x: 320, y: 318, size: 19, tracking: 5 });

const logoSvg = (light) => {
  const ink = light ? "#fff4df" : "#2a1208";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 330" role="img" aria-label="Restaurang &amp; Pizzeria Roma">
<defs><linearGradient id="roma-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe066"/><stop offset=".55" stop-color="#f7b51e"/><stop offset="1" stop-color="#e2830c"/></linearGradient></defs>
<path d="${top}" fill="${ink}"/>
<path d="${romaShadow}" fill="#c8301e"/>
<path d="${roma}" fill="url(#roma-gold)" stroke="#2a1208" stroke-width="7" stroke-linejoin="round" paint-order="stroke"/>
<path d="${bottom}" fill="${ink}"/>
</svg>`;
};

await writeFile(join(OUT, "logo.svg"), logoSvg(false));
await writeFile(join(OUT, "logo-light.svg"), logoSvg(true));

const square = (size, pad) => {
  const inner = Math.round(size * (1 - 2 * pad));
  const h = Math.round((inner * 330) / 640);
  const logo = logoSvg(true).replace("<svg ", `<svg x="${Math.round((size - inner) / 2)}" y="${Math.round(size / 2 - h / 2)}" width="${inner}" height="${h}" `);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#b5261a"/><circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.46}" fill="none" stroke="#f7b51e" stroke-width="${Math.max(2, size * 0.012)}" stroke-dasharray="${size * 0.02} ${size * 0.018}"/>${logo}</svg>`);
};
await sharp(square(800, 0.08)).webp({ quality: 92 }).toFile(join(OUT, "logo-square.webp"));
await sharp(square(512, 0.08)).png().toFile(join(OUT, "icon-512.png"));
await sharp(square(192, 0.08)).png().toFile(join(OUT, "icon-192.png"));
await sharp(square(180, 0.09)).png().toFile(join(OUT, "apple-touch-icon.png"));
await sharp(square(512, 0.17)).png().toFile(join(OUT, "icon-maskable-512.png"));
const cover = opt("cover");
if (cover) {
  await sharp(cover).resize({ width: 1600 }).webp({ quality: 84 }).toFile(join(OUT, "hero.webp"));
  await sharp(cover).resize({ width: 900 }).webp({ quality: 80 }).toFile(join(OUT, "hero-900.webp"));
}
console.log("logga, ikoner och hero klara");
