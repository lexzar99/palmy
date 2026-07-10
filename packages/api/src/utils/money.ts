export const SEK_CURRENCY = 'SEK' as const;

export interface MoneyDto {
  amountMinor: number;
  currency: typeof SEK_CURRENCY;
}

const MAX_MONEY_ORE = 1_000_000_000;

const finiteNumber = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${field} måste vara ett ändligt number`);
  }
  return value;
};

/** Parse an explicitly minor-unit SEK value (ore). No guessing or conversion. */
export function parseOre(value: unknown, field = 'amountOre'): number {
  const amount = finiteNumber(value, field);
  if (!Number.isInteger(amount)) throw new TypeError(`${field} måste vara ett heltal i öre`);
  if (amount < 0 || amount > MAX_MONEY_ORE) {
    throw new RangeError(`${field} måste vara 0-${MAX_MONEY_ORE} öre`);
  }
  return amount;
}

/** Parse an explicitly major-unit SEK value and convert it to ore. */
export function sekToOre(value: unknown, field = 'amountSek'): number {
  const amount = finiteNumber(value, field);
  if (amount < 0 || amount * 100 > MAX_MONEY_ORE) {
    throw new RangeError(`${field} ligger utanför tillåtet intervall`);
  }
  return Math.round((amount + Number.EPSILON) * 100);
}

export const oreToSek = (amountOre: number | null | undefined): number =>
  parseOre(amountOre ?? 0) / 100;

export const moneyDto = (amountOre: number | null | undefined): MoneyDto => ({
  amountMinor: parseOre(amountOre ?? 0),
  currency: SEK_CURRENCY,
});

export function nullableMoneyDto(amountOre: number | null | undefined): MoneyDto | null {
  return amountOre == null ? null : moneyDto(amountOre);
}
