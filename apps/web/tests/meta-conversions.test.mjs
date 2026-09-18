import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const metaEvents = readFileSync(new URL("../lib/metaEvents.ts", import.meta.url), "utf8");
const metaPixel = readFileSync(new URL("../components/MetaPixel.tsx", import.meta.url), "utf8");
const cart = readFileSync(new URL("../app/cart/page.tsx", import.meta.url), "utf8");

test("marknadsföringsevents skickas bara efter uttryckligt cookiesamtycke", () => {
  for (const [name, source] of [["metaEvents", metaEvents], ["MetaPixel", metaPixel]]) {
    assert.match(
      source,
      /hasMarketingConsent\(\)/,
      `${name} måste fråga efter samtycke innan något skickas till Meta`,
    );
  }
});

test("ett event kvitteras först när det faktiskt lämnat klienten", () => {
  // Kvitterades eventet även när samtycket saknades eller pixeln inte hunnit
  // laddas brann det för alltid: dubblettskyddet hade sett det som skickat och
  // kunden hade aldrig rapporterats som köp.
  assert.match(metaEvents, /const sent = track\(/);
  assert.doesNotMatch(
    metaEvents,
    /\n\s*markSent\(eventKey\);\s*\n\}/,
    "markSent får aldrig köras ovillkorat efter track()",
  );
  assert.equal(
    (metaEvents.match(/if \(sent\) markSent\(eventKey\);/g) || []).length,
    2,
    "både Purchase och InitiateCheckout ska kvitteras villkorat",
  );
});

test("Purchase ligger på orderns serververifierade underlag", () => {
  const orderPage = readFileSync(new URL("../app/order/[id]/page.tsx", import.meta.url), "utf8");
  const component = readFileSync(new URL("../components/MetaPurchase.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(cart, /trackMetaPurchase/);
  assert.match(orderPage, /MetaPurchase receipt=\{order.marketingPurchase\}/);
  assert.match(component, /receipt.expiresAt > Date.now/);
});

test("test- och gratisordrar rapporteras aldrig som köp", () => {
  // submitOrder är FREE_PROMO-flödet: ingen betalning sker, och ett Purchase
  // därifrån hade förgiftat annonsoptimeringen med påhittade konverteringar.
  const freeFlow = cart.slice(cart.indexOf("const submitOrder"));
  assert.doesNotMatch(
    freeFlow.slice(0, freeFlow.indexOf("const abandon")),
    /trackMetaPurchase/,
    "FREE_PROMO-flödet får inte skicka Purchase",
  );
});

test("ordervärdet överlever redirecten till betalningen", () => {
  // Kunden kommer tillbaka från Swish/Stripe till en omladdad sida där
  // varukorgen är tömd. Utan det sparade beloppet hade Purchase rapporterats
  // utan värde och kampanjen kunnat optimera mot fel ordrar.
  assert.match(cart, /localStorage\.setItem\("pending_order_value"/);

  assert.equal(
    (cart.match(/localStorage\.removeItem\("pending_order_value"\)/g) || []).length,
    2,
    "nyckeln ska städas på samma ställen som de andra pending_order-nycklarna",
  );
});
