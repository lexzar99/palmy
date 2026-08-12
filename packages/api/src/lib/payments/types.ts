/**
 * Provider-agnostiskt betalnings-interface.
 *
 * Allt betal-specifikt (Stripe och Swish idag, Mollie/Adyen för historiska
 * ordrar) göms bakom detta.
 * Routes och klienter pratar bara med interfacet → byte av PSP blir en
 * inpluggning, inte en omskrivning. Aktiv provider väljs via env
 * PAYMENT_PROVIDER (se ./index.ts).
 */
import type { PaymentProviderName } from './finalize';

export type StripeCheckoutMethod = 'klarna' | 'apple_pay' | 'google_pay' | 'card';
export type CheckoutExperience = 'embedded' | 'hosted';

/** Minimal order-vy som en provider behöver för att skapa en betalning. */
export interface OrderForPayment {
  id: string;
  userId?: string | null;
  orderNumber: string;
  total: number; // öre — auktoritativ, härledd ur DB
  deliveryFee: number;
  discountAmount: number;
  foodDiscountAmount: number;
  deliveryDiscountAmount: number;
  smallOrderFee: number;
  foodVatPercent: number;
  deliveryVatPercent: number | null;
  tipAmount: number;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string;
  deliveryStreet: string | null;
  deliveryCity: string | null;
  deliveryZip: string | null;
  items: Array<{ productName: string; quantity: number; subtotal: number; vatPercent: number }>;
  restaurantName?: string | null;
}

export interface CreatePaymentArgs {
  order: OrderForPayment;
  /** Existing/reserved provider reference bound to this order. Direct Swish
   * reserves it before PUT; Stripe reuses and verifies an existing pi_/cs_. */
  paymentReference?: string;
  /**
   * Stabil nyckel per order/betalningsförsök. PSP:n använder den för att
   * returnera samma session när klienten retry:ar efter timeout, app-restart
   * eller dubbelt tryck i stället för att skapa två debiterbara betalningar.
   */
  idempotencyKey: string;
  /** Dit PSP:n skickar tillbaka kunden (deep link i appen / kassa-URL på webben). */
  returnUrl: string;
  /** Publik https-URL för async-notifieringar. Utelämnas i lokal dev (PSP:n når ej localhost). */
  webhookUrl?: string;
  /** Adyen-kanal: 'Web' (webb-Drop-in) | 'iOS' | 'Android' (native SDK). Sessionen
   *  MÅSTE skapas med samma kanal som klienten använder — annars failar setup
   *  (native iOS-SDK mot en Web-session → AdyenNetworking EmptyErrorResponse). */
  channel?: 'Web' | 'iOS' | 'Android';
  /** Web Stripe is inline by default. Partner iframes may explicitly request
   * hosted Checkout so the parent can perform a top-level navigation. */
  checkoutExperience?: CheckoutExperience;
  /** Explicit customer choice. Wallets use Stripe's `card` API type. */
  checkoutMethod?: StripeCheckoutMethod;
  /** Shopper explicitly consented to store card details with Adyen for faster future checkout. */
  storePaymentMethod?: boolean;
}

export interface CreatePaymentResult {
  /** PSP-referensen som länkas på ordern (Stripe: cs_/pi_, Swish: instruction-id). */
  paymentRef: string;
  /** Hostad checkout att redirecta/öppna. Saknas för direkta providers som Swish. */
  checkoutUrl?: string;
  /** Embeddade providers (Adyen sessions): blob som klientens SDK monterar. Ömsesidigt uteslutande med checkoutUrl. */
  session?: { id: string; sessionData: string };
  /** Stripe native (iOS/Android): PaymentIntent client secret för PaymentSheet. */
  clientSecret?: string;
  /** Stripe native: publishable key klienten monterar PaymentSheet med. */
  publishableKey?: string;
  /** Direkt Swish M-commerce: token som öppnar Swish-appen eller kodas som QR. */
  swishToken?: string;
  /** Färdig M-commerce-länk för Swish-appen. */
  swishUrl?: string;
  /** QR-bild (data URL) för desktopflödet; innehåller samma kortlivade token. */
  swishQrCode?: string;
}

export type RemotePaymentState = 'paid' | 'failed' | 'canceled' | 'expired' | 'open' | 'pending';

export type RemoteRefundState =
  | 'queued'
  | 'pending'
  | 'processing'
  | 'refunded'
  | 'failed'
  | 'canceled'
  | 'unknown';

export interface RemoteRefundStatus {
  refundRef: string;
  state: RemoteRefundState;
  amountOre: number;
  /** PSP timestamp when available; retained once in the immutable ledger. */
  createdAt?: Date | string | null;
  /** Cumulative refunded/requested amount immediately after this refund. */
  cumulativeAmountOre?: number;
}

export interface RemotePaymentStatus {
  state: RemotePaymentState;
  /** Vad PSP:n faktiskt drog, i öre (när betalt). */
  amountReceivedOre?: number;
  /** PSP-verifierat, slutfört återbetalat belopp i öre (inte queued/pending). */
  amountRefundedOre?: number;
  /** Enskilda refunds behövs för async recovery (queued/failed/refunded). */
  refunds?: RemoteRefundStatus[];
  /** PSP:ns faktiska betalmetod (swish/creditcard/klarna…), för kvittot. */
  method?: string | null;
  /** Stripe Checkout skapas som cs_ men finaliseras/refundas mot pi_. */
  paymentIntentId?: string;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  /** Skapa en betalning för en order. Returnerar ref + ev. checkout-URL. */
  createPayment(args: CreatePaymentArgs): Promise<CreatePaymentResult>;
  /** Hämta auktoritativ status från PSP:n (för webhook-finalisering + reconcile). */
  getRemoteStatus(paymentRef: string): Promise<RemotePaymentStatus>;
  /**
   * Avbryt en fortfarande öppen betalning. Providers som inte kan garantera
   * cancellation lämnar metoden oimplementerad; då får timeout-jobbet bevara
   * ordern tills PSP:n själv rapporterar ett terminalt tillstånd.
   */
  cancelPayment?(paymentRef: string): Promise<RemotePaymentStatus>;
  /** Refundera (hel eller delvis). amountOre utelämnat = hela betalningen. */
  refund(
    paymentRef: string,
    amountOre?: number,
    idempotencyKey?: string,
  ): Promise<{ refundRef: string; status?: RemoteRefundState }>;
}
