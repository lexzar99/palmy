#!/usr/bin/env node
// Skapar (eller uppdaterar) rabattkoden TEST1: 99 % rabatt, gäller BARA demorestaurangerna nedan,
// även i deras inbäddade beställning (partner-embed). För att testa och visa demona med en riktig
// betalning på någon krona (Swish – Stripe kräver minst 3 kr). Samma upplägg som demo1-code.mjs.
//
//   VIAEATS_ADMIN_TOKEN=… node docs/restaurants/demo1-code.mjs --api http://127.0.0.1:4002
//   VIAEATS_ADMIN_TOKEN=… node docs/restaurants/demo1-code.mjs --api https://api.viaeats.se
//
// Stäng av koden i admin (Kuponger) när demona är klara.
const args = process.argv.slice(2);
const API = String((args[args.indexOf("--api") + 1]) || "http://127.0.0.1:4002").replace(/\/$/, "");
const TOKEN = process.env.VIAEATS_ADMIN_TOKEN;
if (!TOKEN) throw new Error("Sätt VIAEATS_ADMIN_TOKEN (admin_token-cookien från en inloggad superadmin).");
const SLUGS = [
  "freds-pizzeria-hassleholm",
  "pattaya-bar-tallkrogen",
  "kuben-vast-pa-stan",
  "kuben-mariedal",
  "kuben-tomtebo",
  "pizza-kebab-house-angelholm",
  "balkan-grill-burek",
  "wanthai-foodtruck",
  "pizzeria-roma-astorp",
];

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${json?.error || ""}`);
  return json;
}

const ids = [];
for (const slug of SLUGS) ids.push((await api("GET", `/api/restaurants/${slug}`)).id);

const body = {
  code: "TEST1",
  description: "Test av demorestaurangerna: 99 % rabatt, bara demorestaurangerna",
  type: "PERCENTAGE",
  value: 99,
  minOrder: 0,
  applicableRestaurantIds: ids,
  platform: "ALL",
  partnerEmbedEnabled: true,
};
const existing = (await api("GET", "/api/admin/discounts")).find((d) => String(d.code).toUpperCase() === "TEST1");
const saved = existing
  ? await api("PATCH", `/api/admin/discounts/${existing.id}`, { ...body, isActive: true })
  : await api("POST", "/api/admin/discounts", body);
console.log(`TEST1 ${existing ? "uppdaterad" : "skapad"} (${saved.id}) för ${SLUGS.join(", ")}.`);
