import assert from "node:assert/strict";
import {
  activeCommissionRates,
  amountInputValue,
  commissionRateDetail,
  count,
  kr,
  num,
  parseAmount,
  pct,
  signed,
} from "./format";

const row = (netSales: number, commissionPct: number) => ({ settlement: { netSales, commissionPct } });

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

run("provisionssatser skrivs som de är avtalade", () => {
  // En jämn sats får inte se ut som ett avrundat snitt: 12 %, inte 12,0 %.
  assert.equal(pct(12), "12 %");
  assert.equal(pct(11), "11 %");
  assert.equal(pct(0), "0 %");
  assert.equal(pct(12.5), "12,5 %");
});

/* ── Provisionssatserna bakom "Vi behåller" ─────────────────────────────── */

run("olika satser listas, inte döljs bakom snittet", () => {
  // 11, 13 och 14 % kan väga samman till precis 12,0 % — utan satserna
  // utskrivna ser en korrekt uträknad siffra ut som en hårdkodad 12 %.
  const rows = [row(100_000, 11), row(50_000, 13), row(25_000, 14)];
  assert.deepEqual(activeCommissionRates(rows), [11, 13, 14]);
  assert.equal(commissionRateDetail(activeCommissionRates(rows)), "11 % · 13 % · 14 %");
});

run("ligger alla på samma sats behövs ingen extra rad", () => {
  const rows = [row(100_000, 12), row(50_000, 12)];
  assert.deepEqual(activeCommissionRates(rows), [12]);
  assert.equal(commissionRateDetail(activeCommissionRates(rows)), null);
});

run("restauranger utan omsättning vidgar inte spannet", () => {
  // Vilande restaurang med eget 5 %-avtal påverkar ingen krona i perioden.
  const rows = [row(100_000, 12), row(50_000, 12), row(0, 5)];
  assert.deepEqual(activeCommissionRates(rows), [12]);
});

run("många olika satser visas som spann", () => {
  const rows = [row(1, 11), row(1, 12), row(1, 13), row(1, 14), row(1, 16)];
  assert.equal(commissionRateDetail(activeCommissionRates(rows)), "11 %–16 %");
});

console.log("\nformat: alla testfall gröna");
