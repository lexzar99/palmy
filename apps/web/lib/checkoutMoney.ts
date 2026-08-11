const SEK_AMOUNT_FORMATTER = new Intl.NumberFormat("sv-SE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Checkout-only SEK presentation. Keep monetary calculations and API payloads
 * numeric; call this only at the UI boundary.
 */
export function formatCheckoutSek(value: number): string {
  return SEK_AMOUNT_FORMATTER.format(Number.isFinite(value) ? value : 0);
}
