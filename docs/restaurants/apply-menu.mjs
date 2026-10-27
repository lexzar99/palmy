#!/usr/bin/env node
// Gemensamt uppläggningsskript för restaurangmappar som har restaurant.json, menu.yaml och data.json
// (genererade av mappens build.py). Bygger på Pizzeria Romas apply.mjs:
// restaurang (utkast) → massimport → bildrutor → storleksgrupper → gruppordning, bild och position per rätt → logga och hero.
// restaurant.json kan vara ett objekt eller en lista (t.ex. Kubens tre ställen med samma meny). Går att köra om.
//
// Lokalt:     VIAEATS_ADMIN_TOKEN=… node docs/restaurants/apply-menu.mjs --dir pizza-kebab-house-angelholm --api http://127.0.0.1:4002 --images local --publish
// Produktion: VIAEATS_ADMIN_TOKEN=… node docs/restaurants/apply-menu.mjs --dir pizza-kebab-house-angelholm --api https://api.viaeats.se \
//               --images r2 --image-base https://www.viaeats.se
// --publish sätter draft=false. Bara lokalt, eller när restaurangen sagt ja.
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const DIR = opt("dir");
const API = String(opt("api", "http://127.0.0.1:4002")).replace(/\/$/, "");
const IMAGES = opt("images", "local");
const IMAGE_BASE = String(opt("image-base", "")).replace(/\/$/, "");
const PUBLISH = args.includes("--publish");
const TOKEN = process.env.VIAEATS_ADMIN_TOKEN;
if (!DIR) throw new Error("Ange --dir <restaurangmapp> under docs/restaurants.");
if (!TOKEN) throw new Error("Sätt VIAEATS_ADMIN_TOKEN (admin_token-cookien från en inloggad superadmin).");
if (IMAGES === "r2" && !/^https:\/\//.test(IMAGE_BASE)) throw new Error("--images r2 kräver --image-base https://…");
const here = join(root, DIR);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

const specs = [].concat(JSON.parse(await readFile(join(here, "restaurant.json"), "utf8")));
const menuYaml = await readFile(join(here, "menu.yaml"), "utf8");
const data = JSON.parse(await readFile(join(here, "data.json"), "utf8"));
const SIZE_PREFIX = data.sizePrefix || "storlek";

for (const raw of specs) {
  const spec = { ...raw };
  const hero = spec._hero || data.images.hero;
  delete spec._kommentar;
  delete spec._hero;
  console.log(`\n== ${spec.name} (${spec.slug})`);

  let restaurant;
  try {
    restaurant = await api("GET", `/api/restaurants/${spec.slug}`);
    console.log(`Restaurangen finns redan (${restaurant.id}).`);
  } catch (e) {
    if (e.status !== 404) throw e;
    restaurant = await api("POST", "/api/restaurants", spec);
    console.log(`Skapade ${restaurant.name} (${restaurant.id}) som utkast.`);
  }
  const restaurantId = restaurant.id;

  // Bildernas sökvägar är /demo/…/img/… – lokalt används de direkt, i produktion laddas de upp till R2.
  const uploaded = new Map();
  async function image(path, target) {
    if (!path) return null;
    if (IMAGES === "local") return path;
    const key = `${path}|${target.kind}|${target.productId || target.categoryId || target.fileBaseName || ""}`;
    if (uploaded.has(key)) return uploaded.get(key);
    const form = new FormData();
    form.set("sourceUrl", `${IMAGE_BASE}${path}`);
    form.set("restaurantId", restaurantId);
    for (const [k, v] of Object.entries(target)) if (v) form.set(k, v);
    const res = await send(`${API}/api/admin/upload-r2`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}` }, body: form });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`upload-r2 ${path} → ${res.status}: ${json.error || ""}`);
    uploaded.set(key, json.url);
    return json.url;
  }

  // 1. Massimport (torrkörning först).
  const dry = await api("POST", "/api/admin/menu/bulk-import", { restaurantId, content: menuYaml, apply: false });
  if (!dry.ok || dry.errors?.length) { console.error("Torrkörningen hittade fel:", dry.errors); process.exit(1); }
  if (dry.warnings?.length) console.warn("Varningar:", dry.warnings);
  const applied = await api("POST", "/api/admin/menu/bulk-import", { restaurantId, content: menuYaml, apply: true });
  console.log("Meny importerad:", applied.summary);

  // 2. Bildrutor för importens grupper (få val = rutor med bild).
  let groups = await api("GET", `/api/admin/extra-groups?restaurantId=${restaurantId}`);
  const plain = (g) => !g.description?.startsWith(SIZE_PREFIX);
  for (const [groupName, pics] of Object.entries(data.images.extras || {})) {
    const group = groups.find((g) => g.name === groupName && plain(g));
    if (!group) throw new Error(`Hittar inte gruppen ${groupName}`);
    const extras = [];
    for (const e of [...group.extras].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
      extras.push({ name: e.name, priceAddon: e.priceAddon, isDefault: Boolean(e.isDefault), imageUrl: await image(pics[e.name], { kind: "extra", fileBaseName: e.name }) });
    }
    await api("PATCH", `/api/admin/extra-groups/${group.id}`, { displayStyle: "BOX_IMAGE", allowQuantity: false, extras });
    console.log(`  ${groupName}: ${extras.length} bildrutor`);
  }

  // 3. Storleksgrupper: en per familjepris, alla heter "Storlek". Identifieras på description.
  const sizeIds = {};
  for (const sg of data.sizeGroups || []) {
    const extras = [];
    for (const [name, price, pic] of sg.extras) {
      extras.push({ name, priceAddon: price, isDefault: name === sg.default, imageUrl: await image(pic, { kind: "extra", fileBaseName: `storlek ${name}` }) });
    }
    const body = { name: "Storlek", description: sg.description, type: "RADIO", required: true, minSelections: 1, maxSelections: 1,
      displayStyle: extras.every((e) => e.imageUrl) ? "BOX_IMAGE" : "LIST", allowQuantity: false, extras };
    const existing = groups.find((g) => g.description === sg.description);
    const saved = existing
      ? await api("PATCH", `/api/admin/extra-groups/${existing.id}`, body)
      : await api("POST", "/api/admin/extra-groups", { ...body, restaurantId });
    sizeIds[sg.key] = saved.id;
  }
  if (data.sizeGroups?.length) console.log(`  Storlek: ${data.sizeGroups.length} prisklasser`);
  groups = await api("GET", `/api/admin/extra-groups?restaurantId=${restaurantId}`);
  const groupId = (key) => sizeIds[key] || groups.find((g) => g.name === key && plain(g))?.id;

  // 4. Kategorier och rätter: ordning, bild och gruppordning (storlek först).
  const categories = await api("GET", `/api/admin/categories?restaurantId=${restaurantId}&includeProducts=true`);
  for (const cat of categories) {
    await api("PATCH", `/api/admin/categories/${cat.id}`, {
      position: Math.max(0, data.categoryOrder.indexOf(cat.name)),
      imageUrl: await image(data.images.categories?.[cat.name], { kind: "category", categoryId: cat.id }),
    });
    for (const p of cat.products || []) {
      const body = {
        position: Math.max(0, data.productOrder.indexOf(p.name)),
        imageUrl: await image(data.images.products?.[p.name], { kind: "product", categoryId: cat.id, productId: p.id }),
      };
      const keys = data.productGroups?.[p.name];
      if (keys) {
        const ids = keys.map(groupId);
        if (ids.some((id) => !id)) throw new Error(`Saknar grupp för ${p.name}: ${keys.filter((k, i) => !ids[i]).join(", ")}`);
        body.extraGroupIds = ids;
      }
      await api("PATCH", `/api/admin/products/${p.id}`, body);
    }
  }
  console.log(`Rätter kopplade i ${categories.length} kategorier.`);

  // 5. Logga, hero och ev. publicering.
  await api("PATCH", `/api/restaurants/${restaurantId}`, {
    imageUrl: await image(data.images.logo, { kind: "logo" }),
    heroImageUrl: await image(hero, { kind: "hero" }),
    ...(PUBLISH ? { draft: false } : {}),
  });
  console.log(PUBLISH ? "Klart – publicerad." : "Klart – ligger kvar som utkast.");
}
