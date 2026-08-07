/**
 * Avstämning av den nya avräkningsmodellen mot skarp data.
 *
 * ENDAST LÄSNING. Skriptet startar ingen server, inga bakgrundsjobb och
 * skriver aldrig till databasen — det läser en period och visar vad den gamla
 * respektive den nya modellen ger, rad för rad, så skillnaden går att granska
 * innan något godkänns.
 *
 *   pnpm --filter @viaeats/api verify:settlement -- 2026-07
 *
 * Utan argument används föregående kalendermånad.
 */
import { PrismaClient } from '@prisma/client';
import { economyFromSettings, resolveCommissionPct } from '../src/lib/financeCalc';
import { resolveFinancePeriod } from '../src/lib/financePeriod';
import {
  FINANCE_REAL_PAYMENT_STATUSES,
  PAYOUT_NON_TEST_ORDER_FILTER,
  isFinanceRealPaymentOrder,
} from '../src/lib/payoutPolicy';
import { computeSettlement, sumSettlements } from '../src/lib/settlementModel';

const prisma = new PrismaClient();

const kr = (ore: number) =>
  (ore / 100).toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const pad = (value: string, width: number, right = false) =>
  right ? value.padStart(width) : value.padEnd(width);

/** Samma klampning som summary-routen: PSP-status REFUNDED är auktoritativ. */
const clampedRefundOre = (order: { total: number; refundAmount?: number | null; paymentStatus?: string | null }) => {
  const total = Math.max(0, Number(order.total || 0));
  const recorded = Math.max(0, Number(order.refundAmount || 0));
  const effective = String(order.paymentStatus || '').toUpperCase() === 'REFUNDED' ? total : recorded;
  return Math.min(total, effective);
};

/**
 * Periodgränserna måste byggas med API:ts egen resolveFinancePeriod. Egna
 * Date-objekt hamnar på lokal midnatt i stället för Stockholm-midnatt, och då
 * matchar periodStart inte de sparade utbetalningarna.
 */
function resolvePeriod(argument: string | undefined) {
  const now = new Date();
  const month = argument && /^\d{4}-(0[1-9]|1[0-2])$/.test(argument)
    ? argument
    : `${now.getFullYear()}-${String(now.getMonth() || 12).padStart(2, '0')}`;
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const { start, end } = resolveFinancePeriod(
    `${month}-01`,
    `${month}-${String(lastDay).padStart(2, '0')}`,
  );
  return { month, start, end };
}

async function main() {
  const { month, start, end } = resolvePeriod(process.argv[2]);
  const stockholmDay = (date: Date) =>
    new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', dateStyle: 'short' }).format(date);
  console.log(`\nAvstämning ${month}  (${stockholmDay(start)} – ${stockholmDay(end)})`);
  console.log('Läser produktionsdata. Inget skrivs.\n');

  const [settingsRow, restaurants, orders, persisted] = await Promise.all([
    prisma.restaurantSettings.findUnique({ where: { id: 'settings' } }),
    prisma.restaurant.findMany({
      where: { orders: { some: { createdAt: { gte: start, lte: end } } } },
      select: {
        id: true, name: true, selfDelivery: true, commissionPctOverride: true,
        featuredClass: true, vatPercent: true,
      },
      orderBy: { name: 'asc' },
    }),
    prisma.order.findMany({
      where: { createdAt: { gte: start, lte: end }, ...PAYOUT_NON_TEST_ORDER_FILTER },
      select: {
        restaurantId: true, total: true, refundAmount: true, paymentStatus: true,
        paymentProvider: true, status: true,
      },
    }),
    // Överlapp i stället för exakt likhet: äldre rader sparades med
    // UTC-midnatt medan perioden nu byggs på Stockholm-midnatt, och en
    // avstämning ska hitta underlaget ändå.
    prisma.restaurantPayout.findMany({
      where: { periodStart: { lte: end }, periodEnd: { gte: start } },
      select: {
        restaurantId: true, status: true, payoutAmount: true, commissionAmount: true,
        subscriptionAmount: true, mollieFeeAmount: true, manualAdjustmentAmount: true,
      },
    }),
  ]);

  const economy = economyFromSettings(settingsRow);
  const savedByRestaurant = new Map(persisted.map((row) => [row.restaurantId, row]));
  const realOrders = orders.filter(isFinanceRealPaymentOrder);

  const header = [
    pad('Restaurang', 30), pad('Sats', 6, true), pad('Netto', 14, true),
    pad('Provision', 13, true), pad('Moms', 12, true), pad('Kortavg.', 12, true),
    pad('NY utbet.', 14, true), pad('SPARAD', 14, true), pad('Diff', 13, true), '  Status',
  ].join(' ');
  console.log(header);
  console.log('─'.repeat(header.length));

  const settlements = [];
  let savedTotal = 0;
  let savedKnown = true;

  for (const restaurant of restaurants) {
    const rows = realOrders.filter((order) => order.restaurantId === restaurant.id);
    if (rows.length === 0) continue;

    const grossTotal = rows.reduce((sum, order) => sum + Math.max(0, Number(order.total || 0)), 0);
    const refunds = rows.reduce((sum, order) => sum + clampedRefundOre(order), 0);
    const saved = savedByRestaurant.get(restaurant.id) || null;

    // Kortavgiften hämtas från betalleverantören i API:t. Här används den
    // sparade avgiften när den finns, annars redovisas den som okänd i stället
    // för att antas vara noll.
    const cardFees = saved && saved.mollieFeeAmount != null
      ? Math.max(0, Math.round(Number(saved.mollieFeeAmount)))
      : null;

    const settlement = computeSettlement({
      grossTotal,
      refunds,
      commissionPct: resolveCommissionPct(restaurant as any, economy),
      cardFees,
      // Nya modellens tecken: det lagrade fältet betyder extra avdrag.
      adjustment: saved ? -Math.round(Number(saved.manualAdjustmentAmount || 0)) : 0,
    });
    settlements.push(settlement);

    const savedPayout = saved ? Math.round(Number(saved.payoutAmount || 0)) : null;
    if (savedPayout == null) savedKnown = false;
    else savedTotal += savedPayout;

    console.log([
      pad(restaurant.name.slice(0, 30), 30),
      pad(`${settlement.commissionPct} %`, 6, true),
      pad(kr(settlement.netSales), 14, true),
      pad(kr(settlement.commission), 13, true),
      pad(kr(settlement.commissionVat), 12, true),
      pad(cardFees == null ? 'hämtas' : kr(cardFees), 12, true),
      pad(kr(settlement.payout), 14, true),
      pad(savedPayout == null ? '—' : kr(savedPayout), 14, true),
      pad(savedPayout == null ? '—' : kr(settlement.payout - savedPayout), 13, true),
      `  ${saved?.status || 'inget underlag'}`,
    ].join(' '));
  }

  const totals = sumSettlements(settlements);
  console.log('─'.repeat(header.length));
  console.log([
    pad('TOTALT', 30), pad('', 6, true),
    pad(kr(totals.netSales), 14, true),
    pad(kr(totals.commission), 13, true),
    pad(kr(totals.commissionVat), 12, true),
    pad(totals.cardFees == null ? 'hämtas' : kr(totals.cardFees), 12, true),
    pad(kr(totals.payout), 14, true),
    pad(savedKnown ? kr(savedTotal) : '—', 14, true),
    pad(savedKnown ? kr(totals.payout - savedTotal) : '—', 13, true),
  ].join(' '));

  // Identiteten kontrolleras per rad. En rad utan hämtad kortavgift går inte
  // att kontrollera — den redovisas som okänd i stället för att antas vara noll
  // och tysta ner en verklig avvikelse.
  console.log(`\nIdentitetskontroll per rad: netto − provision − moms − kortavgift + justering = utbetalning`);
  const checkable = settlements.filter((row) => row.cardFees != null);
  const broken = checkable.filter((row) =>
    row.netSales - row.commission - row.commissionVat - (row.cardFees as number) + row.adjustment !== row.payout,
  );
  console.log(
    `  ${checkable.length} av ${settlements.length} rader kontrollerade → ${broken.length === 0 ? 'OK' : `${broken.length} AVVIKER`}` +
    (checkable.length < settlements.length
      ? `  (${settlements.length - checkable.length} utan hämtad kortavgift)`
      : ''),
  );
  console.log(`\nVår intäkt ex moms: ${kr(totals.ourRevenue)}  (${totals.marginPct.toFixed(2)} % av nettot)`);
  console.log(
    '\nSkillnaden mot SPARAD kommer av att den gamla modellen drog abonnemang\n' +
    'och bara delar av kortavgiften. Den nya tar provision plus moms, och\n' +
    'restaurangen bär hela kortavgiften.\n',
  );
}

main()
  .catch((error) => {
    console.error('\nAvstämningen misslyckades:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
