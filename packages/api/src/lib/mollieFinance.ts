/**
 * Read-only Mollie bookkeeping data.
 *
 * Exact processing fees live in the Balances API rather than the Payments API.
 * That API needs an organization access token with `balances.read`; a normal
 * live_/test_ profile key is still used for checkout and may not have access.
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

export type MollieFeeStatus = 'available' | 'partial' | 'unavailable';

export type MollieFinanceReport = {
  feeStatus: MollieFeeStatus;
  feeError: string | null;
  feeByPaymentId: Map<string, number>;
  matchedPaymentCount: number;
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
};

type CachedReport = {
  expiresAt: number;
  report: MollieFinanceReport;
};

const reportCache = new Map<string, CachedReport>();

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
  const embeddedFees = new Map<string, number>();
  const separateFees = new Map<string, number>();

  for (const transaction of transactions) {
    const paymentId = contextPaymentId(transaction.context);
    if (!paymentId) continue;
    const type = String(transaction.type || '').toLowerCase();
    const detailedFee = exactOre(transaction.deductionDetails?.fees);
    if (detailedFee != null && detailedFee !== 0) {
      embeddedFees.set(paymentId, (embeddedFees.get(paymentId) || 0) + Math.abs(detailedFee));
      continue;
    }
    if (type !== 'payment-fee' && type !== 'reimbursement-fee') continue;
    const amount = exactOre(transaction.resultAmount)
      ?? exactOre(transaction.initialAmount)
      ?? exactOre(transaction.deductions);
    if (amount == null || amount === 0) continue;
    // A reimbursement reduces the original processing cost.
    const signed = type === 'reimbursement-fee' ? -Math.abs(amount) : Math.abs(amount);
    separateFees.set(paymentId, (separateFees.get(paymentId) || 0) + signed);
  }

  const result = new Map<string, number>();
  const paymentIds = new Set([...embeddedFees.keys(), ...separateFees.keys()]);
  for (const paymentId of paymentIds) {
    // Do not add both representations of the same fee.
    result.set(paymentId, Math.max(0, embeddedFees.get(paymentId) ?? separateFees.get(paymentId) ?? 0));
  }
  return result;
}

const stockholmDate = (date: Date) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

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
    matchedPaymentCount: 0,
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
  };
}

export async function getMollieFinanceReport(input: {
  from: Date;
  paymentIds: readonly string[];
  env?: NodeJS.ProcessEnv;
}): Promise<MollieFinanceReport> {
  const paymentIds = [...new Set(input.paymentIds.map((id) => String(id || '').trim()).filter(Boolean))].sort();
  const env = input.env ?? process.env;
  const token = reportingToken(env);
  if (!token) {
    return unavailableReport(
      'MOLLIE_REPORTING_ACCESS_TOKEN saknas (kräver balances.read)',
      paymentIds.length,
    );
  }

  const cacheKey = `${input.from.toISOString().slice(0, 10)}:${paymentIds.join(',')}`;
  const cached = reportCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.report;

  try {
    // Card/Klarna movements can become available after the order date.
    const earliest = new Date(input.from.getTime() - 45 * 24 * 60 * 60 * 1000);
    const [balance, transactions, nextSettlementResult, payoutsResult] = await Promise.all([
      mollieGet<MollieBalance>('/balances/primary', token),
      collectBalanceTransactions(token, earliest),
      mollieGet<MollieSettlement>('/settlements/next', token)
        .then((value) => ({ value, error: null }))
        .catch((error: unknown) => ({ value: null, error })),
      mollieGet<{
        _embedded?: { payouts?: MolliePayout[] };
      }>('/payouts?limit=1&sort=desc', token)
        .then((value) => ({ value, error: null }))
        .catch((error: unknown) => ({ value: null, error })),
    ]);
    const allFees = molliePaymentFeesFromTransactions(transactions);
    const feeByPaymentId = new Map<string, number>();
    for (const paymentId of paymentIds) {
      const fee = allFees.get(paymentId);
      if (fee != null) feeByPaymentId.set(paymentId, fee);
    }
    const available = exactOre(balance.availableAmount);
    const pending = exactOre(balance.pendingAmount);
    const transferFrequency = String(balance.transferFrequency || '').trim() || null;
    const nextSettlement = nextSettlementResult.value;
    const latestPayout = payoutsResult.value?._embedded?.payouts?.[0] || null;
    const settlementDate = String(nextSettlement?.settledAt || '').trim() || null;
    const scheduledDate = estimateNextMolliePayoutDate(transferFrequency);
    const matchedPaymentCount = feeByPaymentId.size;
    const report: MollieFinanceReport = {
      feeStatus: matchedPaymentCount === paymentIds.length ? 'available' : 'partial',
      feeError: matchedPaymentCount === paymentIds.length
        ? null
        : `${paymentIds.length - matchedPaymentCount} betalningar saknar bokförd Mollie-avgift`,
      feeByPaymentId,
      matchedPaymentCount,
      requestedPaymentCount: paymentIds.length,
      availableBalanceOre: available,
      pendingBalanceOre: pending,
      totalBalanceOre: available == null || pending == null ? null : available + pending,
      nextPayoutDate: settlementDate || scheduledDate,
      nextPayoutDateSource: settlementDate ? 'settlement' : scheduledDate ? 'schedule' : null,
      transferFrequency,
      nextSettlementAmountOre: exactOre(nextSettlement?.amount),
      nextSettlementStatus: String(nextSettlement?.status || '').trim() || null,
      latestPayoutAmountOre: exactOre(latestPayout?.amount),
      latestPayoutStatus: String(latestPayout?.status || '').trim() || null,
      latestPayoutCreatedAt: String(latestPayout?.createdAt || '').trim() || null,
    };
    reportCache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, report });
    return report;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MOLLIE_REPORTING_FAILED';
    const report = unavailableReport(message, paymentIds.length);
    reportCache.set(cacheKey, { expiresAt: Date.now() + ERROR_CACHE_TTL_MS, report });
    return report;
  }
}
