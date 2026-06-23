/**
 * Adyen-provider (Checkout API v71, sessions-flöde).
 *
 * Skillnad mot Mollie: Adyen är EMBEDDED, inte hostad redirect. /sessions ger
 * { id, sessionData } som klientens Drop-in monterar på sidan. Sanningen kommer
 * via HMAC-signerad webhook (AUTHORISATION) keyad på merchantReference = orderNumber.
 *
 * Belopp i Adyen = minor units = öre, direkt (INGEN /100). Matchar vår DB.
 * Verifierat mot @adyen/api-library@30.1.0.
 */
import { Client, CheckoutAPI, hmacValidator } from '@adyen/api-library';
import type {
  CreatePaymentArgs,
  CreatePaymentResult,
  OrderForPayment,
  PaymentProvider,
  RemotePaymentStatus,
} from './types';

const CURRENCY = 'SEK';

let checkoutApi: CheckoutAPI | null = null;
function checkout(): CheckoutAPI {
  if (!checkoutApi) {
    const apiKey = process.env.ADYEN_API_KEY;
    if (!apiKey) throw new Error('ADYEN_API_KEY saknas');
    const environment = (process.env.ADYEN_ENVIRONMENT || 'TEST').toUpperCase();
    const config: any = { apiKey, environment };
    if (environment === 'LIVE' && process.env.ADYEN_LIVE_URL_PREFIX) {
      config.liveEndpointUrlPrefix = process.env.ADYEN_LIVE_URL_PREFIX;
    }
    checkoutApi = new CheckoutAPI(new Client(config));
  }
  return checkoutApi;
}

const validator = new hmacValidator();

function merchantAccount(): string {
  const m = process.env.ADYEN_MERCHANT_ACCOUNT;
  if (!m) throw new Error('ADYEN_MERCHANT_ACCOUNT saknas');
  return m;
}

/**
 * Adyen lineItems i öre (minor units, ingen konvertering). Summan måste matcha
 * order.total — en justeringsrad fångar ev. öres-diff (t.ex. poäng-betalda rader).
 */
function buildLineItems(order: OrderForPayment): any[] {
  const items: any[] = order.items.map((it) => ({
    description: it.quantity > 1 ? `${it.productName} x${it.quantity}` : it.productName,
    quantity: 1,
    amountIncludingTax: it.subtotal,
  }));
  if (order.deliveryFee > 0) items.push({ description: 'Leverans', quantity: 1, amountIncludingTax: order.deliveryFee });
  if (order.tipAmount > 0) items.push({ description: 'Dricks', quantity: 1, amountIncludingTax: order.tipAmount });
  if (order.discountAmount > 0) items.push({ description: 'Rabatt', quantity: 1, amountIncludingTax: -order.discountAmount });
  const sum = items.reduce((s, l) => s + l.amountIncludingTax, 0);
  const diff = order.total - sum;
  if (diff !== 0) items.push({ description: 'Justering', quantity: 1, amountIncludingTax: diff });
  return items;
}

export const adyenProvider: PaymentProvider = {
  name: 'adyen',

  async createPayment({ order, returnUrl, channel }: CreatePaymentArgs): Promise<CreatePaymentResult> {
    const res = await checkout().PaymentsApi.sessions({
      merchantAccount: merchantAccount(),
      amount: { currency: CURRENCY, value: order.total }, // öre direkt, INGEN /100
      reference: order.orderNumber, // → merchantReference i webhooken (så vi hittar ordern)
      returnUrl, // Drop-in behöver den för redirect-metoder (Swish/Klarna)
      countryCode: 'SE',
      shopperLocale: 'sv-SE',
      // Kanalen MÅSTE matcha klienten: 'Web' för webb-Drop-in, 'iOS'/'Android' för
      // native SDK. Default 'Web' (bakåtkompatibelt med webben som inte skickar fält).
      channel: (channel || 'Web') as any,
      shopperEmail: order.customerEmail ?? undefined,
      lineItems: buildLineItems(order),
      // Bara de metoder vi vill visa. 'klarna' = EN Klarna-rad (inte alla varianter);
      // detta tystar även "you support X but not configured"-varningarna.
      allowedPaymentMethods: ['scheme', 'klarna', 'swish', 'applepay', 'googlepay'],
      metadata: { orderId: order.id },
    } as any);
    return {
      paymentRef: res.id as string, // session-id (lagras som adyenSessionId)
      session: { id: res.id as string, sessionData: res.sessionData as string },
    };
  },

  async getRemoteStatus(_paymentRef: string): Promise<RemotePaymentStatus> {
    // Adyen finaliserar via webhook (HMAC). Det finns ingen poll-by-session utan
    // sessionResult, så reconcile-pollern litar på webhooken. 'pending' för okända
    // refs → reconcile väntar, webhooken gör finaliseringen.
    return { state: 'pending' };
  },

  async refund(paymentPspReference: string, amountOre?: number): Promise<{ refundRef: string }> {
    const r = await checkout().ModificationsApi.refundCapturedPayment(paymentPspReference, {
      merchantAccount: merchantAccount(),
      ...(amountOre != null ? { amount: { currency: CURRENCY, value: amountOre } } : {}),
      reference: `refund_${paymentPspReference}`,
    } as any);
    return { refundRef: (r.pspReference as string) || '' };
  },
};

/**
 * Verifiera HMAC-signaturen på ETT notification-item. Anropas per item i
 * webhook-routen. Returnerar false om nyckel saknas eller signaturen inte stämmer.
 */
export function verifyAdyenHmac(notificationRequestItem: any): boolean {
  const key = process.env.ADYEN_HMAC_KEY;
  if (!key) return false;
  try {
    return validator.validateHMAC(notificationRequestItem, key);
  } catch {
    return false;
  }
}
