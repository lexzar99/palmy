import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import Stripe from 'stripe';
import crypto from 'crypto';
import prisma from '../lib/prisma';
import { getIO } from '../lib/socket';
import {
  DEFAULT_DELIVERY_FEE,
  DEFAULT_ESTIMATED_DELIVERY_TIME,
  DEFAULT_ESTIMATED_PICKUP_TIME,
  DEFAULT_MIN_ORDER_AMOUNT,
} from '../lib/restaurantSettings';
import {
  dealMatchesRestaurant,
  evaluateDeal,
  isAutomaticBasketDeal,
  isDealAvailableNow,
  parseApplicableRestaurantIds,
  resolveDisplayPromotionForProduct,
  userDealRestaurantScope,
  type CartItemForBogo,
} from '../lib/deals';
import { getWelcomeOffer, isWelcomeEligible, welcomeOfferDiscountOre } from './referrals';
import { ALLOW_TEST_ORDERS } from '../lib/config';
import { bustCache } from '../lib/ttlCache';
import { getIdempotencyKey } from '../lib/idempotency';
import { normalizeDeliveryZones, normalizeMoneyToOre, resolveDeliveryFee } from '../utils/deliveryZones';
import { pushLiveActivityForOrder } from '../lib/liveActivityDispatch';
import { computeDeliveryWindowMs } from '../lib/deliveryWindow';
import { checkDeliveryStreet } from '../lib/deliveryAddress';
import { discountPlatformAllowed } from '../lib/clientPlatform';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { dispatchCustomerOrderStatus } from '../lib/customerOrderNotifier';
import { customerStepEtaEndsAt, etaResponseFields, refreshOrderEta } from '../lib/orderEta';
import { overlayCourierLivePosition } from '../lib/courierLivePosition';
import { overlayOrderLiveEta } from '../lib/orderLiveEta';
import { resolveRestaurantAvailability } from '../lib/restaurantAvailability';
import { moneyDto, nullableMoneyDto } from '../utils/money';
import { referralPhoneVariants } from '../lib/referralRules';
import { notifyPartnerDevicesOfNewOrder } from '../lib/partnerFcm';
import {
  cancelPaymentWithCanonicalRetry,
  getCheckoutPaymentProvider,
  getPaymentProviderByName,
} from '../lib/payments';
import { finalizePaymentFailed, finalizePaymentSuccess } from '../lib/payments/finalize';
import type { PaymentProviderName } from '../lib/payments/finalize';
import {
  allowLegacyOrderPhoneProof,
  exchangeOrderAccessForHttpSession,
  exchangeOrderPaymentResumeForHttpSession,
  issueOrderAccessProof,
  issueOrderHttpSession,
  issueOrderNativeSession,
  ORDER_NATIVE_SESSION_HEADER,
  ORDER_NATIVE_SESSION_TTL_SECONDS,
  ORDER_HTTP_SESSION_HEADER,
  ORDER_HTTP_SESSION_ID_HEADER,
  ORDER_HTTP_SESSION_TTL_SECONDS,
  ownsOrderWithActiveRawSecret,
  resolveActiveCustomerFromAuthorization,
  resolveActiveCustomerIdFromAuthorization,
  resolveOrderAccess,
  validOrderId,
  verifyOrderHttpSession,
  verifyOrderNativeSession,
} from '../lib/orderAccess';
import { calculateOrderVat, deliveryVatPercent, normalizeFoodVatPercent, normalizeVatPercent } from '../lib/tax';
import {
  assertNonnegativeCatalogLine,
  OrderExtraPricingError,
  resolveAuthoritativeExtraSelection,
} from '../lib/orderExtraPricing';
import { KIOSK_ACCESS_HEADER, validKioskAccessProof } from '../lib/kioskAccess';
import {
  CHECKOUT_TOTAL_TOLERANCE_ORE,
  checkoutTotalDifferenceOre,
  checkoutTotalMatches,
} from '../lib/checkoutIntegrity';
import { resolvePlatformFundedDiscount } from '../lib/discountFunding';

const router = Router();

/**
 * Next's same-origin proxy converts these internal response headers into a
 * Secure + HttpOnly per-order cookie. Direct/native clients keep using their
 * existing response body and never need to understand the browser session.
 */
function attachWebOrderSession(req: Request, res: Response, orderId: string) {
  // Order responses can contain native exchange credentials or customer PII.
  // They must never be retained by a browser, CDN, or shared intermediary.
  res.setHeader('Cache-Control', 'no-store');
  if (req.headers['x-client-type'] !== 'web' || !validOrderId(orderId)) return;
  res.setHeader(ORDER_HTTP_SESSION_HEADER, issueOrderHttpSession(orderId));
  res.setHeader(ORDER_HTTP_SESSION_ID_HEADER, orderId);
}

function rawOrderAccessForNonWebClient(req: Request, accessToken: string | null) {
  return req.headers['x-client-type'] === 'web' ? {} : { accessToken };
}

function isNativeClient(req: Request): boolean {
  const clientType = String(req.headers['x-client-type'] || '').toLowerCase();
  return clientType === 'ios' || clientType === 'android';
}

function nativeOrderSessionForClient(req: Request, orderId: string) {
  return isNativeClient(req)
    ? {
        orderSession: issueOrderNativeSession(orderId),
        orderSessionExpiresInSeconds: ORDER_NATIVE_SESSION_TTL_SECONDS,
      }
    : {};
}

function ownsByNativeOrderSession(req: Request, orderId: string): boolean {
  return isNativeClient(req) && verifyOrderNativeSession(
    req.headers[ORDER_NATIVE_SESSION_HEADER],
    orderId,
  );
}

const nativeSessionLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'För många försök. Vänta en stund och försök igen.' },
});

function kioskCanTrackPaidOrder(
  req: Request,
  order: { paymentStatus?: string | null; restaurant?: { slug?: string | null } | null },
): boolean {
  if (req.headers['x-client-type'] !== 'web' || order.paymentStatus !== 'PAID') return false;
  const kioskSlug = validKioskAccessProof(req.headers[KIOSK_ACCESS_HEADER]);
  const allowedRestaurants = new Set(
    String(process.env.KIOSK_RESTAURANT_SLUGS || 'palmyra-pizzeria-lund')
      .split(',')
      .map((slug) => slug.trim())
      .filter(Boolean),
  );
  return Boolean(
    kioskSlug &&
    allowedRestaurants.has(kioskSlug) &&
    order.restaurant?.slug === kioskSlug,
  );
}

function rejectExpiredOrderReplay(res: Response) {
  return res.status(410).json({
    error: 'Det tidigare checkout-försöket har gått ut. Försök igen.',
    code: 'ORDER_REPLAY_EXPIRED',
  });
}
const STOCKHOLM_TIMEZONE = 'Europe/Stockholm';
const stockholmDayFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: STOCKHOLM_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const getStockholmCalendarDay = (date: Date) => stockholmDayFormatter.format(date);

// Gästprofiler använder samma enkla normalisering som auth-flödet gör. Vi
// söker både med och utan plustecken så äldre checkout-data inte skapar flera
// gästprofiler för samma nummer.
const guestPhoneVariants = (phone: string) => referralPhoneVariants(phone);

class OrderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderValidationError';
  }
}

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, { apiVersion: '2025-02-24.acacia' })
  : null;

type ConfirmedPaymentIntent = {
  id: string;
  amount: number;
};

const getConfirmedPaymentIntent = async (paymentIntentId: string): Promise<ConfirmedPaymentIntent> => {
  if (!stripe) {
    throw new OrderValidationError('Stripe är inte konfigurerat korrekt på servern');
  }

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status !== 'succeeded') {
      throw new OrderValidationError('Betalningen är inte slutförd ännu');
    }

    const paidAmount = paymentIntent.amount_received || paymentIntent.amount || 0;
    if (paidAmount <= 0) {
      throw new OrderValidationError('Betalningen saknar giltigt belopp');
    }

    return {
      id: paymentIntent.id,
      amount: paidAmount,
    };
  } catch (error) {
    if (error instanceof OrderValidationError) {
      throw error;
    }
    console.error('Stripe verification error:', error);
    throw new OrderValidationError('Kunde inte verifiera betalningen');
  }
};

const OrderItemSchema = z.object({
  productId: z.string(),
  // Tillåt stora beställningar (fester/catering). Tidigare max 20 → "Ogiltig
  // data" vid t.ex. 30–50 pizzor. Taket på 500 är bara ett sanity-skydd.
  quantity: z.number().int().min(1).max(500),
  unitPriceKr: z.number().nonnegative().optional(),
  originalPriceKr: z.number().nonnegative().optional(),
  catalogDiscountApplied: z.boolean().optional(),
  note: z.string().nullable().optional(),
  selectedExtras: z.array(z.object({
    groupId: z.string(),
    groupName: z.string(),
    extraId: z.string(),
    extraName: z.string(),
    // Presentation-only input. Negativa katalogtillval är legitima (t.ex.
    // barnpizza), men klientens belopp används aldrig som prissanning.
    priceAddon: z.number(),
    quantity: z.number().int().min(1).max(500).optional(),
  })),
  // Klienten flaggar items som "BOGO-gratis" så backend kan verifiera
  // att kunden inte smugglar fler gratis-varor än vad dealen tillåter.
  // Vi validerar count mot evaluateBogoCategoryDeal:s maxFreeItems.
  bogoFreeFromDealId: z.string().nullable().optional(),
});

const CreateOrderSchema = z.object({
  restaurantId: z.string().min(1).optional(),
  restaurantSlug: z.string().min(1).optional(),
  type: z.enum(['PICKUP', 'DELIVERY']),
  paymentMethod: z.string().nullable().optional(),
  paymentProvider: z.enum(['mollie', 'swish', 'stripe', 'adyen']).optional(),
  customerName: z.string().min(2).max(100),
  customerPhone: z.string().min(6).max(20),
  customerEmail: z.string().email().nullable().or(z.literal('')).optional(),
  
  // Leverans
  deliveryStreet: z.string().nullable().optional(),
  deliveryCity: z.string().nullable().optional(),
  deliveryZip: z.string().nullable().optional(),
  // Kund-coords vid order-tid. Krävs INTE för giltig order men starkt
  // rekommenderat — sparas för per-zon-ETA-beräkning i efterhand.
  deliveryLatitude: z.number().nullable().optional(),
  deliveryLongitude: z.number().nullable().optional(),
  deliveryNote: z.string().nullable().optional(),
  deliveryInstructions: z.string().nullable().optional(),

  note: z.string().nullable().optional(),
  discountCode: z.string().nullable().optional(),
  // Kunden har EXPLICIT stängt av den automatiskt applicerade kampanjen i
  // kassan (t.ex. för att slippa "25% första beställning" och kunna mata in
  // en egen kupongkod). Backend skippar auto-deal-pickup om true så att
  // frontend-totalen matchar Stripe-beloppet utan diff.
  skipAutomaticDeal: z.boolean().optional(),
  // UserDeal id från GET /api/account/deals — kunden valde att applicera en
  // welcome/referral-kupong i kassan. Backend validerar ägarskap + status +
  // minOrderKr och reserverar atomiskt vid order-creation.
  userDealId: z.string().nullable().optional(),
  items: z.array(OrderItemSchema).min(1),
  
  // Stripe PaymentIntent ID
  stripePaymentIntentId: z.string().nullable().optional(),
  
  // GPS coords for zone validation
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),

  // Scheduled order time (ISO string, null = ASAP)
  scheduledFor: z.string().nullable().optional(),
  pendingPayment: z.boolean().optional(),

  // Kund godkände att betala mellanskillnaden till minsta orderbelopp (kr).
  // Backend lägger till på deliveryFee om subtotal < min och topUp >= shortfall.
  minOrderTopUp: z.number().nonnegative().optional(),
  // Dricks i kr som kund valt i kassan (delivery only). Adderas till
  // order.total + Stripe-belopp.
  tip: z.number().nonnegative().optional(),
  // Kassans egen visade slutsumma i kr. Servern är fortsatt prissanning, men
  // avvikelser större än 1 kr stoppas innan en PSP-betalning kan skapas.
  expectedTotalKr: z.number().nonnegative().optional(),
}).refine((val) => Boolean(val.restaurantId || val.restaurantSlug), {
  message: 'restaurantId eller restaurantSlug krävs',
  path: ['restaurantId'],
});

// POST /api/orders - Skapa ny order
router.post('/', async (req: Request, res: Response) => {
  // Optional client-supplied idempotency key — if the same key arrives twice
  // (e.g. network retry of the same checkout attempt) we replay the original
  // response without doing the work twice.
  const idempotencyKey = getIdempotencyKey(req);
  // Scope keyen till user (om authed via Authorization-header) eller IP (gäst).
  // Hindrar att User B med samma idempotency-key får ut User A:s order-respons.
  // Resolve the account before replay lookup so a deleted/banned/disallowed
  // bearer cannot use a remembered idempotency key as a second order secret.
  // The full token hash still scopes the persisted attempt across retries.
  const authHeaderForScope = req.headers.authorization || '';
  const authenticatedIdentity = authHeaderForScope.startsWith('Bearer ')
    ? await resolveActiveCustomerFromAuthorization(authHeaderForScope).catch(() => null)
    : null;
  if (authHeaderForScope.startsWith('Bearer ') && !authenticatedIdentity) {
    return res.status(401).json({
      error: 'Kundsessionen är ogiltig eller kontot är inte tillgängligt',
      code: 'CUSTOMER_SESSION_NOT_ALLOWED',
    });
  }
  // Hash the WHOLE token for the per-user scope. The previous slice(7,39) took the
  // first 32 token chars, but for Supabase JWTs those are the CONSTANT header
  // (eyJhbG...) — identical for every user → all logged-in users shared one scope,
  // so a duplicate Idempotency-Key could replay another user's order response.
  const tokenScopeHash = authHeaderForScope.startsWith('Bearer ')
    ? crypto.createHash('sha256').update(authHeaderForScope.slice(7)).digest('hex').slice(0, 32)
    : '';
  const phoneScope = String(req.body?.customerPhone || '').replace(/\D/g, '');
  const scope = tokenScopeHash || phoneScope || req.ip || 'anon';
  const clientRequestId = idempotencyKey
    ? crypto.createHash('sha256').update(`${scope}:${idempotencyKey}`).digest('hex')
    : null;

  // Database-backed replay survives deploys/restarts and is shared by every
  // Railway replica. The previous Map cache could still create duplicate paid
  // orders when retry #2 landed on another process.
  if (clientRequestId) {
    const existing = await prisma.order.findUnique({
      where: { clientRequestId },
      select: {
        id: true,
        userId: true,
        orderNumber: true,
        total: true,
        appliedDealTitle: true,
        estimatedTime: true,
        accessToken: true,
        createdAt: true,
        etaReadyAt: true,
        etaPickupAt: true,
        etaCustomerAt: true,
        etaCustomerMin: true,
        etaPriorityScore: true,
        etaReason: true,
        status: true,
        updatedAt: true,
      },
    });
    if (existing) {
      if (authenticatedIdentity && existing.userId !== authenticatedIdentity.id) {
        return res.status(404).json({ error: 'Order hittades inte' });
      }
      // The idempotency key prevents duplicate creation; it must not become a
      // second long-lived order credential. After the raw 48-hour exchange
      // window, a replay may no longer mint a fresh browser session or return
      // the stored native access token.
      if (!ownsOrderWithActiveRawSecret(existing, existing.accessToken)) {
        return rejectExpiredOrderReplay(res);
      }
      console.log(`♻️ Replaying persisted order for idempotency-key ${idempotencyKey}`);
      const liveExisting = await overlayOrderLiveEta(existing);
      attachWebOrderSession(req, res, existing.id);
      return res.status(200).json({
        orderId: existing.id,
        orderNumber: existing.orderNumber,
        total: existing.total / 100,
        appliedDealTitle: existing.appliedDealTitle,
        estimatedTime: existing.estimatedTime,
        ...etaResponseFields(liveExisting),
        ...nativeOrderSessionForClient(req, existing.id),
        ...rawOrderAccessForNonWebClient(req, existing.accessToken),
      });
    }
  }

  try {
    // Logga bara minimum-info i prod — full body innehåller adress/telefon (PII).
    if (process.env.NODE_ENV !== 'production') {
      console.log('📦 New Order Request:', JSON.stringify(req.body, null, 2));
    } else {
      console.log('📦 New Order Request', { restaurantId: req.body?.restaurantId, type: req.body?.type, itemCount: req.body?.items?.length });
    }

    // Crisis: platform-wide pause. Set via /api/admin/crisis/pause-platform.
    // Reject before doing any work — cheaper than parsing/validating the body.
    try {
      const settings = await prisma.restaurantSettings.findUnique({
        where: { id: 'settings' },
        select: {
          platformOrdersPaused: true,
          platformPausedUntil: true,
          platformPauseReason: true,
        } as any,
      });
      const until = (settings as any)?.platformPausedUntil;
      if ((settings as any)?.platformOrdersPaused === true || (until && new Date(until).getTime() > Date.now())) {
        return res.status(503).json({
          error: 'PLATFORM_PAUSED',
          message: 'Plattformen är tillfälligt pausad. Försök igen om en stund.',
          until: until ? new Date(until).toISOString() : null,
          indefinite: (settings as any)?.platformOrdersPaused === true,
          reason: (settings as any)?.platformPauseReason || null,
        });
      }
    } catch {
      // If the settings check itself errors, fall through to normal flow —
      // we never want a transient DB blip to silently block all orders.
    }

    const data = CreateOrderSchema.parse(req.body);
    const isPendingPayment = data.pendingPayment === true;
    const pendingPaymentProvider = isPendingPayment
      ? getCheckoutPaymentProvider(data.paymentProvider)
      : null;
    const hasPaymentIntent = Boolean(data.stripePaymentIntentId);

    // Den äldre klientvägen som skickade ett färdigt Stripe-intent direkt till
    // order-POST:en är pensionerad. Nya klienter skapar en obetald order och
    // startar den uttryckligen aktiverade providern via betalningsendpointen.
    if (process.env.NODE_ENV === 'production' && !isPendingPayment) {
      res.status(410).json({
        error: 'Den äldre betalningsvägen är avstängd. Starta en ny betalning från kassan.',
        code: 'MOLLIE_CHECKOUT_REQUIRED',
      });
      return;
    }

    const intentId = data.stripePaymentIntentId?.toUpperCase();
    const testOrderRequested =
      (data.discountCode?.toLowerCase() === 'test' || data.discountCode?.toLowerCase() === 'testa') &&
      (intentId === 'TEST_PAYMENT' || intentId === 'FREE_PROMO');
    // En rabattkod är inte ett autentiseringsbevis. Gratis testordrar är
    // därför explicit dev-only och kan aldrig slås på i production.
    if (testOrderRequested && !ALLOW_TEST_ORDERS) {
      res.status(403).json({ error: 'Testordrar är avstängda' });
      return;
    }
    const isTestOrder = testOrderRequested && ALLOW_TEST_ORDERS;

    // Enforce mandatory payment (unless pending-payment flow or test order)
    if (!hasPaymentIntent) {
      if (!isTestOrder && !isPendingPayment) {
        res.status(400).json({ error: 'Betalning krävs för att slutföra ordern' });
        return;
      }
    }

    // 0. Resolve account identity through the single customer policy. A
    // supplied but invalid/disallowed/tombstoned bearer fails closed instead
    // of silently becoming a guest checkout.
    let authenticatedUserId: string | null = null;
    let authUser: any = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      authUser = await (prisma as any).user.findFirst({
        where: { id: authenticatedIdentity!.id, deletedAt: null, isActive: true },
      });
      if (!authUser) {
        return res.status(401).json({ error: 'Kundkontot är inte tillgängligt' });
      }
      authenticatedUserId = authUser.id;
      // Keep the order contact phone from checkout. The verified profile is
      // attached through userId, so a parent can order to a child's phone without
      // changing their saved number.
      if (!String(data.customerPhone || '').trim() && authUser.phone) data.customerPhone = authUser.phone;
    }

    // Hard gate: a Google/Apple-signed user without a verified phone cannot
    // place orders. Forces the phone-linking flow client-side and prevents
    // anyone from spinning up disposable OAuth accounts to abuse promos.
    if (authUser?.oauthProvider && (!authUser?.phone || !authUser?.isVerified)) {
      res.status(403).json({
        error: 'Telefonverifiering krävs innan du kan beställa',
        needsPhone: true,
      });
      return;
    }

    // Resolve restaurant (must be explicit to avoid routing orders to the wrong restaurant)
    const restaurant = await prisma.restaurant.findFirst({
      where: data.restaurantId
        ? { id: data.restaurantId, archivedAt: null }
        : { slug: data.restaurantSlug as string, archivedAt: null },
      include: {
        city_relation: {
          select: { ordersPaused: true, ordersPausedUntil: true, ordersPauseReason: true },
        },
      },
    });
    if (!restaurant) {
      res.status(400).json({ error: 'Ogiltig restaurang' });
      return;
    }
    // Utkast (agent-onboarding) kan aldrig ta emot ordrar.
    if ((restaurant as any).draft) {
      res.status(400).json({ error: 'Restaurangen tar inte emot beställningar ännu' });
      return;
    }

    // En gästorder ska fortfarande ge admin en kundrad med namn + telefon.
    // Registrerade användare länkas aldrig genom ett osignerat telefonnummer;
    // bara en befintlig gästprofil återanvänds. Det förhindrar att en felaktig
    // telefoninmatning kopplar ordern till någon annans konto.
    let orderUserId = authenticatedUserId;
    if (!authenticatedUserId) {
      const phoneVariants = guestPhoneVariants(data.customerPhone);
      const existingGuest = await (prisma as any).user.findFirst({
        where: { phone: { in: phoneVariants }, deletedAt: null, isGuest: true },
        select: { id: true, name: true },
      });

      if (existingGuest) {
        orderUserId = existingGuest.id;
        if (!existingGuest.name && data.customerName.trim()) {
          await (prisma as any).user.update({
            where: { id: existingGuest.id },
            data: { name: data.customerName.trim() },
          });
        }
      } else {
        const normalizedGuestPhone = phoneVariants[0];
        try {
          const guest = await (prisma as any).user.create({
            data: {
              name: data.customerName.trim(),
              phone: normalizedGuestPhone,
              isGuest: true,
              isVerified: false,
            },
            select: { id: true },
          });
          orderUserId = guest.id;
        } catch (error: any) {
          // Race eller ett äldre registrerat konto med samma telefon: lämna
          // ordern som oassocierad hellre än att länka den till fel konto.
          if (error?.code !== 'P2002') throw error;
          const racedGuest = await (prisma as any).user.findFirst({
            where: { phone: { in: phoneVariants }, deletedAt: null, isGuest: true },
            select: { id: true },
          });
          orderUserId = racedGuest?.id ?? null;
        }
      }
    }

    // Validate scheduled time if provided
    if (data.scheduledFor) {
      const scheduledTime = new Date(data.scheduledFor);
      const now = new Date();
      const minTime = new Date(now.getTime() + 45 * 60 * 1000); // At least 45 min from now

      if (isNaN(scheduledTime.getTime())) {
        res.status(400).json({ error: 'Ogiltigt tidformat' });
        return;
      }
      if (scheduledTime < minTime) {
        res.status(400).json({ error: 'Tid måste vara minst 45 minuter fram i tiden' });
        return;
      }
      if (getStockholmCalendarDay(scheduledTime) !== getStockholmCalendarDay(now)) {
        res.status(400).json({ error: 'Du kan bara förbeställa för idag' });
        return;
      }
    }

    const globalSettings = await prisma.restaurantSettings.findUnique({ where: { id: 'settings' } });
    
    const availability = resolveRestaurantAvailability(restaurant, {
      city: restaurant.city_relation,
      platform: globalSettings,
    });
    const restaurantOpen = availability.isOpen;

    // FÖR DELIVERY: ENDAST zon-baserade avgifter används. Tidigare fanns
    // restaurant.deliveryFee/minOrderAmount som fallback men det orsakade
    // förvirring (admin satt en, zon satt en, vilken vann?). Nu: zon är
    // ENDA källan. Ingen zon = ingen delivery (kund får tydligt fel).
    // Vill en restaurang ha egen prissättning skapar de en egen zon i
    // admin → den vinner via resolveDeliveryFee polygon-match.
    //
    // FÖR PICKUP: ingen leveransavgift (0) OCH inget minsta orderbelopp.
    // Minsta-order är ett leveranskoncept (zon-baserat); på avhämtning skulle
    // det annars tvinga fram en top-up som neutraliserar första-order-rabatten
    // (t.ex. 25%) och lägga en spök-"leveransavgift" på pickup-ordern.
    let deliveryFee = 0;
    let minOrderAmount = data.type === 'PICKUP' ? 0 : (globalSettings?.minOrderAmount ?? 0);
    let resolvedZoneDeliveryFee = 0;

    if (data.type === 'DELIVERY') {
      if (!data.lat || !data.lng) {
        res.status(400).json({
          error: 'Leveransadressen kunde inte hittas. Välj din adress från listan eller välj avhämtning.',
        });
        return;
      }

      // Single source of truth shared with POST /api/cities/validate-location
      // (kassan). Whatever fee the customer sees in checkout är what we
      // store on the order — no more drift mellan klient och backend.
      const resolved = await resolveDeliveryFee(
        restaurant as any,
        data.lat,
        data.lng,
        prisma as any,
      );

      if (!resolved) {
        // Restaurang har inga zoner ELLER kundens adress är utanför alla
        // zoner. Båda fallen: vi kan inte ta emot delivery-order. Tidigare
        // föll vi tillbaka på en hardkodad default-fee — det orsakade
        // "kunden beställde 49 kr leverans men vi kan inte komma dit"-buggar.
        res.status(400).json({
          error: 'Tyvärr levererar vi inte till din adress. Välj avhämtning eller en annan adress.',
        });
        return;
      }

      deliveryFee = resolved.fee;
      resolvedZoneDeliveryFee = resolved.fee;
      minOrderAmount = resolved.minOrder ?? 0;
    }
    const estimatedTime = data.scheduledFor
      ? null
      : data.type === 'PICKUP'
        ? (globalSettings?.estimatedPickupTime ?? DEFAULT_ESTIMATED_PICKUP_TIME)
        : (restaurant?.etaMinutes ?? globalSettings?.estimatedDeliveryTime ?? DEFAULT_ESTIMATED_DELIVERY_TIME);

    // BYPASS-flaggan är en utvecklarflag och MÅSTE blockeras i produktion.
    // Tidigare räckte det med att klienten skickade `stripePaymentIntentId: 'BYPASS'`
    // för att skapa en PAID-order utan att betala — vem som helst med curl
    // kunde få gratis mat. Allow ENBART när NODE_ENV !== 'production'.
    if (data.stripePaymentIntentId === 'BYPASS' && process.env.NODE_ENV === 'production') {
      console.error('[orders] BYPASS-försök i prod blockerades');
      res.status(403).json({ error: 'Ogiltig betalning' });
      return;
    }
    const bypassAllowed = data.stripePaymentIntentId === 'BYPASS' && ALLOW_TEST_ORDERS;
    // Idempotency: if this PaymentIntent already has an order, return that order directly.
    // Skip for TEST_PAYMENT, FREE_PROMO and BYPASS to allow multiple tests by developers.
    const isSpecialMockId = isTestOrder || bypassAllowed;
    const existingOrder = (data.stripePaymentIntentId && !isSpecialMockId) ? await prisma.order.findFirst({
      where: { stripePaymentIntentId: data.stripePaymentIntentId },
      select: {
        id: true,
        orderNumber: true,
        total: true,
        appliedDealTitle: true,
        estimatedTime: true,
      },
    }) : null;

    if (existingOrder) {
      console.log(`♻️ Found existing order for PaymentIntent ${data.stripePaymentIntentId}, returning early.`);
      res.json(existingOrder);
      return;
    }

    let confirmedPayment: ConfirmedPaymentIntent | null = null;
    if (intentId && !isTestOrder && !bypassAllowed) {
      confirmedPayment = await getConfirmedPaymentIntent(data.stripePaymentIntentId!);
    } else if (isTestOrder) {
      confirmedPayment = { id: data.stripePaymentIntentId || 'TEST_PAYMENT', amount: 0 };
    } else if (bypassAllowed) {
      console.log('⏩ Bypassing Stripe verification for request (NODE_ENV=', process.env.NODE_ENV, ')');
      confirmedPayment = { id: 'BYPASS', amount: -1 };
    } else if (isPendingPayment) {
      confirmedPayment = { id: 'PENDING', amount: -1 };
    }

    // Stängd-/pausad-restaurang-check körs ALLTID för betalande kunder,
    // även när vi har en confirmedPayment (pre-payment-order-flödet sätter
    // confirmedPayment={amount:-1} och hoppade tidigare över denna guard
    // → kunder kunde köpa från restauranger som just stängt mellan
    // page-load och submit). Undantag: isTestOrder och bypassAllowed,
    // som båda är dev-only.
    const skipClosedCheck = isTestOrder || bypassAllowed;
    if (!skipClosedCheck && !restaurantOpen) {
      const isCrisis = availability.reason === 'PLATFORM_PAUSED' || availability.reason === 'CITY_PAUSED';
      res.status(isCrisis ? 503 : 400).json({
        error: isCrisis ? 'ORDERS_PAUSED' : 'RESTAURANT_CLOSED',
        message: 'Tyvärr, restaurangen tar inte emot beställningar just nu.',
        availabilityReason: availability.reason,
      });
      return;
    }

    // Validera leveransadress om delivery
    // Zip är fortfarande valfritt — zon-kontrollen på GPS-koordinater avgör
    // leveransbarhet och avgift. Men gatan måste vara en riktig gatuadress:
    // ett postnummer eller ett ortnamn gav förut en order som restaurangen
    // inte kunde köra ut. Klienterna varnar tidigare, den här grinden är den
    // som gäller för webben, partner-embedden OCH appen.
    if (data.type === 'DELIVERY') {
      const addressCheck = checkDeliveryStreet(data.deliveryStreet);
      if (!addressCheck.ok) {
        res.status(400).json({
          error: addressCheck.message,
          code: 'DELIVERY_ADDRESS_INCOMPLETE',
          issue: addressCheck.issue,
        });
        return;
      }
    }

    const now = new Date();
    const restaurantFoodVatPercent = normalizeFoodVatPercent((restaurant as any).vatPercent, 6);
    const orderDeliveryVatPercent = data.type === 'DELIVERY'
      ? deliveryVatPercent(Boolean((restaurant as any).selfDelivery), restaurantFoodVatPercent)
      : null;

    // Hämta produkter och beräkna priser
    const allActiveDeals = await prisma.deal.findMany({
      // Personliga mallar (welcome/referral) får ALDRIG appliceras som
      // publika auto-deals — de delas bara ut som UserDeals till registrerade
      // kunder. Annars läckte t.ex. "25% första beställning"-välkomstmallen in
      // som automatisk rabatt för ALLA gäst-ordrar.
      where: { isActive: true, isPersonalTemplate: false, isTemplate: false },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
    // Fail closed at the entrance to pricing. Every downstream catalog- and
    // basket-deal calculation sees only deals explicitly scoped to this
    // restaurant (or an intentionally global deal).
    const activeDeals = allActiveDeals.filter((deal) =>
      dealMatchesRestaurant(deal, restaurant.id),
    );
    const productIds = [...new Set(data.items.map((i) => i.productId))];
    const requireActiveCatalog = !confirmedPayment || isPendingPayment;
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        ...(requireActiveCatalog ? { isActive: true } : {}),
        // Never accept a product from another restaurant merely because the
        // client supplied a valid global product id.
        category: {
          restaurantId: restaurant.id,
          ...(requireActiveCatalog ? { isActive: true } : {}),
        },
      },
      include: {
        extraGroups: {
          include: {
            extraGroup: {
              include: {
                extras: requireActiveCatalog ? { where: { isActive: true } } : true,
              },
            },
          },
        },
      },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    let hasCatalogDiscountedItems = false;
    // Underlaget för kuponger med excludeDiscountedItems: bara de rader som
    // INTE redan är nedsatta (menypris-rea, produkt-/kategorideal eller
    // BOGO-gratisvara). Räknas parallellt med subtotal så en kod som
    // "30 % på ej rabatterade varor" aldrig ger rabatt ovanpå rabatt.
    let discountableSubtotal = 0;
    const orderItems: any[] = [];

    for (const item of data.items) {
      const product = productMap.get(item.productId);
      if (!product) {
        res.status(400).json({ error: `Produkt ${item.productId} hittades inte` });
        return;
      }

      const groupMap = new Map(
        product.extraGroups.map((peg) => [
          peg.extraGroup.id,
          {
            ...peg.extraGroup,
            extraMap: new Map(peg.extraGroup.extras.map((extra) => [extra.id, extra])),
            // PER-PRODUKT-ordning: ProductExtraGroup.position (peg.position) — exakt
            // samma nyckel som meny-queryn ordnar grupperna på (orderBy position).
            // INTE extraGroup.position (global) som grupperar t.ex. alla "Pizza"
            // för sig och alla "Sås" för sig → fel ordning på kombo-produkter.
            groupPosition: (peg as any).position ?? 0,
            // Tillvalens egen ordning i gruppen = Extra.position (samma som menyn).
            extraOrder: new Map(peg.extraGroup.extras.map((extra: any) => [extra.id, extra.position ?? 0])),
          },
        ]),
      );

      const validatedExtras = item.selectedExtras.map((selected) => {
        const group = groupMap.get(selected.groupId);
        const extra = group?.extraMap.get(selected.extraId);
        try {
          return resolveAuthoritativeExtraSelection({
            productName: product.name,
            group,
            extra,
            selected,
          });
        } catch (error) {
          if (error instanceof OrderExtraPricingError) {
            throw new OrderValidationError(error.userMessage);
          }
          throw error;
        }
      });

      // Lagra tillvalen i EXAKT samma ordning som produktmodalen visar dem:
      // grupper på PER-PRODUKT-ordning (ProductExtraGroup.position = peg.position,
      // samma som meny-queryn), tillval inom en grupp på Extra.position. Tidigare
      // sorterade vi på extraGroup.position (global) vilket bröt kombo-produkter
      // (alla pizzor först, alla såser sen) — nu blir det pizza1, sås1, pizza2, sås2.
      validatedExtras.sort((a, b) => {
        const ga = groupMap.get(a.groupId) as any;
        const gb = groupMap.get(b.groupId) as any;
        const gpa = ga?.groupPosition ?? 0;
        const gpb = gb?.groupPosition ?? 0;
        if (gpa !== gpb) return gpa - gpb;
        const ea = ga?.extraOrder?.get(a.extraId) ?? 0;
        const eb = gb?.extraOrder?.get(b.extraId) ?? 0;
        return ea - eb;
      });

      if (requireActiveCatalog) {
        for (const group of groupMap.values()) {
          // Defensiv null-coalescing — schemat säger NOT NULL men gammal data
          // från före migration kan ha null-värden.
          const minSel = group.minSelections ?? 0;
          const maxSel = group.maxSelections ?? 99;
          const selectedInGroup = validatedExtras.filter((selected) => selected.groupId === group.id);
          // allowQuantity-grupper: kunden får beställa samma val flera gånger, så
          // gränserna mäts mot SUMMAN av kvantiteter (inte antal distinkta val).
          const totalInGroup = (group as any).allowQuantity
            ? selectedInGroup.reduce((n, sel) => n + ((sel as any).quantity ?? 1), 0)
            : selectedInGroup.length;
          if (totalInGroup < minSel) {
            throw new OrderValidationError(`${product.name} kräver minst ${minSel} val i ${group.name.toLowerCase()}`);
          }
          if (totalInGroup > maxSel) {
            throw new OrderValidationError(`${product.name} tillåter högst ${maxSel} val i ${group.name.toLowerCase()}`);
          }
          if (group.required && selectedInGroup.length === 0) {
            throw new OrderValidationError(`${group.name} måste väljas för ${product.name}`);
          }
          if (group.type === 'RADIO' && selectedInGroup.length > 1) {
            throw new OrderValidationError(`Du kan bara välja ett alternativ i ${group.name.toLowerCase()}`);
          }
        }
      }

      const extrasTotal = validatedExtras.reduce((sum, e) => sum + Math.round(e.priceAddon * 100) * ((e as any).quantity ?? 1), 0);
      const displayPromotion = resolveDisplayPromotionForProduct({
        product,
        categoryId: (product as any).categoryId,
        restaurantId: restaurant.id,
        deals: activeDeals.filter((deal) => isDealAvailableNow(deal, now)),
      });
      const catalogBaseOre = !item.bogoFreeFromDealId && displayPromotion?.salePriceOre && displayPromotion.salePriceOre < product.price
        ? displayPromotion.salePriceOre
        : product.price;
      // Negativa katalogtillval används för t.ex. barnpizza, men en felaktig
      // admin-konfiguration får aldrig skapa en negativ produktrad/utbetalning.
      try {
        assertNonnegativeCatalogLine(product.name, catalogBaseOre, extrasTotal);
      } catch (error) {
        if (error instanceof OrderExtraPricingError) {
          throw new OrderValidationError(error.userMessage);
        }
        throw error;
      }
      const itemHasCatalogDiscount = !item.bogoFreeFromDealId && catalogBaseOre < product.price;
      if (itemHasCatalogDiscount) hasCatalogDiscountedItems = true;
      const lineItemOre = (catalogBaseOre + extrasTotal) * item.quantity;
      const itemSubtotal = lineItemOre;
      subtotal += itemSubtotal;
      // Samma regel som kassan (apps/web/app/cart/page.tsx): bara det nedsatta
      // baspriset undantas — tillval är aldrig rabatterade och räknas därför
      // med även på en rea-rad. BOGO-raden ligger till fullpris i subtotal när
      // en kupong används (kupongen nollar auto-dealen) och räknas därmed med.
      discountableSubtotal += itemHasCatalogDiscount
        ? extrasTotal * item.quantity
        : itemSubtotal;

      orderItems.push({
        productId: product.id,
        productName: product.name,
        basePrice: catalogBaseOre,
        quantity: item.quantity,
        note: item.note,
        selectedExtras: JSON.stringify(validatedExtras), // Store as string for SQLite
        subtotal: itemSubtotal,
        // Snapshot the tax rate used at purchase time. Product overrides are
        // for mixed baskets (for example alcohol at 25%); extras inherit it.
        vatPercent: normalizeVatPercent((product as any).vatPercent, restaurantFoodVatPercent),
      });
    }

    // Min-order-validering flyttad nedåt — den behöver veta om en rabatt
    // appliceras (eftersom rabatt-tolerans bara aktiveras DÅ). Se
    // "RABATT-TOLERANS"-kommentaren längre ner efter discountAmount är klar.
    // Här bestämmer vi bara `pendingMinOrderTopUp` så vi inte tappar bort
    // klientens topUp-input innan vi vet om den behövs.
    const pendingMinOrderTopUpOre = Math.max(0, Math.round(Number(data.minOrderTopUp || 0) * 100));

    // Rabattkod och automatiska deals
    let manualFoodDiscountAmount = 0;
    let manualDeliveryDiscountAmount = 0;
    let validatedCode: string | undefined;
    const hasRequestedBogoFreeItem = data.items.some((item) => !!item.bogoFreeFromDealId);

    // Manuella kuponger och personliga UserDeals får väljas även när en vara
    // har nedsatt menypris. Endast ett kassaerbjudande används, och backend
    // räknar det på den redan reducerade, auktoritativa subtotalen.
    if (hasCatalogDiscountedItems && hasRequestedBogoFreeItem) {
      throw new OrderValidationError('BOGO kan inte kombineras med redan rabatterade produkter');
    }

    if (data.discountCode) {
      const codeVal = data.discountCode?.toLowerCase();
      if (codeVal === 'test' || codeVal === 'testa') {
        validatedCode = codeVal;
        manualFoodDiscountAmount = 0; // Total will be forced to 0 below.
      } else {
        const code = await prisma.discountCode.findUnique({
          where: { code: data.discountCode.toUpperCase(), isActive: true },
        });

        if (code) {
          const isExpired = (code.validUntil && code.validUntil < now) ||
            (code.maxUsages !== null && code.usageCount >= code.maxUsages);

          const applicableIds = parseApplicableRestaurantIds((code as any).applicableRestaurantIds);
          const codeRestaurantId = (code as any).restaurantId;
          const restaurantAllowed =
            applicableIds.length > 0
              ? applicableIds.includes(restaurant.id)
              : codeRestaurantId
                ? codeRestaurantId === restaurant.id
                : true;

          // Plattforms-spärr (backstop). Klienten avvisas redan i
          // /discount/validate, men vi återvaliderar här (server-sanning):
          // en APP-only-kod appliceras aldrig om ordern inte kommer från
          // appen. Nekas → validatedCode förblir undefined → fullpris, precis
          // som vid utgången/otillräcklig minOrder ovan.
          const platformAllowed = discountPlatformAllowed((code as any).platform, req);

          // excludeDiscountedItems → rabatten räknas bara på de rader som
          // inte redan är nedsatta. Underlaget är alltid ≤ subtotal, så
          // minOrder-kontrollen ovan (mot hela subtotalen) står kvar
          // oförändrad: tröskeln gäller vad kunden handlar för, inte vad
          // kupongen får bita på.
          const codeBaseOre = (code as any).excludeDiscountedItems
            ? discountableSubtotal
            : subtotal;

          if (!isExpired && subtotal >= code.minOrder && restaurantAllowed && platformAllowed) {
            if (code.type === 'PERCENTAGE') {
              manualFoodDiscountAmount = Math.round(codeBaseOre * code.value / 100);
            } else if (code.type === 'FREE_DELIVERY') {
              manualDeliveryDiscountAmount = deliveryFee;
            } else {
              manualFoodDiscountAmount = Math.min(code.value, codeBaseOre);
            }
            // Stackbar fri leverans-flagga: PERCENTAGE eller FIXED kupong
            // kan ha freeDelivery=true → leveransavgiften absorberas också.
            // FREE_DELIVERY-typen ignorerar flaggan (redundant — den ÄR
            // redan fri leverans). manualDiscountAmount innehåller då
            // BÅDA komponenterna i ett enda värde.
            if (
              (code as any).freeDelivery &&
              code.type !== 'FREE_DELIVERY' &&
              deliveryFee > 0
            ) {
              manualDeliveryDiscountAmount = deliveryFee;
            }
            // Hela varukorgen redan rabatterad → koden biter inte på något.
            // Vi sätter INTE validatedCode då; annars hade ordern burit en
            // kod som gav 0 kr och kunden trott att rabatten var uttagen.
            // /api/discount/validate nekar redan koden i kassan av samma skäl.
            if (manualFoodDiscountAmount > 0 || manualDeliveryDiscountAmount > 0) {
              validatedCode = code.code;
            }
          }
        } else {
          // 2. Check personalized customer deals.
          // OBS: `code` är @unique → slå upp PÅ KODEN ENSAM. Tidigare krävdes
          // exakt `phone: data.customerPhone` i WHERE, vilket TYST gav 0 rabatt
          // (→ kunden debiterades FULLPRIS) så fort telefonformatet skilde sig
          // (t.ex. "+46 70.." i deal vs "070.." i formuläret), trots att carten
          // visade rabatten. Ägarskap valideras nu i JS mot userId ELLER
          // normaliserat telefonnummer.
          const personalDeal = await (prisma as any).customerDeal.findFirst({
             where: {
               code: data.discountCode,
               campaign: {
                  isActive: true,
                  OR: [
                    { validUntil: null },
                    { validUntil: { gte: now } }
                  ]
               }
             },
             include: { campaign: true }
          });

          const onlyDigits = (v: any) => String(v ?? '').replace(/\D/g, '');
          const dealOwnerOk = personalDeal
            ? (
                (authenticatedUserId && personalDeal.userId === authenticatedUserId) ||
                (personalDeal.phone && data.customerPhone &&
                  onlyDigits(personalDeal.phone).slice(-9) === onlyDigits(data.customerPhone).slice(-9))
              )
            : false;

          if (personalDeal && dealOwnerOk) {
            const isUsable = personalDeal.usageCount < (personalDeal.maxUsages || 1);
            const minOrderOre = normalizeMoneyToOre(personalDeal.campaign.minOrder ?? 0);
            if (isUsable && subtotal >= minOrderOre) {
              if (personalDeal.campaign.discountType === 'PERCENTAGE') {
                manualFoodDiscountAmount = Math.round(subtotal * personalDeal.campaign.discountValue / 100);
              } else {
                const fixedDiscountOre = normalizeMoneyToOre(personalDeal.campaign.discountValue ?? 0);
                manualFoodDiscountAmount = Math.min(fixedDiscountOre, subtotal);
              }
              validatedCode = personalDeal.code;
            }
          }
        }
      }
    }

    const customerDealOrders = await prisma.order.findMany({
      where: {
        customerPhone: data.customerPhone,
        appliedDealId: { not: null },
      },
      select: { appliedDealId: true },
    });

    const customerDealUsage = new Map<string, number>();
    for (const order of customerDealOrders) {
      if (!order.appliedDealId) continue;
      customerDealUsage.set(order.appliedDealId, (customerDealUsage.get(order.appliedDealId) || 0) + 1);
    }

    let appliedDeal: (typeof activeDeals)[number] | null = null;
    let automaticFoodDiscountAmount = 0;
    let automaticDeliveryDiscountAmount = 0;
    // skipAutomaticDeal=true → kunden har stängt av auto-dealen i UI:n.
    // Vi hoppar HELA pickup-loopen (utom BOGO som är knuten till items i
    // kundvagnen och hanteras separat nedan). Detta säkerställer att
    // frontend-totalen (utan auto-deal) matchar backend-totalen.
    const skipAutoDeals = !!data.skipAutomaticDeal || hasCatalogDiscountedItems;
    const productIdsInCart = data.items.flatMap((item) => Array.from({ length: item.quantity }, () => item.productId));

    const cartItemsForBogo: CartItemForBogo[] = orderItems.map((oi) => {
      const prod = productMap.get(oi.productId);
      return {
        productId: oi.productId,
        categoryId: (prod as any)?.categoryId ?? '',
        basePriceOre: prod?.price ?? 0,
        quantity: oi.quantity,
      };
    });

    // Cap på antal gratis-varor från BOGO-deal som klienten valt. Spara
    // per dealId så vi efter loop:en kan validera att kunden inte smugglar
    // fler items än tillåtet (DevTools-abuse-skydd från Marias audit).
    let appliedBogoMaxFreeItems = 0;

    for (const deal of activeDeals) {
      if (!isDealAvailableNow(deal, now)) continue;
      // PRODUCT/CATEGORY prices are already applied per matching item above.
      // Never evaluate them as whole-basket discounts.
      if (!isAutomaticBasketDeal(deal)) continue;

      if (
        deal.maxUsesPerCustomer !== null &&
        (customerDealUsage.get(deal.id) || 0) >= deal.maxUsesPerCustomer
      ) {
        continue;
      }

      const evaluation = evaluateDeal(deal, {
        subtotalOre: subtotal,
        productIds: productIdsInCart,
        cartItems: cartItemsForBogo,
      });

      if (!evaluation.eligible) continue;
      // Respektera kundens explicita avstängning av auto-deals.
      // BOGO_CATEGORY MED gratis-varor (maxFreeItems > 0) hoppas INTE över —
      // gratis-varorna ligger redan i kundvagnen och dismiss skulle göra
      // dem betalda utan att ta bort dem (förvirrande UX). BOGO utan
      // gratis-varor (pure-discount, t.ex. "25% första beställning" satt
      // som BOGO_CATEGORY) skippas precis som andra rabatter.
      const isBogoCategoryDeal = deal.triggerType === 'BOGO_CATEGORY';
      const hasFreeItems = ((evaluation as any).maxFreeItems ?? 0) > 0;
      const isBogoWithFreeItems = isBogoCategoryDeal && hasFreeItems;
      if (skipAutoDeals && !isBogoWithFreeItems) continue;

      if (evaluation.discountAmountOre > automaticFoodDiscountAmount + automaticDeliveryDiscountAmount) {
        automaticFoodDiscountAmount = evaluation.discountAmountOre;
        automaticDeliveryDiscountAmount = 0;
        appliedDeal = deal;
        // maxFreeItems exponeras bara av BOGO_CATEGORY-evalueringen.
        appliedBogoMaxFreeItems = (evaluation as any).maxFreeItems ?? 0;
      }
    }

    // Säkerhetsvalidering: räkna antal items klienten flaggat som
    // bogoFreeFromDealId === appliedDeal.id. Om count > maxFreeItems
    // har kunden manipulerat carten (t.ex. via DevTools). Rejekta.
    if (appliedDeal && appliedDeal.triggerType === 'BOGO_CATEGORY') {
      const claimedFreeCount = data.items
        .filter((it) => it.bogoFreeFromDealId === appliedDeal!.id)
        .reduce((sum, it) => sum + it.quantity, 0);
      if (claimedFreeCount > appliedBogoMaxFreeItems) {
        throw new OrderValidationError(
          `Du har valt ${claimedFreeCount} gratis-varor men endast ${appliedBogoMaxFreeItems} är tillåtna för denna deal. Ta bort några och försök igen.`,
        );
      }
      // Enforce blockerade tillval server-side: en gratis-vara får inte bära
      // tillval som admin uteslutit (bogoExcludedExtraIds). Klienten filtrerar
      // redan bort dem, men vi litar inte på klienten.
      let excludedExtraIds: string[] = [];
      try { excludedExtraIds = JSON.parse((appliedDeal as any).bogoExcludedExtraIds || '[]'); } catch { excludedExtraIds = []; }
      if (excludedExtraIds.length > 0) {
        const excludedSet = new Set(excludedExtraIds);
        for (const it of data.items) {
          if (it.bogoFreeFromDealId !== appliedDeal.id) continue;
          const bad = (it.selectedExtras || []).find((e) => excludedSet.has(e.extraId));
          if (bad) {
            throw new OrderValidationError(`Tillvalet "${bad.extraName ?? ''}" kan inte väljas på gratis-varan i denna deal.`);
          }
        }
      }
    }

    // ── Välkomsterbjudande (driver kassans toggle) ──────────────────────────
    // Appliceras som auto-rabatt om aktivt, kunden är berättigad (audience +
    // första-N-order via telefon, eller inloggad) och auto-deals inte avstängda.
    // Konkurrerar med publika auto-deals → störst belopp vinner. Detta är vad
    // som gör att admin-konfigurerat välkomserbjudande faktiskt syns/appliceras
    // i gäst-kassan (matchar /api/welcome-offer som kassan läser).
    let welcomeAppliedTitle: string | null = null;
    let welcomeAppliedDealId: string | null = null;
    let automaticWelcomeApplied = false;
    if (!skipAutoDeals) {
      try {
        const welcomeOffer = await getWelcomeOffer();
        if (welcomeOffer) {
          const priorOrders = await prisma.order.count({
            where: {
              customerPhone: data.customerPhone,
              status: { notIn: ['CANCELLED', 'REJECTED'] },
            },
          });
          const eligible = isWelcomeEligible(welcomeOffer, {
            priorOrderCount: priorOrders,
            isLoggedIn: !!authenticatedUserId,
          });
          if (eligible) {
            const welcomeTotal =
              welcomeOfferDiscountOre(welcomeOffer, subtotal) +
              (welcomeOffer.freeDelivery ? Math.max(0, deliveryFee) : 0);
            if (welcomeTotal > automaticFoodDiscountAmount + automaticDeliveryDiscountAmount) {
              automaticFoodDiscountAmount = welcomeOfferDiscountOre(welcomeOffer, subtotal);
              automaticDeliveryDiscountAmount = welcomeOffer.freeDelivery ? Math.max(0, deliveryFee) : 0;
              appliedDeal = null;
              welcomeAppliedTitle = welcomeOffer.title;
              welcomeAppliedDealId = welcomeOffer.dealId;
              automaticWelcomeApplied = true;
            }
          }
        }
      } catch (e) {
        console.error('[order] welcome-offer resolve failed:', e);
      }
    }

    // Användarens EXPLICITA val (kupong-kod) vinner alltid över auto-deal —
    // även om kupongen är mindre värd. Annars kunde inte kunden "byta" från
    // en stor auto-deal till sin egen kod. Frontend visar nu auto-dealen som
    // en avstängbar knapp och förväntar samma beteende här. Om data.discountCode
    // är skickat OCH validerades (manualDiscountAmount > 0 eller test-flow),
    // använd det. Annars fall tillbaka på automaticDiscountAmount.
    const manualDiscountAmount = manualFoodDiscountAmount + manualDeliveryDiscountAmount;
    const userSentDiscountCode = !!data.discountCode && (manualDiscountAmount > 0 || validatedCode);
    let foodDiscountAmount = userSentDiscountCode
      ? manualFoodDiscountAmount
      : automaticFoodDiscountAmount;
    let deliveryDiscountAmount = userSentDiscountCode
      ? manualDeliveryDiscountAmount
      : automaticDeliveryDiscountAmount;
    let discountAmount = foodDiscountAmount + deliveryDiscountAmount;

    if (userSentDiscountCode) {
      appliedDeal = null;
      // Kupong-kod vinner → välkomsterbjudandet gäller inte (discountAmount
      // = manualDiscountAmount, inte automaticDiscountAmount).
      welcomeAppliedTitle = null;
      welcomeAppliedDealId = null;
      automaticWelcomeApplied = false;
    } else {
      validatedCode = undefined;
    }

    // ── UserDeal (welcome/referral-kupong) ──────────────────────────────
    // Klienten skickar userDealId från GET /api/account/deals. Vi validerar
    // ägarskap, status, expiry och minOrderKr. Om dealen är större än övriga
    // rabatter — vinner den och nuller appliedDeal/validatedCode (samma
    // logik som "best wins" ovan, men user-toggled trumfar automatic).
    //
    // Rabattberäkning: discountPercent har företräde (20 = 20% av subtotal).
    // amountKr behålls som legacy-fallback för deals skapade innan
    // percent-migreringen (vissa kan ha gamla 50 kr-rabatter i DB).
    let appliedUserDealId: string | null = null;
    let appliedUserDealAmountKr: number | null = null;
    let appliedUserDealType: string | null = null;
    if (data.userDealId && orderUserId) {
      const userDeal = await (prisma as any).userDeal.findFirst({
        where: {
          id: data.userDealId,
          userId: orderUserId,
          status: 'ACTIVE',
          OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
        },
        include: { deal: true },
      });
      if (!userDeal) {
        throw new OrderValidationError('Kupongen är inte längre giltig');
      }
      const userDealMeta = (userDeal.metadata || {}) as any;
      const normalizeCouponPhone = (value: unknown) => {
        let digits = String(value ?? '').replace(/\D/g, '');
        if (digits.startsWith('00')) digits = digits.slice(2);
        if (digits.startsWith('0')) digits = `46${digits.slice(1)}`;
        if (!digits.startsWith('46') && digits.length === 9 && digits.startsWith('7')) digits = `46${digits}`;
        return digits;
      };
      if (
        userDealMeta.ownerPhone &&
        !authenticatedUserId &&
        normalizeCouponPhone(userDealMeta.ownerPhone) !== normalizeCouponPhone(data.customerPhone)
      ) {
        throw new OrderValidationError('Kupongen tillhör ett annat telefonnummer');
      }
      if (userDeal.type === 'FAVORITE_PRODUCT' || userDealMeta.favoriteProductId) {
        await (prisma as any).userDeal.updateMany({
          where: { id: userDeal.id, status: { in: ['ACTIVE', 'RESERVED'] } },
          data: { status: 'EXPIRED' },
        }).catch(() => null);
        throw new OrderValidationError('Din favorit-dealen är borttagen');
      }
      if (
        ['APP_DEAL', 'APP_MISSION', 'CAMPAIGN'].includes(String(userDeal.type || '')) &&
        (!userDeal.deal || !userDeal.deal.isActive || !userDeal.deal.appEnabled || (userDeal.deal.validFrom && userDeal.deal.validFrom > new Date()) || (userDeal.deal.validUntil && userDeal.deal.validUntil < new Date()))
      ) {
        await (prisma as any).userDeal.updateMany({
          where: { id: userDeal.id, status: { in: ['ACTIVE', 'RESERVED'] } },
          data: { status: 'EXPIRED' },
        }).catch(() => null);
        throw new OrderValidationError('Kupongen är inte längre giltig');
      }
      // Restaurang-scopad deal gäller bara i sin restaurangs kassa.
      const dealScope = userDealRestaurantScope(userDeal.deal);
      if (dealScope && !dealScope.includes(restaurant.id)) {
        throw new OrderValidationError('Kupongen gäller inte på den här restaurangen');
      }
      // Din favorit: rabatten gäller bara när favoriten ligger i beställningen
      // hos sin restaurang.
      const favoriteMeta = userDealMeta;
      if (favoriteMeta.favoriteProductId) {
        const favoriteProduct = await prisma.product.findFirst({
          where: {
            id: favoriteMeta.favoriteProductId,
            isActive: true,
            category: {
              isActive: true,
              restaurant: { comingSoon: false, draft: false },
            },
          },
          select: { id: true, isActive: true },
        });
        if (!favoriteProduct) {
          await (prisma as any).userDeal.updateMany({
            where: { id: userDeal.id, status: { in: ['ACTIVE', 'RESERVED'] } },
            data: { status: 'EXPIRED' },
          }).catch(() => null);
          throw new OrderValidationError('Favoriten finns inte längre');
        }
        if (favoriteMeta.restaurantId && favoriteMeta.restaurantId !== restaurant.id) {
          throw new OrderValidationError('Favorit-rabatten gäller hos en annan restaurang');
        }
        const hasFavorite = (data.items || []).some((item: any) => item.productId === favoriteMeta.favoriteProductId);
        if (!hasFavorite) {
          throw new OrderValidationError('Lägg din favorit i beställningen för att använda rabatten');
        }
      }
      const minOrderKr = (userDeal.metadata as any)?.minOrderKr ?? 0;
      if (subtotal < minOrderKr * 100) {
        throw new OrderValidationError(
          `Min orderbelopp för denna kupong är ${minOrderKr} kr`,
        );
      }
      // Beräkna stackad rabatt:
      //   1. Subtotal-rabatt (PERCENTAGE / FIXED / FIXED_PRICE): cappad till subtotal
      //   2. Fri leverans (boolean): cappad till deliveryFee
      //   3. Backward compat: discountType=FREE_DELIVERY tolkas som
      //      freeDelivery=true (vi tog bort det från enum men gamla
      //      UserDeals kan ha det)
      const isLegacyFreeDeliveryType = userDeal.discountType === 'FREE_DELIVERY';
      const wantsFreeDelivery = !!userDeal.freeDelivery || isLegacyFreeDeliveryType;

      let subtotalDiscountOre = 0;
      if (!isLegacyFreeDeliveryType) {
        if (userDeal.discountType === 'FIXED_PRICE' && userDeal.amountKr && userDeal.amountKr > 0) {
          const meta = (userDeal.metadata || {}) as any;
          const metadataTargetIds = Array.isArray(meta.targetIds) ? meta.targetIds.filter((id: unknown): id is string => typeof id === 'string') : [];
          const targetIds = metadataTargetIds.length
            ? metadataTargetIds
            : (() => {
                try {
                  const parsed = JSON.parse(userDeal.deal?.comboProductIds || '[]');
                  return Array.isArray(parsed) ? parsed.filter((id: unknown): id is string => typeof id === 'string') : [];
                } catch {
                  return [];
                }
              })();
          const scopeType = String(meta.scopeType || userDeal.deal?.triggerType || '').toUpperCase();
          const fixedPriceOre = Math.round(Number(userDeal.amountKr || 0) * 100);
          subtotalDiscountOre = data.items.reduce((sum: number, item: any) => {
            const product = productMap.get(item.productId) as any;
            if (!product) return sum;
            const matches =
              scopeType === 'CATEGORY'
                ? targetIds.includes(product.categoryId)
                : targetIds.includes(product.id);
            if (!matches) return sum;
            return sum + Math.max(0, Number(product.price || 0) - fixedPriceOre) * Math.max(1, Number(item.quantity || 1));
          }, 0);
        } else if (userDeal.discountPercent && userDeal.discountPercent > 0) {
          subtotalDiscountOre = Math.round((subtotal * userDeal.discountPercent) / 100);
        } else if (userDeal.amountKr && userDeal.amountKr > 0) {
          subtotalDiscountOre = userDeal.amountKr * 100;
        }
      }
      subtotalDiscountOre = Math.min(subtotalDiscountOre, subtotal);

      const deliveryDiscountOre = wantsFreeDelivery ? deliveryFee : 0;

      const totalDealOre = subtotalDiscountOre + deliveryDiscountOre;
      if (totalDealOre > 0) {
        // discountAmount absorberar BÅDA komponenterna. Order-formel är
        // total = subtotal - discountAmount + deliveryFee. Med freeDelivery:
        // discountAmount = subtotalDisc + deliveryFee → leveransen blir gratis.
        if (totalDealOre > 0) {
          foodDiscountAmount = subtotalDiscountOre;
          deliveryDiscountAmount = deliveryDiscountOre;
          discountAmount = foodDiscountAmount + deliveryDiscountAmount;
          appliedDeal = null;
          validatedCode = undefined;
          // UserDeal vinner → välkomst-auto-erbjudandet gäller inte.
          welcomeAppliedTitle = null;
          welcomeAppliedDealId = null;
          automaticWelcomeApplied = false;
        }
        appliedUserDealId = userDeal.id;
        appliedUserDealAmountKr = Math.round(totalDealOre / 100);
        appliedUserDealType = String(userDeal.type || '');
      }
    }

    // Leveransavgift (use pre-calculated value from above)

    // Test-order: tvinga total till 0 oavsett discount-stack. UserDeal
    // (33% rabatt) eller automatiska deals kan annars producera ett
    // positivt total som matchar inte den 0-betalning bypass:en gör.
    // Vi maxar discountAmount till subtotal+deliveryFee = allt absorberas.
    if (isTestOrder) {
      foodDiscountAmount = subtotal;
      deliveryDiscountAmount = deliveryFee;
      discountAmount = foodDiscountAmount + deliveryDiscountAmount;
    } else {
      foodDiscountAmount = Math.min(Math.max(0, foodDiscountAmount), subtotal);
      deliveryDiscountAmount = Math.min(Math.max(0, deliveryDiscountAmount), deliveryFee);
      discountAmount = foodDiscountAmount + deliveryDiscountAmount;
    }
    const platformDiscountFunding = isTestOrder
      ? {
          platformFundedFoodDiscountAmount: 0,
          platformFundedDeliveryDiscountAmount: 0,
        }
      : resolvePlatformFundedDiscount({
          foodDiscountAmount,
          deliveryDiscountAmount,
          automaticWelcomeApplied,
          appliedUserDealType,
        });

    // ── RABATT-TOLERANS: min-order-validering ────────────────────────────────
    // Nu när discountAmount är slutgiltig kan vi avgöra om kunden får använda
    // 40-kr-toleransen. Regeln:
    //   - Ingen rabatt aktiv → strikt min gäller (subtotal >= minOrderAmount)
    //   - Rabatt aktiv      → tillåt subtotal − discount ≥ (minOrderAmount − 40 kr)
    //
    // Anti-bypass: en kund med bara en dryck (~20 kr) klarar varken den
    // strikta eller den lägre tröskeln, så "lägg dryck + 100%-rabatt"-flödet
    // går fortfarande inte igenom.
    //
    // Kund kan dessutom betala mellanskillnaden manuellt via `minOrderTopUp`.
    // confirmedPayment hoppar över checken (en pre-payment-order har redan
    // passerat denna validering en gång).
    let smallOrderFee = 0;
    if ((!confirmedPayment || isPendingPayment) && !isTestOrder) {
      const MIN_ORDER_TOLERANCE_ORE = 4000; // 40 kr
      const hasActiveDiscount = foodDiscountAmount > 0;
      const effectiveMinOrderAmount = hasActiveDiscount
        ? Math.max(0, minOrderAmount - MIN_ORDER_TOLERANCE_ORE)
        : minOrderAmount;
      const afterDiscountValue = Math.max(0, subtotal - foodDiscountAmount);

      if (afterDiscountValue < effectiveMinOrderAmount) {
        const shortfall = effectiveMinOrderAmount - afterDiscountValue;
        if (pendingMinOrderTopUpOre >= shortfall) {
          smallOrderFee = pendingMinOrderTopUpOre;
        } else {
          const minKr = minOrderAmount / 100;
          const effectiveMinKr = effectiveMinOrderAmount / 100;
          const shortfallKr = (shortfall / 100).toFixed(0);
          res.status(400).json({
            error: hasActiveDiscount
              ? `Minsta beställningsbelopp är ${minKr} kr (rabatt får dra ner till ${effectiveMinKr} kr). Du saknar ${shortfallKr} kr.`
              : `Minsta beställningsbelopp är ${minKr} kr. Du saknar ${shortfallKr} kr.`,
          });
          return;
        }
      }
    }

    // Dricks: konvertera kr → öre och lägg på total. Inkluderas i Stripe-
    // beloppet (klient skickar tip i sin total) så amount-check matchar.
    // Bara DELIVERY-orders (frontend gate:ar redan men dubbelkolla här).
    const tipOre = data.tip && data.type === 'DELIVERY'
      ? Math.max(0, Math.round(Number(data.tip) * 100))
      : 0;

    // Alla komponenter är redan heltalsöre. Ta exakt belopp; att avrunda upp
    // till nästa krona överdebiterade tidigare kunden med upp till 99 öre.
    // Diagnostik: klienten skickade en rabattkod men servern applicerade 0 rabatt
    // → kunden skulle debiteras fullpris (carten visade rabatt). Logga så att
    // ev. kvarvarande mismatch syns direkt i loggarna.
    if (data.discountCode && discountAmount === 0 && data.discountCode !== 'test' && data.discountCode !== 'testa') {
      console.warn('[orders] discountCode skickad men 0 rabatt applicerad (kund riskerar fullpris)', {
        code: data.discountCode, phone: data.customerPhone, subtotal, restaurantId: restaurant?.id,
      });
    }
    const rawTotal = subtotal - foodDiscountAmount + deliveryFee - deliveryDiscountAmount + smallOrderFee + tipOre;
    const total = Math.max(0, rawTotal);

    // Defense in depth between the cart and hosted payment. The server remains
    // authoritative, but a stale/mis-scoped deal or fee must never silently
    // change what the customer saw by more than one krona.
    if (!checkoutTotalMatches(data.expectedTotalKr, total)) {
      const differenceOre = checkoutTotalDifferenceOre(data.expectedTotalKr, total);
      console.warn('[orders] checkout total mismatch; payment creation blocked', {
        restaurantId: restaurant.id,
        clientTotalOre: data.expectedTotalKr == null ? null : Math.round(data.expectedTotalKr * 100),
        serverTotalOre: total,
        differenceOre,
        toleranceOre: CHECKOUT_TOTAL_TOLERANCE_ORE,
      });
      throw new OrderValidationError(
        'Beloppet har ändrats sedan kassan laddades. Uppdatera kassan och försök igen.',
      );
    }

    // Verifiera Stripe-beloppet matchar det vi räknat fram. Tidigare auto-justerade
    // koden order-total NEDÅT om Stripe visade lägre belopp — det betydde att en
    // angripare kunde betala mindre via en manipulerad PaymentIntent och få mat
    // för det reducerade beloppet. Nu kastar vi fel istället.
    //
    // Tolerans: 1 öre (avrundningsavvikelse). Skippas helt för:
    //  - BYPASS (amount === -1)
    //  - isTestOrder (test/testa-koden + FREE_PROMO/TEST_PAYMENT)
    if (confirmedPayment && confirmedPayment.amount !== -1 && !isTestOrder) {
      const diff = Math.abs(confirmedPayment.amount - total);
      if (diff > 1) {
        console.warn(
          `[order] Payment amount mismatch: expected ${total} öre, Stripe says ${confirmedPayment.amount} öre (diff ${diff})`,
        );
        throw new OrderValidationError(
          'Betalningsbeloppet matchar inte order-summan. Försök igen.',
        );
      }
    }

    if (!confirmedPayment) {
      throw new OrderValidationError('Kunde inte verifiera betalningen');
    }

    // ── Unified Order Number Generation ──────────────────────────────
    // Format: XX-NNNN-YY where XX = restaurant initials, NNNN = sequential, YY = random suffix
    // This ensures uniqueness even if two restaurants share initials
    const generateOrderNumber = async (): Promise<string> => {
      const restaurantName = restaurant?.name || 'MG';
      // Get first two consonants or first two chars from restaurant name
      const cleaned = restaurantName.replace(/[^a-zA-ZåäöÅÄÖ]/g, '').toUpperCase();
      let prefix = cleaned.slice(0, 2);
      if (prefix.length < 2) prefix = (prefix + 'X').slice(0, 2);
      // Replace Swedish chars
      prefix = prefix.replace(/Å/g, 'A').replace(/Ä/g, 'A').replace(/Ö/g, 'O');

      // Get the last order number with this prefix to find next sequential number
      const lastOrderWithPrefix = await prisma.order.findFirst({
        where: { orderNumber: { startsWith: `${prefix}-` } },
        orderBy: { createdAt: 'desc' },
        select: { orderNumber: true },
      });

      let nextNum = 1001;
      if (lastOrderWithPrefix?.orderNumber) {
        const match = lastOrderWithPrefix.orderNumber.match(/\d+/);
        if (match) nextNum = parseInt(match[0]) + 1;
      }

      // Pad to 4 digits minimum
      const numStr = String(nextNum).padStart(4, '0');

      // Random 2-letter suffix to prevent collisions
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // No I or O to avoid confusion with 1 and 0
      const suffix = chars[Math.floor(Math.random() * chars.length)] + chars[Math.floor(Math.random() * chars.length)];

      const orderNumber = `${prefix}-${numStr}-${suffix}`;

      // Verify uniqueness
      const exists = await prisma.order.findUnique({ where: { orderNumber } });
      if (exists) {
        // Extremely rare collision — retry with different suffix
        return generateOrderNumber();
      }

      return orderNumber;
    };

    // Collision-safe order-number assignment. `orderNumber` is @unique, so on a
    // concurrent duplicate the DB throws P2002 — we catch ONLY that, regenerate
    // (generateOrderNumber re-reads the latest number so it advances), and retry,
    // instead of 500-ing an order whose payment may already have gone through.
    let order: any = null;
    for (let orderAttempt = 1; orderAttempt <= 8; orderAttempt++) {
      const nextNumber = await generateOrderNumber();
      try {
        order = await prisma.$transaction(async (tx) => {
          const created = await tx.order.create({
      data: {
        orderNumber: nextNumber,
        clientRequestId,
        status: isPendingPayment ? 'AWAITING_PAYMENT' : 'PENDING',
        type: data.type,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        restaurantId: restaurant?.id || null,
        customerEmail: data.customerEmail || null,
        deliveryStreet: data.deliveryStreet || null,
        deliveryCity: data.deliveryCity || null,
        deliveryZip: data.deliveryZip || null,
        // Fallback till zon-koordinaterna: data.lat/lng = kundens adress-koords
        // (appen skickar dem för zon-koll men inte alltid deliveryLatitude/Longitude
        // separat). Utan detta saknar ordern kund-koordinater → order-tracking-kartan
        // kan inte rita kundens pin + rutten från restaurangen.
        deliveryLatitude: data.deliveryLatitude ?? data.lat ?? null,
        deliveryLongitude: data.deliveryLongitude ?? data.lng ?? null,
        deliveryNote: data.deliveryNote || null,
        deliveryInstructions: data.deliveryInstructions || null,
        note: data.note || null,
        discountCode: validatedCode || null,
        appliedDealId: appliedDeal?.id || welcomeAppliedDealId || null,
        appliedDealTitle: appliedDeal?.title || welcomeAppliedTitle || null,
        userDealId: appliedUserDealId,
        userDealAmountKr: appliedUserDealAmountKr,
        discountAmount,
        foodDiscountAmount,
        deliveryDiscountAmount,
        platformFundedFoodDiscountAmount: platformDiscountFunding.platformFundedFoodDiscountAmount,
        platformFundedDeliveryDiscountAmount: platformDiscountFunding.platformFundedDeliveryDiscountAmount,
        smallOrderFee,
        foodVatPercent: restaurantFoodVatPercent,
        deliveryVatPercent: orderDeliveryVatPercent,
        deliveryFee,
        tipAmount: tipOre,
        total,
        stripePaymentIntentId: isPendingPayment ? null : confirmedPayment.id,
        // Sätt provider redan när den obetalda ordern skapas. Då kan abandon,
        // recovery och reconcile aldrig misstolka en ny providerorder som den
        // historiska schema-defaulten "stripe" innan PSP-referensen har länkats.
        paymentProvider: pendingPaymentProvider?.name || 'stripe',
        paymentStatus: isPendingPayment ? 'PENDING' : 'PAID',
        // paymentMethod är non-nullable i schemat (default 'ONLINE'). Den
        // tidigare `isPendingPayment ? null : 'ONLINE'` orsakade Prisma-
        // krasch och 500. För både pending och paid sätter vi 'ONLINE'
        // direkt — det stämmer redan: betalningen GÅR via online-flödet,
        // den är bara inte konfirmerad än. Webhook bekräftar via
        // paymentStatus = PAID, inte via byte av paymentMethod.
        paymentMethod: 'ONLINE',
        estimatedTime,
        scheduledFor: data.scheduledFor ? new Date(data.scheduledFor) : null,
        userId: orderUserId,
        allergens: authUser?.allergens || '[]',
        // Slumpad 32-byte exchange-nyckel för gäster. Webben byter den direkt
        // mot en HttpOnly order-session; native-klienter har ett tidsbegränsat
        // kompatibilitetsfönster och får aldrig behandla den som permanent.
        accessToken: crypto.randomBytes(32).toString('base64url'),

        items: {
          create: orderItems.map(item => ({
            ...item,
            note: item.note || null
          })),
        },
      },
      include: {
        restaurant: { select: { name: true } },
        items: true,
      },
          });

          if (appliedUserDealId) {
            const reserved = await tx.userDeal.updateMany({
              where: { id: appliedUserDealId, userId: orderUserId, status: 'ACTIVE' },
              data: { status: 'RESERVED', usedOnOrderId: created.id },
            });
            if (reserved.count !== 1) {
              // Throwing rolls back the newly created order and all nested
              // items. A concurrent checkout can never keep the same coupon.
              throw new OrderValidationError('Kupongen används redan i en annan beställning');
            }
          }
          return created;
        });
        break; // success
      } catch (err: any) {
        const target = err?.meta?.target;
        const isOrderNumberCollision =
          err?.code === 'P2002' &&
          (Array.isArray(target)
            ? target.includes('orderNumber')
            : String(target ?? '').includes('orderNumber'));
        if (isOrderNumberCollision && orderAttempt < 8) {
          console.warn(`[order] orderNumber collision (attempt ${orderAttempt}) — regenerating`);
          continue;
        }
        const isClientRequestCollision =
          err?.code === 'P2002' &&
          (Array.isArray(target)
            ? target.includes('clientRequestId')
            : String(target ?? '').includes('clientRequestId'));
        if (isClientRequestCollision && clientRequestId) {
          const replay = await prisma.order.findUnique({ where: { clientRequestId } });
          if (replay) {
            if (!ownsOrderWithActiveRawSecret(replay, replay.accessToken)) {
              return rejectExpiredOrderReplay(res);
            }
            attachWebOrderSession(req, res, replay.id);
            const liveReplay = await overlayOrderLiveEta(replay);
            return res.status(200).json({
              orderId: replay.id,
              orderNumber: replay.orderNumber,
              total: replay.total / 100,
              appliedDealTitle: replay.appliedDealTitle,
              estimatedTime: replay.estimatedTime,
              ...etaResponseFields(liveReplay),
              ...nativeOrderSessionForClient(req, replay.id),
              ...rawOrderAccessForNonWebClient(req, replay.accessToken),
            });
          }
        }
        throw err; // non-collision error, or out of attempts → bubble up as before
      }
    }
    if (!order) {
      throw new OrderValidationError('Kunde inte skapa order just nu, försök igen.');
    }
    const createdEta = await refreshOrderEta(order.id, { sink: 'durable-event' }).catch((e: any) => {
      console.warn('[order] initial ETA failed:', e?.message);
      return null;
    });
    if (createdEta) order = { ...order, ...createdEta };

    // For pending-payment orders, skip all post-creation side effects until
    // the Stripe webhook confirms the payment.
    if (!isPendingPayment) {
      if (!isTestOrder) {
        const { maybeTriggerReferralReward } = await import('./referrals');
        await maybeTriggerReferralReward(order.id);
      }
      // UserDeal: vi har redan reserverat och vet att Stripe-betalningen
      // gick igenom (sync path). Markera som USED direkt så användaren ser
      // den i historiken som "använd 2026-05-15". Atomisk uppdatering med
      // status='RESERVED'-guard så vi inte trampar på en revert.
      if (appliedUserDealId) {
        await (prisma as any).userDeal.updateMany({
          where: { id: appliedUserDealId, status: 'RESERVED', usedOnOrderId: order.id },
          data: { status: 'USED', usedAt: new Date() },
        });
      }

      // Uppdatera rabattkods-räknare (Skip for 'test' mock).
      // Atomisk increment med villkor "usageCount < maxUsages" via raw SQL —
      // två parallella checkouts kan inte båda räknas upp förbi gränsen.
      if (validatedCode && validatedCode !== 'test' && validatedCode !== 'testa') {
        await prisma.$executeRaw`
          UPDATE "DiscountCode"
          SET "usageCount" = "usageCount" + 1
          WHERE "code" = ${validatedCode.toUpperCase()}
            AND ("maxUsages" IS NULL OR "usageCount" < "maxUsages")
        `;
      }

      if (appliedDeal) {
        // Atomisk increment med samma race-condition-skydd.
        await prisma.$executeRaw`
          UPDATE "Deal"
          SET "usageCount" = "usageCount" + 1
          WHERE "id" = ${appliedDeal.id}
            AND ("maxUsages" IS NULL OR "usageCount" < "maxUsages")
        `;
      }

      // Emit till admin via Socket.IO
      const orderForSocket = {
        ...order,
        totalOre: order.total,
        totalMoney: moneyDto(order.total),
        total: order.total / 100,
        deliveryFeeOre: order.deliveryFee,
        deliveryFeeMoney: moneyDto(order.deliveryFee),
        deliveryFee: order.deliveryFee / 100,
        discountAmountOre: order.discountAmount,
        discountAmountMoney: moneyDto(order.discountAmount),
        discountAmount: order.discountAmount / 100,
        tipAmountOre: order.tipAmount ?? 0,
        tipAmountMoney: moneyDto(order.tipAmount ?? 0),
        tipAmount: (order.tipAmount ?? 0) / 100,
        refundAmountOre: order.refundAmount ?? null,
        refundAmountMoney: nullableMoneyDto(order.refundAmount),
        refundAmount: order.refundAmount != null ? order.refundAmount / 100 : null,
        items: order.items.map((i: any) => ({
          ...i,
          basePriceOre: i.basePrice,
          basePriceMoney: moneyDto(i.basePrice),
          basePrice: i.basePrice / 100,
          subtotalOre: i.subtotal,
          subtotalMoney: moneyDto(i.subtotal),
          subtotal: i.subtotal / 100,
        })),
        restaurantName: order.restaurant?.name || 'Okänd restaurang',
      };
      // Global room is used by SUPER_ADMIN; per-restaurant room is used by each restaurant panel.
      getIO().to('admin-room').emit('order:new', orderForSocket);
      if (order.restaurantId) {
        getIO().to(`admin-room:${order.restaurantId}`).emit('order:new', orderForSocket);
        void notifyPartnerDevicesOfNewOrder({
          restaurantId: order.restaurantId,
          orderId: order.id,
          orderNumber: order.orderNumber,
        });
      }

      // 5. Update personal deal usage (CustomerDeal)
      if (validatedCode) {
        const updatedPersonal = await (prisma as any).customerDeal.findFirst({
          where: { code: validatedCode, phone: data.customerPhone }
        });

        if (updatedPersonal) {
          const newCount = updatedPersonal.usageCount + 1;
          const max = updatedPersonal.maxUsages || 1;
          await (prisma as any).customerDeal.update({
            where: { id: updatedPersonal.id },
            data: {
              usageCount: newCount,
              isUsed: newCount >= max
            }
          });
        }
      }
    }

    attachWebOrderSession(req, res, order.id);
    res.status(200).json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      total: order.total / 100,
      appliedDealTitle: order.appliedDealTitle,
      estimatedTime: order.estimatedTime ?? estimatedTime,
      ...etaResponseFields(order),
      ...nativeOrderSessionForClient(req, order.id),
      // Native/äldre klienter får fortfarande den råa exchange-nyckeln. Webben
      // får samtidigt ett HttpOnly order-session-bevis via proxyheadern ovan
      // och ska aldrig lägga accessToken i en URL.
      ...rawOrderAccessForNonWebClient(req, order.accessToken),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Zod Validation Error:', JSON.stringify(error.errors, null, 2));
      res.status(400).json({ error: 'Ogiltig data', details: error.errors });
      return;
    }
    if (error instanceof OrderValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Kunde inte skapa order' });
  }
});

// POST /api/orders/:id/native-session — exchange a raw native checkout secret
// for a signed, order-bound HTTP capability. Secrets are accepted only in the
// HTTPS request body; the returned session belongs in a header, never a URL.
router.post('/:id/native-session', nativeSessionLimiter, async (req: Request, res: Response) => {
  const orderId = req.params.id;
  if (!isNativeClient(req) || !validOrderId(orderId)) {
    return res.status(404).json({ error: 'Order hittades inte' });
  }

  const parsed = z.object({
    accessToken: z.string().min(20).max(512).optional(),
  }).safeParse(req.body || {});
  if (!parsed.success) return res.status(404).json({ error: 'Order hittades inte' });

  const allowedByCurrentSession = ownsByNativeOrderSession(req, orderId);
  const allowed = allowedByCurrentSession || await resolveOrderAccess({
    orderId,
    accessToken: parsed.data.accessToken,
    authorization: req.headers.authorization,
  }).catch(() => false);
  if (!allowed) return res.status(404).json({ error: 'Order hittades inte' });

  res.setHeader('Cache-Control', 'no-store');
  return res.json(nativeOrderSessionForClient(req, orderId));
});

// POST /api/orders/validate-discount - Validera kod i kassan
router.post('/validate-discount', async (req: Request, res: Response) => {
  try {
    const { code, subtotal } = req.body;
    if (!code) { res.status(400).json({ error: 'Ingen kod angiven' }); return; }

    const discount = await prisma.discountCode.findUnique({
      where: { code: code.toUpperCase(), isActive: true }
    });

    if (!discount) {
      res.status(404).json({ error: 'Ogiltig kampanjkod' });
      return;
    }

    const now = new Date();
    if (discount.validUntil && discount.validUntil < now) {
      res.status(400).json({ error: 'Rabattkoden har löpt ut' });
      return;
    }
    if (discount.maxUsages !== null && discount.usageCount >= discount.maxUsages) {
      res.status(400).json({ error: 'Rabattkoden är förbrukad' });
      return;
    }
    if (subtotal < discount.minOrder / 100) {
      res.status(400).json({ error: `Kräver en beställning på minst ${discount.minOrder / 100} kr` });
      return;
    }

    res.json({
      valid: true,
      type: discount.type,
      value: discount.type === 'FIXED' ? discount.value / 100 : discount.value,
      description: discount.description
    });
  } catch (err) {
    res.status(500).json({ error: 'Serverfel vid validering' });
  }
});

// POST /api/orders/draft - Spara ett orderutkast innan betalning
router.post('/draft', async (req: Request, res: Response) => {
  try {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Draft valid for 24h

    const draft = await prisma.orderDraft.create({
      data: {
        data: JSON.stringify(req.body),
        expiresAt,
      },
    });

    res.status(201).json({ draftId: draft.id });
  } catch (error) {
    console.error('Create draft error:', error);
    res.status(500).json({ error: 'Kunde inte spara utkast' });
  }
});


// GET /api/orders/draft/:id - Hämta ett utkast efter omdirigering
router.get('/draft/:id', async (req: Request, res: Response) => {
  try {
    const draft = await prisma.orderDraft.findUnique({
      where: { id: req.params.id },
    });

    if (!draft || draft.expiresAt < new Date()) {
      res.status(404).json({ error: 'Utkastet hittades inte eller har gått ut' });
      return;
    }

    // draft.data är JSON-stringat när vi sparar — om det är korrupt (manuell
    // DB-redigering, halv-skrivning) ger vi 400 istället för 500 så klienten
    // kan visa ett vettigt felmeddelande.
    try {
      res.json(JSON.parse(draft.data));
    } catch (parseErr) {
      console.error('[orders] corrupt draft data for id', req.params.id, parseErr);
      res.status(400).json({ error: 'Utkastet är korrupt och kan inte läsas' });
    }
  } catch (error) {
    console.error('[orders] draft fetch error:', error);
    res.status(500).json({ error: 'Serverfel vid hämtning av utkast' });
  }
});

// POST /api/orders/status-batch — one secure lightweight request for guest
// history. New native clients send signed sessions; accessToken remains only
// as a body-based migration path for older installs and is never accepted in
// a URL. A phone number is contact data, never an authorization secret.
router.post('/status-batch', async (req: Request, res: Response) => {
  try {
    const input = z.object({
      orders: z.array(z.object({
        id: z.string().min(1).max(100),
        orderSession: z.string().min(20).max(2048).optional(),
        accessToken: z.string().min(20).max(512).optional(),
      }).refine((value) => Boolean(value.orderSession || value.accessToken))).min(1).max(30),
    }).parse(req.body);
    const proofById = new Map(input.orders.map((item) => [item.id, item]));
    const orders = await prisma.order.findMany({
      where: { id: { in: [...proofById.keys()] } },
      select: {
        id: true,
        accessToken: true,
        createdAt: true,
        orderNumber: true,
        status: true,
        total: true,
        restaurant: { select: { name: true } },
      },
    });
    res.json(orders
      .filter((order) => {
        const proof = proofById.get(order.id);
        return Boolean(
          (isNativeClient(req) && verifyOrderNativeSession(proof?.orderSession, order.id)) ||
          ownsOrderWithActiveRawSecret(order, proof?.accessToken),
        );
      })
      .map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        total: (order.total ?? 0) / 100,
        restaurantName: order.restaurant?.name ?? null,
      })));
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Ogiltiga orderbevis' });
    console.error('status-batch error:', error);
    res.status(500).json({ error: 'Kunde inte hämta orderstatus' });
  }
});

// Legacy GET exists only for local compatibility testing. Production clients
// must use the token-based POST route above.
router.get('/status-batch', async (req: Request, res: Response) => {
  try {
    if (process.env.NODE_ENV === 'production') return res.json([]);
    const idsParam = typeof req.query.ids === 'string' ? req.query.ids : '';
    const phone = typeof req.query.phone === 'string' ? req.query.phone : '';
    const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 30);
    // Require phone ownership proof — order ids alone (even cuids) must never
    // return order data. No phone → empty (the web always sends the stored phone).
    if (ids.length === 0 || !phone) return res.json([]);
    const orders = await prisma.order.findMany({
      where: { id: { in: ids }, customerPhone: phone },
      select: {
        id: true, orderNumber: true, status: true, total: true,
        restaurant: { select: { name: true } },
      },
    });
    res.json(orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      // öre → kr INNAN respons, samma konvention som GET /api/profile/orders.
      // Utan detta visade order-historiken en 5 kr-order som "500 kr".
      total: (o.total ?? 0) / 100,
      restaurantName: o.restaurant?.name ?? null,
    })));
  } catch (err) {
    console.error('status-batch error:', err);
    res.status(500).json({ error: 'Kunde inte hämta orderstatus' });
  }
});

// POST /api/orders/:id/session — exchange a short-lived raw checkout secret
// (or an authenticated account) for the browser's Secure + HttpOnly order
// session. The signed proof is returned only through an internal proxy header;
// it is never exposed to application JavaScript.
router.post('/:id/session', async (req: Request, res: Response) => {
  const orderId = req.params.id;
  const paymentResumeToken = req.body?.paymentResumeToken;
  let allowed = typeof paymentResumeToken === 'string' && paymentResumeToken.length <= 4096
    ? await exchangeOrderPaymentResumeForHttpSession(orderId, paymentResumeToken).catch(() => false)
    : false;
  if (!allowed) {
    allowed = await exchangeOrderAccessForHttpSession({
      orderId,
      accessToken: req.body?.accessToken,
      orderSession: req.headers[ORDER_HTTP_SESSION_HEADER],
      authorization: req.headers.authorization,
    }).catch(() => false);
  }

  if (!allowed || !validOrderId(orderId)) {
    return res.status(404).json({ error: 'Order hittades inte' });
  }

  attachWebOrderSession(req, res, orderId);
  return res.json({ ok: true, expiresInSeconds: ORDER_HTTP_SESSION_TTL_SECONDS });
});

// POST /api/orders/:id/access-proof — mint the five-minute Socket.IO/push
// capability through the order-cookie path. This lets the browser keep every
// long-lived credential out of JavaScript while realtime remains order-scoped.
router.post('/:id/access-proof', async (req: Request, res: Response) => {
  const orderId = req.params.id;
  let allowed = await resolveOrderAccess({
    orderId,
    orderSession: req.headers[ORDER_HTTP_SESSION_HEADER],
    authorization: req.headers.authorization,
  }).catch(() => false);

  if (!allowed && validOrderId(orderId)) {
    const kioskOrder = await prisma.order.findUnique({
      where: { id: orderId },
      select: { paymentStatus: true, restaurant: { select: { slug: true } } },
    });
    allowed = Boolean(kioskOrder && kioskCanTrackPaidOrder(req, kioskOrder));
  }

  if (!allowed || !validOrderId(orderId)) {
    return res.status(404).json({ error: 'Order hittades inte' });
  }

  attachWebOrderSession(req, res, orderId);
  return res.json({ proof: issueOrderAccessProof(orderId) });
});

// GET /api/orders/:id/summary — minimal guest history row. Browser callers
// use the HttpOnly order proof; account callers use active customer auth.
router.get('/:id/summary', async (req: Request, res: Response) => {
  const orderId = req.params.id;
  let allowed = await resolveOrderAccess({
    orderId,
    orderSession: req.headers[ORDER_HTTP_SESSION_HEADER],
    authorization: req.headers.authorization,
  }).catch(() => false);
  if (!validOrderId(orderId)) {
    return res.status(404).json({ error: 'Order hittades inte' });
  }

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      total: true,
      type: true,
      createdAt: true,
      restaurant: { select: { name: true, slug: true, selfDelivery: true } },
      _count: { select: { items: true } },
    },
  });
  if (!order) return res.status(404).json({ error: 'Order hittades inte' });
  if (!allowed) allowed = kioskCanTrackPaidOrder(req, order);
  if (!allowed) return res.status(404).json({ error: 'Order hittades inte' });

  attachWebOrderSession(req, res, orderId);
  return res.json({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    total: (order.total ?? 0) / 100,
    type: order.type,
    selfDelivery: order.restaurant?.selfDelivery ?? false,
    createdAt: order.createdAt,
    restaurantName: order.restaurant?.name ?? null,
    itemCount: order._count.items,
  });
});

// GET /api/orders/:id - Hämta en order (för kund att följa sin order).
// Ägarskap krävs via JWT eller den slumpade per-order-tokenen. Telefonnummer
// är kontaktdata, inte ett lösenord. Lokal utveckling behåller en phone-fallback
// för gamla testverktyg; produktion gör det aldrig.
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const order: any = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        items: true,
        restaurant: true,
        // Tracking must be fresh for the iOS app and Live Activity. Do not cache:
        // admin status changes and courier coordinates need to be visible on the
        // next poll.
        delivery: {
          select: {
            proofMethod: true,
            proofMessage: true,
            proofPhotoUrl: true,
            proofExpiresAt: true,
            courierId: true,
            status: true,
            courier: {
              select: {
                name: true,
                phone: true,
                vehicle: true,
                currentLat: true,
                currentLng: true,
                lastSeenAt: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      res.status(404).json({ error: 'Order hittades inte' });
      return;
    }

    // Account access is always resolved through the same provider allow-list
    // and local tombstone check as every other customer order endpoint.
    const callerUserId = await resolveActiveCustomerIdFromAuthorization(
      req.headers.authorization,
    ).catch(() => null);
    let isOwner =
      verifyOrderHttpSession(req.headers[ORDER_HTTP_SESSION_HEADER], order.id) ||
      ownsByNativeOrderSession(req, order.id) ||
      Boolean(callerUserId && order.userId === callerUserId) ||
      kioskCanTrackPaidOrder(req, order);

    // Local-only compatibility for old dev builds. Production never accepts a
    // phone number as proof of access to customer PII.
    if (!isOwner && allowLegacyOrderPhoneProof()) {
      const queryPhone = typeof req.query.phone === 'string' ? req.query.phone : null;
      const normalize = (p: string | null | undefined) => (p || '').replace(/[^\d+]/g, '');
      if (queryPhone && normalize(queryPhone) === normalize(order.customerPhone)) {
        isOwner = true;
      }
    }

    if (!isOwner) {
      res.status(404).json({ error: 'Order hittades inte' });
      return;
    }

    if (order.delivery?.courier) {
      order.delivery.courier = await overlayCourierLivePosition({ ...order.delivery.courier, id: order.delivery.courierId });
    }
    Object.assign(order, await overlayOrderLiveEta(order));

    // Database status is the sole source of truth. The lifecycle worker keeps
    // self-delivery in DELIVERING for exactly 15 minutes before completing it.
    const customerStatus = order.status;

    // Absolute timestamp when the active LiveActivity step's countdown should
    // hit zero. Computed from anchor timestamps + the originally agreed-on
    // duration so it stays stable across re-fetches and reboots.
    const customerEtaEndsAt = customerStepEtaEndsAt(order, customerStatus);
    const etaEndsAt = customerEtaEndsAt?.toISOString() ?? null;

    // Bud-belastning: hur många aktiva leveranser budet har just nu. Kund-
    // trackingen använder detta för att uppskatta ankomsttid (fler stopp =
    // längre tid). Beräknas bara när ordern är på väg och har ett tilldelat
    // bud — en billig, indexerad räkning på [courierId, status].
    let courierActiveOrders: number | null = null;
    if (customerStatus === 'DELIVERING' && order.delivery?.courierId) {
      try {
        courierActiveOrders = await prisma.delivery.count({
          where: { courierId: order.delivery.courierId, status: { in: ['EN_ROUTE_PICKUP', 'PICKED_UP'] } },
        });
      } catch {
        courierActiveOrders = null;
      }
    }

    const courierCanBeShown =
      customerStatus === 'DELIVERING' &&
      !(order.restaurant as any)?.selfDelivery &&
      order.delivery?.courierId &&
      typeof order.delivery?.courier?.currentLat === 'number' &&
      typeof order.delivery?.courier?.currentLng === 'number';
    const vatSummary = calculateOrderVat(order);

    attachWebOrderSession(req, res, order.id);
    res.json({
      id: order.id,
      orderNumber: order.orderNumber,
      status: customerStatus,
      type: order.type,
      total: order.total / 100,
      deliveryFee: order.deliveryFee / 100,
      discountAmount: order.discountAmount / 100,
      foodDiscountAmount: order.foodDiscountAmount / 100,
      deliveryDiscountAmount: order.deliveryDiscountAmount / 100,
      smallOrderFee: order.smallOrderFee / 100,
      tipAmount: (order.tipAmount ?? 0) / 100,
      vatAmount: vatSummary.totalVatOre / 100,
      vatAmountOre: vatSummary.totalVatOre,
      vatBreakdown: vatSummary.breakdown.map((row) => ({
        rate: row.rate,
        gross: row.grossOre / 100,
        grossOre: row.grossOre,
        vat: row.vatOre / 100,
        vatOre: row.vatOre,
      })),
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      rating: order.rating ?? null,
      review: order.review ?? null,
      reviewedAt: order.reviewedAt ?? null,
      appliedDealTitle: order.appliedDealTitle,
      estimatedTime: order.estimatedTime,
      scheduledFor: order.scheduledFor,
      createdAt: order.createdAt,
      customerPhone: order.customerPhone,
      allergens: order.allergens,
      deliveryStreet: order.deliveryStreet,
      preparingAt: order.preparingAt,
      deliveringAt: order.deliveringAt,
      deliveryLatitude: order.deliveryLatitude ?? null,
      deliveryLongitude: order.deliveryLongitude ?? null,
      selfDelivery: (order.restaurant as any)?.selfDelivery ?? false,
      restaurantLat: (order.restaurant as any)?.latitude ?? null,
      restaurantLng: (order.restaurant as any)?.longitude ?? null,
      courierAssigned: Boolean(order.delivery?.courierId) && !(order.restaurant as any)?.selfDelivery,
      courierLat: courierCanBeShown ? order.delivery.courier.currentLat : null,
      courierLng: courierCanBeShown ? order.delivery.courier.currentLng : null,
      courierName: courierCanBeShown ? order.delivery.courier.name : null,
      courierPhone: courierCanBeShown ? order.delivery.courier.phone : null,
      courierVehicle: courierCanBeShown ? order.delivery.courier.vehicle : null,
      courierLastSeenAt: courierCanBeShown && order.delivery.courier.lastSeenAt ? order.delivery.courier.lastSeenAt.toISOString() : null,
      // Moms i % som restaurangen visar i kvittot (6/12). null = restaurangen
      // visar ingen momsrad → klienten döljer den.
      restaurantVatPercent: normalizeFoodVatPercent(
        (order as any).foodVatPercent ?? (order.restaurant as any)?.vatPercent,
        6,
      ),
      // Budets aktiva orderantal (bara satt under leverans) — driver ETA-spannet.
      courierActiveOrders,
      etaEndsAt,
      ...etaResponseFields(order),
      restaurantName: order.restaurant?.name || 'Okänd restaurang',
      restaurantAddress: order.restaurant?.address || '',
      restaurantZip: order.restaurant?.zip || '',
      restaurantCity: order.restaurant?.city || '',
      restaurantPhone: order.restaurant?.phone || '',
      restaurantEmail: (order.restaurant as any)?.email || '',
      restaurantLegalName: (order.restaurant as any)?.legalName || '',
      restaurantOrgNr: (order.restaurant as any)?.organizationNumber || '',
      // Leveransbevis (visas bara medan fotot finns kvar, ≈2 dygn).
      proofMethod: (order as any).delivery?.proofMethod ?? null, // HANDED | LEFT_AT_DOOR
      proofMessage: (order as any).delivery?.proofMessage ?? null,
      proofPhotoUrl: (order as any).delivery?.proofPhotoUrl ?? null,
      proofExpiresAt: (order as any).delivery?.proofExpiresAt ?? null,
      items: order.items.map((item: any) => ({
        id: item.id,
        productName: item.productName,
        quantity: item.quantity,
        basePrice: item.basePrice / 100,
        subtotal: item.subtotal / 100,
        vatPercent: item.vatPercent,
        selectedExtras: JSON.parse(item.selectedExtras),
        note: item.note,
      })),
    });
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/orders/:id/live-activity-token
// Stores the iOS Live Activity push token for an order so the backend can
// later push status updates straight to the Dynamic Island (works even when
// the app is killed). Token is hex-encoded and per-activity.
// Gate alla debug-endpoints bakom NODE_ENV !== production. I prod kan
// debug-la-tokens exponera senaste 10 ordrar (id + token-preview) och
// debug-la-push kan trigga APNs-anrop på alla ordrar — inget av det
// hör hemma i prod-trafiken.
const blockInProduction = (_req: Request, res: Response, next: NextFunction): void => {
  if (process.env.NODE_ENV === 'production') {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  next();
};

// GET /api/orders/debug-la-config
// Reports whether the four APNs env vars Railway needs are set + which host
// the backend will hit. The full key/team/bundle ids are NOT returned —
// only presence + length + the first/last 2 chars so we can spot a
// truncation or extra-quotes bug without leaking the credentials.
router.get('/debug-la-config', authenticate, requireSuperAdmin, blockInProduction, async (_req: Request, res: Response) => {
  const stripQuotes = (v: string | undefined): string =>
    (v ?? '').replace(/^["']|["']$/g, '').trim();
  const keyId = stripQuotes(process.env.APNS_KEY_ID);
  const teamId = stripQuotes(process.env.APNS_TEAM_ID);
  const bundleId = stripQuotes(process.env.APNS_BUNDLE_ID);
  const keyP8 = stripQuotes(process.env.APNS_KEY_P8).replace(/\\n/g, '\n');
  const previewId = (s: string) => (s.length >= 4 ? `${s.slice(0, 2)}…${s.slice(-2)}` : '<short>');
  const host =
    process.env.APNS_PRODUCTION === '1'
      ? 'api.push.apple.com'
      : 'api.sandbox.push.apple.com';
  res.json({
    apnsHost: host,
    apnsProductionFlag: process.env.APNS_PRODUCTION === '1',
    keyId: keyId ? { present: true, len: keyId.length, preview: previewId(keyId) } : { present: false },
    teamId: teamId ? { present: true, len: teamId.length, preview: previewId(teamId) } : { present: false },
    bundleId: bundleId ? { present: true, value: bundleId } : { present: false },
    keyP8: keyP8
      ? {
          present: true,
          len: keyP8.length,
          looksWrapped:
            keyP8.includes('-----BEGIN PRIVATE KEY-----') &&
            keyP8.includes('-----END PRIVATE KEY-----'),
          hasRealNewlines: keyP8.includes('\n'),
        }
      : { present: false },
    apnsTopic: bundleId ? `${bundleId}.push-type.liveactivity` : null,
  });
});

// GET /api/orders/debug-la-tokens
// Lists the 10 most recent orders that have a Live Activity token registered,
// so we can pick a fresh order to debug with. No auth — keyed by token
// preview only, full token never exposed.
router.get('/debug-la-tokens', authenticate, requireSuperAdmin, blockInProduction, async (_req: Request, res: Response) => {
  try {
    const orders = await prisma.order.findMany({
      where: { liveActivityToken: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        status: true,
        type: true,
        createdAt: true,
        liveActivityToken: true,
      },
    });
    res.json({
      orders: orders.map((o) => ({
        id: o.id,
        status: o.status,
        type: o.type,
        createdAt: o.createdAt.toISOString(),
        ageSeconds: Math.floor((Date.now() - o.createdAt.getTime()) / 1000),
        tokenPreview: o.liveActivityToken!.slice(0, 16) + '…',
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? String(e) });
  }
});

// POST /api/orders/:id/debug-la-push
// Manually triggers a Live Activity push for an order so we can isolate
// APNs delivery from the admin status-update flow. Returns the result of
// the push attempt directly so it's obvious from the HTTP response whether
// APNs accepted / rejected / threw.
//
// Example:
//   curl -X POST https://api.../api/orders/<orderId>/debug-la-push \
//     -H 'Content-Type: application/json' \
//     -d '{"status":"PREPARING"}'
router.post('/:id/debug-la-push', authenticate, requireSuperAdmin, blockInProduction, async (req: Request, res: Response) => {
  const { pushOrderStatusUpdate, ApnsError } = await import('../lib/liveActivityPush');
  try {
    const orderId = req.params.id;
    const status = (req.body?.status || 'PREPARING') as string;
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        type: true,
        liveActivityToken: true,
        estimatedTime: true,
        preparingAt: true,
        deliveringAt: true,
        etaCustomerAt: true,
        etaCustomerMin: true,
      },
    });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (!order.liveActivityToken) {
      return res.status(400).json({
        error: 'No liveActivityToken on order',
        hint: 'Place a fresh order so the iOS Live Activity registers a token, then retry.',
      });
    }
    const etaEndsAt = customerStepEtaEndsAt(order, status);
    console.log(`[debug-la-push] order=${orderId} status=${status} token=${order.liveActivityToken.slice(0, 16)}…`);
    try {
      await pushOrderStatusUpdate({
        token: order.liveActivityToken,
        serverStatus: status,
        orderType: order.type,
        etaMinutes: order.etaCustomerMin ?? order.estimatedTime ?? null,
        etaEndsAt,
      });
      console.log(`[debug-la-push] ✅ order=${orderId} status=${status}`);
      return res.json({
        success: true,
        orderId,
        status,
        tokenPreview: order.liveActivityToken.slice(0, 16) + '…',
        etaEndsAt: etaEndsAt?.toISOString() ?? null,
      });
    } catch (e: any) {
      const isApns = e instanceof ApnsError;
      console.warn(`[debug-la-push] ❌ order=${orderId}:`, e?.message, isApns ? `(reason=${e.reason}, status=${e.status})` : '');
      return res.status(500).json({
        success: false,
        orderId,
        status,
        tokenPreview: order.liveActivityToken.slice(0, 16) + '…',
        error: e?.message ?? String(e),
        apns: isApns ? { status: e.status, reason: e.reason, invalidToken: e.invalidToken } : null,
      });
    }
  } catch (e: any) {
    console.error('[debug-la-push] unexpected error:', e);
    return res.status(500).json({ error: e?.message ?? String(e) });
  }
});

router.post('/:id/live-activity-token', async (req: Request, res: Response) => {
  try {
    const { token, accessToken } = req.body ?? {};
    const orderId = req.params.id;
    if (typeof token !== 'string' || token.length < 32 || token.length > 256 || !/^[a-f0-9]+$/i.test(token)) {
      console.warn(`[live-activity-token] ❌ invalid token for order=${orderId}, len=${(token as any)?.length}`);
      res.status(400).json({ error: 'Ogiltig token' });
      return;
    }
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, userId: true, accessToken: true, createdAt: true },
    });
    if (!order) {
      res.status(404).json({ error: 'Order hittades inte' });
      return;
    }

    const callerUserId = await resolveActiveCustomerIdFromAuthorization(
      req.headers.authorization,
    ).catch(() => null);
    const ownsByUser = !!callerUserId && callerUserId === order.userId;
    const ownsBySession = verifyOrderHttpSession(req.headers[ORDER_HTTP_SESSION_HEADER], orderId);
    const ownsByNativeSession = ownsByNativeOrderSession(req, orderId);
    const ownsByToken = ownsOrderWithActiveRawSecret(order, accessToken);
    if (!ownsByUser && !ownsBySession && !ownsByNativeSession && !ownsByToken) {
      res.status(404).json({ error: 'Order hittades inte' });
      return;
    }

    const updated = await prisma.order.updateMany({
      where: { id: orderId },
      data: { liveActivityToken: token },
    });
    if (updated.count === 0) {
      console.warn(`[live-activity-token] ❌ order not found: ${orderId}`);
      res.status(404).json({ error: 'Order hittades inte' });
      return;
    }
    console.log(`[live-activity-token] ✅ saved token for order=${orderId} (token=${token.slice(0, 16)}…)`);

    // Catch-up push: iOS hands JS the per-activity push token a few hundred
    // ms (sometimes seconds) AFTER `Activity.request()` returns. If admin
    // accepted, started preparing, or marked ready/delivering during that
    // window, the prior `pushOrderStatusUpdate` calls were skipped because
    // `liveActivityToken` was still null on the row — and the LA would
    // freeze on the JS-supplied initial "Mottagen" state until the next
    // admin click. Run the dispatcher immediately so the freshly-registered
    // token gets the current state.
    void pushLiveActivityForOrder(orderId).catch((e) =>
      console.warn(`[live-activity-token] catch-up dispatch threw order=${orderId}:`, e?.message),
    );

    res.json({ success: true });
  } catch (e) {
    console.error('[live-activity-token] failed:', e);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/orders/:id/live-activity-push
//
// Dedicated trigger that pushes the order's *current* DB state into its
// running iOS Live Activity. Same code path as the admin status route, just
// callable on its own — useful for:
//   - Manually re-syncing a stuck LA from a debug curl.
//   - A future cron / reconciler that nudges LAs whose stored status drifted
//     from what's on screen (e.g. push was throttled).
//   - Any service that mutates an order's status outside the admin route
//     and needs the LA to follow.
//
// Optional body: { status?: string } overrides the DB-derived customer
// status (used by debug to test individual steps without flipping the row).
//
// No auth — token in the order row is the capability; the caller still
// needs the orderId to do anything.
router.post('/:id/live-activity-push', async (req: Request, res: Response) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: 'Not found' });
    }
    const orderId = req.params.id;
    const overrideStatus =
      typeof req.body?.status === 'string' ? req.body.status : undefined;
    const result = await pushLiveActivityForOrder(orderId, {
      serverStatus: overrideStatus,
    });
    if (!result.ok) {
      const code = result.reason === 'order-not-found' ? 404
        : result.reason === 'no-token' ? 409
        : 500;
      return res.status(code).json(result);
    }
    return res.json(result);
  } catch (e: any) {
    console.error('[live-activity-push] failed:', e);
    return res.status(500).json({ error: e?.message ?? 'Serverfel' });
  }
});

// PATCH /api/orders/:id/status
//
// Lets the order's owning customer flip status DELIVERING → DELIVERED in the
// DB. We can't actually verify the rider physically delivered the food, so the
// client just calls this when its local fake-delivery countdown expires. This
// makes the change durable (so all clients/admin/restaurant see the same
// status, not just the customer's local app), and triggers the LA dispatcher
// so the iOS Live Activity follows.
//
// Authorization: order.userId must match the JWT subject. We accept the same
// two token shapes as POST /api/orders (Supabase JWT + legacy custom JWT) and
// the same patterns are intentionally inlined since this is the only other
// place we need them.
//
// Allowed customer transition in production:
//   DELIVERING → DELIVERED
//
// Local/dev test mode:
//   When body.devStepper=true and NODE_ENV !== production, the owning customer
//   can step through the full visible tracking chain. This backs the temporary
//   in-app tester without granting admin order controls in production.
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id;
    const newStatus = String(req.body?.status || '').toUpperCase();
    const devStepper = req.body?.devStepper === true && process.env.NODE_ENV !== 'production';
    const devAllowedStatuses = new Set(['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'DELIVERING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED']);
    if (!devStepper && newStatus !== 'DELIVERED') {
      return res.status(400).json({ error: 'Endast DELIVERED tillåts via denna endpoint' });
    }
    if (devStepper && !devAllowedStatuses.has(newStatus)) {
      return res.status(400).json({ error: 'Ogiltig teststatus' });
    }

    const callerUserId = await resolveActiveCustomerIdFromAuthorization(
      req.headers.authorization,
    ).catch(() => null);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, userId: true, status: true, restaurantId: true, customerPhone: true, accessToken: true, createdAt: true, deliveringAt: true, restaurant: { select: { selfDelivery: true } } },
    });
    if (!order) return res.status(404).json({ error: 'Ordern hittades inte' });
    const phoneProof =
      typeof req.query.phone === 'string' ? req.query.phone :
      typeof req.body?.phone === 'string' ? req.body.phone :
      null;
    const tokenProof =
      typeof req.body?.accessToken === 'string' ? req.body.accessToken : null;
    const ownsByUser = !!callerUserId && order.userId === callerUserId;
    const ownsBySession = verifyOrderHttpSession(req.headers[ORDER_HTTP_SESSION_HEADER], orderId);
    const ownsByNativeSession = ownsByNativeOrderSession(req, orderId);
    const ownsByAccessToken = ownsOrderWithActiveRawSecret(order, tokenProof);
    // A phone number is not a secret and must never authorize a mutation.
    // Legacy devStepper may still use it locally; production requires JWT or
    // the random per-order access token returned only at checkout.
    const ownsDevOrderByPhone = devStepper && !!phoneProof && phoneProof.replace(/\D/g, '') === order.customerPhone.replace(/\D/g, '');
    if (!ownsByUser && !ownsBySession && !ownsByNativeSession && !ownsByAccessToken && !ownsDevOrderByPhone) {
      return res.status(403).json({ error: 'Du äger inte denna order' });
    }
    if (devStepper) {
      const data: any = { status: newStatus };
      if (newStatus === 'PREPARING') data.preparingAt = new Date();
      if (newStatus === 'DELIVERING' || newStatus === 'OUT_FOR_DELIVERY') data.deliveringAt = new Date();
      if (newStatus === 'DELIVERED' || newStatus === 'COMPLETED') data.deliveringAt = null;

      let updated = await prisma.order.update({
        where: { id: orderId },
        data,
        select: { id: true, status: true, etaReadyAt: true, etaPickupAt: true, etaCustomerAt: true, etaCustomerMin: true, etaPriorityScore: true, etaReason: true },
      });
      const refreshedEta = await refreshOrderEta(orderId, { sink: 'durable-event' }).catch(() => null);
      if (refreshedEta) updated = { ...updated, ...refreshedEta };

      try {
        getIO()?.to(`order:${orderId}`).emit('order:status', { id: orderId, orderId, status: updated.status, ...etaResponseFields(updated) });
        getIO()?.to('admin-room').emit('order:updated', { id: orderId, orderId, status: updated.status });
        if (order.restaurantId) getIO()?.to(`admin-room:${order.restaurantId}`).emit('order:updated', { id: orderId, orderId, status: updated.status });
        void dispatchCustomerOrderStatus(orderId, updated.status);
      } catch {}
      if (newStatus === 'DELIVERED' || newStatus === 'COMPLETED') {
        void import('./referrals').then(({ maybeTriggerReferralReward }) =>
          maybeTriggerReferralReward(orderId),
        );
      }

      return res.json({ changed: true, status: updated.status, devStepper: true });
    }

    // Kund-mocken (auto-levererad efter X min) gäller ENDAST self-leverans.
    // Vi-levererar markeras DELIVERED på riktigt av budet — aldrig av kunden.
    if (!order.restaurant?.selfDelivery) {
      return res.json({ changed: false, status: order.status });
    }
    if (order.status === 'DELIVERED' || order.status === 'COMPLETED') {
      return res.json({ changed: false, status: order.status });
    }
    if (order.status !== 'DELIVERING') {
      return res.status(409).json({ error: `Kan inte gå från ${order.status} till DELIVERED` });
    }
    const elapsed = order.deliveringAt
      ? Date.now() - new Date(order.deliveringAt).getTime()
      : 0;
    if (elapsed < computeDeliveryWindowMs(order.deliveringAt || new Date(), orderId)) {
      return res.json({ changed: false, status: order.status });
    }

    const changed = await prisma.order.updateMany({
      where: { id: orderId, status: 'DELIVERING' },
      data: { status: 'DELIVERED' },
    });
    if (changed.count !== 1) {
      const latest = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
      return res.json({ changed: false, status: latest?.status || order.status });
    }
    let updated = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { id: true, status: true, etaReadyAt: true, etaPickupAt: true, etaCustomerAt: true, etaCustomerMin: true, etaPriorityScore: true, etaReason: true },
    });
    const refreshedEta = await refreshOrderEta(orderId, { sink: 'durable-event' }).catch(() => null);
    if (refreshedEta) updated = { ...updated, ...refreshedEta };

    // Notify any connected clients (restaurant, admin, customer mirrors).
    try {
      getIO()?.to(`order:${orderId}`).emit('order:status', { id: orderId, orderId, status: 'DELIVERED', ...etaResponseFields(updated) });
      // Även admin-rummet så order-listan uppdateras direkt (annars syns
      // kund-mockens auto-DELIVERED först vid nästa poll).
      getIO()?.to('admin-room').emit('order:updated', { id: orderId, orderId, status: 'DELIVERED' });
      if (order.restaurantId) getIO()?.to(`admin-room:${order.restaurantId}`).emit('order:updated', { id: orderId, orderId, status: 'DELIVERED' });
      void dispatchCustomerOrderStatus(orderId, 'DELIVERED');
    } catch {}
    void import('./referrals').then(({ maybeTriggerReferralReward }) =>
      maybeTriggerReferralReward(orderId),
    );

    return res.json({ changed: true, status: updated.status });
  } catch (e: any) {
    console.error('[orders/status] failed:', e);
    return res.status(500).json({ error: e?.message ?? 'Serverfel' });
  }
});

// POST /api/orders/:id/review  (kräver ägar-bevis — guest eller inloggad).
// Tidigare var endpointen helt publik och en angripare kunde betygsätta vilken
// levererad order som helst, vilket gav en rating-attack-vektor mot konkurrenter.
// Ägar-check: JWT (Supabase eller legacy) som matchar order.userId, eller
// accessToken som matchar order.accessToken. En betald partnerorder får även
// använda det signerade, restaurangbundna kioskbeviset. Det behövs när Safari
// blockerar ordersessionens cookie inuti Palmyras iframe. Telefonnummer är
// inte ett autentiseringsbevis och får aldrig ge rätt att skriva ett betyg.
router.post('/:id/review', async (req: Request, res: Response) => {
  try {
    const { rating, review, likedItemIds, accessToken: bodyAccessToken } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Betyg måste vara mellan 1-5' });
    }
    const order = await prisma.order.findFirst({
      where: { id: req.params.id },
      include: {
        items: { select: { productId: true, productName: true } },
        restaurant: { select: { slug: true } },
      },
    });
    if (!order) return res.status(404).json({ error: 'Order hittades inte' });
    if (!['DELIVERED', 'COMPLETED'].includes(order.status)) {
      return res.status(400).json({ error: 'Du kan bara betygsätta levererade ordrar' });
    }
    if ((order as any).rating) {
      return res.status(400).json({ error: 'Denna order har redan fått ett betyg' });
    }

    let isOwner = false;
    if (verifyOrderHttpSession(req.headers[ORDER_HTTP_SESSION_HEADER], order.id)) {
      isOwner = true;
    }
    if (!isOwner && ownsByNativeOrderSession(req, order.id)) isOwner = true;
    const reviewerUserId = await resolveActiveCustomerIdFromAuthorization(
      req.headers.authorization,
    ).catch(() => null);
    if (reviewerUserId && (order as any).userId === reviewerUserId) isOwner = true;
    // Partnerembedden är gästläge och kan köras med blockerade third-party
    // cookies. Kioskbeviset är signerat, tidsbegränsat och låst till exakt den
    // restaurang som den betalda ordern tillhör.
    if (!isOwner && kioskCanTrackPaidOrder(req, order)) isOwner = true;
    if (!isOwner) {
      const tokenCandidate =
        typeof bodyAccessToken === 'string' ? bodyAccessToken : null;
      // Native-/legacy-hemligheten följer samma hårda 48h-gräns som övrig
      // orderåtkomst. Webben använder normalt sin HttpOnly-session ovan.
      if (ownsOrderWithActiveRawSecret(order, tokenCandidate)) {
        isOwner = true;
      }
    }
    if (!isOwner) {
      // 404 (inte 403) så ID-gissning inte avslöjar om en order existerar.
      return res.status(404).json({ error: 'Order hittades inte' });
    }

    const validProductIds = new Set((order.items as any[]).map((i) => i.productId));
    const cleanLikedIds = Array.isArray(likedItemIds)
      ? likedItemIds.filter((id: unknown): id is string => typeof id === 'string' && validProductIds.has(id))
      : [];

    // Derive reviewer name: use order's customerName, else "Gäst" + 4 chars from order ID
    const rawName = (order as any).customerName as string | null;
    const guestTag = order.id.replace(/-/g, '').slice(-4).toUpperCase();
    const reviewerName = rawName?.trim() ? rawName.trim() : `Gäst${guestTag}`;

    const reviewClaim = await prisma.order.updateMany({
      where: { id: req.params.id, rating: null },
      data: {
        rating,
        review: review || null,
        reviewedAt: new Date(),
        likedItemIds: JSON.stringify(cleanLikedIds),
        customerName: reviewerName,
      } as any,
    });
    if (reviewClaim.count === 0) {
      return res.status(409).json({ error: 'Denna order har redan fått ett betyg', alreadyReviewed: true });
    }
    bustCache('order:byid', req.params.id);

    if ((order as any).restaurantId) {
      const stats = await prisma.order.aggregate({
        where: { restaurantId: (order as any).restaurantId, rating: { not: null } },
        _avg: { rating: true },
        _count: { rating: true },
      });
      if (stats._avg.rating != null) {
        await prisma.restaurant.update({
          where: { id: (order as any).restaurantId },
          data: { rating: Math.round(stats._avg.rating * 10) / 10, ratingCount: stats._count.rating },
        });
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Review error:', error);
    res.status(500).json({ error: 'Kunde inte spara recension' });
  }
});

// ── POST /:id/abandon ────────────────────────────────────────────────────────
// Idempotent abandon av en AWAITING_PAYMENT-order. Vi hard-delete:ar aldrig en
// order som kan ha en pågående PSP-betalning: en sen Swish/Klarna/3DS-success
// måste fortfarande kunna bli en riktig restaurangorder. PSP:n är sanningskälla.
router.post('/:id/abandon', async (req: Request, res: Response) => {
  try {
    const { phone: bodyPhone, accessToken: bodyAccessToken } = req.body || {};
    const order = await prisma.order.findFirst({
      where: { id: req.params.id },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        customerPhone: true,
        userId: true,
        accessToken: true,
        createdAt: true,
        paymentProvider: true,
        molliePaymentId: true,
        swishPaymentId: true,
        stripePaymentIntentId: true,
        adyenSessionId: true,
      },
    });

    // Okänd order är idempotent för klienten.
    if (!order) return res.json({ success: true, alreadyGone: true });

    // Owner-check görs före status-svaret. Annars kunde ett gissat order-id
    // avslöja om ordern existerade och om den fortfarande väntade på betalning.
    let isOwner = false;
    if (verifyOrderHttpSession(req.headers[ORDER_HTTP_SESSION_HEADER], order.id)) {
      isOwner = true;
    }
    if (!isOwner && ownsByNativeOrderSession(req, order.id)) isOwner = true;
    const callerUserId = await resolveActiveCustomerIdFromAuthorization(
      req.headers.authorization,
    ).catch(() => null);
    if (callerUserId && (order as any).userId === callerUserId) isOwner = true;
    if (!isOwner) {
      const tokenCandidate =
        typeof bodyAccessToken === 'string' ? bodyAccessToken : null;
      if (ownsOrderWithActiveRawSecret(order, tokenCandidate)) {
        isOwner = true;
      }
    }
    if (!isOwner && allowLegacyOrderPhoneProof()) {
      const phoneCandidate = typeof bodyPhone === 'string' ? bodyPhone : null;
      const normalize = (p: string | null | undefined) => (p || '').replace(/[^\d+]/g, '');
      if (phoneCandidate && normalize(phoneCandidate) === normalize((order as any).customerPhone)) {
        isOwner = true;
      }
    }
    if (!isOwner) {
      // 404 inte 403 — ID-gissning ska inte avslöja existens.
      return res.status(404).json({ error: 'Order hittades inte' });
    }

    // Svara med det redan kända terminala utfallet. PAID måste vinna även om
    // orderstatusen hann ändras samtidigt som klientens abandon-anrop kom in.
    const paymentStatus = String(order.paymentStatus || '').toUpperCase();
    if (paymentStatus === 'PAID') {
      return res.json({ success: true, paid: true, alreadyTerminal: true });
    }
    const terminalPaymentStatuses = new Set([
      'FAILED',
      'REFUNDED',
      'PARTIALLY_REFUNDED',
      'CANCELED',
      'CANCELLED',
    ]);
    if (
      terminalPaymentStatuses.has(paymentStatus) ||
      order.status === 'CANCELLED' ||
      order.status === 'REJECTED'
    ) {
      return res.json({ success: true, failed: true, alreadyTerminal: true });
    }

    // Bara en fortfarande obetald AWAITING_PAYMENT-order kan överges.
    if (order.status !== 'AWAITING_PAYMENT') {
      return res.json({ success: true, skipped: 'not-awaiting' });
    }

    if (!['mollie', 'stripe', 'adyen', 'swish'].includes(order.paymentProvider)) {
      await finalizePaymentFailed(order.id, { provider: 'stripe', reason: 'unknown-provider' });
      return res.json({ success: true, failed: true });
    }
    const provider = getPaymentProviderByName(order.paymentProvider as PaymentProviderName);
    const ref =
      provider.name === 'mollie'
        ? order.molliePaymentId
        : provider.name === 'swish'
          ? order.swishPaymentId
          : provider.name === 'stripe'
            ? order.stripePaymentIntentId
            : order.adyenSessionId;
    if (!ref) {
      await finalizePaymentFailed(order.id, {
        provider: provider.name,
        reason: 'abandoned-before-payment-start',
      });
      return res.json({ success: true, failed: true });
    }

    try {
      const remote = await cancelPaymentWithCanonicalRetry(provider, ref, 3);
      if (remote.state === 'paid') {
        await finalizePaymentSuccess(order.id, {
          provider: provider.name,
          ref: remote.paymentIntentId || ref,
          amountReceivedOre: remote.amountReceivedOre ?? 0,
          method: remote.method,
        });
        return res.json({ success: true, paid: true });
      }
      if (['failed', 'canceled', 'expired'].includes(remote.state)) {
        await finalizePaymentFailed(order.id, {
          provider: provider.name,
          ref,
          reason: remote.state,
        });
        return res.json({ success: true, failed: true });
      }
      // Fortfarande open/pending: provider-cancel gick inte att bekräfta.
      // Bevara order, reservation och PSP-ref så webhook/reconcile kan avgöra.
      return res.json({ success: true, pending: true, preserved: true });
    } catch (error) {
      console.error(
        '[orders/abandon] kunde inte verifiera PSP-status:',
        (error as Error)?.message,
      );
      return res.json({ success: true, pending: true, preserved: true });
    }
  } catch (error) {
    console.error('Abandon order error:', error);
    // Idempotent: klienten ska inte spinna i en retry-loop. Reconcile/cleanup
    // bevarar underlaget och stämmer av PSP-status igen.
    return res.json({ success: false, error: 'internal' });
  }
});

export default router;
