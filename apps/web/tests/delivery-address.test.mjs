import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import * as web from "../lib/deliveryAddress.ts";
import * as api from "../../../packages/api/src/lib/deliveryAddress.ts";

const cart = fs.readFileSync(new URL("../app/cart/page.tsx", import.meta.url), "utf8");
const modal = fs.readFileSync(new URL("../components/AddressModal.tsx", import.meta.url), "utf8");
const orders = fs.readFileSync(
  new URL("../../../packages/api/src/routes/orders.ts", import.meta.url),
  "utf8",
);
const places = fs.readFileSync(
  new URL("../../../packages/api/src/routes/places.ts", import.meta.url),
  "utf8",
);

// Den faktiska incidenten först: kunden skrev bara ett postnummer och
// restaurangen fick en order utan adress att köra till.
const REJECTED = [
  ["224 76", "postal-code-only"],
  ["22476", "postal-code-only"],
  ["  224   76  ", "postal-code-only"],
  ["224 76 Lund", "missing-house-number"],
  ["Lund", "missing-house-number"],
  ["Lund C", "missing-house-number"],
  ["Linero", "missing-house-number"],
  ["Linero centrum", "missing-house-number"],
  ["Norra Fäladen", "missing-house-number"],
  ["Storgatan", "missing-house-number"],
  ["", "empty"],
  ["   ", "empty"],
  [null, "empty"],
  [undefined, "empty"],
  ["12345", "postal-code-only"],
  ["Box 123", "po-box"],
  ["box 45", "po-box"],
  ["12", "missing-street-name"],
  ["- , .", "missing-street-name"],
];

const ACCEPTED = [
  "Storgatan 12",
  "Storgatan 12A",
  "Storgatan 12 A",
  "Sankt Larsvägen 81",
  "Nya Vattentornet 3",
  "Kyrkogatan 1, 222 22 Lund",
  "Öresundsvägen 4B",
  "Östra Mårtensgatan 7, 223 61 Lund",
  "Norra Vallgatan 60",
  "Gamla Landsvägen 3",
  "Bygatan 1 C",
  // Riktiga träffar från produktionens autocomplete på "224 76": svenska
  // landsvägsadresser där vägnumret följs av husnumret. De får inte råka
  // avfärdas av postnummer-strippningen.
  "AC 768 224",
  "Z 763 224",
];

// Samma sökningar i produktion returnerar också gator UTAN husnummer
// ("Lund" → "Lundagatan, Stockholm", "Lund C" → "Clemenstorget, Lund").
// De ska stoppas med beskedet om husnummer, inte släppas igenom.
const REAL_PREDICTIONS_WITHOUT_NUMBER = [
  "Lundagatan",
  "Lundavägen",
  "Linerovägen",
  "Östra Linerovägen",
  "Clemenstorget",
];

test("a postal code, a city or a district is never a deliverable address", () => {
  for (const [input, issue] of REJECTED) {
    const result = web.checkDeliveryStreet(input);
    assert.equal(result.ok, false, `${JSON.stringify(input)} must be rejected`);
    assert.equal(result.issue, issue, `${JSON.stringify(input)} issue`);
    assert.match(result.message, /\S/);
  }
});

test("real Swedish street addresses still pass", () => {
  for (const input of ACCEPTED) {
    const result = web.checkDeliveryStreet(input);
    assert.equal(result.ok, true, `${JSON.stringify(input)} must be accepted`);
  }
});

test("a street name without a house number is not a delivery address", () => {
  for (const input of REAL_PREDICTIONS_WITHOUT_NUMBER) {
    const result = web.checkDeliveryStreet(input);
    assert.equal(result.ok, false, `${input} must be rejected`);
    assert.equal(result.issue, "missing-house-number");
  }
  // Med husnumret påsatt är samma gata leveransbar.
  assert.equal(web.checkDeliveryStreet("Linerovägen 24").ok, true);
});

test("the web mirror and the API rule cannot drift apart", () => {
  for (const [input] of REJECTED) {
    assert.deepEqual(web.checkDeliveryStreet(input), api.checkDeliveryStreet(input), String(input));
  }
  for (const input of [...ACCEPTED, ...REAL_PREDICTIONS_WITHOUT_NUMBER]) {
    assert.deepEqual(web.checkDeliveryStreet(input), api.checkDeliveryStreet(input), input);
  }
  assert.equal(web.normalizeDeliveryStreet("  a   b "), api.normalizeDeliveryStreet("  a   b "));
});

test("the order API rejects an incomplete delivery address", () => {
  // Servern är grinden som gäller för webben, embedden OCH iOS-appen.
  assert.match(orders, /import \{ checkDeliveryStreet \} from '\.\.\/lib\/deliveryAddress'/);
  assert.match(orders, /const addressCheck = checkDeliveryStreet\(data\.deliveryStreet\)/);
  assert.match(orders, /code: 'DELIVERY_ADDRESS_INCOMPLETE'/);
  assert.doesNotMatch(orders, /if \(!data\.deliveryStreet\) \{/);
});

test("the checkout blocks before payment instead of after", () => {
  assert.match(cart, /import \{ checkDeliveryStreet, isDeliverableStreet \} from "@\/lib\/deliveryAddress"/);
  assert.match(cart, /const deliveryAddressCheck = checkDeliveryStreet\(formData\.deliveryStreet\)/);
  // Sista-chans-geokodningen fick INTE längre tysta acceptera första
  // autocomplete-träffen — det var så postnumret blev en giltig order.
  assert.match(cart, /const bestMatch = \(aData\.predictions \|\| \[\]\)\.find\([\s\S]*?isDeliverableStreet\(/);
  assert.doesNotMatch(cart, /const bestMatch = aData\.predictions\?\.\[0\]/);
});

test("the address modal never confirms raw typed text", () => {
  assert.doesNotMatch(modal, /selectedAddress \|\| input\.trim\(\)/);
  assert.match(modal, /checkDeliveryStreet\(/);
});

test("reverse geocoding never invents an address from a map pin", () => {
  // Båda reverse-vägarna föll förut tillbaka på formatted_address, så en nål
  // mitt i ett fält blev ett postnummerområde som såg ut som en adress.
  const webReverse = fs.readFileSync(
    new URL("../app/api/places/reverse/route.ts", import.meta.url),
    "utf8",
  );
  // Fallbacken på formatted_address får finnas kvar (landsbygdsadresser som
  // "Gårdstånga 309" saknar strukturerad route/street_number), men allt som
  // släpps ut måste klara samma regel som ordern valideras mot.
  for (const source of [webReverse, places]) {
    assert.match(source, /if \(!isDeliverableStreet\(street\)\) return null;/);
    assert.match(source, /isDeliverableStreet.*from ["']@?[./\w-]*\/?lib\/deliveryAddress["']/);
  }
  assert.match(modal, /Ingen gatuadress på den punkten/);

  // Plus-koden som produktionen faktiskt returnerade för en punkt i vattnet.
  assert.equal(web.checkDeliveryStreet("HWX2+X2 Malmö").ok, false);
  assert.equal(web.checkDeliveryStreet("5GX2+X2 Övre Galthult").ok, false);
  // Riktiga landsbygdsadresser från samma reverse-endpoint.
  assert.equal(web.checkDeliveryStreet("Gårdstånga 309").ok, true);
  assert.equal(web.checkDeliveryStreet("Norra REVEN 6520").ok, true);
});

test("autocomplete only suggests street addresses", () => {
  // Places API (New) saknade typfilter helt, så postnummer och ortnamn kom
  // tillbaka som förslag. Legacy hade redan types=address.
  assert.match(places, /includedPrimaryTypes/);
  assert.match(places, /url\.searchParams\.set\('types', 'address'\)/);
  // Photon-fallbacken accepterade ett "gatunamn" utan husnummer.
  assert.match(places, /props\.housenumber/);
});
