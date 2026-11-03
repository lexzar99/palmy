import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("kvittot laddas ner som serverns PDF, aldrig som HTML", () => {
  const page = read("app/order/[id]/page.tsx");
  assert.doesNotMatch(page, /buildReceiptHtml|text\/html/, "inget HTML-kvitto byggs i webbläsaren");
  assert.match(page, /\/api\/platform\/orders\/\$\{orderId\}\/receipt\.pdf/);
  assert.match(page, /responseType: "blob"/);
  assert.match(page, /a\.download = `kvitto-\$\{order\.orderNumber \|\| orderId\}\.pdf`/);
  // Hämtningen går via axios så att embeddens ordernyckel följer med i iframen.
  assert.match(page, /axios\.get\(`\/api\/platform\/orders/);
});

test("proxyn skickar vidare filnamnet och skickar ordersessionen för kvittoadressen", () => {
  const proxy = read("app/api/platform/[...path]/route.ts");
  assert.match(proxy, /content-disposition/);
  // orders/<id>/receipt.pdf ger orderId från andra segmentet, så sessionen eller nyckeln följer med.
  assert.match(proxy, /pathSegments\[0\] === "orders" && pathSegments\[1\]/);
});

test("sidan visar kundens fyrsiffriga nummer, kvittot hela numret", async () => {
  const { customerOrderNumber } = await import("../lib/orderNumber.ts");
  assert.equal(customerOrderNumber("PALM-1234-AB12C"), "1234");
  assert.equal(customerOrderNumber("FRED-0042-X9Y8Z"), "0042");
  assert.equal(customerOrderNumber("TEST-10023-QQ"), "10023");
  assert.equal(customerOrderNumber("ABC"), "ABC", "okänt format visas oförändrat");
  assert.equal(customerOrderNumber(""), null);

  const presentation = read("lib/orderTrackingPresentation.ts");
  assert.match(presentation, /Visa ordernummer \$\{pickupNumber\} i restaurangen/);
  const phase = read("lib/trackingPhase.ts");
  assert.match(phase, /Visa ordernummer \$\{orderNumber\} i restaurangen/);

  const page = read("app/order/[id]/page.tsx");
  assert.match(page, /const orderNo = shortOrderNo \? `#\$\{shortOrderNo\}` : fullOrderNo/);
  // Kvittovyn visar det fullständiga, unika numret.
  assert.match(page, /\{fullOrderNo\}<\/span>/);
});
