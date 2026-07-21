import { createHash } from 'node:crypto';
import prisma from '../prisma';
import type { RemoteRefundState, RemoteRefundStatus } from './types';

export type RefundLedgerProvider = 'mollie' | 'stripe' | 'adyen';
export type RefundLedgerSource =
  | 'ADMIN'
  | 'WEBHOOK'
  | 'REFUND_RECONCILE'
  | 'PAYOUT_PREFLIGHT'
  | 'PAYMENT_STATUS'
  | 'STRIPE_SYNC'
  | 'ADYEN_WEBHOOK';
export type RefundLedgerStatus =
  | 'REQUESTED'
  | 'QUEUED'
  | 'PENDING'
  | 'PROCESSING'
  | 'REFUNDED'
  | 'FAILED'
  | 'CANCELED'
  | 'UNKNOWN';

export function normalizeRefundLedgerStatus(
  status: RemoteRefundState | RefundLedgerStatus | string | null | undefined,
): RefundLedgerStatus {
  switch (String(status || '').toLowerCase()) {
    case 'requested': return 'REQUESTED';
    case 'queued': return 'QUEUED';
    case 'pending': return 'PENDING';
    case 'processing': return 'PROCESSING';
    case 'refunded':
    case 'succeeded': return 'REFUNDED';
    case 'failed': return 'FAILED';
    case 'canceled':
    case 'cancelled': return 'CANCELED';
    default: return 'UNKNOWN';
  }
}

/**
 * Never regress a terminal PSP lifecycle. Mollie has one observed exception to
 * the active-state ordering: a create response can say pending and a later
 * authoritative read can say queued while it waits for available balance.
 */
export function mergeRefundLedgerStatus(
  existing: RefundLedgerStatus | string,
  incoming: RefundLedgerStatus | string,
): RefundLedgerStatus {
  const current = normalizeRefundLedgerStatus(existing);
  const next = normalizeRefundLedgerStatus(incoming);
  if (current === 'REFUNDED' || next === 'REFUNDED') return 'REFUNDED';
  if (current === 'FAILED' || current === 'CANCELED') return current;
  if (next === 'FAILED' || next === 'CANCELED') return next;
  if (next === 'UNKNOWN') return current;
  if (next === 'REQUESTED') return current;
  if (current === 'PENDING' && next === 'QUEUED') return 'QUEUED';
  const rank: Record<RefundLedgerStatus, number> = {
    UNKNOWN: 0,
    REQUESTED: 1,
    QUEUED: 2,
    PENDING: 3,
    PROCESSING: 4,
    REFUNDED: 5,
    FAILED: 5,
    CANCELED: 5,
  };
  return rank[next] >= rank[current] ? next : current;
}

/**
 * Give each remote refund its own chronological cumulative target. PSP lists
 * are commonly newest-first, while their aggregate amount is the final total;
 * copying that final total onto every partial refund would make the audit trail
 * misleading. Failed/canceled attempts get an attempted target but do not
 * increase the running successful/in-flight total.
 */
export function withCumulativeRefundAmounts(
  refunds: readonly RemoteRefundStatus[],
): RemoteRefundStatus[] {
  const ordered = refunds
    .map((refund, index) => ({ refund, index }))
    .sort((a, b) => {
      const left = a.refund.createdAt ? new Date(a.refund.createdAt).getTime() : Number.NaN;
      const right = b.refund.createdAt ? new Date(b.refund.createdAt).getTime() : Number.NaN;
      return Number.isFinite(left) && Number.isFinite(right) && left !== right
        ? left - right
        : a.index - b.index;
    });
  let running = 0;
  return ordered.map(({ refund }) => {
    const amount = Math.max(0, Math.round(refund.amountOre));
    const terminalFailure = refund.state === 'failed' || refund.state === 'canceled';
    const supplied = refund.cumulativeAmountOre == null
      ? null
      : Math.max(amount, Math.round(refund.cumulativeAmountOre));
    if (!terminalFailure) {
      running = supplied == null ? running + amount : Math.max(running, supplied);
    }
    return {
      ...refund,
      cumulativeAmountOre: supplied ?? Math.max(amount, running + (terminalFailure ? amount : 0)),
    };
  });
}

export function remoteRefundIdempotencyKey(
  provider: RefundLedgerProvider,
  orderId: string,
  refundRef: string,
): string {
  const digest = createHash('sha256')
    .update(`viaeats-remote-refund-v1\0${provider}\0${orderId}\0${refundRef}`, 'utf8')
    .digest('hex');
  return `ve-remote-ref-${digest.slice(0, 48)}`;
}

function isUniqueConflict(error: any): boolean {
  return error?.code === 'P2002' || error?.code === '23505';
}

function parsedProviderCreatedAt(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function lifecycleData(existingStatus: string, incomingStatus: string, now = new Date()) {
  const current = normalizeRefundLedgerStatus(existingStatus);
  const status = mergeRefundLedgerStatus(existingStatus, incomingStatus);
  return {
    status,
    lastSeenAt: now,
    ...(status === 'REFUNDED' && current !== 'REFUNDED' ? { completedAt: now } : {}),
    ...((status === 'FAILED' || status === 'CANCELED') && current !== 'FAILED' && current !== 'CANCELED'
      ? { failedAt: now }
      : {}),
  };
}

function assertPositiveEconomicValues(amount: number, cumulativeAmount: number) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Refund-ledgern kräver ett positivt heltalsbelopp i öre');
  }
  if (!Number.isInteger(cumulativeAmount) || cumulativeAmount < amount) {
    throw new Error('Refund-ledgerns kumulativa belopp får inte understiga refundbeloppet');
  }
}

function assertSameRefund(existing: any, expected: {
  orderId: string;
  provider: RefundLedgerProvider;
  paymentRef: string;
  amount: number;
}) {
  if (
    existing.orderId !== expected.orderId ||
    existing.provider !== expected.provider ||
    existing.paymentRef !== expected.paymentRef ||
    existing.amount !== expected.amount
  ) {
    throw new Error('Refund-ledgerkonflikt: samma dedupe-nyckel beskriver olika ekonomiska poster');
  }
}

export async function recordRefundRequest(input: {
  orderId: string;
  provider: RefundLedgerProvider;
  paymentRef: string;
  idempotencyKey: string;
  amountOre: number;
  cumulativeAmountOre: number;
  actorAdminId?: string | null;
  reason?: string | null;
}, db: any = prisma): Promise<any> {
  const amount = Math.round(input.amountOre);
  const cumulativeAmount = Math.round(input.cumulativeAmountOre);
  assertPositiveEconomicValues(amount, cumulativeAmount);
  const existing = await db.paymentRefund.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    assertSameRefund(existing, { ...input, amount });
    if (existing.cumulativeAmount !== cumulativeAmount) {
      throw new Error('Refund-ledgerkonflikt: idempotency-nyckeln har ett annat kumulativt belopp');
    }
    return db.paymentRefund.update({
      where: { id: existing.id },
      data: lifecycleData(existing.status, 'REQUESTED'),
    });
  }

  const raced = await db.paymentRefund.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: { lastSeenAt: new Date() },
    create: {
        orderId: input.orderId,
        provider: input.provider,
        paymentRef: input.paymentRef,
        idempotencyKey: input.idempotencyKey,
        amount,
        cumulativeAmount,
        status: 'REQUESTED',
        source: 'ADMIN',
        actorAdminId: input.actorAdminId || null,
        reason: input.reason || null,
    },
  });
  assertSameRefund(raced, { ...input, amount });
  if (raced.cumulativeAmount !== cumulativeAmount) {
    throw new Error('Refund-ledgerkonflikt: idempotency-nyckeln har ett annat kumulativt belopp');
  }
  return raced.status === 'REQUESTED'
    ? raced
    : db.paymentRefund.update({
        where: { id: raced.id },
        data: lifecycleData(raced.status, 'REQUESTED'),
      });
}

export async function recordRefundProviderResponse(input: {
  idempotencyKey: string;
  provider: RefundLedgerProvider;
  refundRef?: string | null;
  status?: RemoteRefundState | string | null;
  providerCreatedAt?: Date | string | null;
}, db: any = prisma): Promise<any> {
  const existing = await db.paymentRefund.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (!existing || existing.provider !== input.provider) {
    throw new Error('Refund-ledgerpost saknas för PSP-svaret');
  }
  if (input.refundRef && existing.refundRef && existing.refundRef !== input.refundRef) {
    throw new Error('Refund-ledgerkonflikt: idempotency-nyckeln gav en annan PSP-referens');
  }
  const providerCreatedAt = parsedProviderCreatedAt(input.providerCreatedAt);
  const requestedBecameAmbiguous =
    normalizeRefundLedgerStatus(existing.status) === 'REQUESTED' &&
    normalizeRefundLedgerStatus(input.status) === 'UNKNOWN';
  try {
    return await db.paymentRefund.update({
      where: { id: existing.id },
      data: {
        ...(requestedBecameAmbiguous
          ? { status: 'UNKNOWN', lastSeenAt: new Date() }
          : lifecycleData(existing.status, input.status || 'unknown')),
        ...(!existing.refundRef && input.refundRef ? { refundRef: input.refundRef } : {}),
        ...(!existing.providerCreatedAt && providerCreatedAt ? { providerCreatedAt } : {}),
      },
    });
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    if (!input.refundRef) throw error;
    const raced = await db.paymentRefund.findFirst({
      where: { provider: input.provider, refundRef: input.refundRef },
    });
    if (!raced || raced.id !== existing.id) {
      throw new Error('Refund-ledgerkonflikt: PSP-referensen används redan av en annan refund');
    }
    return raced;
  }
}

async function updateKnownRefund(existing: any, refund: RemoteRefundStatus, db: any) {
  const providerCreatedAt = parsedProviderCreatedAt(refund.createdAt);
  return db.paymentRefund.update({
    where: { id: existing.id },
    data: {
      ...lifecycleData(existing.status, refund.state),
      ...(!existing.refundRef ? { refundRef: refund.refundRef } : {}),
      ...(!existing.providerCreatedAt && providerCreatedAt ? { providerCreatedAt } : {}),
    },
  });
}

/** Upsert every concrete PSP refund seen by a webhook, poller or payout audit. */
export async function recordKnownRemoteRefunds(input: {
  orderId: string;
  provider: RefundLedgerProvider;
  paymentRef: string;
  cumulativeRefundOre: number;
  refunds?: readonly RemoteRefundStatus[];
  source: RefundLedgerSource;
}, db: any = prisma): Promise<any[]> {
  const rows: any[] = [];
  for (const refund of withCumulativeRefundAmounts(input.refunds || [])) {
    const amount = Math.round(refund.amountOre);
    const cumulativeAmount = Math.max(
      amount,
      Math.round(refund.cumulativeAmountOre ?? input.cumulativeRefundOre),
    );
    assertPositiveEconomicValues(amount, cumulativeAmount);

    let existing = await db.paymentRefund.findFirst({
      where: { provider: input.provider, refundRef: refund.refundRef },
    });
    if (existing) {
      assertSameRefund(existing, { ...input, amount });
      rows.push(await updateKnownRefund(existing, refund, db));
      continue;
    }

    // Bridge the crash window after a successful PSP response but before its
    // reference was attached to the ADMIN request row. Only adopt an
    // unambiguous single candidate; otherwise create separate evidence.
    const unresolved = await db.paymentRefund.findMany({
      where: {
        orderId: input.orderId,
        provider: input.provider,
        paymentRef: input.paymentRef,
        refundRef: null,
        amount,
        status: { in: ['REQUESTED', 'QUEUED', 'PENDING', 'PROCESSING', 'UNKNOWN'] },
      },
      orderBy: { createdAt: 'asc' },
      take: 2,
    });
    if (unresolved.length === 1) {
      try {
        rows.push(await updateKnownRefund(unresolved[0], refund, db));
        continue;
      } catch (error) {
        if (!isUniqueConflict(error)) throw error;
        existing = await db.paymentRefund.findFirst({
          where: { provider: input.provider, refundRef: refund.refundRef },
        });
        if (existing) {
          assertSameRefund(existing, { ...input, amount });
          rows.push(await updateKnownRefund(existing, refund, db));
          continue;
        }
        throw error;
      }
    }

    const idempotencyKey = remoteRefundIdempotencyKey(
      input.provider,
      input.orderId,
      refund.refundRef,
    );
    try {
      rows.push(await db.paymentRefund.create({
        data: {
          orderId: input.orderId,
          provider: input.provider,
          paymentRef: input.paymentRef,
          refundRef: refund.refundRef,
          idempotencyKey,
          amount,
          cumulativeAmount,
          status: normalizeRefundLedgerStatus(refund.state),
          source: input.source,
          actorAdminId: null,
          reason: null,
          providerCreatedAt: parsedProviderCreatedAt(refund.createdAt),
          ...(normalizeRefundLedgerStatus(refund.state) === 'REFUNDED'
            ? { completedAt: new Date() }
            : normalizeRefundLedgerStatus(refund.state) === 'FAILED' || normalizeRefundLedgerStatus(refund.state) === 'CANCELED'
              ? { failedAt: new Date() }
              : {}),
        },
      }));
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      existing = await db.paymentRefund.findFirst({
        where: {
          OR: [
            { idempotencyKey },
            { provider: input.provider, refundRef: refund.refundRef },
          ],
        },
      });
      if (!existing) throw error;
      assertSameRefund(existing, { ...input, amount });
      rows.push(await updateKnownRefund(existing, refund, db));
    }
  }
  return rows;
}
