/**
 * Plattform-ekonomi — ren beräkningsmodell (ingen DB, ingen I/O).
 *
 * Två oberoende axlar:
 *   1. Tier (featuredClass) → abonnemang + ranking. Påverkar INTE provisionen.
 *   2. Leveransansvar (selfDelivery) → provisionssats (self vs platform-default),
 *      med valfri per-restaurang override (t.ex. 5% första månaden).
 *
 * Pengaflöde: allt kommer till plattformens konto, utbetalning sker periodvis.
 *   - Provisionsbas = matvärde (subtotal − rabatt) i BÅDA modellerna.
 *   - Leveransavgift: self → restaurangen, platform → plattformen (finansierar bud).
 *   - Dricks: self → restaurangen, platform → budet.
 *   - Plattformens avgifter (provision + abonnemang) faktureras som B2B-tjänst
 *     med moms (vatPlatformFeePct, typ. 25%).
 *
 * ALLA belopp är i ÖRE in och ut.
 */

export interface EconomySettings {
  commissionSelfPct: number;
  commissionPlatformPct: number;
  vatCustomerPct: number;
  vatPlatformFeePct: number;
  tierGoldFee: number; // öre/mån
  tierSilverFee: number; // öre/mån
  tierStandardFee: number; // öre/mån
}

export const DEFAULT_ECONOMY: EconomySettings = {
  commissionSelfPct: 10,
  commissionPlatformPct: 20,
  vatCustomerPct: 6,
  vatPlatformFeePct: 25,
  tierGoldFee: 100000,
  tierSilverFee: 70000,
  tierStandardFee: 0,
};

/** Läs ekonomi-inställningar från en RestaurantSettings-rad med säkra fallbacks. */
export function economyFromSettings(row: any | null | undefined): EconomySettings {
  const s = row || {};
  const n = (v: any, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return {
    commissionSelfPct: n(s.commissionSelfPct, DEFAULT_ECONOMY.commissionSelfPct),
    commissionPlatformPct: n(s.commissionPlatformPct, DEFAULT_ECONOMY.commissionPlatformPct),
    vatCustomerPct: n(s.vatCustomerPct, DEFAULT_ECONOMY.vatCustomerPct),
    vatPlatformFeePct: n(s.vatPlatformFeePct, DEFAULT_ECONOMY.vatPlatformFeePct),
    tierGoldFee: n(s.tierGoldFee, DEFAULT_ECONOMY.tierGoldFee),
    tierSilverFee: n(s.tierSilverFee, DEFAULT_ECONOMY.tierSilverFee),
    tierStandardFee: n(s.tierStandardFee, DEFAULT_ECONOMY.tierStandardFee),
  };
}

// featuredClass: 1=Guld, 2=Silver, 3=Standard (default), 0=Dold → standard-pris.
export function tierInfo(featuredClass: number | null | undefined, s: EconomySettings) {
  switch (featuredClass) {
    case 1:
      return { label: 'Guld', subscriptionOre: s.tierGoldFee };
    case 2:
      return { label: 'Silver', subscriptionOre: s.tierSilverFee };
    default:
      return { label: 'Standard', subscriptionOre: s.tierStandardFee };
  }
}

export interface RestaurantEcon {
  selfDelivery: boolean;
  commissionPctOverride: number | null;
  featuredClass: number | null;
}

/** Effektiv provisionssats i %: override vinner, annars self/platform-default. */
export function resolveCommissionPct(r: RestaurantEcon, s: EconomySettings): number {
  if (r.commissionPctOverride != null && Number.isFinite(r.commissionPctOverride)) {
    return r.commissionPctOverride;
  }
  return r.selfDelivery ? s.commissionSelfPct : s.commissionPlatformPct;
}

/** En order, allt i öre. */
export interface OrderEcon {
  total: number;
  deliveryFee: number;
  tipAmount: number;
}

export interface PayoutBreakdown {
  orderCount: number;
  // allt i ÖRE
  grossTotal: number; // summa order.total (allt kunden betalade)
  foodBase: number; // provisionsbas = total − leveransavgift − dricks
  deliveryFeeTotal: number;
  tipTotal: number;
  commissionPct: number;
  commissionOre: number;
  subscriptionOre: number;
  feeVatOre: number; // moms på (provision + abonnemang)
  feeVatPct: number;
  restaurantGrossOre: number; // restaurangens intäkt före avdrag
  payoutOre: number; // netto att betala ut (golvat vid 0 — aldrig negativt)
  owedOre: number; // om avdragen > intäkten: vad restaurangen är skyldig oss (fakturera)
  foodVatOre: number; // informativ: moms i restaurangens matförsäljning
  foodVatPct: number;
  tierLabel: string;
}

export function computePayout(
  orders: OrderEcon[],
  r: RestaurantEcon,
  s: EconomySettings,
): PayoutBreakdown {
  const sum = (f: (o: OrderEcon) => number) => orders.reduce((a, o) => a + (Number(f(o)) || 0), 0);
  const grossTotal = sum((o) => o.total);
  const deliveryFeeTotal = sum((o) => o.deliveryFee);
  const tipTotal = sum((o) => o.tipAmount);
  const foodBase = Math.max(0, grossTotal - deliveryFeeTotal - tipTotal);

  const commissionPct = resolveCommissionPct(r, s);
  const commissionOre = Math.round((foodBase * commissionPct) / 100);
  const tier = tierInfo(r.featuredClass, s);
  const subscriptionOre = tier.subscriptionOre;
  const feeVatOre = Math.round(((commissionOre + subscriptionOre) * s.vatPlatformFeePct) / 100);

  // self: behåller leveransavgift + dricks → gross = total
  // platform: leveransavgift → plattform, dricks → bud → gross = foodBase
  const restaurantGrossOre = r.selfDelivery ? grossTotal : foodBase;
  // Avdragen kan överstiga intäkten (t.ex. abonnemang vid få ordrar). Då betalar
  // vi INTE ut ett negativt belopp — utbetalningen golvas vid 0 och mellanskillnaden
  // blir istället ett belopp restaurangen är skyldig oss (faktureras).
  const rawNetOre = restaurantGrossOre - commissionOre - subscriptionOre - feeVatOre;
  const payoutOre = Math.max(0, rawNetOre);
  const owedOre = Math.max(0, -rawNetOre);

  // Matmoms (inkl-moms i foodBase) — informativ rad för restaurangens egen redovisning.
  const v = s.vatCustomerPct / 100;
  const foodVatOre = v > 0 ? Math.round(foodBase - foodBase / (1 + v)) : 0;

  return {
    orderCount: orders.length,
    grossTotal,
    foodBase,
    deliveryFeeTotal,
    tipTotal,
    commissionPct,
    commissionOre,
    subscriptionOre,
    feeVatOre,
    feeVatPct: s.vatPlatformFeePct,
    restaurantGrossOre,
    payoutOre,
    owedOre,
    foodVatOre,
    foodVatPct: s.vatCustomerPct,
    tierLabel: tier.label,
  };
}
