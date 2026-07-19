/**
 * Provider-agnostiskt betalnings-interface.
 *
 * Allt betal-specifikt (Mollie idag, Adyen/Stripe senare) göms bakom detta.
 * Routes och klienter pratar bara med interfacet → byte av PSP blir en
 * inpluggning, inte en omskrivning. Aktiv provider väljs via env
 * PAYMENT_PROVIDER (se ./index.ts).
 */
import type { PaymentProviderName } from './finalize';

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
  /** Shopper explicitly consented to store card details with Adyen for faster future checkout. */
  storePaymentMethod?: boolean;
}

export interface CreatePaymentResult {
  /** PSP-referensen som länkas på ordern (Mollie: payment-id, Adyen: session-id). */
  paymentRef: string;
  /** Hostad checkout att redirecta/öppna (Mollie). Saknas för embeddade providers. */
  checkoutUrl?: string;
  /** Embeddade providers (Adyen sessions): blob som klientens SDK monterar. Ömsesidigt uteslutande med checkoutUrl. */
  session?: { id: string; sessionData: string };
  /** Stripe native (iOS/Android): PaymentIntent client secret för PaymentSheet. */
  clientSecret?: string;
  /** Stripe native: publishable key klienten monterar PaymentSheet med. */
  publishableKey?: string;
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
  /** PSP:ns kumulativa återbetalade belopp, i öre. */
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
  /** Refundera (hel eller delvis). amountOre utelämnat = hela betalningen. */
  refund(
    paymentRef: string,
    amountOre?: number,
    idempotencyKey?: string,
  ): Promise<{ refundRef: string; status?: RemoteRefundState }>;
}
