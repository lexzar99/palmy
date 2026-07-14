export function normalizeReferralPhone(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `46${digits.slice(1)}`;
  if (!digits.startsWith('46') && digits.length === 9 && digits.startsWith('7')) {
    digits = `46${digits}`;
  }
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

export function referralPhoneVariants(value: unknown): string[] {
  const raw = String(value ?? '').trim();
  const normalized = normalizeReferralPhone(raw);
  if (!normalized) return [];
  const rawDigits = raw.replace(/\D/g, '');
  return Array.from(new Set([normalized, normalized.slice(1), raw, rawDigits].filter(Boolean)));
}

export function isSameReferralPhone(left: unknown, right: unknown): boolean {
  const a = normalizeReferralPhone(left);
  const b = normalizeReferralPhone(right);
  return !!a && !!b && a === b;
}

export function isReferralRewardCompletion(order: {
  paymentStatus?: unknown;
  status?: unknown;
  type?: unknown;
}): boolean {
  if (String(order.paymentStatus || '').toUpperCase() !== 'PAID') return false;
  const status = String(order.status || '').toUpperCase();
  if (status === 'DELIVERED' || status === 'COMPLETED') return true;
  return String(order.type || '').toUpperCase() === 'PICKUP' && status === 'READY';
}
