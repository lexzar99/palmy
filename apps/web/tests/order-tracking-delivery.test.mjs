import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Kunder såg "levererad" innan maten kom och betygsatte direkt. Vid egen
// hemkörning vet vi inte när maten kommer fram, så sidan visar ett intervall
// och säger aldrig "Levererad". Restaurangens besked när kunden inte gick att
// nå visas live, både på viaeats.se och i embedden.
const page = read("app/order/[id]/page.tsx");
const presentation = read("lib/orderTrackingPresentation.ts");
const banner = read("components/order/DeliveryOutcomeBanner.tsx");

test("egen hemkörning visar intervall och aldrig Levererad", () => {
  assert.match(page, /Framme kl\. \$\{clock\(selfEarliestMs\)\}–\$\{clock\(selfLatestMs\)\}/);
  assert.match(page, /order\.etaLatestAt/);
  assert.match(page, /"Det tar lite längre än beräknat"/);
  assert.match(page, /label: isPickup \? "Hämtad" : isSelf \? "Avslutad" : "Levererad"/);
  assert.match(page, /label: isSelf \? "Framme" : "Levererad"/);
  assert.match(presentation, /if \(selfDelivery && !pickup\) \{\s*return \{\s*title: "Hoppas maten smakade!"/);
});

test("betyget kräver att servern tillåter det", () => {
  assert.match(page, /const ReviewCard = isCompleted && reviewAllowed \? \(/);
  assert.match(page, /const reviewAllowed = order\.reviewAllowed !== false/);
  // Befintlig spärr för kioskvyn ligger kvar.
  assert.match(page, /!limitedTracking && ReviewCard/);
});

test("beskedet från restaurangen kommer live och visas i alla vyer", () => {
  assert.match(page, /socket\.on\("order:delivery-outcome"/);
  assert.match(page, /<DeliveryOutcomeBanner outcome=\{order\.deliveryOutcome\}/);
  const mainView = page.slice(page.lastIndexOf("\n  return (\n"));
  const bannerAt = mainView.indexOf("<DeliveryOutcomeBanner");
  assert.ok(bannerAt > 0);
  assert.ok(bannerAt < mainView.indexOf("{limitedTracking && ("), "bannern ska ligga utanför kioskvillkoret");
  for (const code of ["AT_RESTAURANT", "LEFT_AT_DOOR", "LEFT_WITH_NEIGHBOUR", "REDELIVERING"]) {
    assert.match(banner, new RegExp(`case "${code}"`));
  }
  assert.doesNotMatch(banner, /case "RESOLVED"/);
});

test("beskedet vinner över rubriken även när ordern är avslutad", () => {
  assert.match(page, /outcomeCopy \? outcomeCopy\.title : selfStage === "late"/);
  assert.match(page, /const outcomeCopy = order\.deliveryOutcome && !isRejected/);
  // Kunden uppmanas kontakta restaurangen i alla besked.
  for (const code of ["LEFT_AT_DOOR", "LEFT_WITH_NEIGHBOUR"]) {
    const start = banner.indexOf(`case "${code}"`);
    assert.match(banner.slice(start, banner.indexOf("case ", start + 6)), /Kontakta \$\{name\}/);
  }
});
