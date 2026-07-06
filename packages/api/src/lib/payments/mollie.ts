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
  RemotePaymentStatus,
  RemotePaymentState,
} from './types';

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

/**
 * Bygg orderrader som summerar exakt till order.total. Varje rad har qty 1 +
 * unitPrice = totalAmount så ingen kvantitets-avrundning kan spräcka summan.
 * vatRate/vatAmount sätts till 0 för test — sätt riktig moms före produktion.
 */
function buildLines(order: OrderForPayment) {
  const zeroVat = { vatRate: '0.00', vatAmount: money(0) };

  if (order.discountAmount > 0) {
    return [{
      description: 'Beställning',
      quantity: 1,
      unitPrice: money(order.total),
      totalAmount: money(order.total),
      ...zeroVat,
    }];
  }

  const lines: any[] = order.items.map((it) => ({
    description: it.quantity > 1 ? `${it.productName} ×${it.quantity}` : it.productName,
    quantity: 1,
    unitPrice: money(it.subtotal),
    totalAmount: money(it.subtotal),
    ...zeroVat,
  }));

  if (order.deliveryFee > 0) {
    lines.push({ description: 'Leverans', quantity: 1, unitPrice: money(order.deliveryFee), totalAmount: money(order.deliveryFee), ...zeroVat });
  }
  if (order.tipAmount > 0) {
    lines.push({ description: 'Dricks', quantity: 1, unitPrice: money(order.tipAmount), totalAmount: money(order.tipAmount), ...zeroVat });
  }

  // Avstämning: rader måste summera till order.total. Fånga ev. diff (t.ex.
  // poäng-betalda rader, öres-rounding) i en justeringsrad.
  const sum = lines.reduce((s, l) => s + Math.round(parseFloat(l.totalAmount.value) * 100), 0);
  const diff = order.total - sum;
  if (diff !== 0) {
    lines.push({ description: 'Justering', quantity: 1, unitPrice: money(diff), totalAmount: money(diff), ...zeroVat });
  }

  return lines;
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

export const mollieProvider: PaymentProvider = {
  name: 'mollie',

  async createPayment({ order, returnUrl, webhookUrl }: CreatePaymentArgs): Promise<CreatePaymentResult> {
    const billingAddress = buildBillingAddress(order);
    const payment = await mollie().payments.create({
      amount: money(order.total),
      description: `${order.orderNumber}${order.restaurantName ? ` – ${order.restaurantName}` : ''}`,
      redirectUrl: returnUrl,
      ...(webhookUrl ? { webhookUrl } : {}),
      metadata: { orderId: order.id, orderNumber: order.orderNumber },
      lines: buildLines(order),
      ...(billingAddress ? { billingAddress } : {}),
      locale: 'sv_SE',
    } as any);

    return {
      paymentRef: payment.id,
      checkoutUrl: payment.getCheckoutUrl() ?? undefined,
    };
  },

  async getRemoteStatus(paymentRef: string): Promise<RemotePaymentStatus> {
    const payment = await mollie().payments.get(paymentRef);
    const state = mapStatus(payment.status);
    return {
      state,
      amountReceivedOre: state === 'paid' ? toOre((payment as any).amount) : undefined,
    };
  },

  async refund(paymentRef: string, amountOre?: number): Promise<{ refundRef: string }> {
    const payment = await mollie().payments.get(paymentRef);
    const amount = amountOre != null ? money(amountOre) : (payment as any).amount;
    const refund = await mollie().paymentRefunds.create({ paymentId: paymentRef, amount } as any);
    return { refundRef: refund.id };
  },
};
