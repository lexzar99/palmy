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
