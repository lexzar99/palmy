export type CommissionAgreementMode = 'GLOBAL' | 'CUSTOM';

/**
 * Only GLOBAL maps to null. A custom agreement always keeps its explicit
 * percentage, including 0 for a commission-free restaurant.
 */
export function commissionOverrideFromAgreement(
  mode: CommissionAgreementMode,
  commissionPct: unknown,
): number | null {
  if (mode === 'GLOBAL') return null;

  if (typeof commissionPct !== 'number' || !Number.isInteger(commissionPct)) {
    throw new TypeError('Egen provision måste vara ett heltal mellan 0 och 100 procent');
  }
  if (commissionPct < 0 || commissionPct > 100) {
    throw new TypeError('Egen provision måste vara mellan 0 och 100 procent');
  }
  return commissionPct;
}
