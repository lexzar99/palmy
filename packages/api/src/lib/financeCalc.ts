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

const tierFee = (globalFee: number, override?: number | null) =>
  override != null && Number.isFinite(override) ? Math.max(0, Math.round(override)) : globalFee;

// featuredClass: 1=Guld, 2=Silver, 3=Standard (default), 0=Dold → standard-pris.
export function tierInfo(
  featuredClass: number | null | undefined,
  s: EconomySettings,
  r: Pick<RestaurantEcon, 'tierGoldFeeOverride' | 'tierSilverFeeOverride' | 'tierStandardFeeOverride'> = {},
) {
  switch (featuredClass) {
    case 1:
      return { label: 'Guld', subscriptionOre: tierFee(s.tierGoldFee, r.tierGoldFeeOverride) };
    case 2:
      return { label: 'Silver', subscriptionOre: tierFee(s.tierSilverFee, r.tierSilverFeeOverride) };
    default:
      return { label: 'Standard', subscriptionOre: tierFee(s.tierStandardFee, r.tierStandardFeeOverride) };
  }
}

export interface RestaurantEcon {
  selfDelivery: boolean;
  commissionPctOverride: number | null;
  featuredClass: number | null;
  vatPercent?: number | null;
  // Per-restaurangens prisavtal i öre/månad. null = använd global tier-sats.
  tierGoldFeeOverride?: number | null;
  tierSilverFeeOverride?: number | null;
  tierStandardFeeOverride?: number | null;
}

/**
 * Ett explicit tal, inklusive 0, är restaurangens eget avtal. Endast null
 * betyder att den globala satsen för leveransmodellen ska användas.
 */
export function hasCommissionOverride(
  value: number | null | undefined,
): value is number {
  return value != null && Number.isFinite(value) && value >= 0 && value <= 100;
}

/** Effektiv provisionssats i procent. */
export function resolveCommissionPct(r: RestaurantEcon, s: EconomySettings): number {
  if (hasCommissionOverride(r.commissionPctOverride)) {
    return r.commissionPctOverride;
  }
  return r.selfDelivery ? s.commissionSelfPct : s.commissionPlatformPct;
}

/** En order, allt i öre. */
export interface OrderEcon {
  total: number;
  deliveryFee: number;
  tipAmount: number;
  /** Total rabatt: mat + leverans. */
  discountAmount?: number | null;
  /** Fryst matrabatt. Äldre order kan sakna den uppdelade snapshoten. */
  foodDiscountAmount?: number | null;
  /** Fryst leveransrabatt, till exempel fri leverans. */
  deliveryDiscountAmount?: number | null;
  /** Del av matrabatten som ViaEats, inte restaurangen, finansierar. */
  platformFundedFoodDiscountAmount?: number | null;
  /** Del av leveransrabatten som ViaEats finansierar. */
  platformFundedDeliveryDiscountAmount?: number | null;
  /** Kundens komplettering till minsta ordervärde. Tillfaller restaurangen. */
  smallOrderFee?: number | null;
  foodVatPercent?: number | null;
}

const nonNegativeOre = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

/**
 * Resolve the frozen checkout components without mistaking a delivery discount
 * for missing food revenue. New orders have an exact food/delivery discount
 * split. For legacy rows whose split is missing, use the same conservative
 * food-first allocation as the tax projection.
 */
export function financeOrderComponents(order: OrderEcon) {
  const total = nonNegativeOre(order.total);
  const deliveryFee = nonNegativeOre(order.deliveryFee);
  const tipAmount = nonNegativeOre(order.tipAmount);
  const smallOrderFee = nonNegativeOre(order.smallOrderFee);
  const explicitFoodDiscount = nonNegativeOre(order.foodDiscountAmount);
  const explicitDeliveryDiscount = nonNegativeOre(order.deliveryDiscountAmount);
  const explicitComponentTotal = explicitFoodDiscount + explicitDeliveryDiscount;
  const hasTotalDiscount = order.discountAmount != null && Number.isFinite(Number(order.discountAmount));
  const discountAmount = hasTotalDiscount
    ? nonNegativeOre(order.discountAmount)
    : explicitComponentTotal;
  const componentsAreComplete = explicitComponentTotal === discountAmount;

  let foodDiscountAmount = explicitFoodDiscount;
  let deliveryDiscountAmount = explicitDeliveryDiscount;
  if (!componentsAreComplete) {
    const originalFoodSubtotal = Math.max(
      0,
      total + discountAmount - deliveryFee - smallOrderFee - tipAmount,
    );
    foodDiscountAmount = Math.min(discountAmount, originalFoodSubtotal);
    deliveryDiscountAmount = Math.min(
      deliveryFee,
      Math.max(0, discountAmount - foodDiscountAmount),
    );
  }
  deliveryDiscountAmount = Math.min(deliveryFee, deliveryDiscountAmount);
  const platformFundedFoodDiscountAmount = Math.min(
    foodDiscountAmount,
    nonNegativeOre(order.platformFundedFoodDiscountAmount),
  );
  const platformFundedDeliveryDiscountAmount = Math.min(
    deliveryDiscountAmount,
    nonNegativeOre(order.platformFundedDeliveryDiscountAmount),
  );

  return {
    total,
    deliveryFee,
    discountAmount,
    foodDiscountAmount,
    deliveryDiscountAmount,
    platformFundedFoodDiscountAmount,
    platformFundedDeliveryDiscountAmount,
    netDeliveryFee: deliveryFee - deliveryDiscountAmount,
    smallOrderFee,
    tipAmount,
  };
}

export interface PayoutBreakdown {
  orderCount: number;
  // allt i ÖRE
  grossTotal: number; // summa order.total (allt kunden betalade)
  foodBase: number; // provisionsbas = total − leveransavgift − dricks
  deliveryFeeTotal: number; // leveransavgift efter eventuell leveransrabatt
  deliveryDiscountTotal: number;
  platformFundedFoodDiscountTotal: number;
  platformFundedDeliveryDiscountTotal: number;
  /** ViaEats-stöd som faktiskt ökar restaurangens brutto i leveransmodellen. */
  restaurantPlatformFundedDiscountTotal: number;
  smallOrderFeeTotal: number;
  tipTotal: number;
  restaurantTipOre: number;
  platformTipOre: number;
  commissionPct: number;
  commissionOre: number;
  subscriptionOre: number;
  feeVatOre: number; // moms på (provision + abonnemang)
  feeVatPct: number;
  restaurantGrossOre: number; // restaurangens intäkt före avdrag
  payoutOre: number; // netto att betala ut (golvat vid 0 — aldrig negativt)
  owedOre: number; // om avdragen > intäkten: vad restaurangen är skyldig oss (fakturera)
  foodVatOre: number; // informativ: moms i restaurangens matförsäljning
  foodVatPct: number | null;
  tierLabel: string;
}

export function computePayout(
  orders: OrderEcon[],
  r: RestaurantEcon,
  s: EconomySettings,
): PayoutBreakdown {
  const components = orders.map(financeOrderComponents);
  const grossTotal = components.reduce((total, row) => total + row.total, 0);
  const deliveryFeeTotal = components.reduce((total, row) => total + row.netDeliveryFee, 0);
  const deliveryDiscountTotal = components.reduce((total, row) => total + row.deliveryDiscountAmount, 0);
  const platformFundedFoodDiscountTotal = components.reduce(
    (total, row) => total + row.platformFundedFoodDiscountAmount,
    0,
  );
  const platformFundedDeliveryDiscountTotal = components.reduce(
    (total, row) => total + row.platformFundedDeliveryDiscountAmount,
    0,
  );
  const smallOrderFeeTotal = components.reduce((total, row) => total + row.smallOrderFee, 0);
  const tipTotal = components.reduce((total, row) => total + row.tipAmount, 0);
  const customerFoodBase = components.reduce(
    (total, row) => total + Math.max(0, row.total - row.netDeliveryFee - row.tipAmount),
    0,
  );
  const foodBase = customerFoodBase + platformFundedFoodDiscountTotal;
  const restaurantTipOre = r.selfDelivery ? tipTotal : 0;
  const platformTipOre = r.selfDelivery ? 0 : tipTotal;

  const commissionPct = resolveCommissionPct(r, s);
  const commissionOre = Math.round((foodBase * commissionPct) / 100);
  const tier = tierInfo(r.featuredClass, s, r);
  const subscriptionOre = tier.subscriptionOre;
  const feeVatOre = Math.round(((commissionOre + subscriptionOre) * s.vatPlatformFeePct) / 100);

  // self: behåller leveransavgift + dricks → gross = kundbelopp + ViaEats stöd
  // platform: leveransavgift → plattform, dricks → bud → gross = foodBase
  const restaurantGrossOre = r.selfDelivery
    ? grossTotal + platformFundedFoodDiscountTotal + platformFundedDeliveryDiscountTotal
    : foodBase;
  const restaurantPlatformFundedDiscountTotal = platformFundedFoodDiscountTotal +
    (r.selfDelivery ? platformFundedDeliveryDiscountTotal : 0);
  // Avdragen kan överstiga intäkten (t.ex. abonnemang vid få ordrar). Då betalar
  // vi INTE ut ett negativt belopp — utbetalningen golvas vid 0 och mellanskillnaden
  // blir istället ett belopp restaurangen är skyldig oss (faktureras).
  const rawNetOre = restaurantGrossOre - commissionOre - subscriptionOre - feeVatOre;
  const payoutOre = Math.max(0, rawNetOre);
  const owedOre = Math.max(0, -rawNetOre);

  // Matmoms (inkl-moms i foodBase) — informativ rad för restaurangens egen
  // redovisning. Orderns momssnapshot vinner så tidigare perioder inte skrivs
  // om när restaurangens nuvarande momssats ändras.
  const fallbackFoodVatPct = r.vatPercent ?? s.vatCustomerPct;
  const foodVatRates = orders.map((order) => order.foodVatPercent ?? fallbackFoodVatPct);
  const foodVatOre = orders.reduce((total, order, index) => {
    const component = components[index];
    const orderFoodBase = Math.max(
      0,
      component.total - component.netDeliveryFee - component.tipAmount,
    ) + component.platformFundedFoodDiscountAmount;
    const rate = Math.max(0, Number(foodVatRates[index] ?? 0));
    const v = rate / 100;
    return total + (v > 0 ? Math.round(orderFoodBase - orderFoodBase / (1 + v)) : 0);
  }, 0);
  const distinctFoodVatRates = [...new Set(foodVatRates.map((rate) => Number(rate)).filter(Number.isFinite))];
  const foodVatPct = distinctFoodVatRates.length === 1
    ? distinctFoodVatRates[0]
    : (orders.length === 0 ? fallbackFoodVatPct : null);

  return {
    orderCount: orders.length,
    grossTotal,
    foodBase,
    deliveryFeeTotal,
    deliveryDiscountTotal,
    platformFundedFoodDiscountTotal,
    platformFundedDeliveryDiscountTotal,
    restaurantPlatformFundedDiscountTotal,
    smallOrderFeeTotal,
    tipTotal,
    restaurantTipOre,
    platformTipOre,
    commissionPct,
    commissionOre,
    subscriptionOre,
    feeVatOre,
    feeVatPct: s.vatPlatformFeePct,
    restaurantGrossOre,
    payoutOre,
    owedOre,
    foodVatOre,
    foodVatPct,
    tierLabel: tier.label,
  };
}
