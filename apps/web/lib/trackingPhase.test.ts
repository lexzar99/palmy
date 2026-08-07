import assert from "node:assert/strict";
import {
  forecastLabel,
  isPickupOrder,
  phaseSubtitle,
  phaseTitle,
  resolvePhase,
  stepIndex,
  stepLabels,
} from "./trackingPhase";

function run(name: string, fn: () => void) {
  fn();
  console.log(`  ok  ${name}`);
}

const pickup = (status: string) => ({ type: "PICKUP", status });
const delivery = (status: string) => ({ type: "DELIVERY", status });

console.log("trackingPhase");

run("en hämtorder känns igen oavsett fältnamn", () => {
  assert.equal(isPickupOrder({ type: "PICKUP" }), true);
  assert.equal(isPickupOrder({ orderType: "pickup" }), true);
  assert.equal(isPickupOrder({ type: "DELIVERY" }), false);
  // Saknad typ är leverans — den vanligaste ordern.
  assert.equal(isPickupOrder({}), false);
});

run("hämtning använder aldrig ordet framme", () => {
  // Buggen: kunden såg "Beräknad framme" på en order hen skulle hämta själv.
  assert.equal(forecastLabel({ phase: "preparing", pickup: true }), "Beräknad klar");
  assert.equal(forecastLabel({ phase: "preparing", pickup: false }), "Beräknad framme");
});

run("hämtning får aldrig steget På väg", () => {
  assert.deepEqual(stepLabels(true), ["Skickad", "Förbereds", "Klar för hämtning"]);
  assert.deepEqual(stepLabels(false), ["Skickad", "Förbereds", "På väg"]);
  assert.ok(!stepLabels(true).includes("På väg"), "maten åker aldrig iväg vid avhämtning");
});

run("en hämtorder hamnar aldrig i onTheWay", () => {
  for (const status of ["DELIVERING", "OUT_FOR_DELIVERY", "ON_THE_WAY"]) {
    assert.equal(
      resolvePhase(pickup(status)),
      "readyForPickup",
      `${status} får inte bli "på väg" för en hämtorder`,
    );
  }
  assert.equal(resolvePhase(delivery("DELIVERING")), "onTheWay");
});

run("READY betyder klar för hämtning, inte klar för utkörning", () => {
  assert.equal(resolvePhase(pickup("READY")), "readyForPickup");
  assert.equal(phaseTitle("readyForPickup"), "Klar för hämtning");
  // Leverans stannar i preparing på READY — budet har inte hämtat än.
  assert.equal(resolvePhase(delivery("READY")), "preparing");
});

run("en hämtad order är klar, inte fortfarande redo att hämtas", () => {
  // Tidigare stod en hämtad order kvar på "Klar för hämtning" för alltid.
  for (const status of ["DELIVERED", "COMPLETED"]) {
    assert.equal(resolvePhase(pickup(status)), "done");
    assert.equal(resolvePhase(delivery(status)), "done");
  }
  assert.equal(phaseTitle("done", true), "Hämtad");
  assert.equal(phaseTitle("done", false), "Klart");
  assert.equal(forecastLabel({ phase: "done", pickup: true }), "Hämtad");
});

run("faserna går framåt i rätt ordning", () => {
  assert.equal(resolvePhase(pickup("PENDING")), "waiting");
  assert.equal(resolvePhase(pickup("ACCEPTED")), "preparing");
  assert.equal(resolvePhase(pickup("PREPARING")), "preparing");
  assert.equal(resolvePhase(pickup("READY")), "readyForPickup");
  assert.equal(resolvePhase(pickup("COMPLETED")), "done");
});

run("stegmarkören följer fasen", () => {
  assert.equal(stepIndex("waiting"), 0);
  assert.equal(stepIndex("preparing"), 1);
  assert.equal(stepIndex("readyForPickup"), 2);
  assert.equal(stepIndex("onTheWay"), 2);
  assert.equal(stepIndex("done"), 2);
});

run("undertexten berättar vad som händer härnäst vid hämtning", () => {
  assert.match(phaseSubtitle("preparing", "Palmyra", true), /hämta/);
  assert.equal(phaseSubtitle("preparing", "Palmyra", false), "Köket förbereder din mat.");
  assert.match(phaseSubtitle("readyForPickup", "Palmyra"), /ordernumret/);
});

run("leveransprognosen behåller sina egna besked", () => {
  assert.equal(forecastLabel({ phase: "onTheWay", pickup: false }), "Beräknad vara här");
  assert.equal(forecastLabel({ phase: "onTheWay", pickup: false, earlier: true }), "Kommer tidigare än beräknat");
  assert.equal(forecastLabel({ phase: "onTheWay", pickup: false, revised: true }), "Uppdaterad prognos");
  assert.equal(forecastLabel({ phase: "waiting", pickup: true }), "Tid kommer när köket svarat");
});

console.log("\ntrackingPhase: alla testfall gröna");
