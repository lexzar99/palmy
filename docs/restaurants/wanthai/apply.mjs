#!/usr/bin/env node
// Lägger upp Wanthai i viaeats via admin-API:t: restaurang (utkast) → massimport av menyn →
// bildrutor (BOX_IMAGE) för tillbehör, dipp och dryck → bilder på logga, hero, kategorier och rätter.
// Idempotent: körs det igen uppdateras samma rader (menyimporten matchar på namn).
//
// Lokalt (lokal databas, bilder från demomappen):
//   VIAEATS_ADMIN_TOKEN=… node docs/restaurants/wanthai/apply.mjs --api http://127.0.0.1:4002 --images local
// Produktion (bilderna laddas upp till R2 från den deployade demomappen):
//   VIAEATS_ADMIN_TOKEN=… node docs/restaurants/wanthai/apply.mjs --api https://api.viaeats.se \
//     --images r2 --image-base https://www.viaeats.se/demo/wanthai/img
//
// --publish sätter draft=false. Använd det bara lokalt, eller när Wanthai sagt ja.
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const API = String(opt("api", "http://127.0.0.1:4002")).replace(/\/$/, "");
const IMAGES = opt("images", "local");
const IMAGE_BASE = String(opt("image-base", IMAGES === "local" ? "/demo/wanthai/img" : "")).replace(/\/$/, "");
const PUBLISH = args.includes("--publish");
const TOKEN = process.env.VIAEATS_ADMIN_TOKEN;

if (!TOKEN) throw new Error("Sätt VIAEATS_ADMIN_TOKEN (admin_token-cookien från en inloggad superadmin).");
if (IMAGES === "r2" && !/^https:\/\//.test(IMAGE_BASE)) throw new Error("--images r2 kräver --image-base https://…");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Admin-API:t är rate-limitat. Vid 429 väntar vi enligt Retry-After (eller 15 s) och försöker igen.
async function send(url, init) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt >= 8) return res;
    const wait = Math.max(1, Number(res.headers.get("retry-after")) || 15) * 1000;
    console.log(`  Rate limit – väntar ${Math.round(wait / 1000)} s`);
    await sleep(wait);
  }
}

async function api(method, path, body) {
  const res = await send(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status}: ${json?.error || text.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

const restaurantSpec = JSON.parse(await readFile(join(here, "restaurant.json"), "utf8"));
delete restaurantSpec._kommentar;
const menuYaml = await readFile(join(here, "menu.yaml"), "utf8");
const images = JSON.parse(await readFile(join(here, "images.json"), "utf8"));

// 1. Restaurangen
let restaurant;
try {
  restaurant = await api("GET", `/api/restaurants/${restaurantSpec.slug}`);
  console.log(`Restaurangen finns redan (${restaurant.id}).`);
} catch (e) {
  if (e.status !== 404) throw e;
  restaurant = await api("POST", "/api/restaurants", restaurantSpec);
  console.log(`Skapade ${restaurant.name} (${restaurant.id}) som utkast.`);
}
const restaurantId = restaurant.id;

// Bilder: lokalt pekar vi direkt på demomappen, i produktion laddar servern ner och lägger i R2.
async function imageUrl(file, target) {
  if (!file) return null;
  if (IMAGES === "local") return `${IMAGE_BASE}/${file}`;
  const form = new FormData();
  form.set("sourceUrl", `${IMAGE_BASE}/${file}`);
  form.set("restaurantId", restaurantId);
  for (const [k, v] of Object.entries(target)) if (v) form.set(k, v);
  const res = await send(`${API}/api/admin/upload-r2`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}` }, body: form });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`upload-r2 ${file} → ${res.status}: ${json.error || ""}`);
  return json.url;
}

// 2. Menyn: torrkörning först, avbryt vid fel.
const dry = await api("POST", "/api/admin/menu/bulk-import", { restaurantId, content: menuYaml, apply: false });
if (!dry.ok || dry.errors?.length) {
  console.error("Torrkörningen hittade fel:", dry.errors);
  process.exit(1);
}
if (dry.warnings?.length) console.warn("Varningar:", dry.warnings);
const applied = await api("POST", "/api/admin/menu/bulk-import", { restaurantId, content: menuYaml, apply: true });
console.log("Meny importerad:", applied.summary);

// 3. Bildrutor för tillbehör, dipp och dryck (ersätter gruppens extras med samma namn och priser + bild).
const groups = await api("GET", `/api/admin/extra-groups?restaurantId=${restaurantId}`);
for (const [groupName, spec] of Object.entries(images.boxImageGroups)) {
  const group = groups.find((g) => g.name === groupName);
  if (!group) throw new Error(`Hittar inte gruppen ${groupName}`);
  const extras = [];
  for (const e of [...group.extras].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
    const file = spec.extras[e.name];
    if (!file) console.warn(`  ${groupName}: ingen bild för ${e.name}`);
    extras.push({
      name: e.name,
      priceAddon: e.priceAddon, // GET och PATCH räknar båda i kronor

      isDefault: Boolean(e.isDefault),
      imageUrl: await imageUrl(file, { kind: "extra", fileBaseName: e.name }),
    });
  }
  await api("PATCH", `/api/admin/extra-groups/${group.id}`, { displayStyle: "BOX_IMAGE", allowQuantity: spec.allowQuantity, extras });
  console.log(`  ${groupName}: ${extras.length} bildrutor`);
}

// 4. Kategori- och rättbilder, plus ordning. Massimporten sätter ingen position, så ordningen
// tas från images.json, där kategorier och rätter står i samma ordning som i menu.yaml.
const categoryOrder = Object.keys(images.categories);
const productOrder = Object.keys(images.products);
const categories = await api("GET", `/api/admin/categories?restaurantId=${restaurantId}&includeProducts=true`);
for (const cat of categories) {
  const catFile = images.categories[cat.name];
  await api("PATCH", `/api/admin/categories/${cat.id}`, {
    position: Math.max(0, categoryOrder.indexOf(cat.name)),
    ...(catFile ? { imageUrl: await imageUrl(catFile, { kind: "category", categoryId: cat.id }) } : {}),
  });
  for (const p of cat.products || []) {
    const file = images.products[p.name];
    if (!file) console.warn(`  Ingen bild för ${p.name}`);
    await api("PATCH", `/api/admin/products/${p.id}`, {
      position: Math.max(0, productOrder.indexOf(p.name)),
      ...(file ? { imageUrl: await imageUrl(file, { kind: "product", categoryId: cat.id, productId: p.id }) } : {}),
    });
  }
}
console.log(`Bilder och ordning satta på ${categories.length} kategorier.`);

// 5. Logga och hero, och eventuell publicering.
await api("PATCH", `/api/restaurants/${restaurantId}`, {
  imageUrl: await imageUrl(images.restaurant.logo, { kind: "logo" }),
  heroImageUrl: await imageUrl(images.restaurant.hero, { kind: "hero" }),
  ...(PUBLISH ? { draft: false } : {}),
});
console.log(PUBLISH ? "Klart – publicerad." : "Klart – ligger kvar som utkast.");
