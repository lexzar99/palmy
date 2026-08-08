import assert from "node:assert/strict";
import { amountInputValue, count, kr, num, parseAmount, signed } from "./format";

function run(name: string, fn: () => void) {
  fn();
  console.log(`  ok  ${name}`);
}

console.log("format");

/* ── Justeringsbelopp ur fritextfältet ──────────────────────────────────── */

run("svenskt decimaltecken tolkas som decimaler, inte som tusental", () => {
  // Buggen: decimaltecknet plockades bort och parseInt läste "55,53" som
  // 5 553 kr — hundra gånger för mycket rakt in i en utbetalning.
  assert.equal(parseAmount("55,53"), 55.53);
  assert.equal(parseAmount("55.53"), 55.53);
  assert.equal(parseAmount("0,05"), 0.05);
});

run("negativa belopp fungerar med både bindestreck och minustecken", () => {
  assert.equal(parseAmount("-55,53"), -55.53);
  assert.equal(parseAmount("−55,53"), -55.53);
  assert.equal(parseAmount("-200"), -200);
});

run("mellanslag som tusenavgränsare stör inte", () => {
  assert.equal(parseAmount("55 530,50"), 55530.5);
  assert.equal(parseAmount("1 000"), 1000);
});

run("ören är minsta enhet", () => {
  assert.equal(parseAmount("10,006"), 10.01);
  assert.equal(parseAmount("10,004"), 10);
});

run("ett otolkbart fält är null, inte noll", () => {
  // Skillnaden avgör om spara-knappen får vara aktiv. Ett tomt fält får inte
  // tyst bli en nollställning av justeringen.
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount("   "), null);
  assert.equal(parseAmount("-"), null);
  assert.equal(parseAmount("abc"), null);
  assert.equal(parseAmount("0"), 0, "en uttalad nolla är ett giltigt belopp");
});

run("beloppet går tillbaka till fältet i läsbar form", () => {
  assert.equal(amountInputValue(-55.53), "-55,53");
  assert.equal(amountInputValue(200), "200");
  assert.equal(amountInputValue(0), "0");
});

run("rundturen fält → tal → fält bevarar värdet", () => {
  for (const value of [-55.53, 0, 0.05, 200, 55530.5]) {
    assert.equal(parseAmount(amountInputValue(value)), value, `${value} måste överleva rundturen`);
  }
});

/* ── Visning ────────────────────────────────────────────────────────────── */

run("pengar visas med två decimaler", () => {
  assert.equal(num(1246312), "1 246 312,00");
  assert.equal(num(-38200), "−38 200,00");
  assert.equal(kr(2489.62), "2 489,62 kr");
});

run("antal visas utan decimaler", () => {
  assert.equal(count(1842), "1 842");
  assert.equal(count(0), "0");
});

run("justeringar visas med tecken, och noll utan", () => {
  assert.equal(signed(200), "+200,00");
  assert.equal(signed(-200), "−200,00");
  assert.equal(signed(0), "0,00");
});

console.log("\nformat: alla testfall gröna");
