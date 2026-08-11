/**
 * Provider-neutral reconcile-poller — skyddsnät om en webhook missas, och
 * PRIMÄR finaliseringskälla i lokal dev (där Mollie inte kan nå localhost-
 * webhooken). Pollar AWAITING_PAYMENT-orders mot PSP:n och finaliserar.
 *
 * Mirror av den gamla Stripe-reconcilen, men via det neutrala interfacet.
 */
import prisma from '../prisma';
import { getPaymentProviderByName } from './index';
import { finalizePaymentSuccess, finalizePaymentFailed, repairPaymentBusinessEffects } from './finalize';
import type { PaymentProviderName } from './finalize';
import { syncRemoteRefundOutcome } from './refundPersistence';
import { recordRefundProviderResponse } from './refundLedger';
import { announceFullRefund } from './refundNotifications';
import {
  buildPayoutProviderAuditFingerprint,
  PAYOUT_NON_TEST_ORDER_FILTER,
  PAYOUT_ORDER_STATUSES,
  PAYOUT_PAYMENT_STATUSES,
  PayoutProviderAuditStaleError,
  type PayoutProviderAuditOrder,
} from '../payoutPolicy';

const REFUND_AUDIT_BATCH_SIZE = 50;
const PAYOUT_SOURCE_AUDIT_BATCH_SIZE = 50;
let mollieActiveRefundCursor: string | null = null;
let mollieRefundAuditCursor: string | null = null;

type MollieRefundAuditOrder = {
  id: string;
  molliePaymentId: string | null;
};

/** PSP-referensen för en order beror på providern. */
function refOf(
  order: { molliePaymentId: string | null; swishPaymentId: string | null; stripePaymentIntentId: string | null; adyenSessionId: string | null },
  providerName: string,
) {
  if (providerName === 'mollie') return order.molliePaymentId;
  if (providerName === 'swish') return order.swishPaymentId;
  if (providerName === 'stripe') return order.stripePaymentIntentId;
  if (providerName === 'adyen') return order.adyenSessionId; // Adyen finaliserar via webhook; getRemoteStatus = 'pending'
  return null;
}

export async function reconcilePendingPayments(): Promise<void> {
  const now = Date.now();
  const minAge = new Date(now - 30_000); // minst 30s gammal (hinner inte race:a checkouten)
  const maxAge = new Date(now - 24 * 3600_000); // äldre = övergivet

  const pending = await prisma.order.findMany({
    where: {
      status: 'AWAITING_PAYMENT',
      createdAt: { lt: minAge, gt: maxAge },
    },
    select: {
      id: true,
      orderNumber: true,
      paymentProvider: true,
      molliePaymentId: true,
      swishPaymentId: true,
      stripePaymentIntentId: true,
      adyenSessionId: true,
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });
  for (const order of pending) {
    if (!['mollie', 'stripe', 'adyen', 'swish'].includes(order.paymentProvider)) continue;
    const provider = getPaymentProviderByName(order.paymentProvider as PaymentProviderName);
    const ref = refOf(order, provider.name);
    if (!ref) continue;
    try {
      const status = await provider.getRemoteStatus(ref);
      if (status.state === 'paid') {
        await finalizePaymentSuccess(order.id, {
          provider: provider.name,
          ref: status.paymentIntentId || ref,
          amountReceivedOre: status.amountReceivedOre ?? 0,
          method: status.method,
        });
      } else if (status.state === 'failed' || status.state === 'canceled' || status.state === 'expired') {
        await finalizePaymentFailed(order.id, { provider: provider.name, ref, reason: status.state });
      }
      // 'open' / 'pending' → låt kunden slutföra; nästa poll fångar det.
    } catch (err: any) {
      console.error(`[reconcile] kunde inte hämta status för ${ref}:`, err?.message);
    }
  }

  // Repair a crash between the PAID compare-and-swap and its idempotent
  // coupon/referral counters. Historic paid rows were backfilled as complete.
  const incompleteEffects = await prisma.order.findMany({
    where: { paymentStatus: 'PAID', paymentEffectsCompletedAt: null },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: 25,
  });
  for (const order of incompleteEffects) {
    await repairPaymentBusinessEffects(order.id);
  }
}

async function reconcileMollieRefundOrder(
  order: MollieRefundAuditOrder,
  source: 'REFUND_RECONCILE' | 'PAYOUT_PREFLIGHT',
): Promise<void> {
  if (!order.molliePaymentId) return;
  const provider = getPaymentProviderByName('mollie');
  const remote = await provider.getRemoteStatus(order.molliePaymentId);
  const sync = await syncRemoteRefundOutcome({
    orderId: order.id,
    paymentRef: order.molliePaymentId,
    paidAmountOre: remote.amountReceivedOre ?? 0,
    cumulativeRefundOre: remote.amountRefundedOre ?? 0,
    provider: 'mollie',
    source,
    refunds: remote.refunds,
  });
  if (source === 'PAYOUT_PREFLIGHT' && sync.pending) {
    throw new Error(`Refund för order ${order.id} behandlas fortfarande hos Mollie`);
  }
  if (sync.changed && sync.fullRefund) {
    await announceFullRefund(
      order.id,
      sync.restaurantId,
      sync.orderStatus === 'REJECTED' ? 'REJECTED' : 'CANCELLED',
    );
  }

  // Crash recovery for the tiny but unavoidable boundary between the atomic
  // DB intent+lock commit and the external PSP request. Reusing the exact
  // Mollie idempotency key either returns the original refund or creates it
  // once; payout preflight never initiates work and blocks instead.
  const unresolvedIntent = await prisma.paymentRefund.findFirst({
    where: {
      orderId: order.id,
      provider: 'mollie',
      paymentRef: order.molliePaymentId,
      refundRef: null,
      status: { in: ['REQUESTED', 'UNKNOWN'] },
    },
    orderBy: { createdAt: 'asc' },
  });
  if (!unresolvedIntent) return;
  if (source === 'PAYOUT_PREFLIGHT') {
    throw new Error(`Refund-intent för order ${order.id} saknar slutligt PSP-svar`);
  }

  let resumed: Awaited<ReturnType<typeof provider.refund>>;
  try {
    resumed = await provider.refund(
      order.molliePaymentId,
      unresolvedIntent.amount,
      unresolvedIntent.idempotencyKey,
    );
  } catch (error) {
    await recordRefundProviderResponse({
      idempotencyKey: unresolvedIntent.idempotencyKey,
      provider: 'mollie',
      status: 'unknown',
    });
    throw error;
  }
  await recordRefundProviderResponse({
    idempotencyKey: unresolvedIntent.idempotencyKey,
    provider: 'mollie',
    refundRef: resumed.refundRef,
    status: resumed.status,
  });

  const resumedState = resumed.status ?? 'unknown';
  const resumedSync = await syncRemoteRefundOutcome({
    orderId: order.id,
    paymentRef: order.molliePaymentId,
    paidAmountOre: remote.amountReceivedOre ?? 0,
    cumulativeRefundOre: resumedState === 'refunded'
      ? Math.max(remote.amountRefundedOre ?? 0, unresolvedIntent.cumulativeAmount)
      : remote.amountRefundedOre ?? 0,
    provider: 'mollie',
    source: 'REFUND_RECONCILE',
    refunds: [
      ...(remote.refunds || []),
      {
        refundRef: resumed.refundRef,
        state: resumedState,
        amountOre: unresolvedIntent.amount,
        cumulativeAmountOre: unresolvedIntent.cumulativeAmount,
      },
    ],
  });
  if (resumedSync.changed && resumedSync.fullRefund) {
    await announceFullRefund(
      order.id,
      resumedSync.restaurantId,
      resumedSync.orderStatus === 'REJECTED' ? 'REJECTED' : 'CANCELLED',
    );
  }
}

async function reconcileMollieRefundBatch(
  orders: MollieRefundAuditOrder[],
  failClosed: boolean,
  source: 'REFUND_RECONCILE' | 'PAYOUT_PREFLIGHT',
): Promise<void> {
  // Keep PSP concurrency deliberately small. A large payout period must still
  // be fully audited, but it must not burst Mollie's API or silently cap rows.
  for (let offset = 0; offset < orders.length; offset += 5) {
    const chunk = orders.slice(offset, offset + 5);
    const results = await Promise.allSettled(
      chunk.map((order) => reconcileMollieRefundOrder(order, source)),
    );
    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];
      if (result.status === 'fulfilled') continue;
      const order = chunk[index];
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      if (failClosed) {
        throw new Error(`Mollie-refund kunde inte stämmas av för order ${order.id}: ${message}`);
      }
      console.error(`[reconcile] kunde inte stämma av refund för ${order.id}:`, message);
    }
  }
}

type PayoutAuditPeriod = {
  restaurantId: string;
  periodStart: Date;
  periodEnd: Date;
};

async function readPayoutProviderAuditFingerprint(
  db: Pick<typeof prisma, 'order'>,
  input: PayoutAuditPeriod,
): Promise<string[]> {
  const fingerprint: string[] = [];
  let cursor: string | null = null;
  while (true) {
    const payable: PayoutProviderAuditOrder[] = await db.order.findMany({
      where: {
        restaurantId: input.restaurantId,
        createdAt: { gte: input.periodStart, lte: input.periodEnd },
        status: { in: [...PAYOUT_ORDER_STATUSES] },
        paymentStatus: { in: [...PAYOUT_PAYMENT_STATUSES] },
        ...PAYOUT_NON_TEST_ORDER_FILTER,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        paymentProvider: true,
        molliePaymentId: true,
        refundAmount: true,
        updatedAt: true,
      },
      orderBy: { id: 'asc' },
      take: REFUND_AUDIT_BATCH_SIZE,
    });
    if (payable.length === 0) break;
    fingerprint.push(...buildPayoutProviderAuditFingerprint(payable));
    cursor = payable[payable.length - 1].id;
  }
  return fingerprint.sort();
}

/**
 * Fail-closed audit used immediately before a payout is approved or paid.
 * Every Mollie order in the period is checked; pagination prevents the old
 * class of silent 50/100-row caps from producing an incorrect settlement.
 * The returned fingerprint is compared inside payout calculation so no PSP
 * call has to happen inside the serializable transaction.
 */
export async function reconcileMollieRefundsForPayoutPeriod(input: PayoutAuditPeriod, dependencies: {
  db?: Pick<typeof prisma, 'order'>;
  auditBatch?: typeof reconcileMollieRefundBatch;
} = {}): Promise<string[]> {
  const db = dependencies.db ?? prisma;
  const auditBatch = dependencies.auditBatch ?? reconcileMollieRefundBatch;

  // Payout math is provider-neutral, but launch reconciliation is deliberately
  // Mollie-only. Any payable row that cannot be tied to a Mollie payment must
  // therefore block before approval/recovery instead of being silently paid.
  const initialFingerprint = await readPayoutProviderAuditFingerprint(db, input);

  let cursor: string | null = null;
  while (true) {
    const batch: MollieRefundAuditOrder[] = await db.order.findMany({
      where: {
        restaurantId: input.restaurantId,
        createdAt: { gte: input.periodStart, lte: input.periodEnd },
        paymentProvider: 'mollie',
        molliePaymentId: { not: null },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      select: { id: true, molliePaymentId: true },
      orderBy: { id: 'asc' },
      take: REFUND_AUDIT_BATCH_SIZE,
    });
    if (batch.length === 0) break;
    await auditBatch(batch, true, 'PAYOUT_PREFLIGHT');
    cursor = batch[batch.length - 1].id;
  }

  const finalFingerprint = await readPayoutProviderAuditFingerprint(db, input);
  if (
    initialFingerprint.length !== finalFingerprint.length ||
    initialFingerprint.some((value, index) => value !== finalFingerprint[index])
  ) {
    // A PSP-induced convergence is safe, but this run no longer proves the
    // final payable set. Retrying audits the converged rows/references from the
    // beginning and also catches inserts behind the first keyset cursor.
    throw new PayoutProviderAuditStaleError(
      `period ${input.periodStart.toISOString()}–${input.periodEnd.toISOString()}`,
    );
  }
  return finalFingerprint;
}

/**
 * Audit both the new target period and every earlier PAID source period that
 * late-refund recovery will recalculate. Source payouts are keyset-paginated
 * without a total cap; the returned IDs are checked again inside the payout
 * transaction so a concurrently-added source cannot bypass PSP audit.
 */
export async function reconcileMollieRefundsForPayout(input: {
  restaurantId: string;
  targetPeriodStart: Date;
  targetPeriodEnd: Date;
}, dependencies: {
  db?: Pick<typeof prisma, 'restaurantPayout'>;
  auditPeriod?: typeof reconcileMollieRefundsForPayoutPeriod;
} = {}): Promise<{
  targetFingerprint: string[];
  sources: Array<{ payoutId: string; fingerprint: string[] }>;
}> {
  const db = dependencies.db ?? prisma;
  const auditPeriod = dependencies.auditPeriod ?? reconcileMollieRefundsForPayoutPeriod;

  const targetFingerprint = await auditPeriod({
    restaurantId: input.restaurantId,
    periodStart: input.targetPeriodStart,
    periodEnd: input.targetPeriodEnd,
  });

  const auditedSources: Array<{ payoutId: string; fingerprint: string[] }> = [];
  let cursor: string | null = null;
  while (true) {
    const sources: Array<{ id: string; periodStart: Date; periodEnd: Date }> =
      await db.restaurantPayout.findMany({
        where: {
          restaurantId: input.restaurantId,
          status: 'PAID',
          periodEnd: { lt: input.targetPeriodStart },
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        select: { id: true, periodStart: true, periodEnd: true },
        orderBy: { id: 'asc' },
        take: PAYOUT_SOURCE_AUDIT_BATCH_SIZE,
      });
    if (sources.length === 0) break;
    for (const source of sources) {
      const fingerprint = await auditPeriod({
        restaurantId: input.restaurantId,
        periodStart: source.periodStart,
        periodEnd: source.periodEnd,
      });
      auditedSources.push({ payoutId: source.id, fingerprint });
    }
    cursor = sources[sources.length - 1].id;
  }

  return { targetFingerprint, sources: auditedSources };
}

/**
 * Recovery loop for both locally pending refunds and refunds created directly
 * in Mollie Dashboard when a webhook is delayed or missed.
 */
export async function reconcilePendingRefunds(): Promise<void> {
  const pending = await prisma.order.findMany({
    where: {
      paymentStatus: 'REFUNDING',
      paymentProvider: 'mollie',
      molliePaymentId: { not: null },
      ...(mollieActiveRefundCursor ? { id: { gt: mollieActiveRefundCursor } } : {}),
    },
    select: {
      id: true,
      molliePaymentId: true,
    },
    orderBy: { id: 'asc' },
    take: REFUND_AUDIT_BATCH_SIZE,
  });
  await reconcileMollieRefundBatch(pending, false, 'REFUND_RECONCILE');
  mollieActiveRefundCursor = pending.length === REFUND_AUDIT_BATCH_SIZE
    ? pending[pending.length - 1].id
    : null;
}

/**
 * Low-frequency safety sweep for refunds created directly in Mollie Dashboard.
 * Active local refunds are handled separately and more frequently above.
 */
export async function reconcileRefundAuditSlice(): Promise<void> {
  // Walk all paid/refundable Mollie rows in stable id order across intervals.
  // This eventually discovers dashboard refunds even if their webhook never
  // arrived; payout approval additionally performs a complete period audit.
  const audited: MollieRefundAuditOrder[] = await prisma.order.findMany({
    where: {
      paymentProvider: 'mollie',
      paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] },
      molliePaymentId: { not: null },
      ...(mollieRefundAuditCursor ? { id: { gt: mollieRefundAuditCursor } } : {}),
    },
    select: { id: true, molliePaymentId: true },
    orderBy: { id: 'asc' },
    take: REFUND_AUDIT_BATCH_SIZE,
  });
  await reconcileMollieRefundBatch(audited, false, 'REFUND_RECONCILE');
  mollieRefundAuditCursor = audited.length === REFUND_AUDIT_BATCH_SIZE
    ? audited[audited.length - 1].id
    : null;
}

function configuredInterval(name: string, fallbackMs: number, minimumMs: number): number {
  const configured = Number(process.env[name]);
  return Number.isFinite(configured) && configured >= minimumMs
    ? Math.round(configured)
    : fallbackMs;
}

function scheduleNonOverlappingJob(
  label: string,
  intervalMs: number,
  job: () => Promise<void>,
): void {
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await job();
    } catch (err) {
      console.error(`[reconcile] ${label} misslyckades:`, err);
    } finally {
      running = false;
    }
  }, intervalMs);
}

export function startPaymentReconciliation(): void {
  const paymentIntervalMs = configuredInterval('PAYMENT_RECONCILE_INTERVAL_MS', 15_000, 5_000);
  const activeRefundIntervalMs = configuredInterval('REFUND_RECONCILE_INTERVAL_MS', 5 * 60_000, 60_000);
  const refundAuditIntervalMs = configuredInterval('REFUND_AUDIT_INTERVAL_MS', 60 * 60_000, 5 * 60_000);
  console.log(
    `[reconcile] betalningar ${paymentIntervalMs}ms, aktiva refunds ${activeRefundIntervalMs}ms, ` +
    `refund-audit ${refundAuditIntervalMs}ms`,
  );
  scheduleNonOverlappingJob('betalningspoll', paymentIntervalMs, reconcilePendingPayments);
  scheduleNonOverlappingJob('aktiv refundpoll', activeRefundIntervalMs, reconcilePendingRefunds);
  scheduleNonOverlappingJob('refund-audit', refundAuditIntervalMs, reconcileRefundAuditSlice);
}
