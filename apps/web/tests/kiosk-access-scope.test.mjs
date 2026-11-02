import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Kioskbeviset är partner-embeddens nyckel. Hamnar det i en vanlig kassa på
// viaeats.se tolkar API:t den som privat embed: VIAEATS30 nekas med
// "gäller bara på viaeats.se eller i appen" och ordern bokförs som partner_embed.
test("kioskcookien följer bara med anrop som kommer från embedden", () => {
  const proxy = read("app/api/platform/[...path]/route.ts");
  assert.match(
    proxy,
    /isEmbeddedRequest \? request\.cookies\.get\(KIOSK_ACCESS_COOKIE\)\?\.value : undefined/,
  );
  assert.doesNotMatch(
    proxy,
    /request\.headers\.get\("x-viaeats-kiosk-access"\) \|\|\s*request\.cookies\.get\(KIOSK_ACCESS_COOKIE\)/,
  );
});

test("klienten skickar kioskbevis och embedmarkering bara i embedkontext", () => {
  const api = read("lib/api.ts");
  assert.match(api, /export function isEmbedContext\(\): boolean/);
  assert.match(api, /window\.parent !== window\) return true/);
  assert.match(api, /pathname\.startsWith\("\/embed\/"\)\) return true/);
  assert.match(api, /get\("embed"\) === "1"/);
  assert.match(api, /url\.startsWith\("\/api\/platform\/"\) && isEmbedContext\(\)/);
});

test("embedytorna identifierar sig med samma regel som interceptorn", () => {
  for (const page of ["app/cart/page.tsx", "app/order/[id]/page.tsx", "app/orders/page.tsx"]) {
    assert.match(read(page), /params\.get\("embed"\) === "1"/, page);
  }
  assert.match(read("app/embed/[slug]/page.tsx"), /embedMode/);
});

test("orderns nyckel stannar i iframen och når aldrig partnersidan", () => {
  const client = readFileSync(new URL("../lib/api.ts", import.meta.url), "utf8");
  const keyStore = readFileSync(new URL("../lib/orderEmbedKey.ts", import.meta.url), "utf8");
  const embed = readFileSync(new URL("../public/embed.js", import.meta.url), "utf8");
  const proxy = readFileSync(new URL("../app/api/platform/[...path]/route.ts", import.meta.url), "utf8");

  assert.match(client, /isEmbedContext\(\)\) \{[\s\S]*ORDER_EMBED_KEY_HEADER\] = orderKey/);
  assert.match(keyStore, /window\.localStorage\.setItem/);
  assert.match(keyStore, /expiresAt/, "nyckeln har begränsad livslängd");
  assert.doesNotMatch(embed, /order-key|orderKey|order_key/, "partnerns skript känner aldrig till nyckeln");
  assert.match(embed, /searchParams\.delete\("payment_resume"\)/, "gamla återhoppsbevis rensas ur adressfältet");
  assert.doesNotMatch(embed, /searchParams\.set\("payment_resume"/);
  assert.match(proxy, /isEmbeddedRequest \? request\.headers\.get\(ORDER_EMBED_KEY_HEADER\) : null/, "vanlig webb kan inte använda nyckelvägen");
  assert.match(proxy, /isEmbeddedRequest && issuedOrderKey && issuedCookieName/);
});

test("spårningen har en väg vidare utan orderns nyckel", () => {
  const page = readFileSync(new URL("../app/order/[id]/page.tsx", import.meta.url), "utf8");
  const orders = readFileSync(new URL("../app/orders/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const limitedTracking = order\.trackingAccess === "limited"/);
  assert.match(page, /!limitedTracking && ReviewCard/);
  assert.match(page, /!limitedTracking && OrderCollapse/);
  assert.match(page, /trackingAccess !== "limited"\) cacheOrderDetail/, "begränsad vy får inte ersätta kvittot");
  assert.match(page, /if \(!order && embedMode\)/, "embedden får en begriplig återställningsvy");
  assert.match(page, /setInterval\(\(\) => fetchOrder\(\{ silent: true \}\), 15000\)/, "status uppdateras utan socket");
  assert.match(orders, /import "@\/lib\/api"/, "historiken skickar nyckeln");
});
