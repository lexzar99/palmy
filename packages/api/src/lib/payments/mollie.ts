/**
 * Mollie-provider (Payments API).
 *
 * Mollie är redirect + webhook: vi skapar en betalning, får en checkout-URL,
 * och får sanningen via webhook (+ reconcile-poller som skyddsnät).
 *
 * Klarna kräver `lines` + `billingAddress` (Mollie-krav, till skillnad från
 * Stripe). Vi skickar därför alltid orderrader så Klarna kan erbjudas i
 * checkouten. Raderna måste summera EXAKT till order.total — en justeringsrad
 * fångar ev. öres-diff så Mollie aldrig rejectar på beloppsmismatch.
 *
 * Belopp i Mollie = decimalsträng i hel valuta ("149.00"), vår DB = öre.
 */
import { createMollieClient, type MollieClient } from '@mollie/api-client';
import type {
  CreatePaymentArgs,
  CreatePaymentResult,
  OrderForPayment,
  PaymentProvider,
  RemoteRefundState,
  RemotePaymentStatus,
  RemotePaymentState,
} from './types';
import { buildMollieLines } from './mollieLines';

const CURRENCY = 'SEK';

let client: MollieClient | null = null;
function mollie(): MollieClient {
  if (!client) {
    const apiKey = process.env.MOLLIE_API_KEY;
    if (!apiKey) throw new Error('MOLLIE_API_KEY saknas');
    client = createMollieClient({ apiKey });
  }
  return client;
}

/** öre → Mollie-belopp-objekt. */
function money(ore: number) {
  return { currency: CURRENCY, value: (ore / 100).toFixed(2) };
}

/** Mollie-belopp-objekt → öre. */
function toOre(amount?: { value: string } | null): number {
  if (!amount) return 0;
  return Math.round(parseFloat(amount.value) * 100);
}

/** Faktureringsadress för Klarna. Returnerar null om vi saknar fält → Klarna döljs men kort/Swish funkar. */
function buildBillingAddress(order: OrderForPayment) {
  if (!order.deliveryStreet || !order.deliveryCity || !order.deliveryZip || !order.customerEmail) return null;
  const [givenName, ...rest] = order.customerName.trim().split(/\s+/);
  return {
    givenName: givenName || order.customerName || 'Kund',
    familyName: rest.join(' ') || '-',
    email: order.customerEmail,
    streetAndNumber: order.deliveryStreet,
    postalCode: order.deliveryZip,
    city: order.deliveryCity,
    country: 'SE',
  };
}

function mapStatus(status: string): RemotePaymentState {
  switch (status) {
    case 'paid':
    case 'authorized': // Klarna pay-later auktoriseras → behandla som betald (capture sker hos Mollie)
      return 'paid';
    case 'failed':
      return 'failed';
    case 'canceled':
      return 'canceled';
    case 'expired':
      return 'expired';
    case 'pending':
      return 'pending';
    default:
      return 'open';
  }
}

function mapRefundStatus(status: string): RemoteRefundState {
  switch (status) {
    case 'queued':
    case 'pending':
    case 'processing':
    case 'refunded':
    case 'failed':
    case 'canceled':
      return status;
    default:
      return 'unknown';
  }
}

type MollieRefundLike = {
  id?: unknown;
  status?: unknown;
  amount?: { currency?: unknown; value?: unknown } | null;
  createdAt?: unknown;
};

/**
 * Convert a Mollie decimal amount without accepting rounded, non-SEK or
 * otherwise ambiguous values in an accounting path.
 */
function exactMollieOre(
  amount: { currency?: unknown; value?: unknown } | null | undefined,
  context: string,
): number {
  const currency = String(amount?.currency || CURRENCY).toUpperCase();
  const value = String(amount?.value ?? '');
  if (currency !== CURRENCY || !/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new Error(`Mollie returnerade ett ogiltigt belopp för ${context}`);
  }
  const [whole, fraction = ''] = value.split('.');
  const ore = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(ore) || ore < 0) {
    throw new Error(`Mollie returnerade ett icke-exakt belopp för ${context}`);
  }
  return ore;
}

/**
 * Consume the complete Payment Refunds iterator. The iterator follows every
 * Mollie page; duplicate IDs, malformed rows and a mismatch against the
 * payment's authoritative amountRefunded all fail closed before callers can
 * update local state or initiate another refund.
 */
export async function collectCompleteMollieRefunds(input: {
  paymentRef: string;
  amountRefunded?: { currency?: unknown; value?: unknown } | null;
  refunds: AsyncIterable<MollieRefundLike> | Iterable<MollieRefundLike>;
}): Promise<{ amountRefundedOre: number; refunds: RemotePaymentStatus['refunds'] }> {
  const seen = new Set<string>();
  const refunds: NonNullable<RemotePaymentStatus['refunds']> = [];

  for await (const refund of input.refunds) {
    const refundRef = String(refund.id || '').trim();
    if (!refundRef || seen.has(refundRef)) {
      throw new Error(
        `Mollie-refundlistan för ${input.paymentRef} är ofullständig eller innehåller dubletter`,
      );
    }
    seen.add(refundRef);
    refunds.push({
      refundRef,
      state: mapRefundStatus(String(refund.status || 'unknown')),
      amountOre: exactMollieOre(refund.amount, `refund ${refundRef}`),
      createdAt: refund.createdAt ? String(refund.createdAt) : null,
    });
  }

  const completedRefundOre = refunds
    .filter((refund) => refund.state === 'refunded')
    .reduce((sum, refund) => sum + refund.amountOre, 0);
  const aggregateRefundOre = exactMollieOre(
    input.amountRefunded || { currency: CURRENCY, value: '0.00' },
    `betalning ${input.paymentRef}`,
  );
  if (completedRefundOre !== aggregateRefundOre) {
    throw new Error(
      `Mollie-refundrevision misslyckades för ${input.paymentRef}: ` +
      `detaljer ${completedRefundOre} öre, totalsumma ${aggregateRefundOre} öre`,
    );
  }

  return { amountRefundedOre: aggregateRefundOre, refunds };
}

export const mollieProvider: PaymentProvider = {
  name: 'mollie',

  async createPayment({ order, returnUrl, webhookUrl, idempotencyKey }: CreatePaymentArgs): Promise<CreatePaymentResult> {
    const billingAddress = buildBillingAddress(order);
    const payment = await mollie().payments.create({
      amount: money(order.total),
      description: `${order.orderNumber}${order.restaurantName ? ` – ${order.restaurantName}` : ''}`,
      redirectUrl: returnUrl,
      ...(webhookUrl ? { webhookUrl } : {}),
      metadata: { orderId: order.id, orderNumber: order.orderNumber },
      lines: buildMollieLines(order),
      ...(billingAddress ? { billingAddress } : {}),
      locale: 'sv_SE',
      // @mollie/api-client plockar bort fältet ur JSON-body och skickar det
      // som Idempotency-Key-header. Samma order kan därför tryggt retry:a.
      idempotencyKey,
    } as any);

    return {
      paymentRef: payment.id,
      checkoutUrl: payment.getCheckoutUrl() ?? undefined,
    };
  },

  async getRemoteStatus(paymentRef: string): Promise<RemotePaymentStatus> {
    const mollieClient = mollie();
    const payment = await mollieClient.payments.get(paymentRef);
    const state = mapStatus(payment.status);
    const refundAudit = await collectCompleteMollieRefunds({
      paymentRef,
      amountRefunded: (payment as any).amountRefunded,
      // Unlike payment._embedded.refunds, this iterator follows every page.
      refunds: mollieClient.paymentRefunds.iterate({ paymentId: paymentRef }),
    });
    return {
      state,
      amountReceivedOre: state === 'paid' ? toOre((payment as any).amount) : undefined,
      amountRefundedOre: refundAudit.amountRefundedOre,
      refunds: refundAudit.refunds,
    };
  },

  async refund(paymentRef: string, amountOre?: number, idempotencyKey?: string) {
    const payment = await mollie().payments.get(paymentRef);
    const amount = amountOre != null ? money(amountOre) : (payment as any).amount;
    const refund = await mollie().paymentRefunds.create({
      paymentId: paymentRef,
      amount,
      idempotencyKey,
    } as any);
    return { refundRef: refund.id, status: mapRefundStatus(String(refund.status)) };
  },
};
