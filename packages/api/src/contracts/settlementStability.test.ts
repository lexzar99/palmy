import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeSettlement } from '../lib/settlementModel';

function run(name: string, fn: () => void) {
  fn();
  console.log(`  ok  ${name}`);
}

console.log('settlementStability');

/**
 * Underlaget för en riktig period. Ingenting i det ändras när man sparar en
 * justering — bara justeringen gör det.
 */
const base = {
  grossTotal: 396_600_00,
  refunds: 12_400_00,
  commissionPct: 16,
  cardFees: 6_330_00,
};

run('en justering ändrar bara utbetalningen och vår intäkt', () => {
  const before = computeSettlement({ ...base, adjustment: 0 });
  const after = computeSettlement({ ...base, adjustment: 200_00 });

  // Allt underlag står stilla.
  assert.equal(after.netSales, before.netSales, 'nettot får inte ändras');
  assert.equal(after.commission, before.commission, 'provisionen får inte ändras');
  assert.equal(after.commissionVat, before.commissionVat, 'momsen får inte ändras');
  assert.equal(after.cardFees, before.cardFees, 'kortavgiften får inte ändras');

  // Bara de två posterna justeringen faktiskt rör.
  assert.equal(after.payout - before.payout, 200_00);
  assert.equal(before.ourRevenue - after.ourRevenue, 200_00);
});

run('en negativ justering rör lika lite', () => {
  const before = computeSettlement({ ...base, adjustment: 0 });
  const after = computeSettlement({ ...base, adjustment: -500_00 });
  assert.equal(after.netSales, before.netSales);
  assert.equal(after.commission, before.commission);
  assert.equal(before.payout - after.payout, 500_00);
  assert.equal(after.ourRevenue - before.ourRevenue, 500_00);
});

run('tecknet vänds exakt en gång mellan gränssnitt och lagring', () => {
  // Gränssnittet: positivt = restaurangen får extra.
  // Lagringen: motsatt tecken, fältet lämnas orört av historiska skäl.
  const uiValue = 200_00;
  const stored = -uiValue;
  const readBack = computeSettlement({ ...base, adjustment: -stored });
  assert.equal(readBack.adjustment, uiValue, 'rundturen måste ge tillbaka samma tal');
  assert.equal(
    readBack.payout,
    computeSettlement({ ...base, adjustment: 0 }).payout + uiValue,
    'en justering på +200 ska höja utbetalningen med 200',
  );
});

/* ── Avräkningen får aldrig läsa den frysta ögonblicksbilden ────────────── */

const financeSource = readFileSync(join(__dirname, '..', 'routes', 'finance.ts'), 'utf8');

run('summary räknar avräkningen på färskt underlag', () => {
  // Den frysta bilden kommer från den gamla modellen, där provisionen
  // räknades på matvärdet i stället för nettoförsäljningen. Läser avräkningen
  // den hoppar siffrorna i samma sekund som en justering sparas och posten
  // blir godkänd — vilket är precis vad som rapporterades.
  const start = financeSource.indexOf('const settlementOre = computeSettlement({');
  assert.ok(start > 0, 'settlement-anropet måste finnas');
  const block = financeSource.slice(start, financeSource.indexOf('});', start));

  for (const frozen of ['grossTotalOre', 'refundTotalOre', 'economic.', 'commissionVatPct', 'mollieFeesOre']) {
    assert.ok(
      !new RegExp(`(?<![A-Za-z])${frozen.replace('.', '\\.')}`).test(block.replace(/live[A-Za-z]+/g, '')),
      `avräkningen får inte läsa ${frozen} — det kan komma från den frysta bilden`,
    );
  }
  assert.match(block, /liveGrossTotalOre/, 'brutto måste tas färskt');
  assert.match(block, /liveRefundTotalOre/, 'återbetalningar måste tas färskt');
  assert.match(block, /liveMollieFeesOre/, 'kortavgiften måste tas färsk');
});

console.log('\nsettlementStability: alla testfall gröna');
