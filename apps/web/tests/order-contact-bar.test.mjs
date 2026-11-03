import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// Kunder som inte visste hur de skulle nå restaurangen har gett dåliga
// recensioner. Kontaktraden ska därför synas i alla lägen och för alla
// ordertyper, även i kioskvyn och i embeddens återställningsvy.
const page = read("app/order/[id]/page.tsx");
const bar = read("components/order/RestaurantContactBar.tsx");

// Klipper ut sidans sista return (huvudvyn) och återställningsvyn.
const mainView = page.slice(page.lastIndexOf("\n  return (\n"));
const recoveryStart = page.indexOf("if (!order && embedMode) {");
const recoveryView = page.slice(recoveryStart, page.indexOf("if (!order) {", recoveryStart));

test("kontaktraden öppnar tel/mailto utanför iframen", () => {
  assert.match(bar, /target="_top"/);
  assert.match(bar, /`tel:\$\{tel\}`/);
  assert.match(bar, /`mailto:\$\{mail\}`/);
  assert.match(bar, /Kontakta restaurangen vid fel/);
  assert.match(bar, /fixed inset-x-0/);
  // Embeddens flikrad ligger längst ned på mobil; raden måste ligga ovanför den.
  assert.match(bar, /bottom-\[calc\(4rem_\+_env\(safe-area-inset-bottom,0px\)\)\]/);
});

test("huvudvyn renderar raden utanför alla villkor för läge och ordertyp", () => {
  const line = mainView.split("\n").find((l) => l.includes("<RestaurantContactBar"));
  assert.ok(line, "RestaurantContactBar saknas i huvudvyn");
  assert.match(line, /^\s*<RestaurantContactBar phone=\{order\.restaurantPhone\} email=\{order\.restaurantEmail\} embed=\{embedMode\} \/>$/);
  // Raden ligger direkt i sidans rot, inte i ett kort som döljs av limitedTracking,
  // isPickup, isSelf, isWeDeliver, isRejected eller isCompleted.
  const before = mainView.slice(0, mainView.indexOf("<RestaurantContactBar"));
  const after = mainView.slice(mainView.indexOf("<RestaurantContactBar"));
  assert.match(before, /\{OrderInfoOverlayWeb\}\s*$/);
  assert.match(after, /<AnimatePresence>/);
});

test("kioskvyn och återställningsvyn har raden", () => {
  assert.doesNotMatch(mainView, /limitedTracking && <RestaurantContactBar|!limitedTracking && <RestaurantContactBar/);
  assert.match(recoveryView, /<RestaurantContactBar phone=\{recoveryPhone\} email=\{recoveryEmail\} embed \/>/);
});

test("numret finns bara i kontaktraden och kvittot", () => {
  assert.doesNotMatch(page, /telHref|recoveryTel/);
  assert.doesNotMatch(page, /href=\{?`?tel:/);
  assert.doesNotMatch(page, /Ring restaurangen<\/span>/);
});
