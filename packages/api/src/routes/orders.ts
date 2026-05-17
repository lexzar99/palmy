import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import Stripe from 'stripe';
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
import { triggerLoyaltyRewards } from '../lib/loyalty';
import { JWT_SECRET } from '../lib/config';
import { cacheResponse, getCachedResponse, getIdempotencyKey } from '../lib/idempotency';
import { normalizeDeliveryZones, normalizeMoneyToOre, resolveDeliveryFee } from '../utils/deliveryZones';
import supabaseAdmin from '../lib/supabase';
import { pushLiveActivityForOrder } from '../lib/liveActivityDispatch';
import { computeDeliveryWindowMs } from '../lib/deliveryWindow';
import { authenticate, requireSuperAdmin } from '../middleware/auth';

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
  quantity: z.number().min(1).max(20),
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
  deliveryNote: z.string().nullable().optional(),
  deliveryInstructions: z.string().nullable().optional(),

  note: z.string().nullable().optional(),
  discountCode: z.string().nullable().optional(),
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
  const tokenScopeHash = authHeaderForScope.startsWith('Bearer ')
    ? authHeaderForScope.slice(7, 39) // de första 32 chars av token = unique per user
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
    // FÖR PICKUP: ingen leveransavgift (0). minOrder från globalSettings
    // som fallback (om admin satt plattform-wide min). Ingen restaurant-
    // specifik min för pickup heller — håll det enkelt.
    let deliveryFee = 0;
    let minOrderAmount = globalSettings?.minOrderAmount ?? 0;

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

    // Idempotency: if this PaymentIntent already has an order, return that order directly.
    // Skip for TEST_PAYMENT, FREE_PROMO and BYPASS to allow multiple tests by developers.
    const isSpecialMockId = data.stripePaymentIntentId === 'TEST_PAYMENT' || data.stripePaymentIntentId === 'FREE_PROMO' || data.stripePaymentIntentId === 'BYPASS';
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
    if (intentId && !isTestOrder && intentId !== 'BYPASS') {
      confirmedPayment = await getConfirmedPaymentIntent(data.stripePaymentIntentId!);
    } else if (isTestOrder) {
      confirmedPayment = { id: data.stripePaymentIntentId || 'TEST_PAYMENT', amount: 0 }; 
    } else if (intentId === 'BYPASS') {
      console.log('⏩ Bypassing Stripe verification for request');
      confirmedPayment = { id: 'BYPASS', amount: -1 };
    } else if (isPendingPayment) {
      confirmedPayment = { id: 'PENDING', amount: -1 };
    }

    // Only enforce open status for unpaid/manual flows.
    if (!confirmedPayment && !restaurantOpen) {
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
      const itemSubtotal = (product.price + extrasTotal) * item.quantity;
      subtotal += itemSubtotal;

      orderItems.push({
        productId: product.id,
        productName: product.name,
        basePrice: product.price,
        quantity: item.quantity,
        note: item.note,
        selectedExtras: JSON.stringify(validatedExtras), // Store as string for SQLite
        subtotal: itemSubtotal,
      });
    }

    // Minsta ordersumma-validering — kund kan välja att betala mellanskillnaden
    // via `minOrderTopUp`-fältet (kr). Då läggs det på deliveryFee och ordern går igenom.
    if (!confirmedPayment && subtotal < minOrderAmount) {
      const topUpKr = Number(data.minOrderTopUp || 0);
      const topUpOre = Math.max(0, Math.round(topUpKr * 100));
      const shortfall = minOrderAmount - subtotal;
      if (topUpOre >= shortfall) {
        deliveryFee = deliveryFee + topUpOre;
      } else {
        res.status(400).json({ error: `Minsta beställningsbelopp är ${minOrderAmount / 100} kr. Du saknar ${((minOrderAmount - subtotal) / 100).toFixed(0)} kr.` });
        return;
      }
    }

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
      where: { isActive: true },
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
    }

    let discountAmount = manualDiscountAmount >= automaticDiscountAmount
      ? manualDiscountAmount
      : automaticDiscountAmount;

    if (discountAmount === manualDiscountAmount) {
      appliedDeal = null;
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
    const total = Math.max(0, Math.ceil(rawTotal / 100) * 100);

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

    const nextNumber = await generateOrderNumber();

    const order: any = await prisma.order.create({
      data: {
        orderNumber: nextNumber,
        status: isPendingPayment ? 'AWAITING_PAYMENT' : 'PENDING',
        type: data.type,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        restaurantId: restaurant?.id || null,
        customerEmail: data.customerEmail || null,
        deliveryStreet: data.deliveryStreet || null,
        deliveryCity: data.deliveryCity || null,
        deliveryZip: data.deliveryZip || null,
        deliveryNote: data.deliveryNote || null,
        deliveryInstructions: data.deliveryInstructions || null,
        note: data.note || null,
        discountCode: validatedCode || null,
        appliedDealId: appliedDeal?.id || null,
        appliedDealTitle: appliedDeal?.title || null,
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

// GET /api/orders/:id - Hämta en order (för kund att följa sin order).
// Ägarskap krävs: antingen via JWT (inloggad kund) ELLER customerPhone som
// query-param som matchar order.customerPhone (för guest-ordrar).
// Utan dessa returnerar vi 404 (samma som om order inte fanns) så att
// ID-gissning inte avslöjar vilka ordrar som existerar.
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const order: any = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { items: true, restaurant: true },
    });

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

    // 3. Grace-period för nyligen lagda ordrar (5 min) — webhook-confirmation
    // och redirect-flows (Swish/Klarna) kan komma tillbaka utan auth-header
    // direkt. Vi tillåter ID-baserad åtkomst inom kort fönster efter create.
    if (!isOwner) {
      const ageMs = Date.now() - new Date(order.createdAt).getTime();
      if (ageMs < 5 * 60 * 1000) {
        isOwner = true;
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
    if (order.status === 'DELIVERED' && order.deliveringAt) {
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
      etaEndsAt,
      restaurantName: order.restaurant?.name || 'Okänd restaurang',
      restaurantAddress: order.restaurant?.address || '',
      restaurantZip: order.restaurant?.zip || '',
      restaurantCity: order.restaurant?.city || '',
      restaurantPhone: order.restaurant?.phone || '',
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
      select: { id: true, userId: true, status: true },
    });
    if (!order) return res.status(404).json({ error: 'Ordern hittades inte' });
    if (order.userId !== callerUserId) {
      return res.status(403).json({ error: 'Du äger inte denna order' });
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

// POST /api/orders/:id/review  (public — works for both guests and logged-in users)
router.post('/:id/review', async (req: Request, res: Response) => {
  try {
    const { rating, review, likedItemIds } = req.body;
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

export default router;
