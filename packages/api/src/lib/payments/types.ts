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
  tipAmount: number;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string;
  deliveryStreet: string | null;
  deliveryCity: string | null;
  deliveryZip: string | null;
  items: Array<{ productName: string; quantity: number; subtotal: number }>;
  restaurantName?: string | null;
}

export interface CreatePaymentArgs {
  order: OrderForPayment;
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
}

export type RemotePaymentState = 'paid' | 'failed' | 'canceled' | 'expired' | 'open' | 'pending';

export interface RemotePaymentStatus {
  state: RemotePaymentState;
  /** Vad PSP:n faktiskt drog, i öre (när betalt). */
  amountReceivedOre?: number;
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
  refund(paymentRef: string, amountOre?: number): Promise<{ refundRef: string }>;
}
