/**
 * Read-only Mollie bookkeeping data.
 *
 * Exact processing fees live in the Balances API rather than the Payments API.
 * That API needs an organization access token with `balances.read` and
 * `balance-reports.read`; a normal live_/test_ profile key is still used for
 * checkout and may not have access.
 */

const MOLLIE_API_BASE = 'https://api.mollie.com/v2';
const SEK = 'SEK';
const CACHE_TTL_MS = 60_000;
const ERROR_CACHE_TTL_MS = 5 * 60_000;
const MAX_TRANSACTION_PAGES = 100;

type MollieAmount = {
  currency?: unknown;
  value?: unknown;
} | null | undefined;

type MollieBalanceTransaction = {
  id?: unknown;
  type?: unknown;
  createdAt?: unknown;
  initialAmount?: MollieAmount;
  resultAmount?: MollieAmount;
  deductions?: MollieAmount;
  deductionDetails?: {
    fees?: MollieAmount;
  } | null;
  context?: Record<string, any> | null;
};

type MollieBalance = {
  availableAmount?: MollieAmount;
  pendingAmount?: MollieAmount;
  transferFrequency?: unknown;
};

type MollieSettlement = {
  id?: unknown;
  status?: unknown;
  amount?: MollieAmount;
  settledAt?: unknown;
};

type MolliePayout = {
  id?: unknown;
  status?: unknown;
  amount?: MollieAmount;
  createdAt?: unknown;
};

type MolliePayment = {
  id?: unknown;
  amount?: MollieAmount;
  amountRefunded?: MollieAmount;
  createdAt?: unknown;
  status?: unknown;
  method?: unknown;
  details?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  description?: unknown;
};

export type MollieOrderReference = {
  id: string;
  orderNumber: string;
  refunded?: boolean;
};

const EEA_COUNTRY_CODES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR',
  'GR', 'HU', 'IE', 'IS', 'IT', 'LI', 'LT', 'LU', 'LV', 'MT', 'NL', 'NO',
  'PL', 'PT', 'RO', 'SE', 'SI', 'SK',
]);

const percentageFee = (amountOre: number, percentage: number, fixedOre: number) =>
  Math.max(0, Math.round(amountOre * percentage / 100) + fixedOre);

export function mollieRefundFeeForDisplay(input: {
  bookedFeeOre?: number | null;
}): number {
  return input.bookedFeeOre == null ? 0 : Math.max(0, Math.round(input.bookedFeeOre));
}

/**
 * Swedish standard online pricing from mollie.com/se/pricing.
 * This is only a provisional fallback; deductionDetails remains authoritative.
 */
export function estimateMollieFeeFromSwedishPricing(payment: MolliePayment): number | null {
  const amountOre = exactOre(payment.amount);
  if (amountOre == null || amountOre < 0) return null;
  const method = String(payment.method || '').trim().toLowerCase();
  const details = payment.details || {};

  if (method === 'swish') return percentageFee(amountOre, 0.9, 300);
  if (method === 'klarna') return percentageFee(amountOre, 2.99, 515);

  const isCard = ['creditcard', 'applepay', 'googlepay'].includes(method) ||
    Boolean(details.cardCountryCode || details.cardAudience || details.cardLabel);
  if (!isCard) return null;

  const label = String(details.cardLabel || '').trim().toLowerCase();
  if (label.includes('american express') || label === 'amex') {
    return percentageFee(amountOre, 2.9, 280);
  }

  const countryCode = String(details.cardCountryCode || '').trim().toUpperCase();
  const audience = String(details.cardAudience || '').trim().toLowerCase();
  if (!countryCode || (audience !== 'consumer' && audience !== 'business')) return null;
  if (!EEA_COUNTRY_CODES.has(countryCode)) return percentageFee(amountOre, 3.25, 280);
  if (audience === 'business') return percentageFee(amountOre, 2.9, 280);
  if (countryCode === 'SE') return percentageFee(amountOre, 1.2, 280);
  return percentageFee(amountOre, 1.8, 280);
}

export type MollieFeeStatus = 'available' | 'partial' | 'unavailable';
export type MollieLedgerStatus = 'exact' | 'partial' | 'unavailable';

export type MollieFinanceReport = {
  feeStatus: MollieFeeStatus;
  feeError: string | null;
  /** Fully booked payment + refund fees. Used when a report is locked. */
  feeByPaymentId: Map<string, number>;
  /** Booked fees plus a provisional estimate for payments still pending in Mollie. */
  displayFeeByPaymentId: Map<string, number>;
  estimatedFeeByPaymentId: Map<string, number>;
  paymentFeeByPaymentId: Map<string, number>;
  refundFeeByPaymentId: Map<string, number>;
  /** Booked refund fee only; no unverified refund fee is assumed. */
  displayRefundFeeByPaymentId: Map<string, number>;
  paymentIdByOrderId: Map<string, string>;
  paymentIdByOrderNumber: Map<string, string>;
  matchedPaymentCount: number;
  estimatedPaymentCount: number;
  requestedPaymentCount: number;
  availableBalanceOre: number | null;
  pendingBalanceOre: number | null;
  totalBalanceOre: number | null;
  nextPayoutDate: string | null;
  nextPayoutDateSource: 'settlement' | 'schedule' | null;
  transferFrequency: string | null;
  nextSettlementAmountOre: number | null;
  nextSettlementStatus: string | null;
  latestPayoutAmountOre: number | null;
  latestPayoutStatus: string | null;
  latestPayoutCreatedAt: string | null;
  /** Hela Mollie-kontot för vald period, inklusive betalningar utan order. */
  periodLedgerStatus: MollieLedgerStatus;
  periodReportUntil: string | null;
  periodGrossOre: number | null;
  periodRefundsOre: number | null;
  periodFeesOre: number | null;
  periodOtherMovementsOre: number | null;
  periodDifferenceOre: number | null;
  periodOpeningBalanceOre: number | null;
  periodClosingBalanceOre: number | null;
  unlinkedPaymentCount: number;
  unlinkedGrossOre: number;
  unlinkedRefundsOre: number;
  unlinkedFeesOre: number | null;
  unlinkedNetOre: number | null;
  feeCalibrationOre: number | null;
};

export function molliePaymentOrderReference(payment: MolliePayment): {
  orderId: string | null;
  orderNumber: string | null;
} {
  const metadata = payment.metadata || {};
  const orderId = String(metadata.orderId || '').trim() || null;
  const metadataOrderNumber = String(metadata.orderNumber || '').trim();
  const descriptionOrderNumber = String(payment.description || '').trim().split(/\s+[–-]\s+/)[0]?.trim() || '';
  return {
    orderId,
    orderNumber: metadataOrderNumber || descriptionOrderNumber || null,
  };
}

type CachedReport = {
  expiresAt: number;
  report: MollieFinanceReport;
};

const reportCache = new Map<string, CachedReport>();
const paymentCache = new Map<string, { expiresAt: number; payment: MolliePayment }>();

function exactOre(amount: MollieAmount): number | null {
  if (!amount) return null;
  const currency = String(amount.currency || '').toUpperCase();
  const value = String(amount.value ?? '');
  if (currency !== SEK || !/^-?\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const negative = value.startsWith('-');
  const normalized = negative ? value.slice(1) : value;
  const [whole, fraction = ''] = normalized.split('.');
  const ore = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(ore)) return null;
  return negative ? -ore : ore;
}

type MollieBalanceReportBucket = {
  amount?: MollieAmount;
  subtotals?: MollieBalanceReportBucket[];
};

type MollieBalanceReport = {
  from?: unknown;
  until?: unknown;
  totals?: Record<string, Record<string, MollieBalanceReportBucket>>;
};

const bucketOre = (bucket: MollieBalanceReportBucket | null | undefined) =>
  exactOre(bucket?.amount) ?? 0;

function balanceReportExternalMovement(
  report: MollieBalanceReport | null,
  category: string,
): number | null {
  const row = report?.totals?.[category];
  if (!row) return null;
  // movedToAvailable är bara en intern flytt från pending till available och
  // får därför aldrig räknas en gång till i periodens kassaflöde.
  return bucketOre(row.pending) + bucketOre(row.immediatelyAvailable);
}

function balanceReportBalance(
  report: MollieBalanceReport | null,
  category: 'open' | 'close',
): number | null {
  const row = report?.totals?.[category];
  if (!row) return null;
  return bucketOre(row.pending) + bucketOre(row.available);
}

export function allocateExactFeeTotal(
  feeByPaymentId: ReadonlyMap<string, number>,
  estimatedFeeByPaymentId: ReadonlyMap<string, number>,
  exactTotalOre: number,
): Map<string, number> {
  const calibrated = new Map<string, number>(feeByPaymentId);
  const estimatedRows = [...estimatedFeeByPaymentId.entries()];
  const bookedTotal = [...feeByPaymentId.values()].reduce((sum, fee) => sum + fee, 0);
  const estimatedTarget = Math.max(0, Math.round(exactTotalOre) - bookedTotal);
  if (estimatedRows.length === 0) return calibrated;

  const estimatedTotal = estimatedRows.reduce((sum, [, fee]) => sum + Math.max(0, fee), 0);
  if (estimatedTotal <= 0) {
    estimatedRows.forEach(([paymentId], index) => {
      calibrated.set(paymentId, index === 0 ? estimatedTarget : 0);
    });
    return calibrated;
  }

  const allocations = estimatedRows.map(([paymentId, fee]) => {
    const raw = estimatedTarget * Math.max(0, fee) / estimatedTotal;
    return { paymentId, allocated: Math.floor(raw), fraction: raw - Math.floor(raw) };
  });
  let remainder = estimatedTarget - allocations.reduce((sum, row) => sum + row.allocated, 0);
  allocations
    .sort((a, b) => b.fraction - a.fraction || a.paymentId.localeCompare(b.paymentId))
    .forEach((row) => {
      if (remainder <= 0) return;
      row.allocated += 1;
      remainder -= 1;
    });
  allocations.forEach((row) => calibrated.set(row.paymentId, row.allocated));
  return calibrated;
}

function contextPaymentId(context: MollieBalanceTransaction['context']): string | null {
  if (!context || typeof context !== 'object') return null;
  const direct = String(context.paymentId || '').trim();
  if (direct) return direct;
  for (const value of Object.values(context)) {
    if (!value || typeof value !== 'object') continue;
    const nested = String((value as Record<string, unknown>).paymentId || '').trim();
    if (nested) return nested;
  }
  return null;
}

/**
 * Parse fee movements without counting capital repayments, commissions or
 * reserves as payment fees. New Mollie responses expose fees directly in
 * deductionDetails; older separate `payment-fee` movements remain supported.
 */
export function molliePaymentFeesFromTransactions(
  transactions: readonly MollieBalanceTransaction[],
): Map<string, number> {
  return mollieFeeBreakdownFromTransactions(transactions).totalByPaymentId;
}

export function mollieFeeBreakdownFromTransactions(
  transactions: readonly MollieBalanceTransaction[],
): {
  totalByPaymentId: Map<string, number>;
  paymentByPaymentId: Map<string, number>;
  refundByPaymentId: Map<string, number>;
} {
  const embeddedPaymentFees = new Map<string, number>();
  const embeddedRefundFees = new Map<string, number>();
  const separatePaymentFees = new Map<string, number>();
  const separateRefundFees = new Map<string, number>();

  for (const transaction of transactions) {
    const paymentId = contextPaymentId(transaction.context);
    if (!paymentId) continue;
    const type = String(transaction.type || '').toLowerCase();
    const detailedFee = exactOre(transaction.deductionDetails?.fees);
    if (detailedFee != null && detailedFee !== 0) {
      const target = type.includes('refund') ? embeddedRefundFees : embeddedPaymentFees;
      target.set(paymentId, (target.get(paymentId) || 0) + Math.abs(detailedFee));
      continue;
    }
    if (type !== 'payment-fee' && type !== 'reimbursement-fee') continue;
    const amount = exactOre(transaction.resultAmount)
      ?? exactOre(transaction.initialAmount)
      ?? exactOre(transaction.deductions);
    if (amount == null || amount === 0) continue;
    // A reimbursement reduces the original processing cost.
    const signed = type === 'reimbursement-fee' ? -Math.abs(amount) : Math.abs(amount);
    separatePaymentFees.set(paymentId, (separatePaymentFees.get(paymentId) || 0) + signed);
  }

  const paymentByPaymentId = new Map<string, number>();
  const refundByPaymentId = new Map<string, number>();
  const totalByPaymentId = new Map<string, number>();
  const paymentIds = new Set([
    ...embeddedPaymentFees.keys(),
    ...embeddedRefundFees.keys(),
    ...separatePaymentFees.keys(),
    ...separateRefundFees.keys(),
  ]);
  for (const paymentId of paymentIds) {
    // Do not add both the embedded and legacy separate representation.
    const paymentFee = Math.max(
      0,
      embeddedPaymentFees.get(paymentId) ?? separatePaymentFees.get(paymentId) ?? 0,
    );
    const refundFee = Math.max(
      0,
      embeddedRefundFees.get(paymentId) ?? separateRefundFees.get(paymentId) ?? 0,
    );
    if (paymentFee > 0) paymentByPaymentId.set(paymentId, paymentFee);
    if (refundFee > 0) refundByPaymentId.set(paymentId, refundFee);
    totalByPaymentId.set(paymentId, paymentFee + refundFee);
  }
  return { totalByPaymentId, paymentByPaymentId, refundByPaymentId };
}

function paymentFingerprint(payment: MolliePayment): string {
  const details = payment.details || {};
  return [
    String(payment.method || '').toLowerCase(),
    String(details.cardCountryCode || '').toUpperCase(),
    String(details.cardFunding || '').toLowerCase(),
    String(details.cardAudience || '').toLowerCase(),
  ].join(':');
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

export function estimateMollieFeeFromObservations(
  amountOre: number,
  observations: readonly { amountOre: number; feeOre: number }[],
): number | null {
  if (observations.length === 0 || amountOre < 0) return null;
  const distinctAmounts = new Set(observations.map((row) => row.amountOre));
  if (observations.length >= 2 && distinctAmounts.size >= 2) {
    const meanX = observations.reduce((sum, row) => sum + row.amountOre, 0) / observations.length;
    const meanY = observations.reduce((sum, row) => sum + row.feeOre, 0) / observations.length;
    const denominator = observations.reduce(
      (sum, row) => sum + ((row.amountOre - meanX) ** 2),
      0,
    );
    if (denominator > 0) {
      const slope = Math.max(0, observations.reduce(
        (sum, row) => sum + ((row.amountOre - meanX) * (row.feeOre - meanY)),
        0,
      ) / denominator);
      const fixed = Math.max(0, meanY - (slope * meanX));
      return Math.max(0, Math.round(fixed + (slope * amountOre)));
    }
  }
  return median(observations.map((row) => row.feeOre));
}

async function collectPayments(
  token: string,
  paymentIds: readonly string[],
): Promise<Map<string, MolliePayment>> {
  const payments = new Map<string, MolliePayment>();
  const missing: string[] = [];
  for (const paymentId of paymentIds) {
    const cached = paymentCache.get(paymentId);
    if (cached && cached.expiresAt > Date.now()) {
      payments.set(paymentId, cached.payment);
    } else {
      missing.push(paymentId);
    }
  }
  for (let offset = 0; offset < missing.length; offset += 10) {
    const batch = missing.slice(offset, offset + 10);
    const results = await Promise.all(batch.map(async (paymentId) => {
      try {
        return await mollieGet<MolliePayment>(`/payments/${encodeURIComponent(paymentId)}`, token);
      } catch {
        return null;
      }
    }));
    results.forEach((payment, index) => {
      if (!payment) return;
      payments.set(batch[index], payment);
      paymentCache.set(batch[index], {
        expiresAt: Date.now() + 5 * 60_000,
        payment,
      });
    });
  }
  return payments;
}

async function collectPeriodPayments(
  token: string,
  from: Date,
  to: Date,
): Promise<MolliePayment[]> {
  const payments: MolliePayment[] = [];
  let nextUrl: string | null = `${MOLLIE_API_BASE}/payments?limit=250&sort=desc`;
  let page = 0;

  while (nextUrl && page < MAX_TRANSACTION_PAGES) {
    const payload: {
      _embedded?: { payments?: MolliePayment[] };
      _links?: { next?: { href?: unknown } | null };
    } = await mollieGet(nextUrl, token);
    const rows = payload._embedded?.payments || [];
    payments.push(...rows.filter((payment) => {
      const createdAt = new Date(String(payment.createdAt || ''));
      const status = String(payment.status || '').toLowerCase();
      return createdAt >= from && createdAt <= to &&
        ['paid', 'refunded', 'partially_refunded'].includes(status);
    }));
    page += 1;

    const oldest = rows.reduce<number | null>((value, row) => {
      const time = new Date(String(row.createdAt || '')).getTime();
      if (!Number.isFinite(time)) return value;
      return value == null ? time : Math.min(value, time);
    }, null);
    if (oldest != null && oldest < from.getTime()) break;

    const href = String(payload._links?.next?.href || '').trim();
    nextUrl = href || null;
  }
  if (page >= MAX_TRANSACTION_PAGES && nextUrl) {
    throw new Error('MOLLIE_PAYMENT_PAGINATION_LIMIT');
  }
  return payments;
}

const stockholmDate = (date: Date) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

export function mollieBalanceReportUntil(requestedTo: Date, now = new Date()): string {
  const requestedToKey = stockholmDate(requestedTo);
  const todayKey = stockholmDate(now);
  return requestedToKey < todayKey ? requestedToKey : todayKey;
}

function atStockholmNoon(date = new Date()): Date {
  const [year, month, day] = stockholmDate(date).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function nextWeekday(from: Date, allowedDays: readonly number[]): Date {
  for (let offset = 1; offset <= 14; offset += 1) {
    const candidate = new Date(from);
    candidate.setUTCDate(candidate.getUTCDate() + offset);
    if (allowedDays.includes(candidate.getUTCDay())) return candidate;
  }
  return from;
}

function firstBusinessDayOfNextMonth(from: Date): Date {
  const candidate = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1, 12));
  while (candidate.getUTCDay() === 0 || candidate.getUTCDay() === 6) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }
  return candidate;
}

export function estimateNextMolliePayoutDate(
  transferFrequency: unknown,
  now = new Date(),
): string | null {
  const frequency = String(transferFrequency || '').trim().toLowerCase().replace(/_/g, '-');
  if (!frequency || frequency === 'never' || frequency === 'manual') return null;
  const today = atStockholmNoon(now);
  let next: Date;
  if (frequency === 'daily' || frequency === 'every-business-day' || frequency === 'revenue-day') {
    next = nextWeekday(today, [1, 2, 3, 4, 5]);
  } else if (frequency === 'twice-a-week') {
    next = nextWeekday(today, [2, 5]);
  } else if (frequency === 'monthly' || frequency === 'once-a-month') {
    next = firstBusinessDayOfNextMonth(today);
  } else {
    const match = frequency.match(/(?:every|weekly-on)-(monday|tuesday|wednesday|thursday|friday)/);
    const weekday = match?.[1];
    const dayMap: Record<string, number> = {
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
    };
    if (!weekday || dayMap[weekday] == null) return null;
    next = nextWeekday(today, [dayMap[weekday]]);
  }
  return stockholmDate(next);
}

function reportingToken(env: NodeJS.ProcessEnv = process.env): string | null {
  const token = String(
    env.MOLLIE_REPORTING_ACCESS_TOKEN ||
    env.MOLLIE_ORGANIZATION_ACCESS_TOKEN ||
    '',
  ).trim();
  return token || null;
}

async function mollieGet<T>(pathOrUrl: string, token: string): Promise<T> {
  const url = pathOrUrl.startsWith('https://') ? pathOrUrl : `${MOLLIE_API_BASE}${pathOrUrl}`;
  if (!url.startsWith(`${MOLLIE_API_BASE}/`)) throw new Error('MOLLIE_INVALID_PAGINATION_URL');
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/hal+json',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: unknown } | null;
    const detail = String(body?.detail || '').trim();
    throw new Error(`MOLLIE_${response.status}${detail ? `: ${detail}` : ''}`);
  }
  return response.json() as Promise<T>;
}

async function collectBalanceTransactions(
  token: string,
  earliestRelevantAt: Date,
): Promise<MollieBalanceTransaction[]> {
  const transactions: MollieBalanceTransaction[] = [];
  let nextUrl: string | null = `${MOLLIE_API_BASE}/balances/primary/transactions?limit=250`;
  let page = 0;

  while (nextUrl && page < MAX_TRANSACTION_PAGES) {
    const payload: {
      _embedded?: { balance_transactions?: MollieBalanceTransaction[] };
      _links?: { next?: { href?: unknown } | null };
    } = await mollieGet(nextUrl, token);
    const rows = payload._embedded?.balance_transactions || [];
    transactions.push(...rows);
    page += 1;

    const oldest = rows.reduce<number | null>((value, row) => {
      const time = new Date(String(row.createdAt || '')).getTime();
      if (!Number.isFinite(time)) return value;
      return value == null ? time : Math.min(value, time);
    }, null);
    if (oldest != null && oldest < earliestRelevantAt.getTime()) break;

    const href = String(payload._links?.next?.href || '').trim();
    nextUrl = href || null;
  }
  if (page >= MAX_TRANSACTION_PAGES && nextUrl) {
    throw new Error('MOLLIE_TRANSACTION_PAGINATION_LIMIT');
  }
  return transactions;
}

function unavailableReport(message: string, requestedPaymentCount: number): MollieFinanceReport {
  return {
    feeStatus: 'unavailable',
    feeError: message,
    feeByPaymentId: new Map(),
    displayFeeByPaymentId: new Map(),
    estimatedFeeByPaymentId: new Map(),
    paymentFeeByPaymentId: new Map(),
    refundFeeByPaymentId: new Map(),
    displayRefundFeeByPaymentId: new Map(),
    paymentIdByOrderId: new Map(),
    paymentIdByOrderNumber: new Map(),
    matchedPaymentCount: 0,
    estimatedPaymentCount: 0,
    requestedPaymentCount,
    availableBalanceOre: null,
    pendingBalanceOre: null,
    totalBalanceOre: null,
    nextPayoutDate: null,
    nextPayoutDateSource: null,
    transferFrequency: null,
    nextSettlementAmountOre: null,
    nextSettlementStatus: null,
    latestPayoutAmountOre: null,
    latestPayoutStatus: null,
    latestPayoutCreatedAt: null,
    periodLedgerStatus: 'unavailable',
    periodReportUntil: null,
    periodGrossOre: null,
    periodRefundsOre: null,
    periodFeesOre: null,
    periodOtherMovementsOre: null,
    periodDifferenceOre: null,
    periodOpeningBalanceOre: null,
    periodClosingBalanceOre: null,
    unlinkedPaymentCount: 0,
    unlinkedGrossOre: 0,
    unlinkedRefundsOre: 0,
    unlinkedFeesOre: null,
    unlinkedNetOre: null,
    feeCalibrationOre: null,
  };
}

export async function getMollieFinanceReport(input: {
  from: Date;
  to?: Date;
  paymentIds: readonly string[];
  refundedPaymentIds?: readonly string[];
  orderReferences?: readonly MollieOrderReference[];
  env?: NodeJS.ProcessEnv;
}): Promise<MollieFinanceReport> {
  const explicitPaymentIds = [...new Set(input.paymentIds.map((id) => String(id || '').trim()).filter(Boolean))].sort();
  const orderReferences = (input.orderReferences || []).map((reference) => ({
    id: String(reference.id || '').trim(),
    orderNumber: String(reference.orderNumber || '').trim(),
    refunded: Boolean(reference.refunded),
  }));
  const env = input.env ?? process.env;
  const token = reportingToken(env);
  if (!token) {
    return unavailableReport(
      'MOLLIE_REPORTING_ACCESS_TOKEN saknas (kräver balances.read och balance-reports.read)',
      explicitPaymentIds.length,
    );
  }

  const cacheKey = [
    input.from.toISOString().slice(0, 10),
    (input.to || new Date()).toISOString().slice(0, 10),
    explicitPaymentIds.join(','),
    orderReferences.map((reference) => `${reference.id}:${reference.orderNumber}:${reference.refunded ? 1 : 0}`).sort().join(','),
  ].join(':');
  const cached = reportCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.report;

  try {
    // Card/Klarna movements can become available after the order date.
    const earliest = new Date(input.from.getTime() - 45 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const requestedTo = input.to && input.to < now ? input.to : now;
    const todayKey = stockholmDate(now);
    const requestedToKey = stockholmDate(requestedTo);
    // Mollie's balance report `until` is inclusive. Passing the following day
    // pulled 1 August into July (including its 8.66 SEK fee).
    const reportUntil = mollieBalanceReportUntil(requestedTo, now);
    const reportFrom = stockholmDate(input.from);
    const balanceReportPromise = reportUntil >= reportFrom
      ? mollieGet<MollieBalanceReport>(
          `/balances/primary/report?from=${encodeURIComponent(reportFrom)}&until=${encodeURIComponent(reportUntil)}&grouping=transaction-categories`,
          token,
        ).then((value) => ({ value, error: null }))
          .catch((error: unknown) => ({ value: null, error }))
      : Promise.resolve({ value: null, error: null });
    const [balance, transactions, periodPaymentsResult, balanceReportResult, nextSettlementResult, payoutsResult] = await Promise.all([
      mollieGet<MollieBalance>('/balances/primary', token),
      collectBalanceTransactions(token, earliest),
      collectPeriodPayments(token, input.from, requestedTo)
        .then((value) => ({ value, error: null }))
        .catch((error: unknown) => ({ value: null, error })),
      balanceReportPromise,
      mollieGet<MollieSettlement>('/settlements/next', token)
        .then((value) => ({ value, error: null }))
        .catch((error: unknown) => ({ value: null, error })),
      mollieGet<{
        _embedded?: { payouts?: MolliePayout[] };
      }>('/payouts?limit=1&sort=desc', token)
        .then((value) => ({ value, error: null }))
        .catch((error: unknown) => ({ value: null, error })),
    ]);
    const periodPayments = periodPaymentsResult.value;
    const orderIds = new Set(orderReferences.map((reference) => reference.id).filter(Boolean));
    const orderNumbers = new Set(orderReferences.map((reference) => reference.orderNumber).filter(Boolean));
    const paymentIdByOrderId = new Map<string, string>();
    const paymentIdByOrderNumber = new Map<string, string>();
    const inferredPaymentIds: string[] = [];
    for (const payment of periodPayments || []) {
      const paymentId = String(payment.id || '').trim();
      if (!paymentId) continue;
      const reference = molliePaymentOrderReference(payment);
      const matchesOrderId = Boolean(reference.orderId && orderIds.has(reference.orderId));
      const matchesOrderNumber = Boolean(reference.orderNumber && orderNumbers.has(reference.orderNumber));
      if (!matchesOrderId && !matchesOrderNumber) continue;
      inferredPaymentIds.push(paymentId);
      if (matchesOrderId && reference.orderId) paymentIdByOrderId.set(reference.orderId, paymentId);
      if (matchesOrderNumber && reference.orderNumber) paymentIdByOrderNumber.set(reference.orderNumber, paymentId);
    }
    const paymentIds = [...new Set([...explicitPaymentIds, ...inferredPaymentIds])].sort();
    const allFees = mollieFeeBreakdownFromTransactions(transactions);
    // Recent booked payments are also training data, so a short date range can
    // still estimate today's paid-but-not-booked transactions.
    const trainingPaymentIds = [...allFees.paymentByPaymentId.keys()].slice(0, 50);
    const payments = await collectPayments(
      token,
      [...new Set([...paymentIds, ...trainingPaymentIds])],
    );
    const feeByPaymentId = new Map<string, number>();
    const displayFeeByPaymentId = new Map<string, number>();
    const estimatedFeeByPaymentId = new Map<string, number>();
    const paymentFeeByPaymentId = new Map<string, number>();
    const refundFeeByPaymentId = new Map<string, number>();
    const displayRefundFeeByPaymentId = new Map<string, number>();

    for (const paymentId of paymentIds) {
      const paymentFee = allFees.paymentByPaymentId.get(paymentId);
      if (paymentFee != null) paymentFeeByPaymentId.set(paymentId, paymentFee);
      const refundFee = allFees.refundByPaymentId.get(paymentId);
      if (refundFee != null) refundFeeByPaymentId.set(paymentId, refundFee);
    }

    const observationsByFingerprint = new Map<string, Array<{ amountOre: number; feeOre: number }>>();
    const observationsByMethod = new Map<string, Array<{ amountOre: number; feeOre: number }>>();
    for (const [paymentId, paymentFee] of allFees.paymentByPaymentId) {
      const payment = payments.get(paymentId);
      const amountOre = exactOre(payment?.amount);
      if (!payment || amountOre == null) continue;
      const fingerprint = paymentFingerprint(payment);
      const method = String(payment.method || '').toLowerCase();
      const fingerprintRows = observationsByFingerprint.get(fingerprint) || [];
      fingerprintRows.push({ amountOre, feeOre: paymentFee });
      observationsByFingerprint.set(fingerprint, fingerprintRows);
      const methodRows = observationsByMethod.get(method) || [];
      methodRows.push({ amountOre, feeOre: paymentFee });
      observationsByMethod.set(method, methodRows);
    }
    for (const paymentId of paymentIds) {
      const payment = payments.get(paymentId);
      const amountOre = exactOre(payment?.amount);
      if (!payment || amountOre == null) continue;
      const bookedPaymentFee = paymentFeeByPaymentId.get(paymentId);
      const method = String(payment.method || '').toLowerCase();
      const bookedRefundFee = refundFeeByPaymentId.get(paymentId);
      const displayRefundFee = mollieRefundFeeForDisplay({
        bookedFeeOre: bookedRefundFee,
      });
      displayRefundFeeByPaymentId.set(paymentId, displayRefundFee);

      if (bookedPaymentFee != null) {
        const exactFee = bookedPaymentFee + (bookedRefundFee || 0);
        feeByPaymentId.set(paymentId, exactFee);
        displayFeeByPaymentId.set(paymentId, exactFee);
        continue;
      }
      const estimatedPaymentFee = bookedPaymentFee ??
        estimateMollieFeeFromSwedishPricing(payment) ??
        estimateMollieFeeFromObservations(
          amountOre,
          observationsByFingerprint.get(paymentFingerprint(payment))
            || observationsByMethod.get(method)
            || [],
        );
      if (estimatedPaymentFee == null) continue;
      const estimatedTotal = estimatedPaymentFee + displayRefundFee;
      displayFeeByPaymentId.set(paymentId, estimatedTotal);
      estimatedFeeByPaymentId.set(paymentId, estimatedTotal);
    }
    const available = exactOre(balance.availableAmount);
    const pending = exactOre(balance.pendingAmount);
    const totalBalance = available == null || pending == null ? null : available + pending;
    const balanceReport = balanceReportResult.value;
    const reportOpeningBalance = balanceReportBalance(balanceReport, 'open');
    const reportClosingBalance = balanceReportBalance(balanceReport, 'close');
    const balanceReportFees = balanceReportExternalMovement(balanceReport, 'fee-prepayments');
    const reportOtherMovements = balanceReport
      ? ['chargebacks', 'capital', 'transfers', 'corrections', 'topups']
          .reduce((sum, category) =>
            sum + (balanceReportExternalMovement(balanceReport, category) || 0),
          0)
      : null;
    const reportCoversRequestedPeriod = Boolean(balanceReport) && (
      requestedToKey < todayKey ||
      (reportClosingBalance != null && totalBalance != null && reportClosingBalance === totalBalance)
    );
    const periodGross = periodPayments
      ? periodPayments.reduce((sum, payment) => sum + Math.max(0, exactOre(payment.amount) || 0), 0)
      : null;
    const periodRefunds = periodPayments
      ? periodPayments.reduce((sum, payment) => sum + Math.max(0, exactOre(payment.amountRefunded) || 0), 0)
      : null;
    const periodPaymentIds = periodPayments
      ? periodPayments.map((payment) => String(payment.id || '').trim()).filter(Boolean)
      : [];
    const transactionFeesComplete = periodPaymentIds.every((paymentId) =>
      allFees.totalByPaymentId.has(paymentId)
    );
    const transactionPeriodFees = periodPayments && transactionFeesComplete
      ? periodPaymentIds.reduce(
          (sum, paymentId) => sum + (allFees.totalByPaymentId.get(paymentId) || 0),
          0,
        )
      : null;
    const requestedPaymentIds = new Set(paymentIds);
    const unlinkedPayments = periodPayments
      ? periodPayments.filter((payment) => {
          const paymentId = String(payment.id || '').trim();
          return paymentId && !requestedPaymentIds.has(paymentId);
        })
      : [];
    const unlinkedPaymentIds = unlinkedPayments
      .map((payment) => String(payment.id || '').trim())
      .filter(Boolean);
    const unlinkedGross = unlinkedPayments.reduce(
      (sum, payment) => sum + Math.max(0, exactOre(payment.amount) || 0),
      0,
    );
    const unlinkedRefunds = unlinkedPayments.reduce(
      (sum, payment) => sum + Math.max(0, exactOre(payment.amountRefunded) || 0),
      0,
    );
    const unlinkedFeesComplete = unlinkedPaymentIds.every((paymentId) =>
      allFees.totalByPaymentId.has(paymentId)
    );
    const unlinkedFees = unlinkedFeesComplete
      ? unlinkedPaymentIds.reduce(
          (sum, paymentId) => sum + (allFees.totalByPaymentId.get(paymentId) || 0),
          0,
        )
      : null;
    const exactPeriodFees = requestedToKey < todayKey && transactionPeriodFees != null
      ? transactionPeriodFees
      : reportCoversRequestedPeriod && balanceReportFees != null
        ? Math.abs(balanceReportFees)
      : null;
    const periodDifference = (
      reportCoversRequestedPeriod &&
      reportOpeningBalance != null &&
      reportClosingBalance != null &&
      periodGross != null &&
      periodRefunds != null &&
      exactPeriodFees != null &&
      reportOtherMovements != null
    )
      ? reportClosingBalance - (
          reportOpeningBalance +
          periodGross -
          periodRefunds -
          exactPeriodFees +
          reportOtherMovements
      )
      : null;
    // Keep provisional fees untouched. The reconciliation must show the
    // difference against Mollie's booked ledger instead of hiding unmatched
    // charges by distributing them across restaurant transactions.
    const feeCalibrationOre: number | null = null;
    const transferFrequency = String(balance.transferFrequency || '').trim() || null;
    const nextSettlement = nextSettlementResult.value;
    const latestPayout = payoutsResult.value?._embedded?.payouts?.[0] || null;
    const settlementDate = String(nextSettlement?.settledAt || '').trim() || null;
    const scheduledDate = estimateNextMolliePayoutDate(transferFrequency);
    const matchedPaymentCount = feeByPaymentId.size;
    const estimatedPaymentCount = estimatedFeeByPaymentId.size;
    const missingPaymentCount = paymentIds.length - matchedPaymentCount - estimatedPaymentCount;
    const report: MollieFinanceReport = {
      feeStatus: matchedPaymentCount === paymentIds.length ? 'available' : 'partial',
      feeError: matchedPaymentCount === paymentIds.length
        ? null
        : missingPaymentCount > 0
          ? `${estimatedPaymentCount} avgifter är preliminära och ${missingPaymentCount} kunde inte beräknas`
          : `${estimatedPaymentCount} avgifter är preliminära tills Mollie bokför dem`,
      feeByPaymentId,
      displayFeeByPaymentId,
      estimatedFeeByPaymentId,
      paymentFeeByPaymentId,
      refundFeeByPaymentId,
      displayRefundFeeByPaymentId,
      paymentIdByOrderId,
      paymentIdByOrderNumber,
      matchedPaymentCount,
      estimatedPaymentCount,
      requestedPaymentCount: paymentIds.length,
      availableBalanceOre: available,
      pendingBalanceOre: pending,
      totalBalanceOre: totalBalance,
      nextPayoutDate: settlementDate || scheduledDate,
      nextPayoutDateSource: settlementDate ? 'settlement' : scheduledDate ? 'schedule' : null,
      transferFrequency,
      nextSettlementAmountOre: exactOre(nextSettlement?.amount),
      nextSettlementStatus: String(nextSettlement?.status || '').trim() || null,
      latestPayoutAmountOre: exactOre(latestPayout?.amount),
      latestPayoutStatus: String(latestPayout?.status || '').trim() || null,
      latestPayoutCreatedAt: String(latestPayout?.createdAt || '').trim() || null,
      periodLedgerStatus: exactPeriodFees != null
        ? 'exact'
        : balanceReport || periodPayments
          ? 'partial'
          : 'unavailable',
      periodReportUntil: String(balanceReport?.until || '').trim() || null,
      periodGrossOre: periodGross,
      periodRefundsOre: periodRefunds,
      periodFeesOre: exactPeriodFees,
      periodOtherMovementsOre: reportOtherMovements,
      periodDifferenceOre: periodDifference,
      periodOpeningBalanceOre: reportOpeningBalance,
      periodClosingBalanceOre: reportClosingBalance,
      unlinkedPaymentCount: unlinkedPayments.length,
      unlinkedGrossOre: unlinkedGross,
      unlinkedRefundsOre: unlinkedRefunds,
      unlinkedFeesOre: unlinkedFees,
      unlinkedNetOre: unlinkedFees == null
        ? null
        : Math.max(0, unlinkedGross - unlinkedRefunds - unlinkedFees),
      feeCalibrationOre,
    };
    reportCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, report });
    return report;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MOLLIE_REPORTING_FAILED';
    const report = unavailableReport(message, explicitPaymentIds.length);
    reportCache.set(cacheKey, { expiresAt: Date.now() + ERROR_CACHE_TTL_MS, report });
    return report;
  }
}
