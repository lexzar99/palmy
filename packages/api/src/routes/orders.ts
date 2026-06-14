import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import Stripe from 'stripe';
import crypto from 'crypto';
import prisma from '../lib/prisma';
import { getIO } from '../lib/socket';
import jwt from 'jsonwebtoken';
import {
  DEFAULT_DELIVERY_FEE,
  DEFAULT_ESTIMATED_DELIVERY_TIME,
  DEFAULT_ESTIMATED_PICKUP_TIME,
  DEFAULT_MIN_ORDER_AMOUNT,
} from '../lib/restaurantSettings';
import { evaluateDeal, isDealAvailableNow, parseApplicableRestaurantIds, type CartItemForBogo } from '../lib/deals';
import { getWelcomeOffer, isWelcomeEligible, welcomeOfferDiscountOre } from './referrals';
import { triggerLoyaltyRewards } from '../lib/loyalty';
import { JWT_SECRET } from '../lib/config';
import { cached } from '../lib/ttlCache';
import { cacheResponse, getCachedResponse, getIdempotencyKey } from '../lib/idempotency';
import { normalizeDeliveryZones, normalizeMoneyToOre, resolveDeliveryFee } from '../utils/deliveryZones';
import { getDpointsSettings, awardOrderPointsIfNotAwarded } from '../lib/dpoints';
import supabaseAdmin from '../lib/supabase';
import { pushLiveActivityForOrder } from '../lib/liveActivityDispatch';
import { computeDeliveryWindowMs } from '../lib/deliveryWindow';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { sendOrderStatusPush } from '../lib/customerPush';

const router = Router();
const STOCKHOLM_TIMEZONE = 'Europe/Stockholm';
const stockholmDayFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: STOCKHOLM_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const getStockholmCalendarDay = (date: Date) => stockholmDayFormatter.format(date);

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
  note: z.string().nullable().optional(),
  selectedExtras: z.array(z.object({
    groupId: z.string(),
    groupName: z.string(),
    extraId: z.string(),
    extraName: z.string(),
    priceAddon: z.number(),
  })),
  // Klienten flaggar items som "BOGO-gratis" så backend kan verifiera
  // att kunden inte smugglar fler gratis-varor än vad dealen tillåter.
  // Vi validerar count mot evaluateBogoCategoryDeal:s maxFreeItems.
  bogoFreeFromDealId: z.string().nullable().optional(),
  // Dpoints: kunden betalar denna rad med poäng → backend nollar priset och
  // drar poäng vid betalning. Kräver inloggad användare med tillräckligt saldo.
  paidWithPoints: z.boolean().optional(),
});

const CreateOrderSchema = z.object({
  restaurantId: z.string().min(1).optional(),
  restaurantSlug: z.string().min(1).optional(),
  type: z.enum(['PICKUP', 'DELIVERY']),
  paymentMethod: z.string().nullable().optional(),
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
  // OBS: authenticatedUserId resolveras längre ned — vi använder header-token-prefix
  // som temporär scope-proxy här. För säkerhets skull bryts cache-keyen ändå per
  // klient via IP-fallback. Det här är säkert nog för att eliminera cross-user leak.
  const authHeaderForScope = req.headers.authorization || '';
  // Hash the WHOLE token for the per-user scope. The previous slice(7,39) took the
  // first 32 token chars, but for Supabase JWTs those are the CONSTANT header
  // (eyJhbG...) — identical for every user → all logged-in users shared one scope,
  // so a duplicate Idempotency-Key could replay another user's order response.
  const tokenScopeHash = authHeaderForScope.startsWith('Bearer ')
    ? crypto.createHash('sha256').update(authHeaderForScope.slice(7)).digest('hex').slice(0, 32)
    : '';
  const scope = tokenScopeHash || req.ip || 'anon';
  if (idempotencyKey) {
    const cached = getCachedResponse(scope, `orders:${idempotencyKey}`);
    if (cached) {
      console.log(`♻️ Replaying cached response for idempotency-key ${idempotencyKey}`);
      return res.status(cached.status).json(cached.body);
    }
    // Wrap res.json so any successful 2xx response is captured before sending.
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cacheResponse(scope, `orders:${idempotencyKey}`, res.statusCode, body);
      }
      return originalJson(body);
    };
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
        select: { platformPausedUntil: true, platformPauseReason: true } as any,
      });
      const until = (settings as any)?.platformPausedUntil;
      if (until && new Date(until).getTime() > Date.now()) {
        return res.status(503).json({
          error: 'PLATFORM_PAUSED',
          message: 'Plattformen är tillfälligt pausad. Försök igen om en stund.',
          until: new Date(until).toISOString(),
          reason: (settings as any)?.platformPauseReason || null,
        });
      }
    } catch {
      // If the settings check itself errors, fall through to normal flow —
      // we never want a transient DB blip to silently block all orders.
    }

    const data = CreateOrderSchema.parse(req.body);
    const isPendingPayment = data.pendingPayment === true;
    const hasPaymentIntent = Boolean(data.stripePaymentIntentId);

    const intentId = data.stripePaymentIntentId?.toUpperCase();
    // Test-order: medveten testkanal som funkar även i prod. Användaren har
    // sagt att "test"/"testa" + FREE_PROMO/TEST_PAYMENT ska kringgå Stripe
    // för testflöden (inkl. referral-unlock-test). Tidigare gated på
    // NODE_ENV !== 'production' vilket bröt bypass på Railway. Den ENDA
    // vägen in är via discount-code "test"/"testa" på webbens cart-flow —
    // alltså inte triggable av andra klienter eller av externa angripare
    // utan kod-kännedom.
    const isTestOrder =
      (data.discountCode?.toLowerCase() === 'test' || data.discountCode?.toLowerCase() === 'testa') &&
      (intentId === 'TEST_PAYMENT' || intentId === 'FREE_PROMO');

    // Enforce mandatory payment (unless pending-payment flow or test order)
    if (!hasPaymentIntent) {
      if (!isTestOrder && !isPendingPayment) {
        res.status(400).json({ error: 'Betalning krävs för att slutföra ordern' });
        return;
      }
    }

    // 0. Check for auth user to link account
    // Supports both Supabase JWTs (primary) and legacy custom JWTs (fallback)
    let authenticatedUserId: string | null = null;
    let authUser: any = null;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];

      // ── 1. Try Supabase JWT ─────────────────────────────────────────────
      if (supabaseAdmin) {
        try {
          const { data: { user: sbUser }, error } = await supabaseAdmin.auth.getUser(token);
          if (!error && sbUser) {
            // Ensure a corresponding row exists in the local User table
            authUser = await (prisma as any).user.upsert({
              where: { id: sbUser.id },
              update: {
                email: sbUser.email || undefined,
                name: sbUser.user_metadata?.name || sbUser.user_metadata?.full_name || undefined,
                image: sbUser.user_metadata?.avatar_url || sbUser.user_metadata?.picture || undefined,
                phone: sbUser.phone || undefined,
                isVerified: !!sbUser.phone_confirmed_at || !!sbUser.email_confirmed_at || undefined,
              },
              create: {
                id: sbUser.id,
                email: sbUser.email ?? null,
                name: sbUser.user_metadata?.name ?? sbUser.user_metadata?.full_name ?? 'Användare',
                image: sbUser.user_metadata?.avatar_url ?? sbUser.user_metadata?.picture ?? null,
                phone: sbUser.phone ?? null,
                oauthProvider: sbUser.app_metadata?.provider ?? null,
                oauthId: sbUser.id,
                isVerified: !!sbUser.phone_confirmed_at || !!sbUser.email_confirmed_at,
              },
            }).catch(() => null);

            if (authUser) {
              authenticatedUserId = authUser.id;
              // Force use official profile phone to prevent discount abuse
              if (authUser.phone) data.customerPhone = authUser.phone;
            }
          }
        } catch (_sbErr) {
          // Not a Supabase JWT — try legacy
        }
      }

      // ── 2. Fall back to legacy custom JWT ──────────────────────────────
      if (!authenticatedUserId) {
        try {
          const payload = jwt.verify(token, JWT_SECRET) as any;
          authUser = await (prisma as any).user.findUnique({ where: { id: payload.id } });
          if (authUser) {
            authenticatedUserId = authUser.id;
            // Force use official profile phone to prevent discount abuse
            if (authUser.phone) data.customerPhone = authUser.phone;
          }
        } catch (_jwtErr) {
          // Token invalid, proceed as guest
        }
      }
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
        ? { id: data.restaurantId }
        : { slug: data.restaurantSlug as string },
    });
    if (!restaurant) {
      res.status(400).json({ error: 'Ogiltig restaurang' });
      return;
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
    
    // Use restaurant specific settings or global fallbacks
    const restaurantOpen = restaurant?.isOpen ?? globalSettings?.isOpen ?? true;

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
    const bypassAllowed = data.stripePaymentIntentId === 'BYPASS' && process.env.NODE_ENV !== 'production';
    // Idempotency: if this PaymentIntent already has an order, return that order directly.
    // Skip for TEST_PAYMENT, FREE_PROMO and BYPASS to allow multiple tests by developers.
    const isSpecialMockId = data.stripePaymentIntentId === 'TEST_PAYMENT' || data.stripePaymentIntentId === 'FREE_PROMO' || (bypassAllowed);
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
      res.status(400).json({ error: 'Tyvärr, restaurangen har för närvarande stängt. Välkommen tillbaka när vi öppnar!' });
      return;
    }

    // Validera leveransadress om delivery
    // Only require street — zip is optional since the zone check via GPS coordinates
    // is the authoritative validation for delivery availability and fee.
    if (data.type === 'DELIVERY') {
      if (!data.deliveryStreet) {
        res.status(400).json({ error: 'Leveransadress krävs för hemkörning' });
        return;
      }
    }

    // Hämta produkter och beräkna priser
    const productIds = [...new Set(data.items.map((i) => i.productId))];
    const requireActiveProducts = !confirmedPayment || isPendingPayment;
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        ...(requireActiveProducts ? { isActive: true } : {}),
      },
      include: {
        extraGroups: {
          include: {
            extraGroup: {
              include: {
                extras: confirmedPayment ? true : { where: { isActive: true } },
              },
            },
          },
        },
      },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    let subtotal = 0;
    let pointsToSpend = 0;
    let pointsPaidValueOre = 0; // brutto-värde (öre) av varor betalda med poäng — för min-order
    const dpSettings = await getDpointsSettings();
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
          },
        ]),
      );

      const validatedExtras = item.selectedExtras.map((selected) => {
        const group = groupMap.get(selected.groupId);
        if (!group) {
          if (confirmedPayment) {
            return {
              groupId: selected.groupId,
              groupName: selected.groupName,
              extraId: selected.extraId,
              extraName: selected.extraName,
              priceAddon: selected.priceAddon,
            };
          }
          throw new OrderValidationError(`Ogiltigt tillval för ${product.name}`);
        }

        const extra = group.extraMap.get(selected.extraId);
        if (!extra) {
          if (confirmedPayment) {
            return {
              groupId: group.id,
              groupName: group.name,
              extraId: selected.extraId,
              extraName: selected.extraName,
              priceAddon: selected.priceAddon,
            };
          }
          throw new OrderValidationError(`Tillvalet ${selected.extraName} finns inte längre`);
        }

        return {
          groupId: group.id,
          groupName: group.name,
          extraId: extra.id,
          extraName: extra.name,
          priceAddon: extra.priceAddon / 100,
          groupRequired: group.required || group.minSelections > 0,
        };
      });

      if (!confirmedPayment) {
        for (const group of groupMap.values()) {
          // Defensiv null-coalescing — schemat säger NOT NULL men gammal data
          // från före migration kan ha null-värden.
          const minSel = group.minSelections ?? 0;
          const maxSel = group.maxSelections ?? 99;
          const selectedInGroup = validatedExtras.filter((selected) => selected.groupId === group.id);
          if (selectedInGroup.length < minSel) {
            throw new OrderValidationError(`${product.name} kräver minst ${minSel} val i ${group.name.toLowerCase()}`);
          }
          if (selectedInGroup.length > maxSel) {
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

      const extrasTotal = validatedExtras.reduce((sum, e) => sum + Math.round(e.priceAddon * 100), 0);
      const fullItemOre = (product.price + extrasTotal) * item.quantity;
      // Rabattpris (öre) för POÄNG-kostnaden så den matchar vad kunden ser i
      // appen (rabattpris i poäng). Kontant-subtotalen använder fortsatt
      // normalpriset (fullItemOre) — kr-rabatten appliceras separat via
      // discountAmount, så vi får ingen dubbel-rabatt på kontantvaror.
      const discountedBaseOre = (() => {
        if (product.discountActive) {
          if (typeof product.discountPrice === 'number' && product.discountPrice > 0) {
            return Math.max(0, product.discountPrice);
          }
          if (typeof product.discountPercent === 'number' && product.discountPercent > 0) {
            return Math.max(0, Math.round(product.price - product.price * (product.discountPercent / 100)));
          }
        }
        return product.price;
      })();
      const pointsBaseOre = (discountedBaseOre + extrasTotal) * item.quantity;
      // Dpoints: betalas raden med poäng nollas priset (gratis-rad) och poängen
      // dras vid betalning. Kräver inloggad användare + aktiverat system + att
      // varan är markerad rewardable. Klienten erbjuder bara poäng-köp på
      // rewardable-varor, men vi litar inte på klienten — server-side gate.
      if (item.paidWithPoints && dpSettings.dpointsEnabled && !product.rewardable) {
        throw new OrderValidationError(`${product.name} kan inte köpas med Dpoints`);
      }
      const payWithPoints = !!item.paidWithPoints && !!authenticatedUserId && dpSettings.dpointsEnabled && !!product.rewardable;
      const itemSubtotal = payWithPoints ? 0 : fullItemOre;
      if (payWithPoints) {
        pointsToSpend += Math.round((pointsBaseOre / 100) * dpSettings.dpointsValuePerKr);
        pointsPaidValueOre += pointsBaseOre;
      }
      subtotal += itemSubtotal;

      orderItems.push({
        productId: product.id,
        productName: product.name,
        basePrice: payWithPoints ? 0 : product.price,
        quantity: item.quantity,
        note: item.note,
        selectedExtras: JSON.stringify(validatedExtras), // Store as string for SQLite
        subtotal: itemSubtotal,
      });
    }

    // Dpoints budkostnad: en order som betalas ENBART med poäng (subtotal 0 kr,
    // all mat täckt av poäng) bär ingen kontant som kan finansiera kuriren.
    // Vid LEVERANS lägger vi därför på den globala budkostnaden — den ersätter
    // ev. zon-avgift (även restauranger med "fri leverans") så budet alltid får
    // betalt. Vid HÄMTNING finns ingen kurir → ingen budkostnad (gratis).
    const isPointsOnlyOrder = pointsToSpend > 0 && subtotal === 0;
    if (isPointsOnlyOrder && data.type === 'DELIVERY') {
      deliveryFee = dpSettings.dpointsCourierCost ?? 0;
    }

    // Min-order-validering flyttad nedåt — den behöver veta om en rabatt
    // appliceras (eftersom rabatt-tolerans bara aktiveras DÅ). Se
    // "RABATT-TOLERANS"-kommentaren längre ner efter discountAmount är klar.
    // Här bestämmer vi bara `pendingMinOrderTopUp` så vi inte tappar bort
    // klientens topUp-input innan vi vet om den behövs.
    const pendingMinOrderTopUpOre = Math.max(0, Math.round(Number(data.minOrderTopUp || 0) * 100));

    // Rabattkod och automatiska deals
    const now = new Date();
    let manualDiscountAmount = 0;
    let validatedCode: string | undefined;

    if (data.discountCode) {
      const codeVal = data.discountCode?.toLowerCase();
      if (codeVal === 'test' || codeVal === 'testa') {
        validatedCode = codeVal;
        manualDiscountAmount = 0; // Total will be forced to 0 via confirmedPayment
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

          if (!isExpired && subtotal >= code.minOrder && restaurantAllowed) {
            if (code.type === 'PERCENTAGE') {
              manualDiscountAmount = Math.round(subtotal * code.value / 100);
            } else if (code.type === 'FREE_DELIVERY') {
              manualDiscountAmount = deliveryFee; // zeroes out the delivery fee
            } else {
              manualDiscountAmount = Math.min(code.value, subtotal);
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
              manualDiscountAmount += deliveryFee;
            }
            validatedCode = code.code;
          }
        } else {
          // 2. Check personalized customer deals
          const personalDeal = await (prisma as any).customerDeal.findFirst({
             where: { 
               code: data.discountCode,
               phone: data.customerPhone,
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

          if (personalDeal) {
            const isUsable = personalDeal.usageCount < (personalDeal.maxUsages || 1);
            const minOrderOre = normalizeMoneyToOre(personalDeal.campaign.minOrder ?? 0);
            if (isUsable && subtotal >= minOrderOre) {
              if (personalDeal.campaign.discountType === 'PERCENTAGE') {
                manualDiscountAmount = Math.round(subtotal * personalDeal.campaign.discountValue / 100);
              } else {
                const fixedDiscountOre = normalizeMoneyToOre(personalDeal.campaign.discountValue ?? 0);
                manualDiscountAmount = Math.min(fixedDiscountOre, subtotal);
              }
              validatedCode = personalDeal.code;
            }
          }
        }
      }
    }

    const activeDeals = await prisma.deal.findMany({
      // Personliga mallar (welcome/referral) får ALDRIG appliceras som
      // publika auto-deals — de delas bara ut som UserDeals till registrerade
      // kunder. Annars läckte t.ex. "25% första beställning"-välkomstmallen in
      // som automatisk rabatt för ALLA gäst-ordrar.
      where: { isActive: true, isPersonalTemplate: false },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

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
    let automaticDiscountAmount = 0;
    // skipAutomaticDeal=true → kunden har stängt av auto-dealen i UI:n.
    // Vi hoppar HELA pickup-loopen (utom BOGO som är knuten till items i
    // kundvagnen och hanteras separat nedan). Detta säkerställer att
    // frontend-totalen (utan auto-deal) matchar backend-totalen.
    const skipAutoDeals = !!data.skipAutomaticDeal;
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

      if (evaluation.discountAmountOre > automaticDiscountAmount) {
        automaticDiscountAmount = evaluation.discountAmountOre;
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
            if (welcomeTotal > automaticDiscountAmount) {
              automaticDiscountAmount = welcomeTotal;
              appliedDeal = null;
              welcomeAppliedTitle = welcomeOffer.title;
              welcomeAppliedDealId = welcomeOffer.dealId;
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
    const userSentDiscountCode = !!data.discountCode && (manualDiscountAmount > 0 || validatedCode);
    let discountAmount = userSentDiscountCode
      ? manualDiscountAmount
      : automaticDiscountAmount;

    if (userSentDiscountCode) {
      appliedDeal = null;
      // Kupong-kod vinner → välkomsterbjudandet gäller inte (discountAmount
      // = manualDiscountAmount, inte automaticDiscountAmount).
      welcomeAppliedTitle = null;
      welcomeAppliedDealId = null;
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
    if (data.userDealId && authenticatedUserId) {
      const userDeal = await (prisma as any).userDeal.findFirst({
        where: {
          id: data.userDealId,
          userId: authenticatedUserId,
          status: 'ACTIVE',
          OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
        },
      });
      if (!userDeal) {
        throw new OrderValidationError('Kupongen är inte längre giltig');
      }
      const minOrderKr = (userDeal.metadata as any)?.minOrderKr ?? 0;
      if (subtotal < minOrderKr * 100) {
        throw new OrderValidationError(
          `Min orderbelopp för denna kupong är ${minOrderKr} kr`,
        );
      }
      // Beräkna stackad rabatt:
      //   1. Subtotal-rabatt (PERCENTAGE / FIXED): cappad till subtotal
      //   2. Fri leverans (boolean): cappad till deliveryFee
      //   3. Backward compat: discountType=FREE_DELIVERY tolkas som
      //      freeDelivery=true (vi tog bort det från enum men gamla
      //      UserDeals kan ha det)
      const isLegacyFreeDeliveryType = userDeal.discountType === 'FREE_DELIVERY';
      const wantsFreeDelivery = !!userDeal.freeDelivery || isLegacyFreeDeliveryType;

      let subtotalDiscountOre = 0;
      if (!isLegacyFreeDeliveryType) {
        if (userDeal.discountPercent && userDeal.discountPercent > 0) {
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
        discountAmount = totalDealOre;
        appliedDeal = null;
        validatedCode = undefined;
        // UserDeal vinner → välkomst-auto-erbjudandet gäller inte.
        welcomeAppliedTitle = null;
        welcomeAppliedDealId = null;
        appliedUserDealId = userDeal.id;
        appliedUserDealAmountKr = Math.round(totalDealOre / 100);
      }
    }

    // Leveransavgift (use pre-calculated value from above)

    // Test-order: tvinga total till 0 oavsett discount-stack. UserDeal
    // (33% rabatt) eller automatiska deals kan annars producera ett
    // positivt total som matchar inte den 0-betalning bypass:en gör.
    // Vi maxar discountAmount till subtotal+deliveryFee = allt absorberas.
    if (isTestOrder) {
      discountAmount = subtotal + deliveryFee;
    }

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
    if (!confirmedPayment && !isTestOrder) {
      const MIN_ORDER_TOLERANCE_ORE = 4000; // 40 kr
      const hasActiveDiscount = discountAmount > 0;
      const effectiveMinOrderAmount = hasActiveDiscount
        ? Math.max(0, minOrderAmount - MIN_ORDER_TOLERANCE_ORE)
        : minOrderAmount;
      // Dpoints: poäng-betalda varors värde räknas med i min-order (samma tröskel
      // för pengar och poäng — de "matchar"), annars exkluderas gratis-raderna.
      const afterDiscountValue = Math.max(0, subtotal + pointsPaidValueOre - discountAmount);

      if (afterDiscountValue < effectiveMinOrderAmount) {
        const shortfall = effectiveMinOrderAmount - afterDiscountValue;
        if (pendingMinOrderTopUpOre >= shortfall) {
          deliveryFee = deliveryFee + pendingMinOrderTopUpOre;
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

    // Räkna ut total och avrunda UPP till hela kronor (öre-multipel av 100).
    // Frontend gör samma Math.ceil i cart/page.tsx så cart-display ↔ Stripe ↔
    // order.total alla matchar. Utan denna ceil hamnade vi på t.ex.
    // "154.28999999999996 kr" på Stripe-knappen (JS-float-precision på
    // rabatt-procent). Ceil betyder kunden betalar max 99 öre mer än
    // exakt-beloppet — försumbart, men håller siffrorna rena.
    const rawTotal = subtotal - discountAmount + deliveryFee + tipOre;
    let total = Math.max(0, Math.ceil(rawTotal / 100) * 100);
    // Dpoints: Stripe kan inte debitera under 5 kr. Om poäng dragit ner kr-totalen
    // under 5 kr → golva kortbeloppet till 5 kr och låt poängen täcka 5 kr mindre.
    // Kunden betalar alltid minst 5 kr med kort, resten med poäng (inget kortfritt 0-kr).
    const CARD_FLOOR_ORE = 500;
    if (pointsToSpend > 0 && total < CARD_FLOOR_ORE) {
      const bumpOre = CARD_FLOOR_ORE - total;
      total = CARD_FLOOR_ORE;
      pointsToSpend = Math.max(0, pointsToSpend - Math.round((bumpOre / 100) * dpSettings.dpointsValuePerKr));
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
    // Dpoints: ATOMISK reservation av poäng — EN gång, FÖRE retry-loopen (annars
    // dubbel-dras vid orderNumber-kollision). gte-CAS stänger race/dubbel-spend:
    // räcker inte saldot (eller hann ta slut i en parallell order) → avbryt ordern.
    // Poängen är nu dragna; revertas vid betalnings-fail/expiry/refund.
    if (pointsToSpend > 0) {
      if (!authenticatedUserId) throw new OrderValidationError('Logga in för att betala med Dpoints');
      const dec = await prisma.user.updateMany({
        where: { id: authenticatedUserId, pointsBalance: { gte: pointsToSpend } },
        data: { pointsBalance: { decrement: pointsToSpend } },
      });
      if (dec.count === 0) throw new OrderValidationError('Otillräckligt med Dpoints');
    }

    let order: any = null;
    for (let orderAttempt = 1; orderAttempt <= 8; orderAttempt++) {
      const nextNumber = await generateOrderNumber();
      try {
        order = await prisma.order.create({
      data: {
        orderNumber: nextNumber,
        pointsSpent: pointsToSpend,
        status: isPendingPayment ? 'AWAITING_PAYMENT' : 'PENDING',
        type: data.type,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        restaurantId: restaurant?.id || null,
        customerEmail: data.customerEmail || null,
        deliveryStreet: data.deliveryStreet || null,
        deliveryCity: data.deliveryCity || null,
        deliveryZip: data.deliveryZip || null,
        deliveryLatitude: data.deliveryLatitude ?? null,
        deliveryLongitude: data.deliveryLongitude ?? null,
        deliveryNote: data.deliveryNote || null,
        deliveryInstructions: data.deliveryInstructions || null,
        note: data.note || null,
        discountCode: validatedCode || null,
        appliedDealId: appliedDeal?.id || welcomeAppliedDealId || null,
        appliedDealTitle: appliedDeal?.title || welcomeAppliedTitle || null,
        userDealId: appliedUserDealId,
        userDealAmountKr: appliedUserDealAmountKr,
        discountAmount,
        deliveryFee,
        tipAmount: tipOre,
        total,
        stripePaymentIntentId: isPendingPayment ? null : confirmedPayment.id,
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
        userId: authenticatedUserId,
        allergens: authUser?.allergens || '[]',
        // Access-token för guest-tracking-URL: slumpad 32-byte. Returneras
        // till klienten en gång och kan användas i 30 min via `?token=...`
        // i /order/{id} (se GET /orders/:id ovan).
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
        // Dpoints reserverades före loopen men ordern misslyckades → ge tillbaka.
        if (pointsToSpend > 0 && authenticatedUserId) {
          await prisma.user.updateMany({ where: { id: authenticatedUserId }, data: { pointsBalance: { increment: pointsToSpend } } }).catch(() => {});
        }
        throw err; // non-collision error, or out of attempts → bubble up as before
      }
    }
    if (!order) {
      if (pointsToSpend > 0 && authenticatedUserId) {
        await prisma.user.updateMany({ where: { id: authenticatedUserId }, data: { pointsBalance: { increment: pointsToSpend } } }).catch(() => {});
      }
      throw new OrderValidationError('Kunde inte skapa order just nu, försök igen.');
    }

    // Dpoints: ledger-rad för poängen som reserverats/dragits vid order-skapande
    // (saldot är redan atomiskt draget ovan; detta är historik + balanceAfter).
    if (pointsToSpend > 0 && authenticatedUserId) {
      try {
        const u = await prisma.user.findUnique({ where: { id: authenticatedUserId }, select: { pointsBalance: true } });
        await prisma.pointsTransaction.create({
          data: {
            userId: authenticatedUserId,
            amount: -pointsToSpend,
            type: 'REDEEM',
            balanceAfter: u?.pointsBalance ?? 0,
            reason: 'Köpt med poäng',
            metadata: { orderId: order.id },
          },
        });
      } catch (e: any) {
        console.error('[order] dpoints redeem-ledger failed:', e?.message);
      }
    }

    // ── UserDeal-reservation ────────────────────────────────────────────
    // Atomisk reserve så två parallella orders inte kan båda använda samma
    // deal. updateMany med where:{status:'ACTIVE'} fungerar som compare-and-
    // swap. Räknaren `count` säger om vi vann race:n. Om 0: dealen användes
    // av en annan order parallellt — vi loggar warning men ordern är redan
    // skapad med rabatten. I praktiken nästintill omöjligt eftersom samma
    // user måste ha två concurrent checkouts. Hard-rollback skulle kräva
    // refund-flow vilket är overkill för v1.
    if (appliedUserDealId) {
      const reservedCount = await (prisma as any).userDeal.updateMany({
        where: { id: appliedUserDealId, userId: authenticatedUserId, status: 'ACTIVE' },
        data: { status: 'RESERVED', usedOnOrderId: order.id },
      });
      if (reservedCount.count === 0) {
        console.warn(
          `[order] UserDeal reservation race lost — userDealId=${appliedUserDealId} orderId=${order.id} userId=${authenticatedUserId}. Ordern fick rabatten men dealen kunde inte reserveras.`,
        );
      }
    }

    // For pending-payment orders, skip all post-creation side effects until
    // the Stripe webhook confirms the payment.
    if (!isPendingPayment) {
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

      // Dpoints: synkron (direkt-PAID/bypass) väg → intjäning + köp-med-poäng-
      // avdrag. Idempotent (Order.pointsAwarded race-guard) så det krockar inte
      // med applyPaymentSuccess för async-vägen. Utan detta blev en köp-med-
      // poäng-vara gratis UTAN att poäng drogs på sync-vägen (säkerhetshål).
      await awardOrderPointsIfNotAwarded(order.id);

      // Trigger loyalty/retention rewards (async). Failar tyst i bakgrunden
      // — vi blockerar inte order-skapandet på det, men loggar med kontext
      // så vi kan upptäcka i Sentry/loggar om en kund inte fick sin reward.
      triggerLoyaltyRewards(order).catch((err) => {
        console.error('[loyalty] reward trigger failed', {
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerPhone: order.customerPhone ? `${order.customerPhone.slice(0, -4)}xxxx` : null,
          restaurantId: order.restaurantId,
          error: err?.message || String(err),
        });
      });

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
        total: order.total / 100,
        deliveryFee: order.deliveryFee / 100,
        discountAmount: order.discountAmount / 100,
        items: order.items.map((i: any) => ({
          ...i,
          basePrice: i.basePrice / 100,
          subtotal: i.subtotal / 100,
        })),
        restaurantName: order.restaurant?.name || 'Okänd restaurang',
      };
      // Global room is used by SUPER_ADMIN; per-restaurant room is used by each restaurant panel.
      getIO().to('admin-room').emit('order:new', orderForSocket);
      if (order.restaurantId) {
        getIO().to(`admin-room:${order.restaurantId}`).emit('order:new', orderForSocket);
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

    res.status(200).json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      total: order.total / 100,
      appliedDealTitle: order.appliedDealTitle,
      estimatedTime: order.estimatedTime ?? estimatedTime,
      // Klienten ska skicka tokenen som ?token= på order-tracking-URL:n så
      // gäst-redirect efter Stripe (utan auth-header) får tillgång inom 30 min.
      accessToken: order.accessToken,
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

// GET /api/orders/status-batch?ids=a,b,c&phone=46... — lightweight status for
// many orders in ONE request (guest order-history list). Replaces the per-order
// fan-out (~21 requests/load) so 1000 concurrent history loads don't melt the DB.
// Same ownership model as GET /:id: phone must match (ids are unguessable cuids).
// NOTE: must be declared BEFORE GET /:id so it isn't captured as id="status-batch".
router.get('/status-batch', async (req: Request, res: Response) => {
  try {
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

// GET /api/orders/:id - Hämta en order (för kund att följa sin order).
// Ägarskap krävs: antingen via JWT (inloggad kund) ELLER customerPhone som
// query-param som matchar order.customerPhone (för guest-ordrar).
// Utan dessa returnerar vi 404 (samma som om order inte fanns) så att
// ID-gissning inte avslöjar vilka ordrar som existerar.
router.get('/:id', async (req: Request, res: Response) => {
  try {
    // Cache 4s by id: order-tracking AND the app-wide banner both poll this every
    // 15s for the SAME order — collapses synchronized polls to ~1 DB read per 4s.
    // The owner check below still gates access; the socket pushes realtime so a
    // ≤4s lag on the poll path is invisible.
    const order: any = await cached('order:byid', req.params.id, 4000, () =>
      prisma.order.findUnique({
        where: { id: req.params.id },
        include: {
          items: true,
          restaurant: true,
          // Leveransbevis för order-tracking: foto (TTL 2 dygn), leveranssätt,
          // kurirens notering. proofExpiresAt → klienten döljer fotot när det gått ut.
          delivery: { select: { proofMethod: true, proofMessage: true, proofPhotoUrl: true, proofExpiresAt: true } },
        },
      })
    );

    if (!order) {
      res.status(404).json({ error: 'Order hittades inte' });
      return;
    }

    // Ägarskaps-kontroll
    let isOwner = false;

    // 1. JWT-baserad auth — om header finns och token-userId matchar order.userId
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      // Supabase
      if (supabaseAdmin) {
        try {
          const { data: { user: sbUser } } = await supabaseAdmin.auth.getUser(token);
          if (sbUser && order.userId === sbUser.id) isOwner = true;
        } catch { /* try legacy */ }
      }
      // Legacy custom JWT
      if (!isOwner) {
        try {
          const payload = jwt.verify(token, JWT_SECRET) as any;
          if (payload?.id && order.userId === payload.id) isOwner = true;
        } catch { /* fallthrough */ }
      }
    }

    // 2. customerPhone-match — för guest-ordrar och nyligen lagda ordrar där
    // kunden ännu inte loggat in. Telefonnumret normaliseras (siffror + +).
    if (!isOwner) {
      const queryPhone = typeof req.query.phone === 'string' ? req.query.phone : null;
      const normalize = (p: string | null | undefined) => (p || '').replace(/[^\d+]/g, '');
      if (queryPhone && normalize(queryPhone) === normalize(order.customerPhone)) {
        isOwner = true;
      }
    }

    // 3. SnabbVERIFY-token: efter en lyckad pre-payment-order returnerar
    //    POST /api/orders en `orderToken` (sätts på ordern). Klienten skickar
    //    den som `?token=...` direkt efter Stripe-redirect och vi godkänner
    //    åtkomst inom 30 min. Tokenen är 32-byte slumpad så ID-gissning är
    //    omöjlig. (Tidigare hade vi 5-min grace baserat enbart på ageMs
    //    vilket lät vem som helst läsa kundens PII via enumerable cuid:er.)
    if (!isOwner) {
      const queryToken = typeof req.query.token === 'string' ? req.query.token : null;
      const orderToken = (order as any).accessToken as string | null | undefined;
      if (queryToken && orderToken && queryToken === orderToken) {
        const ageMs = Date.now() - new Date(order.createdAt).getTime();
        if (ageMs < 30 * 60 * 1000) {
          isOwner = true;
        }
      }
    }

    if (!isOwner) {
      res.status(404).json({ error: 'Order hittades inte' });
      return;
    }

    // For customer-facing view: while the order is still inside its
    // DELIVERING window (computed by computeDeliveryWindowMs — currently 30 s
    // for testing, normally 10–25 min), show DELIVERING; after that the row
    // already reads DELIVERED and we serve that. Single source of truth so
    // the customer banner, the LA finaliser, and the LA dispatcher all
    // agree on the same window.
    let customerStatus = order.status;
    // Det artificiella DELIVERING-fönstret är en MOCK och gäller ENDAST
    // self-leverans (ingen kurir finns som markerar klart — vi simulerar
    // transit-tiden). För vi-levererar har budet redan markerat DELIVERED
    // PÅ RIKTIGT (courier `complete`); då måste vi respektera det direkt.
    // Annars drog denna override tillbaka status till DELIVERING på nästa
    // poll efter att budet levererat → kund-trackingen hoppade bakåt och
    // live-kartan kom tillbaka. Samma selfDelivery-gate som PATCH /status.
    if (
      order.status === 'DELIVERED' &&
      order.deliveringAt &&
      (order.restaurant as any)?.selfDelivery
    ) {
      const deliveringAtDate = new Date(order.deliveringAt);
      const windowMs = computeDeliveryWindowMs(deliveringAtDate, order.id);
      const elapsed = Date.now() - deliveringAtDate.getTime();
      if (elapsed < windowMs) {
        customerStatus = 'DELIVERING';
      }
    }

    // Absolute timestamp when the active LiveActivity step's countdown should
    // hit zero. Computed from anchor timestamps + the originally agreed-on
    // duration so it stays stable across re-fetches and reboots.
    let etaEndsAt: string | null = null;
    if (customerStatus === 'PREPARING' && order.preparingAt && order.estimatedTime) {
      etaEndsAt = new Date(new Date(order.preparingAt).getTime() + order.estimatedTime * 60_000).toISOString();
    } else if (customerStatus === 'DELIVERING' && order.deliveringAt) {
      const deliveringAtDate = new Date(order.deliveringAt);
      const windowMs = computeDeliveryWindowMs(deliveringAtDate, order.id);
      etaEndsAt = new Date(deliveringAtDate.getTime() + windowMs).toISOString();
    }

    res.json({
      id: order.id,
      orderNumber: order.orderNumber,
      status: customerStatus,
      type: order.type,
      total: order.total / 100,
      deliveryFee: order.deliveryFee / 100,
      discountAmount: order.discountAmount / 100,
      tipAmount: (order.tipAmount ?? 0) / 100,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
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
      etaEndsAt,
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
    let etaEndsAt: Date | null = null;
    if (status === 'PREPARING' && order.preparingAt && order.estimatedTime) {
      etaEndsAt = new Date(new Date(order.preparingAt).getTime() + order.estimatedTime * 60_000);
    } else if (status === 'PREPARING' && order.estimatedTime) {
      etaEndsAt = new Date(Date.now() + order.estimatedTime * 60_000);
    } else if (status === 'DELIVERING' && order.deliveringAt) {
      const deliveringAtDate = new Date(order.deliveringAt);
      etaEndsAt = new Date(deliveringAtDate.getTime() + computeDeliveryWindowMs(deliveringAtDate, order.id));
    } else if (status === 'DELIVERING') {
      const now = new Date();
      etaEndsAt = new Date(now.getTime() + computeDeliveryWindowMs(now, order.id));
    }
    console.log(`[debug-la-push] order=${orderId} status=${status} token=${order.liveActivityToken.slice(0, 16)}…`);
    try {
      await pushOrderStatusUpdate({
        token: order.liveActivityToken,
        serverStatus: status,
        orderType: order.type,
        etaMinutes: order.estimatedTime ?? null,
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
    const { token } = req.body ?? {};
    const orderId = req.params.id;
    if (typeof token !== 'string' || token.length < 32 || token.length > 256 || !/^[a-f0-9]+$/i.test(token)) {
      console.warn(`[live-activity-token] ❌ invalid token for order=${orderId}, len=${(token as any)?.length}`);
      res.status(400).json({ error: 'Ogiltig token' });
      return;
    }
    // TODO(mobile-launch): kräv ägar-bevis (JWT-match eller accessToken)
    // när iOS-appen uppdaterats att forwarda Authorization-header eller
    // order.accessToken. För nuvarande RN-klient (src/lib/api.ts saknar
    // global Authorization-injection) skulle en strikt check breaka push-
    // notiser i Live Activity för alla iOS-användare. Webappen påverkas
    // inte — endpointen är iOS-only.
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
// Allowed transitions:
//   DELIVERING → DELIVERED
// All other transitions are no-ops (return 200 with `{changed: false}` so the
// client doesn't retry). This endpoint is idempotent.
router.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const orderId = req.params.id;
    const newStatus = String(req.body?.status || '').toUpperCase();
    if (newStatus !== 'DELIVERED') {
      return res.status(400).json({ error: 'Endast DELIVERED tillåts via denna endpoint' });
    }

    // Resolve caller identity
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Saknar inloggning' });
    }
    const token = auth.slice(7);
    let callerUserId: string | null = null;

    // Try Supabase JWT first
    try {
      const sb = await supabaseAdmin.auth.getUser(token);
      if (sb.data.user) {
        callerUserId = sb.data.user.id;
      }
    } catch {}

    // Fall back to legacy custom JWT
    if (!callerUserId) {
      try {
        const payload = jwt.verify(token, JWT_SECRET) as any;
        if (payload?.id) callerUserId = String(payload.id);
      } catch {}
    }

    if (!callerUserId) {
      return res.status(401).json({ error: 'Ogiltig token' });
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, userId: true, status: true, restaurantId: true, restaurant: { select: { selfDelivery: true } } },
    });
    if (!order) return res.status(404).json({ error: 'Ordern hittades inte' });
    if (order.userId !== callerUserId) {
      return res.status(403).json({ error: 'Du äger inte denna order' });
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

    const updated = await prisma.order.update({
      where: { id: orderId },
      data: { status: 'DELIVERED' },
      select: { id: true, status: true },
    });

    // Notify any connected clients (restaurant, admin, customer mirrors).
    try {
      getIO()?.to(`order:${orderId}`).emit('order:status', { id: orderId, status: 'DELIVERED' });
      // Även admin-rummet så order-listan uppdateras direkt (annars syns
      // kund-mockens auto-DELIVERED först vid nästa poll).
      getIO()?.to('admin-room').emit('order:updated', { id: orderId, status: 'DELIVERED' });
      if (order.restaurantId) getIO()?.to(`admin-room:${order.restaurantId}`).emit('order:updated', { id: orderId });
      void sendOrderStatusPush(orderId, 'DELIVERED');
    } catch {}

    // Sync the iOS Live Activity if one is registered.
    void pushLiveActivityForOrder(orderId).catch((e) =>
      console.warn(`[orders/status] LA dispatch failed order=${orderId}:`, e?.message),
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
// Samma trefaldiga ägar-check som GET /:id: JWT (Supabase eller legacy) som
// matchar order.userId, query/body-phone som matchar order.customerPhone, eller
// accessToken som matchar order.accessToken (32-byte slumpad, 30 min TTL).
router.post('/:id/review', async (req: Request, res: Response) => {
  try {
    const { rating, review, likedItemIds, phone: bodyPhone, accessToken: bodyAccessToken } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Betyg måste vara mellan 1-5' });
    }
    const order = await prisma.order.findFirst({
      where: { id: req.params.id },
      include: { items: { select: { productId: true, productName: true } } },
    });
    if (!order) return res.status(404).json({ error: 'Order hittades inte' });
    if (!['DELIVERED', 'READY', 'COMPLETED'].includes(order.status)) {
      return res.status(400).json({ error: 'Du kan bara betygsätta levererade ordrar' });
    }
    if ((order as any).rating) {
      return res.status(400).json({ error: 'Denna order har redan fått ett betyg' });
    }

    let isOwner = false;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const bearer = authHeader.split(' ')[1];
      if (supabaseAdmin) {
        try {
          const { data: { user: sbUser } } = await supabaseAdmin.auth.getUser(bearer);
          if (sbUser && (order as any).userId === sbUser.id) isOwner = true;
        } catch { /* fallthrough */ }
      }
      if (!isOwner) {
        try {
          const payload = jwt.verify(bearer, JWT_SECRET) as any;
          if (payload?.id && (order as any).userId === payload.id) isOwner = true;
        } catch { /* fallthrough */ }
      }
    }
    if (!isOwner) {
      const phoneCandidate =
        (typeof req.query.phone === 'string' ? req.query.phone : null) ||
        (typeof bodyPhone === 'string' ? bodyPhone : null);
      const normalize = (p: string | null | undefined) => (p || '').replace(/[^\d+]/g, '');
      if (phoneCandidate && normalize(phoneCandidate) === normalize((order as any).customerPhone)) {
        isOwner = true;
      }
    }
    if (!isOwner) {
      const tokenCandidate =
        (typeof req.query.token === 'string' ? req.query.token : null) ||
        (typeof bodyAccessToken === 'string' ? bodyAccessToken : null);
      const orderToken = (order as any).accessToken as string | null | undefined;
      if (tokenCandidate && orderToken && tokenCandidate === orderToken) {
        // Reviews får vi tillåta hela 30 dagar efter delivery — review-fönstret
        // är längre än access-fönstret för PII (30 min). Stoppar bara mycket
        // gamla orders som ändå inte borde kunna betygsättas.
        const ageMs = Date.now() - new Date(order.createdAt).getTime();
        if (ageMs < 30 * 24 * 60 * 60 * 1000) isOwner = true;
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

    await prisma.order.update({
      where: { id: req.params.id },
      data: {
        rating,
        review: review || null,
        reviewedAt: new Date(),
        likedItemIds: JSON.stringify(cleanLikedIds),
        customerName: reviewerName,
      } as any,
    });

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
// Idempotent cancel av en AWAITING_PAYMENT-order. Anropas när kunden trycker
// browser-back / stänger taben / Stripe redirectar tillbaka utan succeeded.
//
// Säker mot race med webhook: re-assertar status=AWAITING_PAYMENT + paymentStatus
// != PAID i deleteMany — om Stripe just bekräftade betalningen mellan vår fetch
// och delete så raderas ordern INTE (den blev en riktig PENDING-order i samma
// transaktion). Reverterar reserverad UserDeal samma sätt som
// expireAbandonedAwaitingPayment-cronen.
//
// Returnerar alltid 200 (idempotent — sendBeacon/beforeunload kan trigga
// flera gånger; vi vill inte krascha klienten på en redan-raderad order).
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
        userDealId: true,
        accessToken: true,
      },
    });

    // Order hittades inte = redan raderad av tidigare abandon-call eller av
    // cleanup-cronen. Idempotent: returnera 200 så klienten inte retryar.
    if (!order) return res.json({ success: true, alreadyGone: true });

    // Bara AWAITING_PAYMENT som inte är PAID får raderas. Allt annat är
    // antingen en betald order (vill inte radera!) eller en redan cancellerad.
    // Returnera 200 även här — klienten ska inte logga fel.
    if (order.status !== 'AWAITING_PAYMENT' || (order as any).paymentStatus === 'PAID') {
      return res.json({ success: true, skipped: 'not-awaiting' });
    }

    // ── Owner-check (samma pattern som /:id/review) ────────────────────────
    let isOwner = false;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const bearer = authHeader.split(' ')[1];
      if (supabaseAdmin) {
        try {
          const { data: { user: sbUser } } = await supabaseAdmin.auth.getUser(bearer);
          if (sbUser && (order as any).userId === sbUser.id) isOwner = true;
        } catch { /* fallthrough */ }
      }
      if (!isOwner) {
        try {
          const payload = jwt.verify(bearer, JWT_SECRET) as any;
          if (payload?.id && (order as any).userId === payload.id) isOwner = true;
        } catch { /* fallthrough */ }
      }
    }
    if (!isOwner) {
      const tokenCandidate =
        (typeof req.query.token === 'string' ? req.query.token : null) ||
        (typeof bodyAccessToken === 'string' ? bodyAccessToken : null);
      const orderToken = (order as any).accessToken as string | null | undefined;
      if (tokenCandidate && orderToken && tokenCandidate === orderToken) {
        isOwner = true;
      }
    }
    if (!isOwner) {
      const phoneCandidate =
        (typeof req.query.phone === 'string' ? req.query.phone : null) ||
        (typeof bodyPhone === 'string' ? bodyPhone : null);
      const normalize = (p: string | null | undefined) => (p || '').replace(/[^\d+]/g, '');
      if (phoneCandidate && normalize(phoneCandidate) === normalize((order as any).customerPhone)) {
        isOwner = true;
      }
    }
    if (!isOwner) {
      // 404 inte 403 — ID-gissning ska inte avslöja existens.
      return res.status(404).json({ error: 'Order hittades inte' });
    }

    // ── Revert UserDeal (om någon reserverats) ─────────────────────────────
    if ((order as any).userDealId) {
      await (prisma as any).userDeal
        .updateMany({
          where: { id: (order as any).userDealId, status: 'RESERVED', usedOnOrderId: order.id },
          data: { status: 'ACTIVE', usedOnOrderId: null },
        })
        .catch(() => {});
    }

    // ── Delete (race-safe via re-assertad where) ───────────────────────────
    // Om webhook precis flippade ordern till PENDING+PAID i en parallell
    // transaktion så matchar where-klausulen INTE → 0 rows affected → ordern
    // bevaras. Det är exakt vad vi vill.
    const deleted = await prisma.order.deleteMany({
      where: {
        id: order.id,
        status: 'AWAITING_PAYMENT',
        paymentStatus: { not: 'PAID' },
      },
    });

    return res.json({ success: true, deleted: deleted.count });
  } catch (error) {
    console.error('Abandon order error:', error);
    // Idempotent: även vid serverfel ska klienten inte spinna i en retry-
    // loop. Cleanup-cronen tar hand om kvarvarande ordrar inom 5 min ändå.
    return res.json({ success: false, error: 'internal' });
  }
});

export default router;
