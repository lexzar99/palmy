#!/usr/bin/env node
// Bygger allt underlag för Pizzeria Roma i Åstorp ur lumit-menu.json (Romas Lumit-meny):
//   menu.yaml  – massimporten (kategorier, rätter, tillvalsgrupper med unika namn)
//   roma.json  – det importen inte bär: storleksgrupperna (9 prisklasser, alla heter "Storlek"),
//                gruppordning per rätt och bildkarta för apply.mjs
//   apps/web/public/demo/pizzeria-roma/img/menu|tiles/*.webp – illustrationer av varje rätt,
//                ritade efter rättens riktiga ingredienser (Roma har inga egna produktfoton)
//
//   node docs/restaurants/pizzeria-roma-astorp/build.mjs
import { readFile, writeFile, mkdir, stat, copyFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../../..");
const sharp = createRequire(join(repo, "packages/api/package.json"))("sharp");
const OUT = join(repo, "apps/web/public/demo/pizzeria-roma/img");
const WEB = "/demo/pizzeria-roma/img";

const lumit = JSON.parse(await readFile(join(here, "lumit-menu.json"), "utf8"));

// ── Hjälpare ────────────────────────────────────────────────────────────────
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function rng(seedText) {
  let h = 2166136261;
  for (const c of seedText) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

// ── Ingredienser → ritbara pålägg ──────────────────────────────────────────
// Varje pålägg ritas runt (0,0) och placeras/roteras ut över pizzan.
const G = {
  ham: (r) => `<rect x="-17" y="-13" width="34" height="26" rx="6" fill="#ec9aa3" stroke="#d27583" stroke-width="2.5"/><path d="M-10 -4 q8 -6 18 2" stroke="#f7c3c9" stroke-width="3" fill="none"/>`,
  parma: () => `<path d="M-26 -6 q10 -16 26 -6 q14 8 26 -2 q-6 18 -26 12 q-14 -6 -26 -4z" fill="#d95f6b" stroke="#b9414f" stroke-width="2"/><path d="M-18 -4 q10 -8 20 0" stroke="#f3b6bc" stroke-width="3" fill="none"/>`,
  salami: () => `<circle r="19" fill="#b8312b" stroke="#8f201b" stroke-width="2.5"/><circle cx="-6" cy="-5" r="3" fill="#e9a29a"/><circle cx="7" cy="3" r="2.5" fill="#e9a29a"/><circle cx="-2" cy="9" r="2" fill="#e9a29a"/>`,
  pepperoni: () => `<circle r="17" fill="#c6402c" stroke="#94281b" stroke-width="3"/><circle cx="-5" cy="-4" r="2.4" fill="#7e1d14"/><circle cx="6" cy="5" r="2.4" fill="#7e1d14"/>`,
  mince: (r) => `<path d="M-11 -6 q6 -9 14 -3 q9 2 6 10 q-3 9 -12 6 q-11 -2 -8 -13z" fill="#7a4a2c" stroke="#5c3520" stroke-width="2"/><circle cx="-2" cy="0" r="2.4" fill="#9c6a45"/>`,
  kebab: () => `<path d="M-18 -10 q14 -8 30 -2 q8 6 2 14 q-14 8 -30 4 q-10 -6 -2 -16z" fill="#a0602f" stroke="#6f3d1b" stroke-width="2.5"/><path d="M-12 -3 q12 -4 22 2" stroke="#c98d55" stroke-width="3" fill="none"/><path d="M-8 5 q8 -2 14 1" stroke="#7b4520" stroke-width="2.5" fill="none"/>`,
  beef: () => `<path d="M-22 -6 q10 -8 24 -4 q12 3 20 -1 l-2 11 q-12 5 -22 1 q-12 -4 -20 1z" fill="#6e2d22" stroke="#4a1a12" stroke-width="2"/><path d="M-12 -1 l18 2" stroke="#a5574a" stroke-width="2.5"/>`,
  pork: () => `<path d="M-20 -7 q10 -7 22 -3 q11 3 18 -1 l-1 11 q-11 5 -21 1 q-10 -4 -18 1z" fill="#d8ab7c" stroke="#a97b4f" stroke-width="2"/><path d="M-10 -1 l16 2" stroke="#efd0ad" stroke-width="2.5"/>`,
  chicken: () => `<path d="M-14 -9 q12 -8 22 0 q8 8 0 15 q-10 6 -20 0 q-9 -6 -2 -15z" fill="#f0cf98" stroke="#c99f61" stroke-width="2.5"/><path d="M-7 -2 q6 -3 11 1" stroke="#e0b06e" stroke-width="2.5" fill="none"/>`,
  bacon: () => `<path d="M-26 0 q6 -10 13 0 t13 0 t13 0 t13 0" stroke="#c4453b" stroke-width="11" fill="none" stroke-linecap="round"/><path d="M-26 0 q6 -10 13 0 t13 0 t13 0 t13 0" stroke="#f3c6b8" stroke-width="3" fill="none"/>`,
  mushroom: () => `<path d="M-16 2 q0 -18 16 -18 q16 0 16 18z" fill="#e8d7bc" stroke="#b49a72" stroke-width="2.5"/><path d="M-6 2 v12 q6 4 12 0 v-12" fill="#f1e5d0" stroke="#b49a72" stroke-width="2.5"/>`,
  redonion: () => `<path d="M-16 6 a17 17 0 0 1 32 0" stroke="#8d3f88" stroke-width="5" fill="none"/><path d="M-10 6 a11 11 0 0 1 20 0" stroke="#c88cc4" stroke-width="3" fill="none"/>`,
  onion: () => `<path d="M-16 6 a17 17 0 0 1 32 0" stroke="#efe6c9" stroke-width="5" fill="none"/><path d="M-10 6 a11 11 0 0 1 20 0" stroke="#fbf6e6" stroke-width="3" fill="none"/>`,
  pineapple: () => `<path d="M-13 9 l13 -21 l13 21z" fill="#f6cf3c" stroke="#d29b16" stroke-width="2.5"/><path d="M-5 4 l5 -8 l5 8" stroke="#fbe58a" stroke-width="2" fill="none"/>`,
  banana: () => `<circle r="14" fill="#f8eaa6" stroke="#dcc56a" stroke-width="2.5"/><circle cx="-3" cy="-2" r="1.6" fill="#b79a4a"/><circle cx="3" cy="3" r="1.6" fill="#b79a4a"/><circle cx="4" cy="-4" r="1.4" fill="#b79a4a"/>`,
  shrimp: () => `<path d="M-14 -6 q8 -16 22 -6 q10 10 0 20 q-6 4 -10 0 q8 -8 2 -14 q-6 -4 -12 2z" fill="#f59b70" stroke="#d76b42" stroke-width="2.5"/><path d="M-2 -10 q4 6 0 12" stroke="#fde0cd" stroke-width="2.5" fill="none"/>`,
  mussel: () => `<ellipse rx="17" ry="10" fill="#2b2b3c" stroke="#16161f" stroke-width="2"/><ellipse rx="10" ry="5" fill="#f2b26e"/>`,
  tuna: () => `<path d="M-14 -4 q6 -10 16 -6 q12 2 10 10 q-4 10 -16 8 q-12 -2 -10 -12z" fill="#e7c4b0" stroke="#c09784" stroke-width="2"/><path d="M-8 0 l14 2" stroke="#f6e3d8" stroke-width="2.5"/>`,
  surimi: () => `<rect x="-18" y="-6" width="36" height="12" rx="5" fill="#fff6f0" stroke="#e8c9bd" stroke-width="2"/><rect x="-18" y="-6" width="36" height="5" rx="2.5" fill="#e45a4a"/>`,
  pepper: () => `<path d="M-20 4 q20 -16 40 0" stroke="#d93a2b" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M-14 1 q14 -9 28 0" stroke="#f08d7e" stroke-width="2.5" fill="none"/>`,
  greenpepper: () => `<path d="M-20 4 q20 -16 40 0" stroke="#4f9a3c" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M-14 1 q14 -9 28 0" stroke="#9fd38e" stroke-width="2.5" fill="none"/>`,
  olive: () => `<circle r="10" fill="#2a2a2a"/><circle r="4" fill="#5c5244"/>`,
  artichoke: () => `<path d="M0 -16 q14 8 8 18 q-8 6 -16 0 q-6 -10 8 -18z" fill="#a8b763" stroke="#7b8a3a" stroke-width="2.5"/><path d="M0 -8 v14" stroke="#d5df9b" stroke-width="2.5"/>`,
  jalapeno: () => `<circle r="12" fill="#3f8a2e" stroke="#2a6420" stroke-width="2"/><circle r="6.5" fill="#c9e3a4"/><circle cx="-2" cy="-1" r="1.5" fill="#f4f0d0"/><circle cx="2" cy="2" r="1.5" fill="#f4f0d0"/>`,
  pepperoncini: () => `<circle r="11" fill="#b9c94a" stroke="#8b9a24" stroke-width="2"/><circle r="5.5" fill="#eef3bf"/>`,
  egg: () => `<path d="M-20 0 q0 -18 18 -18 q22 2 22 18 q-2 18 -20 18 q-20 0 -20 -18z" fill="#fffdf6" stroke="#eadfcb" stroke-width="2"/><circle cx="1" cy="0" r="9" fill="#f7b928"/><circle cx="-2" cy="-3" r="3" fill="#fbd877"/>`,
  peanut: () => `<ellipse rx="7" ry="5" fill="#d6a564" stroke="#a87739" stroke-width="1.5"/>`,
  walnut: () => `<path d="M-9 -7 q9 -6 18 0 q4 9 -4 14 q-9 4 -14 -2 q-6 -6 0 -12z" fill="#9a6a3c" stroke="#6b4421" stroke-width="2"/>`,
  gorgonzola: () => `<path d="M-13 -10 q14 -6 24 4 q4 12 -8 14 q-16 2 -18 -8 q-2 -6 2 -10z" fill="#f4f1e6" stroke="#d9d3bf" stroke-width="2"/><path d="M-6 -3 l5 3 M3 -6 l2 5 M-2 5 l6 -1" stroke="#7d8db5" stroke-width="2"/>`,
  fetacube: () => `<rect x="-9" y="-9" width="18" height="18" rx="3" fill="#fbfbf6" stroke="#dcdccc" stroke-width="2"/>`,
  mozzarella: () => `<path d="M-15 -4 q2 -14 16 -12 q16 2 14 14 q-2 14 -16 12 q-16 -2 -14 -14z" fill="#fffef8" stroke="#ece6d2" stroke-width="2"/><ellipse cx="-3" cy="-4" rx="5" ry="3" fill="#ffffff"/>`,
  chevre: () => `<circle r="14" fill="#fbf8ee" stroke="#e1d9c2" stroke-width="2.5"/><circle r="9" fill="none" stroke="#ece4cf" stroke-width="2"/>`,
  burrata: () => `<circle r="34" fill="#fffef9" stroke="#efe7d2" stroke-width="3"/><path d="M-14 -6 q14 -14 28 0" stroke="#f3ecd9" stroke-width="5" fill="none"/>`,
  parmesan: () => `<path d="M-7 -3 l12 -3 l-3 9z" fill="#f2dc8f"/>`,
  tomato: () => `<circle r="18" fill="#e2402f" stroke="#b6271a" stroke-width="2.5"/><circle r="12" fill="#f06a52"/><circle cx="-4" cy="-3" r="2" fill="#f7d16d"/><circle cx="4" cy="2" r="2" fill="#f7d16d"/><circle cx="-1" cy="5" r="2" fill="#f7d16d"/>`,
  cherrytomato: () => `<circle r="12" fill="#e23b2a" stroke="#b5241a" stroke-width="2"/><circle cx="-4" cy="-4" r="3" fill="#f58e7d"/>`,
  sundried: () => `<path d="M-14 -6 q8 -10 18 -4 q10 6 2 14 q-10 8 -18 0 q-6 -4 -2 -10z" fill="#a8261c" stroke="#7a160f" stroke-width="2"/>`,
  rucola: () => `<path d="M0 0 q-6 -12 0 -24 q2 6 8 4 q-4 6 2 10 q-6 0 -4 6 q-4 -2 -6 4z" fill="#4f8f34" stroke="#376b22" stroke-width="1.5"/><path d="M0 0 l2 -22" stroke="#7fb85f" stroke-width="1.5"/>`,
  lettuce: () => `<path d="M-18 6 q-4 -18 12 -20 q10 -10 20 2 q12 4 4 16 q-6 10 -18 6 q-14 4 -18 -4z" fill="#86c55a" stroke="#5c9a37" stroke-width="2"/><path d="M-10 4 q8 -8 18 -6" stroke="#c4e6a6" stroke-width="2.5" fill="none"/>`,
  cucumber: () => `<circle r="14" fill="#3e7d2b"/><circle r="11" fill="#cfe6a3"/><circle cx="-3" cy="-2" r="1.6" fill="#f3f7e2"/><circle cx="3" cy="3" r="1.6" fill="#f3f7e2"/>`,
  corn: () => `<rect x="-5" y="-5" width="10" height="10" rx="3" fill="#f7cf38" stroke="#d9a51b" stroke-width="1.5"/>`,
  avocado: () => `<path d="M-6 -18 q20 -2 18 18 q-2 16 -16 14 q-12 -4 -10 -18 q0 -12 8 -14z" fill="#b9d66b" stroke="#6f8f2c" stroke-width="3"/>`,
  aubergine: () => `<circle r="16" fill="#efe1c4" stroke="#5a2d5e" stroke-width="4"/><circle cx="-4" cy="-3" r="1.6" fill="#c9b48b"/><circle cx="4" cy="3" r="1.6" fill="#c9b48b"/>`,
  fries: () => `<rect x="-3.5" y="-20" width="7" height="40" rx="2.5" fill="#f6c84c" stroke="#d29a1d" stroke-width="2"/>`,
  dorito: () => `<path d="M-13 10 l13 -22 l13 22z" fill="#f08a24" stroke="#c45f0c" stroke-width="2"/><circle cx="-2" cy="2" r="1.5" fill="#c73a14"/><circle cx="4" cy="5" r="1.5" fill="#c73a14"/>`,
  falafel: () => `<circle r="14" fill="#8a6430" stroke="#5f421b" stroke-width="2"/><circle cx="-4" cy="-4" r="2" fill="#b58b4c"/><circle cx="4" cy="3" r="2" fill="#5e8b33"/>`,
  bread: () => `<path d="M-30 10 q0 -26 30 -26 q30 0 30 26z" fill="#e2b06a" stroke="#b07d34" stroke-width="3"/><path d="M-16 -4 l6 -6 M0 -8 l6 -6 M14 -4 l6 -6" stroke="#f3d39c" stroke-width="3"/>`,
  lemon: () => `<circle r="14" fill="#f8e05a" stroke="#d9b51b" stroke-width="2.5"/><path d="M0 -10 v20 M-10 0 h20 M-7 -7 l14 14 M7 -7 l-14 14" stroke="#fbf0a8" stroke-width="2"/>`,
};

// Strössel, ringlar och prickar ritas som lager över hela pizzan.
const DRIZZLE = { bearnaise: "#f5c13a", vitlok: "#fbf6ea", valfri: "#fbf6ea", bbq: "#6e2b16", taco: "#b24a1d", pesto: "#4f8f2b", honung: "#e4a325", balsamico: "#4a2016", dressing: "#f4ead0", olivolja: "#c9b13a" };
const DUST = { curry: "#e3a21a", vitlok: "#ffffff", stark: "#c4321e", oregano: "#5d7a2e" };

const ING = {
  "Skinka": "ham", "Parmaskinka": "parma", "Lufttorkad skinka": "parma", "Salami": "salami", "Pepperonikorv": "pepperoni",
  "Köttfärs": "mince", "Kebabkött": "kebab", "Oxfilé": "beef", "Fläskfilé": "pork", "Kyckling": "chicken", "Bacon": "bacon",
  "Champinjoner": "mushroom", "Färska champinjoner": "mushroom", "Rödlök": "redonion", "Lök": "onion",
  "Ananas": "pineapple", "Banan": "banana", "Räkor": "shrimp", "Musslor": "mussel", "Tonfisk": "tuna", "Surimi": "surimi",
  "Paprika": "pepper", "Färsk paprika": "pepper", "Grillad paprika": "pepper", "Oliver": "olive", "Kronärtskocka": "artichoke",
  "Jalapeno": "jalapeno", "Feferoni": "pepperoncini", "Ägg": "egg", "Jordnötter": "peanut", "Valnötter": "walnut",
  "Gorgonzola": "gorgonzola", "Vitost": "fetacube", "Mozzarella": "mozzarella", "Chevre": "chevre", "Krämig burattaost": "burrata",
  "Parmesanost": "parmesan", "Tomat": "tomato", "Färska tomater": "tomato", "Körsbärstomat": "cherrytomato", "Körsbärstomater": "cherrytomato",
  "Soltorkade tomater": "sundried", "Ruccolasallad": "rucola", "Mixsallad": "lettuce", "Sallad": "lettuce", "Romansallad": "lettuce",
  "Färska grönsaker": "lettuce", "Gurka": "cucumber", "Majs": "corn", "Avocado": "avocado", "Aubergine": "aubergine",
  "Pommes frites": "fries", "Pommes": "fries", "Doritos": "dorito", "Bröd": "bread", "Citron": "lemon",
};
const ING_DRIZZLE = { "Bearnaisesås": "bearnaise", "Valfri sås": "valfri", "BBQ-sås": "bbq", "Tacosås": "taco", "Pesto": "pesto", "Honung": "honung", "Balsamico": "balsamico", "Dressing": "dressing", "Olivolja": "olivolja" };
const ING_DUST = { "Curry": "curry", "Vitlök": "vitlok", "Färsk vitlök": "vitlok", "Stark krydda": "stark", "Oregano": "oregano" };
const SIZE = { burrata: 1, egg: 3, bread: 1, lemon: 2, parmesan: 14, peanut: 14, corn: 14, olive: 9, fries: 9 };

function scatter(rand, count, R, minDist, taken = []) {
  const pts = [];
  for (let tries = 0; pts.length < count && tries < count * 60; tries++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * R;
    const p = { x: Math.cos(a) * r, y: Math.sin(a) * r };
    if ([...pts, ...taken].every((q) => Math.hypot(q.x - p.x, q.y - p.y) > minDist)) pts.push(p);
  }
  return pts;
}

function toppingLayer(rand, ingredients, R, scale = 1) {
  const items = ingredients.map((n) => ING[n]).filter(Boolean);
  const unique = [...new Set(items)];
  let svg = "";
  const taken = [];
  unique.forEach((key, idx) => {
    const n = SIZE[key] ?? Math.max(5, Math.round(12 - unique.length * 0.7));
    for (const p of scatter(rand, n, R, 30 * scale, taken.slice(-80))) {
      taken.push(p);
      svg += `<g transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${Math.round(rand() * 360)}) scale(${(scale * (0.92 + rand() * 0.22)).toFixed(2)})">${G[key](rand)}</g>`;
    }
  });
  return svg;
}
function drizzleLayer(rand, ingredients, R) {
  let svg = "";
  for (const n of ingredients) {
    const key = ING_DRIZZLE[n];
    if (!key) continue;
    let d = "";
    const rows = 4, tilt = rand() * 40 - 20;
    for (let i = 0; i < rows; i++) {
      const y = -R * 0.6 + (i * R * 1.2) / (rows - 1) + (rand() - 0.5) * 16;
      const half = Math.sqrt(Math.max(0, R * R - y * y)) * 0.8;
      d += `M${(-half).toFixed(0)} ${y.toFixed(0)} `;
      for (let x = -half; x < half; x += 60) d += `q30 ${(rand() > 0.5 ? 22 : -22)} 60 0 `;
    }
    svg += `<path d="${d}" transform="rotate(${tilt.toFixed(0)})" stroke="${DRIZZLE[key]}" stroke-width="11" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".95"/>`;
  }
  return svg;
}
function dustLayer(rand, ingredients, R) {
  let svg = "";
  for (const n of ingredients) {
    const key = ING_DUST[n];
    if (!key) continue;
    for (const p of scatter(rand, 60, R, 6)) svg += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(1.6 + rand() * 1.8).toFixed(1)}" fill="${DUST[key]}" opacity=".85"/>`;
  }
  return svg;
}

const BG = "#f6ecdc";
const frame = (inner, w = 1200, h = 900) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${BG}"/>${inner}</svg>`;

function crustPath(rand, R, wobble = 7) {
  let d = "";
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2, r = R + (rand() - 0.5) * wobble;
    d += `${i ? "L" : "M"}${(Math.cos(a) * r).toFixed(1)} ${(Math.sin(a) * r).toFixed(1)} `;
  }
  return d + "Z";
}

function pizza(name, ingredients, { shape = "round" } = {}) {
  const rand = rng(name);
  const sauce = ingredients.includes("Tomatsås") || ingredients.includes("Tacosås");
  const cheese = ingredients.some((i) => ["Ost", "Mozzarella"].includes(i));
  const R = 372;
  const cx = 600, cy = 450;
  let body = "";
  const board = () => `<circle cx="${cx + 16}" cy="${cy + 22}" r="${R + 46}" fill="#000" opacity=".14"/><circle cx="${cx}" cy="${cy}" r="${R + 44}" fill="#b07a45"/><circle cx="${cx}" cy="${cy}" r="${R + 32}" fill="#c99158"/><path d="M${cx - R - 20} ${cy - 40} q${R} -40 ${2 * R + 40} 0 M${cx - R} ${cy + 90} q${R} -30 ${2 * R} 0" stroke="#b9824c" stroke-width="5" fill="none" opacity=".6"/>`;
  if (shape === "calzone") {
    body += `<ellipse cx="${cx + 20}" cy="${cy + 120}" rx="370" ry="70" fill="#000" opacity=".12"/>`;
    // Inbakad: halvmåne med lite sås som tittar fram i skarven.
    body += `<g transform="translate(${cx} ${cy + 40}) rotate(-12)"><path d="M-330 0 A330 300 0 0 1 330 0 Q0 60 -330 0z" fill="#e2a24d" stroke="#b5762a" stroke-width="6"/><path d="M-300 6 Q0 54 300 6" stroke="#c8361f" stroke-width="16" fill="none" stroke-linecap="round"/><path d="M-310 0 Q0 44 310 0" stroke="#f3cf7c" stroke-width="5" fill="none"/>`;
    for (let i = 0; i < 26; i++) body += `<circle cx="${(-260 + i * 21).toFixed(0)}" cy="${(-80 - Math.sin(i / 3) * 70 - rand() * 60).toFixed(0)}" r="${(3 + rand() * 4).toFixed(1)}" fill="#c08a3c" opacity=".55"/>`;
    body += `<path d="M-200 -150 q30 -20 60 0 M40 -200 q30 -20 60 0 M150 -110 q30 -20 60 0" stroke="#f0c070" stroke-width="10" fill="none" stroke-linecap="round" opacity=".7"/></g>`;
    return frame(body);
  }
  if (shape === "boat") {
    body += `<ellipse cx="${cx + 20}" cy="${cy + 150}" rx="400" ry="60" fill="#000" opacity=".12"/>`;
    body += `<g transform="translate(${cx} ${cy}) rotate(-8)"><path d="M-380 -40 Q0 -230 380 -40 Q300 170 0 170 Q-300 170 -380 -40z" fill="#e2a24d" stroke="#b5762a" stroke-width="6"/>`;
    body += `<path d="M-300 -30 Q0 -150 300 -30 Q230 100 0 105 Q-230 100 -300 -30z" fill="${sauce ? "#c8361f" : "#f2d382"}"/>`;
    body += `<path d="M-280 -26 Q0 -130 280 -26 Q215 86 0 92 Q-215 86 -280 -26z" fill="#f7d77c"/>`;
    body += `<g transform="scale(.82 .45) translate(0 -40)">${toppingLayer(rand, ingredients, 300, 1.15)}</g>${drizzleLayer(rand, ingredients, 150)}</g>`;
    return frame(body);
  }
  body += board() + `<g transform="translate(${cx} ${cy})">`;
  body += `<path d="${crustPath(rand, R)}" fill="#e2a24d" stroke="#b5762a" stroke-width="6"/>`;
  for (let i = 0; i < 40; i++) {
    const a = rand() * Math.PI * 2, r = R - 18 + rand() * 10;
    body += `<circle cx="${(Math.cos(a) * r).toFixed(1)}" cy="${(Math.sin(a) * r).toFixed(1)}" r="${(3 + rand() * 5).toFixed(1)}" fill="#b9782d" opacity=".55"/>`;
  }
  body += `<path d="${crustPath(rand, R - 38, 10)}" fill="${sauce ? "#c8361f" : "#f2d382"}"/>`;
  if (cheese) {
    body += `<path d="${crustPath(rand, R - 52, 26)}" fill="#f7d77c"/>`;
    for (const p of scatter(rand, 26, R - 80, 40)) body += `<ellipse cx="${p.x.toFixed(0)}" cy="${p.y.toFixed(0)}" rx="${(14 + rand() * 14).toFixed(0)}" ry="${(9 + rand() * 9).toFixed(0)}" fill="#fbe7a6" opacity=".9"/>`;
    for (const p of scatter(rand, 12, R - 70, 60)) body += `<circle cx="${p.x.toFixed(0)}" cy="${p.y.toFixed(0)}" r="${(5 + rand() * 7).toFixed(0)}" fill="#e7a83e" opacity=".55"/>`;
  }
  body += dustLayer(rand, ingredients, R - 70);
  body += toppingLayer(rand, ingredients, R - 96, 2.15);
  body += drizzleLayer(rand, ingredients, R - 70);
  body += `</g>`;
  return frame(body);
}

function plateDish(name, ingredients, kind) {
  const rand = rng(name);
  const cx = 600, cy = 455;
  let s = `<ellipse cx="${cx + 16}" cy="${cy + 24}" rx="372" ry="372" fill="#000" opacity=".1"/>`;
  if (kind === "bowl") {
    s += `<circle cx="${cx}" cy="${cy}" r="360" fill="#ffffff" stroke="#e3dccd" stroke-width="6"/><circle cx="${cx}" cy="${cy}" r="300" fill="#f4efe4"/>`;
    s += `<g transform="translate(${cx} ${cy})">`;
    for (const p of scatter(rand, 26, 230, 46)) s += `<g transform="translate(${p.x.toFixed(0)} ${p.y.toFixed(0)}) rotate(${Math.round(rand() * 360)}) scale(2.2)">${G.lettuce()}</g>`;
    s += toppingLayer(rand, ingredients.filter((i) => !["Mixsallad", "Sallad", "Romansallad", "Bröd"].includes(i)), 220, 1.8);
    s += drizzleLayer(rand, ingredients, 190) + dustLayer(rand, ingredients, 200);
    s += `</g>`;
    if (ingredients.includes("Bröd")) s += `<g transform="translate(${cx + 330} ${cy + 250}) rotate(-20) scale(2.4)">${G.bread()}</g>`;
    return frame(s);
  }
  // Tallrik: pommes/potatis + kött + sallad + såskopp
  s += `<circle cx="${cx}" cy="${cy}" r="370" fill="#ffffff" stroke="#e3dccd" stroke-width="6"/><circle cx="${cx}" cy="${cy}" r="320" fill="none" stroke="#efe9dc" stroke-width="4"/>`;
  s += `<g transform="translate(${cx} ${cy})">`;
  const meat = kind;
  // pommes
  if (ingredients.some((i) => /Pommes|potatis/i.test(i)) || meat === "steak" || meat === "chicken-fillet") {
    for (let i = 0; i < 26; i++) s += `<g transform="translate(${(-150 + rand() * 120).toFixed(0)} ${(-160 + rand() * 120).toFixed(0)}) rotate(${Math.round(-60 + rand() * 120)}) scale(2.2)">${G.fries()}</g>`;
  }
  // salladshörna
  for (const p of scatter(rand, 8, 70, 40)) s += `<g transform="translate(${(150 + p.x).toFixed(0)} ${(-120 + p.y).toFixed(0)}) rotate(${Math.round(rand() * 360)}) scale(2.2)">${G.lettuce()}</g>`;
  for (const p of scatter(rand, 4, 60, 40)) s += `<g transform="translate(${(170 + p.x).toFixed(0)} ${(-110 + p.y).toFixed(0)}) scale(2)">${G.cherrytomato()}</g>`;
  if (meat === "steak") {
    s += `<path d="M-170 40 q40 -70 150 -60 q140 10 150 90 q4 100 -150 110 q-170 0 -150 -140z" fill="#7a3220" stroke="#4d1b10" stroke-width="6"/>`;
    for (let i = 0; i < 5; i++) s += `<path d="M${-120 + i * 55} 10 l40 110" stroke="#3e150c" stroke-width="10" opacity=".55" stroke-linecap="round"/>`;
  } else if (meat === "chicken-fillet") {
    s += `<path d="M-170 40 q30 -80 160 -60 q140 20 140 90 q0 90 -150 100 q-170 0 -150 -130z" fill="#e9bf80" stroke="#b98a45" stroke-width="6"/>`;
    for (let i = 0; i < 5; i++) s += `<path d="M${-120 + i * 55} 10 l40 110" stroke="#9b6a2b" stroke-width="10" opacity=".5" stroke-linecap="round"/>`;
  } else {
    const key = meat === "falafel" ? "falafel" : meat === "chicken" ? "chicken" : meat === "nuggets" ? "chicken" : "kebab";
    for (const p of scatter(rand, meat === "falafel" ? 9 : 18, 140, 44)) s += `<g transform="translate(${(p.x - 30).toFixed(0)} ${(p.y + 90).toFixed(0)}) rotate(${Math.round(rand() * 360)}) scale(2.3)">${G[key]()}</g>`;
  }
  s += `<circle cx="230" cy="150" r="70" fill="#ffffff" stroke="#d9d1bf" stroke-width="6"/><circle cx="230" cy="150" r="54" fill="${ingredients.includes("Bearnaisesås") || meat === "steak" ? "#f5c13a" : "#fbf6ea"}"/>`;
  s += `</g>`;
  return frame(s);
}

function wrap(name, ingredients, filling) {
  const rand = rng(name);
  let s = `<ellipse cx="616" cy="560" rx="440" ry="120" fill="#000" opacity=".1"/><g transform="translate(600 450) rotate(-24)">`;
  s += `<rect x="-400" y="-120" width="700" height="240" rx="120" fill="#ecd3a2" stroke="#c7a466" stroke-width="6"/>`;
  for (let i = 0; i < 18; i++) s += `<circle cx="${(-340 + rand() * 600).toFixed(0)}" cy="${(-90 + rand() * 180).toFixed(0)}" r="${(6 + rand() * 9).toFixed(0)}" fill="#c99c55" opacity=".45"/>`;
  s += `<ellipse cx="300" cy="0" rx="90" ry="120" fill="#f3e1ba" stroke="#c7a466" stroke-width="6"/>`;
  for (const p of scatter(rand, 9, 70, 30)) s += `<g transform="translate(${(310 + p.x * 0.6).toFixed(0)} ${p.y.toFixed(0)}) rotate(${Math.round(rand() * 360)}) scale(1.7)">${G.lettuce()}</g>`;
  for (const p of scatter(rand, 7, 70, 30)) s += `<g transform="translate(${(320 + p.x * 0.6).toFixed(0)} ${p.y.toFixed(0)}) rotate(${Math.round(rand() * 360)}) scale(1.6)">${G[filling]()}</g>`;
  s += `<g transform="translate(330 30) scale(1.4)">${G.tomato()}</g><g transform="translate(300 -50) scale(1.4)">${G.pepperoncini()}</g>`;
  s += `<path d="M260 -100 q40 40 0 200" stroke="#fbf6ea" stroke-width="12" fill="none" stroke-linecap="round"/></g>`;
  return frame(s);
}

function pita(name, filling) {
  const rand = rng(name);
  let s = `<ellipse cx="616" cy="640" rx="360" ry="70" fill="#000" opacity=".1"/>`;
  s += `<path d="M300 620 Q300 250 600 230 Q900 250 900 620z" fill="#e6c48c" stroke="#bb9455" stroke-width="6"/>`;
  s += `<path d="M330 330 Q600 180 870 330" stroke="#f3e1ba" stroke-width="40" fill="none" stroke-linecap="round"/>`;
  for (const p of scatter(rand, 12, 130, 34)) s += `<g transform="translate(${(600 + p.x * 1.8).toFixed(0)} ${(300 + p.y * 0.35).toFixed(0)}) rotate(${Math.round(rand() * 360)}) scale(2)">${G[rand() > 0.5 ? "lettuce" : filling]()}</g>`;
  s += `<g transform="translate(470 300) scale(1.8)">${G.tomato()}</g><g transform="translate(720 290) scale(1.8)">${G.pepperoncini()}</g>`;
  return frame(s);
}

function burger(name, ingredients, withSide = "strips") {
  const rand = rng(name);
  let s = `<ellipse cx="560" cy="700" rx="320" ry="60" fill="#000" opacity=".1"/>`;
  s += `<path d="M300 680 q0 -50 260 -50 q260 0 260 50 q0 30 -260 30 q-260 0 -260 -30z" fill="#d9954a" stroke="#a96a26" stroke-width="6"/>`;
  s += `<rect x="290" y="560" width="540" height="80" rx="40" fill="#5b2a17" stroke="#3a170b" stroke-width="6"/>`;
  if (ingredients.includes("Bacon")) s += `<path d="M300 560 q40 -24 80 0 t80 0 t80 0 t80 0 t80 0 t80 0" stroke="#c4453b" stroke-width="20" fill="none" stroke-linecap="round"/>`;
  s += `<path d="M300 560 l40 30 l40 -30 l40 30 l40 -30 l40 30 l40 -30 l40 30 l40 -30 l40 30 l40 -30 l40 30 l40 -30 l20 14 v-30 h-520z" fill="#f6c43c"/>`;
  s += `<rect x="290" y="505" width="540" height="34" rx="17" fill="#e2402f"/><path d="M280 500 q60 -30 120 0 t120 0 t120 0 t120 0 t100 0" stroke="#86c55a" stroke-width="26" fill="none" stroke-linecap="round"/>`;
  if (ingredients.includes("Jalapeno")) for (let i = 0; i < 6; i++) s += `<g transform="translate(${330 + i * 90} 470) scale(1.8)">${G.jalapeno()}</g>`;
  s += `<path d="M290 470 q0 -230 270 -230 q270 0 270 230z" fill="#e3a24f" stroke="#b5762a" stroke-width="6"/>`;
  for (let i = 0; i < 22; i++) s += `<ellipse cx="${(380 + rand() * 360).toFixed(0)}" cy="${(300 + rand() * 120).toFixed(0)}" rx="7" ry="4" fill="#fbecc8" transform="rotate(${Math.round(rand() * 60 - 30)} 560 360)"/>`;
  for (let i = 0; i < 14; i++) s += `<g transform="translate(${(900 + rand() * 150).toFixed(0)} ${(520 + rand() * 140).toFixed(0)}) rotate(${Math.round(-40 + rand() * 80)}) scale(2.4)">${G.fries()}</g>`;
  return frame(s);
}

function simpleTray(name, item, count) {
  const rand = rng(name);
  let s = `<ellipse cx="616" cy="590" rx="420" ry="110" fill="#000" opacity=".1"/><rect x="200" y="220" width="800" height="440" rx="60" fill="#c8361f"/><rect x="230" y="250" width="740" height="380" rx="44" fill="#f7efe2"/>`;
  const cols = count <= 2 ? count : count <= 4 ? 2 : count <= 6 ? 3 : 6;
  const rows = Math.ceil(count / cols), cw = 740 / cols, rh = 380 / rows;
  const sc = Math.min(cw / 70, rh / 50, 4.2);
  for (let i = 0; i < count; i++) {
    const x = 230 + cw * (i % cols + 0.5) + (rand() - 0.5) * 16, y = 250 + rh * (Math.floor(i / cols) + 0.5) + (rand() - 0.5) * 12;
    s += `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) rotate(${Math.round(rand() * 30 - 15)}) scale(${sc.toFixed(2)})">${item}</g>`;
  }
  return frame(s);
}
const STICK = `<rect x="-26" y="-9" width="52" height="18" rx="9" fill="#d98f3c" stroke="#a9621f" stroke-width="2"/><rect x="18" y="-6" width="10" height="12" rx="5" fill="#fff6dc"/>`;
const POPPER = `<circle r="16" fill="#dc8a33" stroke="#a9621f" stroke-width="2"/><circle cx="-4" cy="-4" r="4" fill="#f4c46a"/><circle cx="5" cy="4" r="3" fill="#6aa34a"/>`;
const CHEESEBREAD = `<rect x="-60" y="-30" width="120" height="60" rx="18" fill="#e2b06a" stroke="#b07d34" stroke-width="3"/><path d="M-50 -14 q20 -14 40 0 t40 0 t20 0" stroke="#f7d77c" stroke-width="14" fill="none" stroke-linecap="round"/>`;

function sauceCup(color, label, burk = true) {
  let s = `<ellipse cx="616" cy="690" rx="270" ry="50" fill="#000" opacity=".1"/>`;
  s += `<path d="M360 360 L400 680 Q600 720 800 680 L840 360z" fill="#ffffff" stroke="#d9d1bf" stroke-width="8"/>`;
  s += `<ellipse cx="600" cy="360" rx="240" ry="62" fill="${color}" stroke="#d9d1bf" stroke-width="8"/>`;
  s += `<path d="M450 350 q60 -40 120 0 q50 30 110 -10" stroke="#ffffff" stroke-width="12" fill="none" opacity=".5" stroke-linecap="round"/>`;
  if (burk) s += `<ellipse cx="600" cy="300" rx="250" ry="58" fill="none" stroke="#e8e1d2" stroke-width="10" stroke-dasharray="20 14" opacity=".9"/>`;
  return frame(s);
}

function sizeTile(kind) {
  const rand = rng("size-" + kind);
  const scale = { normal: 0.78, familj: 1.12, glutenfri: 0.78, barn: 0.56 }[kind];
  const R = 360 * scale;
  let s = `<g transform="translate(600 450)"><path d="${crustPath(rand, R)}" fill="#e2a24d" stroke="#b5762a" stroke-width="6"/><path d="${crustPath(rand, R - 30 * scale, 8)}" fill="#c8361f"/><path d="${crustPath(rand, R - 44 * scale, 18)}" fill="#f7d77c"/>`;
  s += toppingLayer(rand, ["Skinka", "Champinjoner"], R - 70 * scale, 1.3 * scale + 0.3);
  s += `</g>`;
  if (kind === "glutenfri") s += `<g transform="translate(830 230) scale(1.15)"><circle r="92" fill="#ffffff" stroke="#2f5d3a" stroke-width="10"/><path d="M0 -55 v110 M0 -30 l-24 -18 M0 -30 l24 -18 M0 0 l-24 -18 M0 0 l24 -18 M0 30 l-24 -18 M0 30 l24 -18" stroke="#c99b3f" stroke-width="10" stroke-linecap="round" fill="none"/><path d="M-62 62 L62 -62" stroke="#c8361f" stroke-width="14" stroke-linecap="round"/></g>`;
  if (kind === "familj") s += `<g transform="translate(600 450)"><path d="M0 0 L${R} 0 M0 0 L${-R / 2} ${R * 0.866} M0 0 L${-R / 2} ${-R * 0.866} M0 0 L0 ${R} M0 0 L0 ${-R} M0 0 L${-R} 0" stroke="#b5762a" stroke-width="5" opacity=".55"/></g>`;
  if (kind === "barn") s += `<g transform="translate(600 450)"><circle cx="-40" cy="-30" r="16" fill="#3a2a1a"/><circle cx="40" cy="-30" r="16" fill="#3a2a1a"/><path d="M-60 30 q60 60 120 0" stroke="#3a2a1a" stroke-width="14" fill="none" stroke-linecap="round"/></g>`;
  return frame(s);
}

function neutralCan(name, color, accent) {
  let s = `<ellipse cx="600" cy="790" rx="170" ry="30" fill="#000" opacity=".12"/>`;
  s += `<rect x="460" y="150" width="280" height="640" rx="40" fill="${color}"/><rect x="460" y="150" width="280" height="40" rx="18" fill="#cfd2d6"/><rect x="460" y="760" width="280" height="30" rx="14" fill="#b9bcc1"/>`;
  s += `<rect x="460" y="330" width="280" height="200" fill="${accent}" opacity=".9"/>`;
  s += `<text x="600" y="450" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="46" font-weight="700" fill="#ffffff">${esc(name)}</text>`;
  s += `<rect x="490" y="190" width="26" height="560" rx="13" fill="#ffffff" opacity=".18"/>`;
  return frame(s);
}

// Rutbilder i tillvalsmodalen visas 48×48 med object-contain: transparent bakgrund och tight utsnitt.
const asTile = (svg, vb) => svg.replace(/<rect width="\d+" height="\d+" fill="#f6ecdc"\/>/, "").replace(/width="\d+" height="\d+" viewBox="[^"]+"/, `width="600" height="600" viewBox="${vb}"`);
const TILE_VB = { size: "180 30 840 840", cup: "330 200 540 540", tray: "190 30 820 820" };

// ── Menystruktur (svenska namn, Lumits ordning) ────────────────────────────
const CATEGORY = {
  "Standardpizzor 1": "Klassiska pizzor", "Standardpizzor 2": "Klassiska pizzor", "Standardpizzor 3": "Husets pizzor",
  "Kycklingpizzor": "Kycklingpizzor", "Oxfilépizzor": "Oxfilépizzor", "Fläskfilépizzor": "Fläskfilépizzor",
  "Mexikanska Pizzor": "Mexikanska pizzor", "Mozzarellapizzor": "Mozzarellapizzor", "Kebabpizzor": "Kebabpizzor",
  "Amerikanska Pizzor": "Amerikanska pizzor", "Grillrätter": "Grill", "Sallader": "Sallader", "Kebabrätter": "Kebab och rullar",
  "Övrigt": "Smårätter", "Såser": "Såser", "Drycker": "Dryck",
};
const CATEGORY_DESC = {
  "Klassiska pizzor": "Romas klassiker sedan 2003. Familjepizza, glutenfri botten eller barnpizza väljer du på pizzan.",
  "Husets pizzor": "De stora favoriterna på Nya Torg.",
  "Mozzarellapizzor": "Färsk mozzarella, ruccola och lufttorkat.",
  "Amerikanska pizzor": "Tjock botten, extra allt.",
  "Grill": "Lagas på beställning.",
  "Kebab och rullar": "Välj sås, den ingår.",
};
const lower = (s, i) => (i === 0 ? s : s.replace(/^(?!BBQ)([A-ZÅÄÖ])(?=[a-zåäö])/, (m) => m.toLowerCase()));
const SKIP_IN_DESC = new Set(["Välj klyftpotatis eller pommes"]);
function describe(p) {
  if (p.description) return p.description;
  const list = p.ingredients.filter((i) => !SKIP_IN_DESC.has(i));
  let text = list.map(lower).join(", ");
  if (p.ingredients.includes("Välj klyftpotatis eller pommes")) text += ". Med klyftpotatis eller pommes";
  return text ? text.charAt(0).toUpperCase() + text.slice(1) + "." : undefined;
}

// Vesuvio saknar ingredienser i Lumit – standardreceptet (skinka) läggs in och flaggas i README.
for (const c of lumit.categories) for (const p of c.products) if (p.name === "Vesuvio" && !p.ingredients.length) p.ingredients = ["Tomatsås", "Ost", "Skinka"];

const DRINK_IMG = {
  "Coca-Cola Original - 33cl": "coca-cola-original-taste-33-cl", "Coca-Cola Zero - 33cl": "coca-cola-zero-33-cl",
  "Fanta Lemon Zero Sugar - 33cl": "fanta-lemon-zero-33-cl", "Fanta Strawberry - 33cl": "fanta-strawberry-kiwi-33-cl",
  "Pepsi Max - 33cl": "pepsi-max-33-cl", "Sprite - 33cl": "sprite-33-cl", "Coca-Cola Original - 50cl": "coca-cola-original-taste-50-cl",
  "Coca-Cola Zero - 50cl": "coca-cola-zero-50-cl", "Fanta Orange - 50cl": "fanta-orange-50-cl",
  "Coca-Cola Zero - 2L": "coca-cola-zero-2-liter", "Coca-Cola Original - 2L": "coca-cola-original-taste-2-liter",
  "Pepsi - 33cl": "pepsi-50-cl", "Sprite - 2L": "sprite-50-cl",
};
// Packshots i Palmyras format från Wanthai-demon.
const DRINK_WANTHAI = { "Ramlösa Original - 33cl": "ramlosa-natur", "Ramlösa Citrus - 33cl": "ramlosa-citrus", "Fanta Orange - 33cl": "fanta", "Fanta Exotic - 33cl": "fanta-exotic", "Fanta Exotic - 50cl": "fanta-exotic" };
const DRINK_NEUTRAL = { "Cuba Cola - 33cl": ["Cuba Cola", "#5a1f14", "#c8361f"], "Cuba Cola Zero - 33cl": ["Cuba Zero", "#1d1d1d", "#c8361f"], "7up - 33cl": ["7up", "#1f8a3c", "#e2342b"], "Pepsi - 33cl": ["Pepsi", "#0b3b8f", "#e2342b"], "Sprite - 2L": ["Sprite 2 L", "#1b8f4a", "#f2c230"] };
const drinkName = (n) => n.replace(/ - (\d+)cl$/, " $1 cl").replace(/ - 2L$/, " 2 l");

// ── Bygg ───────────────────────────────────────────────────────────────────
await mkdir(join(OUT, "menu"), { recursive: true });
await mkdir(join(OUT, "tiles"), { recursive: true });
await mkdir(join(OUT, "drinks"), { recursive: true });

async function render(svg, file, w = 1000) {
  await sharp(Buffer.from(svg)).resize({ width: w }).webp({ quality: 86 }).toFile(join(OUT, file));
  return `${WEB}/${file}`;
}

const images = { products: {}, categories: {}, extras: {} };
const toppingCats = new Set();
const categories = [];
const productGroups = {}; // produktnamn → gruppnycklar i ordning
const sizeClasses = new Set();
let palmyraDrinks = [];

for (const c of lumit.categories) {
  const catName = CATEGORY[c.lumitName] || c.lumitName;
  let cat = categories.find((x) => x.name === catName);
  if (!cat) categories.push((cat = { name: catName, description: CATEGORY_DESC[catName], products: [] }));
  for (const p of c.products) {
    const isPizza = /pizz/i.test(c.lumitName);
    const isDrink = c.lumitName === "Drycker";
    const name = isDrink ? drinkName(p.name) : p.name;
    cat.products.push({ name, description: isDrink ? undefined : describe(p), price: p.price });
    // Ordning i produktmodalen: bildrutor först i viktighetsordning (storlek, sås, dryck, burk, tillbehör), listorna sist.
    const groups = [];
    const addons = !isDrink && c.lumitName !== "Såser";
    if (p.familyAddon) { groups.push(`size:${p.familyAddon}`); sizeClasses.add(p.familyAddon); }
    if (p.sauceIncluded || /Valfri sås/.test(p.ingredients.join())) groups.push("Välj sås (ingår)");
    if (addons) {
      groups.push("Lägg till dryck", "Sås i burk");
      if (c.lumitName !== "Övrigt" || !p.accessory) groups.push("Tillbehör");
    }
    if (p.potatoChoice) groups.push("Stekt potatis eller pommes");
    if (c.hasToppingExtras) groups.push("Extra kött och protein", "Extra grönsaker", "Extra ost", "Extra sås på rätten");
    productGroups[name] = groups;

    // Bild
    const file = `menu/${slug(name)}.webp`;
    let svg = null;
    const ing = p.ingredients;
    if (isPizza) svg = pizza(name, ing, { shape: /\(inbakad\)/.test(name) ? "calzone" : /halvinbakad/.test(name) ? "boat" : "round" });
    else if (c.lumitName === "Sallader") svg = plateDish(name, ing, "bowl");
    else if (c.lumitName === "Grillrätter") svg = /Högrev/.test(name) ? burger(name, ing) : plateDish(name, ing, /Kyckling/.test(name) ? "chicken-fillet" : "steak");
    else if (c.lumitName === "Kebabrätter") {
      const filling = /Falafel/.test(name) ? "falafel" : /Kyc/.test(name) ? "chicken" : "kebab";
      svg = /rulle/i.test(name) ? wrap(name, ing, filling) : /bröd/i.test(name) ? pita(name, filling) : plateDish(name, [...ing, "Pommes frites"], filling);
    } else if (c.lumitName === "Övrigt") {
      if (/Nuggets/.test(name)) svg = plateDish(name, ["Pommes frites"], "nuggets");
      else if (/Hamburgare/.test(name)) svg = burger(name, ["Ost"]);
      else if (/Mozzarellasticks/.test(name)) svg = simpleTray(name, STICK, 4);
      else if (/Chili Cheese/.test(name)) svg = simpleTray(name, POPPER, 6);
      else if (/Pommes/.test(name)) svg = simpleTray(name, G.fries(), 24);
      else if (/Bröd med ost/.test(name)) svg = simpleTray(name, CHEESEBREAD, 2);
    } else if (c.lumitName === "Såser") {
      const col = /Vitlök/.test(name) ? "#fbf6ea" : /Mild/.test(name) ? "#f3c9b0" : /Stark/.test(name) ? "#d8432b" : /Bearnaise/.test(name) ? "#f5c13a" : "#eef0dd";
      svg = sauceCup(col, name);
    }
    if (isDrink) {
      if (DRINK_IMG[p.name]) { images.products[name] = `palmyra:${DRINK_IMG[p.name]}`; palmyraDrinks.push(DRINK_IMG[p.name]); }
      else if (DRINK_WANTHAI[p.name]) {
        await copyFile(join(repo, "apps/web/public/demo/wanthai/img/drinks", `${DRINK_WANTHAI[p.name]}.webp`), join(OUT, "drinks", `${DRINK_WANTHAI[p.name]}.webp`));
        images.products[name] = `${WEB}/drinks/${DRINK_WANTHAI[p.name]}.webp`;
      }
      else images.products[name] = null; // Cuba Cola, 7up: ingen riktig bild finns – hellre ingen än en ritad
      continue;
    }
    if (svg) images.products[name] = await render(svg, file);
  }
}

// Kategoribilder: Lumits foton för Roma (samma koppling som i Lumit), annars första rättens illustration.
const CATEGORY_PHOTO = {
  "Klassiska pizzor": "pizza-1", "Husets pizzor": "pizza-3", "Kycklingpizzor": "pizza-4", "Oxfilépizzor": "oxfile",
  "Fläskfilépizzor": "pizza-5", "Mexikanska pizzor": "pizza-6", "Mozzarellapizzor": "pizza-7", "Kebabpizzor": "pizza-8",
  "Amerikanska pizzor": "pizza-9", "Grill": "grill", "Sallader": "sallad", "Kebab och rullar": "meze",
};
for (const cat of categories) images.categories[cat.name] = CATEGORY_PHOTO[cat.name] ? `${WEB}/photos/${CATEGORY_PHOTO[cat.name]}.webp` : images.products[cat.products[0].name];

// Tillvalsgrupper (unika namn → massimporten). Priser exakt som i Lumit.
const extraGroups = [
  { name: "Välj sås (ingår)", type: "radio", required: true, options: [["Vitlökssås", 0], ["Stark sås", 0], ["Mild sås", 0], ["Bearnaisesås", 0], ["Vitlökssås i burk", 0], ["Stark sås i burk", 0], ["Mild sås i burk", 0], ["Bearnaisesås i burk", 0], ["Ingen sås", 0]] },
  { name: "Stekt potatis eller pommes", type: "radio", required: true, options: [["Stekt potatis", 0], ["Pommes frites", 0]] },
  { name: "Extra kött och protein", type: "checkbox", max: 12, options: ["Skinka", "Salami", "Köttfärs", "Bacon", "Kyckling", "Kebabkött", "Oxfilé", "Fläskfilé", "Pepperonikorv", "Räkor", "Musslor", "Tonfisk"].map((n) => [n, 30]) },
  { name: "Extra grönsaker", type: "checkbox", max: 13, options: ["Champinjoner", "Rödlök", "Paprika", "Oliver", "Ananas", "Banan", "Kronärtskocka", "Majs", "Gurka", "Avocado", "Körsbärstomater", "Sallad", "Romansallad"].map((n) => [n, 20]) },
  { name: "Extra ost", type: "checkbox", max: 7, options: ["Ost", "Mozzarella", "Gorgonzola", "Parmesanost", "Vitost", "Ägg", "Jordnötter"].map((n) => [n, 20]) },
  { name: "Extra sås på rätten", type: "checkbox", max: 5, options: ["Tomatsås", "Bearnaisesås", "Vitlökssås", "Stark sås", "Mild sås"].map((n) => [n, 19]) },
  { name: "Sås i burk", type: "checkbox", max: 10, options: [["Vitlökssås", 19], ["Mild sås", 19], ["Stark sås", 19], ["Bearnaisesås", 19], ["Tzatziki", 19]] },
  { name: "Tillbehör", type: "checkbox", max: 10, options: [["Mozzarellasticks 4 st", 40], ["Chili cheese 6 st", 40], ["Pommes låda", 59], ["Bröd med ost", 49]] },
  { name: "Lägg till dryck", type: "checkbox", max: 10, options: lumit.categories.find((c) => c.lumitName === "Drycker").products.map((p) => [drinkName(p.name), p.price]) },
];

// Bildrutor: såser, tillbehör, dryck och storlek.
const sauceImg = (n) => images.products[Object.keys(images.products).find((k) => k.startsWith(n.replace(" i burk", "").replace("Tzatziki", "Tzaziki"))) || ""];
images.extras["Välj sås (ingår)"] = {};
for (const [n] of extraGroups[0].options) {
  if (n === "Ingen sås") images.extras["Välj sås (ingår)"][n] = await render(asTile(frame(`<g transform="translate(600 470)"><circle r="230" fill="#fff" stroke="#c8b9a0" stroke-width="26"/><path d="M-160 160 L160 -160" stroke="#c8b9a0" stroke-width="26" stroke-linecap="round"/></g>`), TILE_VB.cup), "tiles/ingen-sas.webp", 600);
  else images.extras["Välj sås (ingår)"][n] = await render(asTile(sauceCup(/Vitlök/.test(n) ? "#fbf6ea" : /Mild/.test(n) ? "#f3c9b0" : /Stark/.test(n) ? "#d8432b" : "#f5c13a", n, /burk/.test(n)), TILE_VB.cup), `tiles/${slug(n)}.webp`, 600);
}
const SAUCE_COLOR = { Vitlökssås: "#fbf6ea", "Mild sås": "#f3c9b0", "Stark sås": "#d8432b", Bearnaisesås: "#f5c13a", Tzatziki: "#eef0dd" };
images.extras["Sås i burk"] = {};
for (const [n] of extraGroups[6].options) images.extras["Sås i burk"][n] = await render(asTile(sauceCup(SAUCE_COLOR[n], n), TILE_VB.cup), `tiles/burk-${slug(n)}.webp`, 600);
images.extras["Tillbehör"] = {
  "Mozzarellasticks 4 st": await render(asTile(simpleTray("Mozzarellasticks", STICK, 4), TILE_VB.tray), "tiles/mozzarellasticks.webp", 600),
  "Chili cheese 6 st": await render(asTile(simpleTray("Chili Cheese", POPPER, 6), TILE_VB.tray), "tiles/chili-cheese.webp", 600),
  "Pommes låda": await render(asTile(simpleTray("Pommes låda", G.fries(), 24), TILE_VB.tray), "tiles/pommes.webp", 600),
  "Bröd med ost": await render(asTile(simpleTray("Bröd med ost", CHEESEBREAD, 2), TILE_VB.tray), "tiles/brod-med-ost.webp", 600),
};
images.extras["Lägg till dryck"] = Object.fromEntries(extraGroups[8].options.map(([n]) => [n, images.products[n]]));
images.extras["Storlek"] = {
  Normal: await render(asTile(sizeTile("normal"), TILE_VB.size), "tiles/storlek-normal.webp", 600),
  Familjepizza: await render(asTile(sizeTile("familj"), TILE_VB.size), "tiles/storlek-familj.webp", 600),
  "Glutenfri botten": await render(asTile(sizeTile("glutenfri"), TILE_VB.size), "tiles/storlek-glutenfri.webp", 600),
  Barnpizza: await render(asTile(sizeTile("barn"), TILE_VB.size), "tiles/storlek-barn.webp", 600),
};

// ── Matfoton från Palmyra (godkänt för demon) ──────────────────────────────
// Samma namn → Palmyras foto. Andra pizzor → Palmyras pizza med flest gemensamma ingredienser.
// Grillen → Lumits biff/burgarfoton. Utan rimlig motsvarighet behålls illustrationen.
await mkdir(join(OUT, "palmyra"), { recursive: true });
const palmyra = await (await fetch("https://api.viaeats.se/api/restaurants/palmyra-pizzeria-lund")).json();
const SYN = { svamp: "champinjoner", kantareller: "champinjoner", "farska champinjoner": "champinjoner", "farska tomater": "tomat", "farsk tomat": "tomat", isbergssallad: "sallad", mixsallad: "sallad", romansallad: "sallad", "kottfarssas": "kottfars", kebabkott: "kebab", "grillad kyckling": "kyckling", "farsk vitlok": "vitlok", "tacokryddmix": "tacosas", "farsk mozzarella": "mozzarella", "rodlok": "lok", parmesan: "parmesanost", "pommes frites": "pommes" };
const tok = (s) => { const t = s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\.$/, "").trim(); return SYN[t] || t; };
const BASE_ING = new Set(["tomatsas", "ost", "tomat och ost"]);
const PROTEIN = new Set(["kebab", "kyckling", "kottfars", "skinka", "salami", "tonfisk", "rakor", "oxfile", "flaskfile", "bacon", "pepperonikorv"]);
const pItems = [];
for (const c of palmyra.menu || []) for (const it of c.items || []) {
  if (!it.imageUrl || /kombo|meal deal/i.test(c.name) || /\+|^box$|valfri|vegansk/i.test(it.name)) continue;
  if (pItems.some((x) => x.name.toLowerCase() === it.name.toLowerCase())) continue;
  const kind = /pizz|inbakad/i.test(c.name) || /pizza/i.test(it.name) ? "pizza" : /sallad/i.test(c.name) ? "sallad" : /burgare/i.test(c.name + it.name) ? "burger" : /rulle/i.test(it.name) ? "rulle" : /tallrik/i.test(it.name) ? "tallrik" : /bröd/i.test(it.name) ? "brod" : /sås|sas/i.test(c.name) ? "sas" : "ovrigt";
  const ing = new Set(String(it.description || "").replace(/ och /g, ", ").split(/,\s*/).map(tok).filter((x) => x && !BASE_ING.has(x)));
  pItems.push({ name: it.name, key: tok(it.name), kind, ing, url: it.imageUrl });
}
const EXACT = { "nuggets 9 bitar": "chicken nuggets", "nuggets 5 bitar": "chicken nuggets", "mozzarellasticks": "mozzarella sticks", "hamburgare 90g": "orginal burgare", "hogrev - 200g": "ostburgare 200g meny", "hogrev bacon - 200g": "baconburgare 200g meny", "hogrev mex - 200g": "chilliburgare meny", "kycklingfile": "kycklingtallrik", "calzone (inbakad)": "calzone", "kebab i brod": "kebab i pitabrod", "caesarsallad": "kycklingsallad", "avocado kyckling": "kycklingsallad", "rasksallad": "tonfisksallad", "raksallad": "tonfisksallad", "ost & skinksallad": "grekisk sallad", "avocado parma": "grekisk sallad", "avocado falafel": "grekisk sallad", "vitlokssas (burk)": "vitlokssas", "mild sas (burk)": "mildsas", "stark sas (burk)": "starksas", "bearnaisesas": "bearnaisesas", "4 ostar": "fume" };
const GRILL_PHOTO = { "Grillad Entrecote": "oxfile", "Ryggbiff": "oxfile" };
async function palmyraImage(item) {
  const file = `palmyra/${slug(item.name)}.webp`;
  try {
    await stat(join(OUT, file));
  } catch {
    const res = await fetch(item.url);
    if (!res.ok) return null;
    await sharp(Buffer.from(await res.arrayBuffer())).resize({ width: 1000, withoutEnlargement: true }).webp({ quality: 82 }).toFile(join(OUT, file));
  }
  return `${WEB}/${file}`;
}
const photoSource = {};
for (const c of lumit.categories) {
  if (c.lumitName === "Drycker") continue;
  const isPizza = /pizz/i.test(c.lumitName);
  for (const p of c.products) {
    const name = p.name;
    if (GRILL_PHOTO[name]) { images.products[name] = `${WEB}/photos/${GRILL_PHOTO[name]}.webp`; photoSource[name] = "Lumit"; continue; }
    const key = tok(name);
    let match = pItems.find((x) => x.key === (EXACT[key] || key));
    if (!match && isPizza) {
      const mine = new Set(p.ingredients.map(tok).filter((x) => !BASE_ING.has(x)));
      let best = null, bestScore = -9;
      for (const x of pItems.filter((x) => x.kind === "pizza")) {
        const inter = [...mine].filter((i) => x.ing.has(i)).length;
        // Huvudproteinet väger tyngst: en kebabpizza ska aldrig få en kycklingpizzas foto.
        const mp = [...mine].filter((i) => PROTEIN.has(i)), xp = [...x.ing].filter((i) => PROTEIN.has(i));
        const proteinBonus = mp.length ? (mp.some((i) => xp.includes(i)) ? 0.5 : -0.5) : (xp.length ? -0.3 : 0.2);
        const score = inter / (mine.size + x.ing.size - inter || 1) + proteinBonus + (/inbakad/i.test(name) === /calzone/i.test(x.name) ? 0.05 : -0.3);
        if (score > bestScore) { best = x; bestScore = score; }
      }
      match = best;
    }
    if (!match && c.lumitName === "Kebabrätter") {
      const want = /rulle/i.test(name) ? "rulle" : /tallrik/i.test(name) ? "tallrik" : "brod";
      match = pItems.find((x) => x.kind === want && x.key.includes(/falafel/i.test(name) ? "falafel" : /kyc/i.test(name) ? "kyckling" : "kebab"));
    }
    if (!match && c.lumitName === "Sallader") match = pItems.find((x) => x.kind === "sallad" && x.key.includes(key.split("sallad")[0])) || pItems.find((x) => x.key === "grekisk sallad");
    if (match) { const url = await palmyraImage(match); if (url) { images.products[name] = url; photoSource[name] = `Palmyra: ${match.name}`; } }
  }
}
// Såsrutorna: Palmyras såsbilder (Tzatziki och Ingen sås behåller sina).
const PSAUCE = { Vitlökssås: "vitlokssas", "Mild sås": "mildsas", "Stark sås": "starksas", Bearnaisesås: "bearnaisesas" };
for (const group of ["Välj sås (ingår)", "Sås i burk"]) {
  for (const n of Object.keys(images.extras[group] || {})) {
    const base = n.replace(" i burk", "");
    const item = PSAUCE[base] && pItems.find((x) => x.key === PSAUCE[base]);
    if (item) images.extras[group][n] = await palmyraImage(item);
  }
}
images.extras["Tillbehör"]["Mozzarellasticks 4 st"] = images.products["Mozzarellasticks"];
images.extras["Tillbehör"]["Pommes låda"] = images.products["Pommes låda"];
// Rätter utan riktigt foto får ingen bild (inga illustrationer i menyn).
for (const c of lumit.categories) for (const p of c.products) {
  if (c.lumitName === "Drycker" || photoSource[p.name]) continue;
  if (p.name === "Pommes låda") continue;
  images.products[p.name] = null;
}
// Pommes låda: pommesdelen ur Palmyras Box-foto.
{
  const box = pItems.find((x) => x.key === "box") || { url: "https://images.viaeats.se/lund/palmyra-pizzeria-lund/menu-images/2026-09-17/box-65590228ef8b.webp" };
  const buf = Buffer.from(await (await fetch(box.url)).arrayBuffer());
  const meta = await sharp(buf).metadata();
  await sharp(buf).extract({ left: Math.round(meta.width * 0.36), top: Math.round(meta.height * 0.2), width: Math.round(meta.width * 0.56), height: Math.round(meta.height * 0.62) }).resize({ width: 900 }).webp({ quality: 82 }).toFile(join(OUT, "palmyra/pommes.webp"));
  images.products["Pommes låda"] = `${WEB}/palmyra/pommes.webp`;
  photoSource["Pommes låda"] = "Palmyra: Box (beskuren)";
}
// Storlek: Palmyras storleksfoton. Barnpizza = Normal-fotot i mindre skala.
const PX = "https://pub-3aa62f4934014835956fe3777d5b3abd.r2.dev/lund/palmyra-pizzeria-lund/menu/extras";
async function palmyraExtra(file, out, scale = 1) {
  const buf = Buffer.from(await (await fetch(`${PX}/${file}`)).arrayBuffer());
  let img = sharp(buf).resize({ width: 900 });
  if (scale < 1) {
    const small = await sharp(buf).resize({ width: Math.round(900 * scale) }).toBuffer();
    img = sharp({ create: { width: 900, height: 600, channels: 3, background: "#ffffff" } }).composite([{ input: small, gravity: "center" }]);
  }
  await img.webp({ quality: 84 }).toFile(join(OUT, out));
  return `${WEB}/${out}`;
}
const normal = await palmyraExtra("normal.webp", "palmyra/storlek-normal.webp");
images.extras["Storlek"] = {
  Normal: normal,
  Familjepizza: await palmyraExtra("familje.webp", "palmyra/storlek-familj.webp"),
  "Glutenfri botten": normal,
  Barnpizza: await palmyraExtra("normal.webp", "palmyra/storlek-barn.webp", 0.62),
};
// Såser: Palmyras, utan bild där Palmyra saknar (Ingen sås, Tzatziki).
for (const group of ["Välj sås (ingår)", "Sås i burk"]) for (const n of Object.keys(images.extras[group])) {
  const base = n.replace(" i burk", "");
  if (!PSAUCE[base]) images.extras[group][n] = null;
}
images.extras["Tillbehör"] = {
  "Mozzarellasticks 4 st": images.products["Mozzarellasticks"],
  "Chili cheese 6 st": null,
  "Pommes låda": images.products["Pommes låda"],
  "Bröd med ost": null,
};
// Kategorier utan Lumit-foto: första rättens riktiga foto (efter Palmyra-bytet).
for (const cat of categories) if (!CATEGORY_PHOTO[cat.name]) images.categories[cat.name] = cat.products.map((p) => images.products[p.name]).find(Boolean) || null;
await writeFile(join(here, "image-sources.json"), JSON.stringify(photoSource, null, 1));

// Palmyras packshots kopieras in lokalt så demon fungerar utan nät mot R2.
for (const n of [...new Set(palmyraDrinks)]) {
  const res = await fetch(`https://images.viaeats.se/lund/palmyra-pizzeria-lund/menu/dryck-palmyra-pizzeria/${n}-palmyra-pizzeria-lund.webp`);
  if (!res.ok) throw new Error(`Palmyra-bild saknas: ${n}`);
  await writeFile(join(OUT, "drinks", `${n}.webp`), Buffer.from(await res.arrayBuffer()));
}
const fixDrink = (v) => (typeof v === "string" && v.startsWith("palmyra:") ? `${WEB}/drinks/${v.slice(8)}.webp` : v);
for (const k of Object.keys(images.products)) images.products[k] = fixDrink(images.products[k]);
for (const k of Object.keys(images.categories)) images.categories[k] = fixDrink(images.categories[k]);
for (const g of Object.values(images.extras)) for (const k of Object.keys(g)) g[k] = fixDrink(g[k]);

// ── menu.yaml ──────────────────────────────────────────────────────────────
const y = (s) => JSON.stringify(s);
let yaml = `# Pizzeria Roma Åstorp – meny för massimport. GENERERAD av build.mjs ur lumit-menu.json (Romas Lumit-meny, avläst ${lumit.readAt}).\n`;
yaml += `# Priser i KRONOR exakt som i Lumit. Storleksgrupperna (alla heter "Storlek") och gruppordningen per rätt sätts av apply.mjs från roma.json.\n`;
yaml += `extraGroups:\n`;
for (const g of extraGroups) {
  yaml += `  - name: ${y(g.name)}\n    type: ${g.type}\n    required: ${Boolean(g.required)}\n${g.max ? `    max: ${g.max}\n` : ""}    options:\n`;
  for (const [n, pr] of g.options) yaml += `      - { name: ${y(n)}, price: ${pr} }\n`;
}
yaml += `\ncategories:\n`;
for (const c of categories) {
  yaml += `  - name: ${y(c.name)}\n${c.description ? `    description: ${y(c.description)}\n` : ""}    products:\n`;
  for (const p of c.products) {
    const ex = productGroups[p.name].filter((g) => !g.startsWith("size:"));
    yaml += `      - name: ${y(p.name)}\n${p.description ? `        description: ${y(p.description)}\n` : ""}        price: ${p.price}\n${ex.length ? `        extras: [${ex.map(y).join(", ")}]\n` : ""}`;
  }
}
await writeFile(join(here, "menu.yaml"), yaml);

// ── roma.json ──────────────────────────────────────────────────────────────
const roma = {
  _kommentar: "GENERERAD av build.mjs. Läses av apply.mjs. sizeGroups: en grupp per familjepris (Lumits prisklasser), alla med namnet Storlek. productGroups: gruppordning per rätt; 'size:<familjetillägg>' pekar på en storleksgrupp.",
  sizeGroups: [...sizeClasses].sort((a, b) => a - b).map((addon) => ({
    key: `size:${addon}`,
    description: `roma-storlek-${addon}`,
    extras: [["Normal", 0], ["Familjepizza", addon], ["Glutenfri botten", 30], ["Barnpizza", -10]],
  })),
  productGroups,
  categoryOrder: categories.map((c) => c.name),
  productOrder: categories.flatMap((c) => c.products.map((p) => p.name)),
  images,
};
await writeFile(join(here, "roma.json"), JSON.stringify(roma, null, 1));
// ── Sajtens menydata (pizzatavlan) ─────────────────────────────────────────
const MEAT = ["Skinka", "Parmaskinka", "Lufttorkad skinka", "Salami", "Pepperonikorv", "Köttfärs", "Kebabkött", "Oxfilé", "Fläskfilé", "Kyckling", "Bacon", "Räkor", "Musslor", "Tonfisk", "Surimi"];
function tags(name, ing) {
  const t = new Set();
  if (ing.includes("Kebabkött")) t.add("kebab");
  if (ing.includes("Kyckling")) t.add("kyckling");
  if (ing.includes("Oxfilé")) t.add("oxfile");
  if (ing.includes("Fläskfilé")) t.add("flaskfile");
  if (ing.some((i) => /skinka/i.test(i))) t.add("skinka");
  if (ing.some((i) => ["Räkor", "Musslor", "Tonfisk", "Surimi"].includes(i))) t.add("havet");
  if (ing.includes("Bearnaisesås")) t.add("bearnaise");
  if (/stark/i.test(name) || ing.some((i) => ["Jalapeno", "Stark krydda"].includes(i))) t.add("stark");
  if (!ing.some((i) => MEAT.includes(i))) t.add("vegetarisk");
  if (/inbakad/i.test(name)) t.add("inbakad");
  return [...t];
}
const site = { categories: [] };
for (const c of lumit.categories) {
  const catName = CATEGORY[c.lumitName] || c.lumitName;
  let cat = site.categories.find((x) => x.name === catName);
  if (!cat) site.categories.push((cat = { name: catName, pizza: /pizz/i.test(c.lumitName), items: [] }));
  for (const p of c.products) {
    const isDrink = c.lumitName === "Drycker";
    const name = isDrink ? drinkName(p.name) : p.name;
    cat.items.push({
      name, price: p.price, family: p.familyAddon ? p.price + p.familyAddon : null,
      desc: isDrink ? null : describe(p), img: images.products[name] || null, tags: tags(name, p.ingredients),
    });
  }
}
await writeFile(join(repo, "apps/web/public/demo/pizzeria-roma/menu-data.json"), JSON.stringify(site));

// Illustrationerna ritas fortfarande (reserv vid utveckling) men används inte längre: menyn har bara riktiga foton.
await rm(join(OUT, "menu"), { recursive: true, force: true });
await rm(join(OUT, "tiles"), { recursive: true, force: true });
console.log(`${roma.productOrder.length} rätter, ${categories.length} kategorier, ${roma.sizeGroups.length} storleksklasser, ${Object.keys(images.products).length} produktbilder`);
