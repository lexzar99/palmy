import assert from 'node:assert/strict';
import {
  computeSettlement,
  sumSettlements,
  SETTLEMENT_VAT_PCT,
  type Settlement,
} from '../lib/settlementModel';

/**
 * Underlaget ur handoff-dokumentet, juli 2026.
 *
 * Modellen är enhetsagnostisk heltalsmatte: den avrundar i den enhet den matas
 * med. Handoffens tabell är räknad i hela kronor, så fixturen körs i kronor och
 * reproducerar dokumentets siffror exakt. Produktionen matar öre — se
 * testfallet längst ner, som visar vad den högre precisionen gör med totalen.
 */
const KR = 1;

type Fixture = {
  name: string;
  pct: number;
  gross: number;
  refunds: number;
  saleFee: number;
  refundFee: number;
  adj: number;
};

const JULI_2026: Fixture[] = [
  { name: 'Palmyra Pizzeria', pct: 16, gross: 396600, refunds: 12400, saleFee: 5610, refundFee: 720, adj: 0 },
  { name: 'Sushi Lund', pct: 15, gross: 277800, refunds: 8900, saleFee: 4180, refundFee: 440, adj: 0 },
  { name: 'Grill & Kebab Mårtenstorget', pct: 18, gross: 221800, refunds: 7300, saleFee: 3320, refundFee: 420, adj: -200 },
  { name: 'Thai House', pct: 15, gross: 172500, refunds: 4100, saleFee: 2640, refundFee: 340, adj: 200 },
  { name: 'Burgers Clemenstorget', pct: 17, gross: 136300, refunds: 3600, saleFee: 2010, refundFee: 280, adj: 0 },
  { name: 'Café Ariman', pct: 14, gross: 79500, refunds: 1900, saleFee: 1200, refundFee: 180, adj: 0 },
];

const settle = (row: Fixture): Settlement =>
  computeSettlement({
    grossTotal: row.gross * KR,
    refunds: row.refunds * KR,
    commissionPct: row.pct,
    cardFees: (row.saleFee + row.refundFee) * KR,
    adjustment: row.adj * KR,
  });

const kr = (value: number) => value / KR;

function run(name: string, fn: () => void) {
  fn();
  console.log(`  ok  ${name}`);
}

console.log('settlementModel');

run('räknat exempel — Palmyra Pizzeria, juli 2026', () => {
  const s = settle(JULI_2026[0]);
  assert.equal(kr(s.netSales), 384200, 'netto = 396 600 − 12 400');
  assert.equal(kr(s.commission), 61472, 'provision = 384 200 × 16 %');
  assert.equal(kr(s.commissionVat), 15368, 'moms = 61 472 × 25 %');
  assert.equal(kr(s.cardFees), 6330, 'kortavgift = 5 610 + 720');
  assert.equal(kr(s.adjustment), 0);
  assert.equal(kr(s.payout), 301030, 'att betala ut');
  assert.equal(kr(s.ourRevenue), 61472, 'vår intäkt ex moms');
});

run('netto = brutto − återbetalningar för hela perioden', () => {
  const totals = sumSettlements(JULI_2026.map(settle));
  assert.equal(kr(totals.netSales), 1246300);
});

run('summa utbetalningar = netto − provision − moms − avgifter + justering', () => {
  const rows = JULI_2026.map(settle);
  const totals = sumSettlements(rows);
  assert.equal(kr(totals.payout), 976084);
  assert.equal(
    totals.payout,
    totals.netSales - totals.commission - totals.commissionVat - (totals.cardFees as number) + totals.adjustment,
    'identiteten håller på totalnivå',
  );
});

run('provision per restaurang = round(netto × sats)', () => {
  for (const row of JULI_2026) {
    const s = settle(row);
    assert.equal(
      s.commission,
      Math.round((s.netSales * row.pct) / 100),
      `${row.name} provision`,
    );
  }
});

run('justering +1 240 höjer utbetalningen och sänker vår intäkt lika mycket', () => {
  const base = settle(JULI_2026[0]);
  const adjusted = settle({ ...JULI_2026[0], adj: 1240 });
  assert.equal(kr(adjusted.payout), 302270);
  assert.equal(kr(adjusted.ourRevenue), 60232);
  assert.equal(adjusted.payout - base.payout, 1240 * KR, 'utbetalningen höjs med justeringen');
  assert.equal(base.ourRevenue - adjusted.ourRevenue, 1240 * KR, 'vår intäkt sänks lika mycket');
});

run('justering +200 höjer utbetalningen med 200 och sänker vår intäkt med 200', () => {
  const base = settle({ ...JULI_2026[0], adj: 0 });
  const plus = settle({ ...JULI_2026[0], adj: 200 });
  assert.equal(plus.payout - base.payout, 200 * KR);
  assert.equal(base.ourRevenue - plus.ourRevenue, 200 * KR);
});

run('negativ justering drar av från restaurangen och tillfaller oss', () => {
  const grill = settle(JULI_2026[2]);
  const utan = settle({ ...JULI_2026[2], adj: 0 });
  assert.equal(utan.payout - grill.payout, 200 * KR);
  assert.equal(grill.ourRevenue - utan.ourRevenue, 200 * KR);
});

run('totalen är summan av de avrundade raderna, inte en omräkning', () => {
  const rows = JULI_2026.map(settle);
  const totals = sumSettlements(rows);
  assert.equal(totals.commission, rows.reduce((sum, row) => sum + row.commission, 0));
  assert.equal(totals.commissionVat, rows.reduce((sum, row) => sum + row.commissionVat, 0));
  assert.equal(totals.payout, rows.reduce((sum, row) => sum + row.payout, 0));
});

run('ingen abonnemangsavgift och ingen kortavgift belastar oss', () => {
  const s = settle(JULI_2026[0]);
  // Vår intäkt är exakt provisionen minus justeringen — inget annat läggs till
  // eller dras av, varken tier-avgift eller kortavgift.
  assert.equal(s.ourRevenue, s.commission - s.adjustment);
});

run('restaurangen bär hela kortavgiften, återbetalningsavgifterna inräknade', () => {
  const utan = computeSettlement({
    grossTotal: 100000 * KR, refunds: 0, commissionPct: 16, cardFees: 0,
  });
  const med = computeSettlement({
    grossTotal: 100000 * KR, refunds: 0, commissionPct: 16, cardFees: 1800 * KR,
  });
  assert.equal(utan.payout - med.payout, 1800 * KR, 'hela avgiften dras från utbetalningen');
  assert.equal(med.ourRevenue, utan.ourRevenue, 'vår intäkt påverkas inte');
});

run('kortavgift som ännu inte hämtats rapporteras som null, inte som noll', () => {
  const s = computeSettlement({
    grossTotal: 100000 * KR, refunds: 0, commissionPct: 16, cardFees: null,
  });
  assert.equal(s.cardFees, null);
  // Utbetalningen räknas utan avgiften, men gränssnittet kan visa "hämtas".
  assert.equal(kr(s.payout), 100000 - 16000 - 4000);
});

run('en okänd kortavgift gör periodens avgiftssumma okänd, inte lägre', () => {
  const totals = sumSettlements([
    computeSettlement({ grossTotal: 100000, refunds: 0, commissionPct: 16, cardFees: 1000 }),
    computeSettlement({ grossTotal: 100000, refunds: 0, commissionPct: 16, cardFees: null }),
  ]);
  assert.equal(totals.cardFees, null);
  assert.equal(totals.netSales, 200000, 'nettot är fortfarande känt');
});

run('momssatsen är 25 % och går att sätta per period', () => {
  assert.equal(SETTLEMENT_VAT_PCT, 25);
  const s = computeSettlement({
    grossTotal: 100000, refunds: 0, commissionPct: 10, cardFees: 0, vatPct: 12,
  });
  assert.equal(s.commission, 10000);
  assert.equal(s.commissionVat, 1200);
});

run('nollprovision är ett giltigt avtal, inte ett saknat värde', () => {
  const s = computeSettlement({
    grossTotal: 100000, refunds: 0, commissionPct: 0, cardFees: 500,
  });
  assert.equal(s.commission, 0);
  assert.equal(s.commissionVat, 0);
  assert.equal(s.ourRevenue, 0);
  assert.equal(s.payout, 99500);
});

run('utbetalningen får vara negativ — den golvas inte', () => {
  // Återbetalningarna äter upp perioden. Restaurangen är skyldig oss pengar och
  // det ska synas som ett negativt belopp, inte döljas som en nolla.
  const s = computeSettlement({
    grossTotal: 10000, refunds: 9000, commissionPct: 16, cardFees: 2500,
  });
  assert.ok(s.payout < 0, 'negativ utbetalning bevaras');
  assert.equal(s.payout, 1000 - 160 - 40 - 2500);
});

run('öre-precision ger samma modell men en exaktare total', () => {
  // Samma underlag i öre. Tre momsrader landar på bråkdelar av en krona
  // (10 083,75 / 9 652,50 / 5 639,75) och avrundas därför inte uppåt som i
  // handoffens kronortabell. Skillnaden är 1 krona på hela perioden, till
  // restaurangernas fördel, och är rätt siffra att betala ut.
  const ore = JULI_2026.map((row) =>
    computeSettlement({
      grossTotal: row.gross * 100,
      refunds: row.refunds * 100,
      commissionPct: row.pct,
      cardFees: (row.saleFee + row.refundFee) * 100,
      adjustment: row.adj * 100,
    }),
  );
  const totals = sumSettlements(ore);
  assert.equal(totals.netSales / 100, 1246300, 'nettot är identiskt i båda enheterna');
  assert.equal(totals.payout / 100, 976085);
  assert.equal(
    totals.payout,
    totals.netSales - totals.commission - totals.commissionVat - (totals.cardFees as number) + totals.adjustment,
    'identiteten håller även i öre',
  );
});

run('marginalen är vår intäkt i procent av nettoförsäljningen', () => {
  const totals = sumSettlements(JULI_2026.map(settle));
  assert.equal(
    totals.marginPct.toFixed(4),
    ((totals.ourRevenue / totals.netSales) * 100).toFixed(4),
  );
  const tom = sumSettlements([]);
  assert.equal(tom.marginPct, 0, 'ingen division med noll');
});

console.log('\nsettlementModel: alla testfall gröna');
