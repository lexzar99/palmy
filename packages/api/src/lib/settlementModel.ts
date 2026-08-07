/**
 * ViaEats avräkningsmodell — den enda sanningen för ekonomisidorna.
 *
 * Kunden betalar. Betalleverantören drar kortavgiften direkt. Restaurangen bär
 * både återbetalningar och alla kortavgifter. Vi tar vår provision plus moms,
 * och kan lägga en manuell justering i valfri riktning. Det som blir kvar
 * betalas ut till restaurangen.
 *
 *   netto      = brutto − återbetalningar
 *   provision  = round(netto × sats)          // ex moms
 *   moms       = round(provision × 0,25)
 *   kortavgift = avgift_försäljning + avgift_återbetalning
 *   utbetalning = netto − provision − moms − kortavgift + justering
 *   vår_intäkt  = provision − justering
 *
 * Positiv justering = restaurangen får extra. Negativ = vi drar av. Justeringen
 * går ur vår ficka, därför sänker den vår intäkt lika mycket som den höjer
 * utbetalningen.
 *
 * Inget abonnemang. Vi bär noll kortavgift.
 *
 * ALLA belopp är i ÖRE in och ut. Avrundning sker per restaurang och post,
 * aldrig på totalen — totalen är summan av de avrundade raderna, så den
 * stämmer alltid mot vad som faktiskt betalas ut.
 */

/** Moms på provisionen. Redovisas vidare, är inte vår intäkt. */
export const SETTLEMENT_VAT_PCT = 25;

export interface SettlementInput {
  /** Kundbetalningar före återbetalningar, i öre. */
  grossTotal: number;
  /** Återbetalt till kund under perioden, i öre. */
  refunds: number;
  /** Provisionssats i procent, till exempel 16 för 16 %. */
  commissionPct: number;
  /**
   * Kortavgift i öre: allt betalleverantören tagit på restaurangens ordrar i
   * perioden, inklusive avgiften på de återbetalda. En enda post — vi delar
   * inte upp den, eftersom hela beloppet ändå belastar restaurangen.
   *
   * null = avgiften är ännu inte hämtad från leverantören.
   */
  cardFees: number | null;
  /**
   * Manuell justering i öre, i den nya modellens tecken: positivt betyder att
   * restaurangen får extra, negativt att vi drar av.
   */
  adjustment?: number | null;
  /** Momssats på provisionen i procent. Default 25. */
  vatPct?: number | null;
}

export interface Settlement {
  /** brutto − återbetalningar */
  netSales: number;
  /** round(netto × sats), ex moms */
  commission: number;
  /** round(provision × momssats) */
  commissionVat: number;
  /** provision + moms */
  commissionInclVat: number;
  /**
   * Hela kortavgiften på periodens ordrar, återbetalningsavgifterna inräknade.
   * null när avgiften ännu inte är hämtad.
   */
  cardFees: number | null;
  /** Manuell justering, positivt = restaurangen får extra. */
  adjustment: number;
  /** netto − provision − moms − kortavgift + justering */
  payout: number;
  /** provision − justering */
  ourRevenue: number;
  /** Vår intäkt i procent av nettoförsäljningen. 0 när nettot är 0. */
  marginPct: number;
  /** Effektiv provisionssats i procent. */
  commissionPct: number;
  /** Momssats som användes. */
  vatPct: number;
}

const ore = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
};

const nonNegativeOre = (value: unknown): number => Math.max(0, ore(value));

const nullableOre = (value: number | null | undefined): number | null =>
  value == null || !Number.isFinite(Number(value)) ? null : Math.max(0, Math.round(Number(value)));

/**
 * Beräkna en avräkning. Ingen I/O, inget sidoeffektberoende — samma indata ger
 * alltid samma utdata, så både API, rapporter och tester kan använda den.
 *
 * Kortavgifter som ännu inte hämtats (null) räknas som 0 i utbetalningen men
 * rapporteras som null så gränssnittet kan visa "hämtas" i stället för att
 * påstå att avgiften var noll.
 */
export function computeSettlement(input: SettlementInput): Settlement {
  const grossTotal = nonNegativeOre(input.grossTotal);
  const refunds = nonNegativeOre(input.refunds);
  const netSales = grossTotal - refunds;

  const commissionPct = Number.isFinite(Number(input.commissionPct))
    ? Number(input.commissionPct)
    : 0;
  const vatPct = Number.isFinite(Number(input.vatPct)) && input.vatPct != null
    ? Number(input.vatPct)
    : SETTLEMENT_VAT_PCT;

  const commission = Math.round((netSales * commissionPct) / 100);
  const commissionVat = Math.round((commission * vatPct) / 100);

  const cardFees = nullableOre(input.cardFees);

  const adjustment = ore(input.adjustment);
  const payout = netSales - commission - commissionVat - (cardFees ?? 0) + adjustment;
  const ourRevenue = commission - adjustment;

  return {
    netSales,
    commission,
    commissionVat,
    commissionInclVat: commission + commissionVat,
    cardFees,
    adjustment,
    payout,
    ourRevenue,
    marginPct: netSales === 0 ? 0 : (ourRevenue / netSales) * 100,
    commissionPct,
    vatPct,
  };
}

export interface SettlementTotals {
  netSales: number;
  commission: number;
  commissionVat: number;
  commissionInclVat: number;
  cardFees: number | null;
  adjustment: number;
  payout: number;
  ourRevenue: number;
  marginPct: number;
}

/**
 * Summera avrundade rader. Totalen räknas aldrig om från grunden — den är
 * summan av raderna, precis som pengarna som faktiskt lämnar kontot.
 *
 * En saknad kortavgift smittar totalen: går en rads avgift inte att hämta är
 * periodens avgiftssumma okänd, inte lägre.
 */
export function sumSettlements(rows: readonly Settlement[]): SettlementTotals {
  const sumNullable = (pick: (row: Settlement) => number | null): number | null =>
    rows.every((row) => pick(row) != null)
      ? rows.reduce((total, row) => total + (pick(row) as number), 0)
      : null;

  const netSales = rows.reduce((total, row) => total + row.netSales, 0);
  const commission = rows.reduce((total, row) => total + row.commission, 0);
  const commissionVat = rows.reduce((total, row) => total + row.commissionVat, 0);
  const adjustment = rows.reduce((total, row) => total + row.adjustment, 0);
  const ourRevenue = rows.reduce((total, row) => total + row.ourRevenue, 0);

  return {
    netSales,
    commission,
    commissionVat,
    commissionInclVat: commission + commissionVat,
    cardFees: sumNullable((row) => row.cardFees),
    adjustment,
    payout: rows.reduce((total, row) => total + row.payout, 0),
    ourRevenue,
    marginPct: netSales === 0 ? 0 : (ourRevenue / netSales) * 100,
  };
}
