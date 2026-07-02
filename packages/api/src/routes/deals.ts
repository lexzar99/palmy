import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { evaluateDeal, formatDealForClient, isBasketDeal, isDealAvailableNow, parseDealProductIds, userDealRestaurantScope, type CartItemForBogo } from '../lib/deals';
import { cached } from '../lib/ttlCache';
import { getWelcomeOffer, isWelcomeEligible, welcomeOfferDiscountOre } from './referrals';
import { authenticateUser, authenticateUserOptional } from './auth';
import { themeForKey } from '../lib/themeRotation';
import { abHiddenDealIds } from '../lib/abTests';

const router = Router();

// ── GET /api/welcome-offer — publikt välkomsterbjudande för kassans toggle ──
// Drivs av admin → Välkomstrabatt (welcomeDealActive + mall + audience +
// maxOrders). Visas optimistiskt i kassan; checkout validerar mot riktig
// telefon. Query: subtotal (kr), phone (valfri), loggedIn ("1"/"0").
router.get('/welcome-offer', async (req, res) => {
  try {
    const subtotalKr = Math.max(0, Number(req.query.subtotal) || 0);
    const phone = typeof req.query.phone === 'string' ? req.query.phone.trim() : '';
    const isLoggedIn = req.query.loggedIn === '1' || req.query.loggedIn === 'true';

    const offer = await getWelcomeOffer();
    if (!offer) return res.json({ active: false });

    // Tidigare ordrar för telefonen (om angiven) — för första-N-order-gating.
    // Räknar bort avbrutna/nekade. null = okänt (gäst utan telefon) → optimistiskt.
    let priorOrderCount: number | null = null;
    if (phone) {
      priorOrderCount = await prisma.order.count({
        where: { customerPhone: phone, status: { notIn: ['CANCELLED', 'REJECTED'] } },
      });
    }

    const eligible = isWelcomeEligible(offer, { priorOrderCount, isLoggedIn });
    const subtotalOre = Math.round(subtotalKr * 100);
    const discountOre = eligible ? welcomeOfferDiscountOre(offer, subtotalOre) : 0;

    res.json({
      active: true,
      eligible,
      title: offer.title,
      discountPercent: offer.discountPercent,
      amountKr: offer.amountKr,
      freeDelivery: offer.freeDelivery,
      minOrderKr: offer.minOrderKr,
      audience: offer.audience,
      maxOrders: offer.maxOrders,
      discountKr: discountOre / 100,
    });
  } catch (err) {
    console.error('welcome-offer error:', err);
    res.json({ active: false });
  }
});

// Rate-limit /evaluate-cart eftersom kunden POSTar för VARJE cart-mutation
// (lägg till/ta bort/byt antal). 60 anrop/min/IP är generöst för interaktiv
// användning men stoppar enkla DoS-försök.
const evaluateCartLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'För många anrop — vänta en stund och försök igen' },
});

const parseJsonArray = (raw: string | null | undefined) => {
  if (!raw) return [] as string[];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
};

const normalizeAudience = (value: unknown) => String(value || 'ALL').toUpperCase();
const normalizePlacement = (value: unknown) => String(value || 'HOME_TOP').toUpperCase();
const oreToKr = (value: unknown) => Math.round(Number(value || 0)) / 100;

const appAudienceMatches = (deal: any, ctx: { isLoggedIn: boolean; orderCount: number | null }) => {
  const audience = normalizeAudience(deal.appAudience);
  if (audience === 'ALL') return true;
  if (audience === 'GUEST') return !ctx.isLoggedIn;
  if (audience === 'LOGGED_IN') return ctx.isLoggedIn;
  if (audience === 'NEW_CUSTOMER') return ctx.orderCount === null || ctx.orderCount === 0;
  if (audience === 'NEW_LOGGED_IN') return ctx.isLoggedIn && (ctx.orderCount === null || ctx.orderCount === 0);
  if (audience === 'RETURNING') return (ctx.orderCount ?? 0) > 0;
  return true;
};

const isMissionDeal = (deal: any) => Boolean(deal.appMissionType) || String(deal.appTemplate || '').toUpperCase() === 'MISSION';

// Uppdragets mål bor i Deal.triggerQuantity (admin-styrt, återanvänt fält).
const missionTargetForDeal = (deal: any) => {
  const raw = Number(deal.triggerQuantity || 0);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 3;
};

// TOTAL_ORDERS = milstolpe (räknar alla ordrar, inget tidsfönster).
const isAllTimeMission = (deal: any) =>
  String(deal.appMissionType || '').toUpperCase() === 'TOTAL_ORDERS';

const missionProgressForDeal = async (userId: string | undefined, deal: any, userDeal?: any) => {
  if (!userId || !isMissionDeal(deal)) return null;
  const target = missionTargetForDeal(deal);
  const allTime = isAllTimeMission(deal);
  const windowDays = allTime ? 0 : 7;
  const windowStart = allTime
    ? undefined
    : userDeal?.createdAt || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const count = await prisma.order.count({
    where: {
      userId,
      pointsAwarded: true,
      ...(windowStart ? { createdAt: { gte: windowStart } } : {}),
      status: { notIn: ['CANCELLED', 'REJECTED'] },
    },
  });
  const completed = userDeal?.status === 'USED' || count >= target;
  return {
    target,
    count: Math.min(count, target),
    remaining: Math.max(0, target - count),
    completed,
    windowDays,
    rewardPoints: Math.max(0, Math.round(Number(deal.appDpointsBonus || 0))),
    claimed: Boolean(userDeal),
  };
};

const formatAppDeal = (deal: any, userDealId?: string | null, missionProgress?: any) => {
  const mission = isMissionDeal(deal);
  const fixedKr =
    deal.discountType === 'FIXED' || deal.discountType === 'FIXED_PRICE'
      ? oreToKr(deal.discountValue)
      : null;
  const percent = deal.discountType === 'PERCENTAGE' ? Number(deal.discountValue || 0) : null;
  const minOrderKr = oreToKr(deal.minOrder);
  const restaurant = deal.restaurant
    ? {
        id: deal.restaurant.id,
        name: deal.restaurant.name,
        slug: deal.restaurant.slug,
        imageUrl: deal.restaurant.imageUrl || deal.restaurant.heroImageUrl || null,
        cuisine: deal.restaurant.cuisine || null,
      }
    : null;

  const fallbackBadge = deal.freeDelivery
    ? 'Fri leverans'
    : percent
      ? `${percent}% rabatt`
      : fixedKr
        ? `${fixedKr} kr rabatt`
        : deal.appDpointsBonus > 0
          ? `+${deal.appDpointsBonus} Dpoints`
          : 'Deal';
  const subtitle = missionProgress
    ? missionProgress.completed
      ? `Uppdrag klart. ${missionProgress.rewardPoints} Dpoints är dina.`
      : missionProgress.windowDays > 0
        ? `${missionProgress.count} av ${missionProgress.target} beställningar denna vecka`
        : `${missionProgress.count} av ${missionProgress.target} beställningar`
    : deal.description || '';

  return {
    id: deal.id,
    title: deal.title,
    subtitle,
    badge: deal.badgeText || fallbackBadge,
    imageUrl: deal.imageUrl || restaurant?.imageUrl || null,
    ctaLabel: deal.appCtaLabel || (deal.appClaimRequired ? 'Hämta' : 'Visa'),
    placement: deal.appPlacement || 'HOME_TOP',
    audience: deal.appAudience || 'ALL',
    template: deal.appTemplate || 'DEAL_HERO',
    size: deal.appSize || 'LARGE',
    rotating: deal.appRotating !== false,
    weight: deal.appWeight ?? 10,
    claimRequired: deal.appClaimRequired !== false,
    claimExpiresMinutes: deal.appClaimExpiresMinutes ?? null,
    cooldownHours: deal.appCooldownHours ?? null,
    dpointsBonus: deal.appDpointsBonus ?? 0,
    missionType: deal.appMissionType || null,
    missionProgress: missionProgress || null,
    checkoutApplicable: !mission,
    theme: deal.appTheme || themeForKey(`deal:${deal.id}`),
    discountType: deal.discountType,
    discountPercent: percent,
    amountKr: fixedKr,
    freeDelivery: !!deal.freeDelivery,
    minOrderKr,
    restaurant,
    restaurantId: deal.restaurantId || null,
    isGlobal: !!deal.isGlobal,
    applicableRestaurantIds: parseJsonArray(deal.applicableRestaurantIds),
    validUntil: deal.validUntil,
    userDealId: userDealId || null,
  };
};

const AppDealQuoteSchema = z.object({
  userDealId: z.string().min(1),
  subtotalKr: z.number().nonnegative(),
  deliveryFeeKr: z.number().nonnegative().optional().default(0),
  orderMode: z.enum(['DELIVERY', 'PICKUP', 'delivery', 'pickup']).optional().default('DELIVERY'),
  restaurantId: z.string().optional(),
});

const calculateUserDealQuote = (userDeal: any, input: z.infer<typeof AppDealQuoteSchema>) => {
  const subtotalOre = Math.round(input.subtotalKr * 100);
  const deliveryFeeOre = Math.round((input.deliveryFeeKr || 0) * 100);
  const isDelivery = String(input.orderMode).toUpperCase() === 'DELIVERY';
  const metadata = (userDeal.metadata || {}) as any;
  const minOrderKr = Math.max(0, Number(metadata.minOrderKr || 0));

  if ((metadata.appMissionType || userDeal.type === 'APP_MISSION') && !metadata.appTemplate?.includes?.('CHECKOUT')) {
    return {
      applicable: false,
      reason: 'MISSION_NOT_CHECKOUT',
      minOrderKr,
      subtotalDiscountOre: 0,
      deliveryDiscountOre: 0,
      discountAmountOre: 0,
      dpointsBonus: 0,
    };
  }

  if (minOrderKr > 0 && subtotalOre < minOrderKr * 100) {
    return {
      applicable: false,
      reason: 'MIN_ORDER',
      minOrderKr,
      subtotalDiscountOre: 0,
      deliveryDiscountOre: 0,
      discountAmountOre: 0,
      dpointsBonus: Math.max(0, Math.round(Number(metadata.appDpointsBonus || 0))),
    };
  }

  const isLegacyFreeDeliveryType = userDeal.discountType === 'FREE_DELIVERY';
  const wantsFreeDelivery = Boolean(userDeal.freeDelivery) || isLegacyFreeDeliveryType;
  let subtotalDiscountOre = 0;
  if (!isLegacyFreeDeliveryType) {
    if (userDeal.discountPercent && userDeal.discountPercent > 0) {
      subtotalDiscountOre = Math.round((subtotalOre * Number(userDeal.discountPercent)) / 100);
    } else if (userDeal.amountKr && userDeal.amountKr > 0) {
      subtotalDiscountOre = Math.round(Number(userDeal.amountKr) * 100);
    }
  }
  subtotalDiscountOre = Math.min(Math.max(0, subtotalDiscountOre), subtotalOre);
  const deliveryDiscountOre = wantsFreeDelivery && isDelivery ? deliveryFeeOre : 0;
  const discountAmountOre = Math.min(subtotalOre + deliveryFeeOre, subtotalDiscountOre + deliveryDiscountOre);

  const applicable = discountAmountOre > 0 || Number(metadata.appDpointsBonus || 0) > 0;
  // Förklara VARFÖR dealen inte gäller (annars ser det ut som en bugg):
  // fri leverans-deal + 0 kr i avgift = redan gratis; pickup = gäller ej.
  let notApplicableReason: string | null = null;
  if (!applicable && wantsFreeDelivery && subtotalDiscountOre === 0) {
    notApplicableReason = !isDelivery ? 'PICKUP_ONLY' : deliveryFeeOre === 0 ? 'ALREADY_FREE_DELIVERY' : 'NO_VALUE';
  } else if (!applicable) {
    notApplicableReason = 'NO_VALUE';
  }

  return {
    applicable,
    reason: notApplicableReason,
    minOrderKr,
    subtotalDiscountOre,
    deliveryDiscountOre,
    discountAmountOre,
    dpointsBonus: Math.max(0, Math.round(Number(metadata.appDpointsBonus || 0))),
  };
};

// GET /api/deals/app — roterande app-kort för Swift home/cart/rewards.
// Query: placement=HOME_TOP, limit=6, loggedIn=1, phone=...
router.get('/app', authenticateUserOptional, async (req: any, res) => {
  try {
    const placement = normalizePlacement(req.query.placement);
    const limit = Math.max(1, Math.min(12, Number(req.query.limit) || 8));
    const isLoggedIn = Boolean(req.user?.id) || req.query.loggedIn === '1' || req.query.loggedIn === 'true';
    const phone = typeof req.query.phone === 'string' ? req.query.phone.trim() : '';
    const now = new Date();

    let orderCount: number | null = null;
    if (req.user?.id) {
      orderCount = await prisma.order.count({
        where: { userId: req.user.id, status: { notIn: ['CANCELLED', 'REJECTED'] } },
      });
    } else if (phone) {
      orderCount = await prisma.order.count({
        where: { customerPhone: phone, status: { notIn: ['CANCELLED', 'REJECTED'] } },
      });
    }

    // Själv-läkning: uppfyllda uppdrag betalas ut när Rewards öppnas (täcker
    // claims som gjordes innan direkt-utbetalningen fanns).
    if (req.user?.id && placement === 'REWARDS') {
      const { evaluateAppDealMissions, getDpointsSettings } = await import('../lib/dpoints');
      const settings = await getDpointsSettings().catch(() => null);
      await evaluateAppDealMissions({
        userId: req.user.id,
        orderId: 'rewards-check',
        orderDate: now,
        cap: settings?.dpointsMaxBalance ?? 0,
      }).catch(() => null);
    }

    const claimedRows = req.user?.id
      ? await (prisma as any).userDeal.findMany({
          where: {
            userId: req.user.id,
            status: { in: ['ACTIVE', 'RESERVED', 'USED'] },
            dealId: { not: null },
            OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
          },
          select: { id: true, dealId: true, status: true, metadata: true, createdAt: true },
        })
      : [];
    const claimedByDealId = new Map<string, any>(
      claimedRows
        .filter((row: any) => row.dealId)
        .map((row: any) => [row.dealId, row]),
    );
    // Claim-lägen: ACTIVE döljer vanliga deals (de bor i kassan + Mina deals)
    // men uppdrag visas med progress. USED/RESERVED utan aktiv claim döljs
    // helt — ett avklarat uppdrag ska inte stå kvar och tjata.
    const activeClaimedDealIds = new Set(
      claimedRows
        .filter((row: any) => row.dealId && row.status === 'ACTIVE')
        .map((row: any) => row.dealId),
    );
    const spentClaimedDealIds = new Set(
      claimedRows
        .filter((row: any) => row.dealId && (row.status === 'RESERVED' || row.status === 'USED'))
        .map((row: any) => row.dealId),
    );

    const deals = await prisma.deal.findMany({
      where: {
        appEnabled: true,
        isActive: true,
        isPersonalTemplate: false,
        appPlacement: placement,
        OR: [{ validFrom: null }, { validFrom: { lte: now } }],
        AND: [{ OR: [{ validUntil: null }, { validUntil: { gte: now } }] }],
      },
      include: {
        restaurant: {
          select: { id: true, name: true, slug: true, cuisine: true, imageUrl: true, heroImageUrl: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      take: 80,
    });

    // A/B: varje kund ser bara sin tilldelade variant av ett aktivt test.
    const abHidden = await abHiddenDealIds(req.user?.id || null);

    const eligiblePairs = deals
      .filter((deal) => isDealAvailableNow(deal, now))
      .filter((deal) => !abHidden.has(deal.id))
      .filter((deal) => appAudienceMatches(deal, { isLoggedIn, orderCount }))
      .filter((deal) => !(spentClaimedDealIds.has(deal.id) && !activeClaimedDealIds.has(deal.id)))
      .filter((deal) => isMissionDeal(deal) || !activeClaimedDealIds.has(deal.id))
      .map((deal) => ({
        deal,
        score: (deal.appRotating === false ? 10_000 : 0) + (deal.sortOrder || 0) - Math.random() * Math.max(1, deal.appWeight || 10),
      }))
      .sort((a, b) => a.score - b.score)
      .slice(0, limit);

    const eligible = await Promise.all(
      eligiblePairs.map(async ({ deal }) => {
        const claim = claimedByDealId.get(deal.id);
        const progress = await missionProgressForDeal(req.user?.id, deal, claim);
        return formatAppDeal(deal, claim?.status === 'ACTIVE' ? claim.id : null, progress);
      }),
    );

    // Motor-tilldelade deals (DealCampaign): redan bundna till kunden, visas
    // först på HOME_TOP. Ingen claim behövs; kassans /quote är sanning.
    let assigned: any[] = [];
    if (req.user?.id && placement === 'HOME_TOP') {
      const assignedRows = await (prisma as any).userDeal.findMany({
        where: {
          userId: req.user.id,
          type: 'CAMPAIGN',
          status: 'ACTIVE',
          OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
        },
        include: {
          deal: {
            include: {
              restaurant: { select: { id: true, name: true, slug: true, cuisine: true, imageUrl: true, heroImageUrl: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      assigned = assignedRows
        .filter((row: any) => row.deal)
        .map((row: any) => ({
          ...formatAppDeal(row.deal, row.id, null),
          claimRequired: false,
          checkoutApplicable: true,
          ctaLabel: row.deal.appCtaLabel || 'Använd',
          validUntil: row.expiresAt,
          userDealId: row.id,
        }));
    }

    const assignedIds = new Set(assigned.map((d) => d.id));
    const merged = [...assigned, ...eligible.filter((d) => !assignedIds.has(d.id))].slice(0, limit);

    res.json({ deals: merged, context: { placement, isLoggedIn, orderCount } });
  } catch (error) {
    console.error('[deals/app] error:', error);
    res.status(500).json({ error: 'Kunde inte hämta app-deals' });
  }
});

// POST /api/deals/app/:id/claim — gör en app-deal betalningsbar i kassan.
router.post('/app/:id/claim', authenticateUser, async (req: any, res) => {
  try {
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!deal || !deal.appEnabled || !deal.isActive || deal.isPersonalTemplate) {
      return res.status(404).json({ error: 'Erbjudandet hittades inte' });
    }
    if (!isDealAvailableNow(deal)) {
      return res.status(400).json({ error: 'Erbjudandet är inte längre aktivt' });
    }

    const existing = await (prisma as any).userDeal.findFirst({
      where: {
        userId: req.user.id,
        dealId: deal.id,
        status: { in: ['ACTIVE', 'RESERVED'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing && existing.status !== 'EXPIRED') {
      const progress = await missionProgressForDeal(req.user.id, deal, existing);
      return res.json({ claimed: true, deal: formatAppDeal(deal, existing.id, progress), userDeal: existing });
    }

    const orderCount = await prisma.order.count({
      where: { userId: req.user.id, status: { notIn: ['CANCELLED', 'REJECTED'] } },
    });
    if (!appAudienceMatches(deal, { isLoggedIn: true, orderCount })) {
      return res.status(403).json({ error: 'Erbjudandet gäller inte för ditt konto' });
    }

    const maxUsesPerCustomer = Math.max(0, Math.round(Number(deal.maxUsesPerCustomer || 0)));
    if (maxUsesPerCustomer > 0) {
      const usageCount = await (prisma as any).userDeal.count({
        where: {
          userId: req.user.id,
          dealId: deal.id,
          status: { in: ['RESERVED', 'USED'] },
        },
      });
      if (usageCount >= maxUsesPerCustomer) {
        return res.status(409).json({ error: 'Du har redan använt det här erbjudandet' });
      }
    }

    const cooldownHours = Math.max(0, Math.round(Number(deal.appCooldownHours || 0)));
    if (cooldownHours > 0) {
      const cooldownStart = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);
      const recentUsed = await (prisma as any).userDeal.findFirst({
        where: {
          userId: req.user.id,
          dealId: deal.id,
          status: 'USED',
          usedAt: { gte: cooldownStart },
        },
        orderBy: { usedAt: 'desc' },
      });
      if (recentUsed) {
        const progress = await missionProgressForDeal(req.user.id, deal, recentUsed);
        return res.json({
          claimed: false,
          reason: 'COOLDOWN',
          deal: formatAppDeal(deal, null, progress),
          userDeal: null,
        });
      }
    }

    const expiresAt = deal.appClaimExpiresMinutes
      ? new Date(Date.now() + deal.appClaimExpiresMinutes * 60_000)
      : deal.validUntil || null;
    const mission = isMissionDeal(deal);
    const amountKr = !mission && deal.discountType === 'FIXED' ? Math.round(oreToKr(deal.discountValue)) : null;
    const discountPercent = !mission && deal.discountType === 'PERCENTAGE' ? deal.discountValue : null;
    const userDeal = await (prisma as any).userDeal.create({
      data: {
        userId: req.user.id,
        dealId: deal.id,
        type: mission ? 'APP_MISSION' : 'APP_DEAL',
        status: 'ACTIVE',
        amountKr,
        discountPercent,
        discountType: mission ? 'NONE' : deal.freeDelivery && deal.discountType === 'NONE' ? 'NONE' : deal.discountType,
        freeDelivery: mission ? false : !!deal.freeDelivery,
        expiresAt,
        metadata: {
          title: deal.title,
          minOrderKr: oreToKr(deal.minOrder),
          appDpointsBonus: mission ? 0 : deal.appDpointsBonus || 0,
          appMissionType: deal.appMissionType || null,
          missionRewardPoints: mission ? deal.appDpointsBonus || 0 : 0,
          missionTarget: missionTargetForDeal(deal),
          missionWindowDays: isAllTimeMission(deal) ? 0 : 7,
          appTemplate: deal.appTemplate || null,
        },
      },
    });
    await prisma.deal.update({ where: { id: deal.id }, data: { usageCount: { increment: 1 } } }).catch(() => null);
    if (mission) {
      // Redan uppfyllt mål (t.ex. milstolpe man passerat) betalas ut direkt,
      // inte först vid nästa order.
      const { evaluateAppDealMissions, getDpointsSettings } = await import('../lib/dpoints');
      const settings = await getDpointsSettings().catch(() => null);
      await evaluateAppDealMissions({
        userId: req.user.id,
        orderId: 'claim-check',
        orderDate: new Date(),
        cap: settings?.dpointsMaxBalance ?? 0,
      }).catch((e: any) => console.error('[deals/app claim] mission eval error:', e?.message));
    }
    const refreshedUserDeal = await (prisma as any).userDeal.findUnique({ where: { id: userDeal.id } }).catch(() => userDeal);
    const progress = await missionProgressForDeal(req.user.id, deal, refreshedUserDeal || userDeal);
    res.status(201).json({ claimed: true, deal: formatAppDeal(deal, (refreshedUserDeal || userDeal).id, progress), userDeal: refreshedUserDeal || userDeal });
  } catch (error: any) {
    console.error('[deals/app claim] error:', error?.message);
    res.status(500).json({ error: 'Kunde inte hämta erbjudandet' });
  }
});

// POST /api/deals/app/quote — lätt server-sanning för Swift-kassan.
// Order-endpointen är fortfarande sista valideringen/reservationen.
router.post('/app/quote', authenticateUser, async (req: any, res) => {
  try {
    const data = AppDealQuoteSchema.parse(req.body);
    const userDeal = await (prisma as any).userDeal.findFirst({
      where: {
        id: data.userDealId,
        userId: req.user.id,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      },
      include: {
        deal: {
          include: {
            restaurant: {
              select: { id: true, name: true, slug: true, cuisine: true, imageUrl: true, heroImageUrl: true },
            },
          },
        },
      },
    });

    if (!userDeal) {
      return res.status(404).json({
        applicable: false,
        reason: 'NOT_FOUND',
        discountAmountKr: 0,
        deliveryDiscountKr: 0,
        subtotalDiscountKr: 0,
        dpointsBonus: 0,
        deal: null,
      });
    }

    // Restaurang-scopad deal får inte prissättas i en annan restaurangs kassa.
    const scope = userDealRestaurantScope(userDeal.deal);
    if (scope && data.restaurantId && !scope.includes(data.restaurantId)) {
      return res.json({
        applicable: false,
        reason: 'RESTAURANT_SCOPE',
        minOrderKr: null,
        discountAmountKr: 0,
        deliveryDiscountKr: 0,
        subtotalDiscountKr: 0,
        dpointsBonus: 0,
        deal: userDeal.deal ? formatAppDeal(userDeal.deal, userDeal.id, null) : null,
      });
    }

    const quote = calculateUserDealQuote(userDeal, data);
    res.json({
      applicable: quote.applicable,
      reason: quote.reason,
      minOrderKr: quote.minOrderKr,
      discountAmountKr: quote.discountAmountOre / 100,
      deliveryDiscountKr: quote.deliveryDiscountOre / 100,
      subtotalDiscountKr: quote.subtotalDiscountOre / 100,
      dpointsBonus: quote.dpointsBonus,
      deal: userDeal.deal ? formatAppDeal(userDeal.deal, userDeal.id, null) : null,
    });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return res.status(400).json({ error: 'Ogiltig deal-quote' });
    }
    console.error('[deals/app quote] error:', error?.message);
    res.status(500).json({ error: 'Kunde inte räkna ut erbjudandet' });
  }
});

// GET /api/deals/:id/restaurants
// Returnerar dealen + alla restauranger som matchar (för att kunna bygga
// en dedikerad /deals/[id]-sida i web/RN). Logik:
//   - isGlobal=true → alla aktiva restauranger
//   - applicableRestaurantIds satt → bara dessa
//   - restaurantId satt → bara den
router.get('/:id/restaurants', async (req, res) => {
  try {
    const deal = await prisma.deal.findUnique({
      where: { id: req.params.id },
      include: { restaurant: { select: { id: true, name: true, slug: true } } },
    });
    if (!deal) return res.status(404).json({ error: 'Deal hittades inte' });

    let applicable: string[] = [];
    try {
      const parsed = JSON.parse(deal.applicableRestaurantIds || '[]');
      if (Array.isArray(parsed)) applicable = parsed.filter((id: unknown): id is string => typeof id === 'string');
    } catch { /* bad JSON tolererad */ }

    const restaurantWhere: any = deal.isGlobal
      ? {}
      : applicable.length > 0
        ? { id: { in: applicable } }
        : deal.restaurantId
          ? { id: deal.restaurantId }
          : { id: '__none__' };

    const restaurants = await prisma.restaurant.findMany({
      where: restaurantWhere,
      select: {
        id: true, slug: true, name: true, cuisine: true, address: true, city: true,
        imageUrl: true, heroImageUrl: true, rating: true, ratingCount: true,
        deliveryFee: true, etaMinutes: true, isOpen: true, pausedUntil: true,
      },
      orderBy: [{ featuredClass: 'asc' }, { rating: 'desc' }],
    });

    // Beräkna värdet på den aktuella dealen för en restaurang (i procent
    // för PERCENTAGE, eller kr-belopp/100 för FIXED). Används för att
    // jämföra "högre deal vinner" — om en restaurang har en specifik deal
    // som ger BÄTTRE rabatt än den globala dealen vi tittar på, exkluderar
    // vi restaurangen ur listan eftersom den globala dealen inte gäller där.
    const dealMagnitude = (d: { discountType: string; discountValue: number }) => {
      if (d.discountType === 'PERCENTAGE') return Number(d.discountValue || 0);
      // FIXED är öre — normalisera till kronor så storleken är jämförbar
      // med procent-talet (rough heuristic — admin sätter sällan fixed >100kr
      // OCH percent på samma restaurang).
      return Number(d.discountValue || 0) / 100;
    };
    const currentMagnitude = dealMagnitude(deal);

    // Hämta alla aktiva deals (utöver den vi tittar på) som kan vara
    // konkurrenter — antingen specifika för restaurangen eller andra
    // globala. Vi filtrerar restauranger där en konkurrent ger högre värde.
    const otherDeals = await prisma.deal.findMany({
      where: {
        id: { not: deal.id },
        isActive: true,
        OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
      },
      select: { id: true, restaurantId: true, isGlobal: true, applicableRestaurantIds: true, discountType: true, discountValue: true },
    });

    const restaurantHasBetterDeal = (restaurantId: string): boolean => {
      for (const other of otherDeals) {
        if (dealMagnitude(other) <= currentMagnitude) continue;
        if (other.restaurantId === restaurantId) return true;
        if (other.isGlobal) return true;
        try {
          const list = JSON.parse(other.applicableRestaurantIds || '[]');
          if (Array.isArray(list) && list.includes(restaurantId)) return true;
        } catch { /* tolerera bad JSON */ }
      }
      return false;
    };

    const visibleRestaurants = restaurants.filter((r) => !restaurantHasBetterDeal(r.id));

    const formatted = formatDealForClient(deal, {
      restaurant: deal.restaurant
        ? { id: deal.restaurant.id, name: deal.restaurant.name, slug: deal.restaurant.slug }
        : null,
      applicableRestaurantIds: applicable,
    });

    res.json({
      deal: formatted,
      restaurants: visibleRestaurants.map((r) => ({
        ...r,
        deliveryFee: (r.deliveryFee || 0) / 100,
      })),
    });
  } catch (error) {
    console.error('Deal restaurants error:', error);
    res.status(500).json({ error: 'Kunde inte hämta deal-restauranger' });
  }
});

// GET /api/deals/banners?slug=xxx — aktiva banner-deals för en restaurangs sida
router.get('/banners', async (req, res) => {
  try {
    let targetRestaurantId = typeof req.query.restaurantId === 'string' ? req.query.restaurantId : null;

    if (!targetRestaurantId && typeof req.query.slug === 'string' && req.query.slug.trim()) {
      const restaurant = await prisma.restaurant.findUnique({
        where: { slug: req.query.slug.trim() },
        select: { id: true },
      });
      targetRestaurantId = restaurant?.id || null;
    }

    if (!targetRestaurantId) return res.json([]);

    const deals = await prisma.deal.findMany({
      where: {
        isActive: true,
        showAsBanner: true,
        OR: [
          { restaurantId: targetRestaurantId },
          { applicableRestaurantIds: { contains: `"${targetRestaurantId}"` } },
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

    res.json(
      deals
        .filter((deal) => isDealAvailableNow(deal))
        .map((deal) => formatDealForClient(deal)),
    );
  } catch (error) {
    console.error('Banner deals error:', error);
    res.status(500).json({ error: 'Kunde inte hämta banner-deals' });
  }
});

router.get('/', async (req, res) => {
  try {
    // Cache 30s keyed by restaurant scope: public deals are identical for all
    // anonymous callers of the same restaurant. Collapses the deal-fetch herd.
    const dealsKey = (typeof req.query.restaurantId === 'string' && req.query.restaurantId)
      || (typeof req.query.slug === 'string' && req.query.slug.trim())
      || 'all';
    const out = await cached('deals:public', dealsKey, 30_000, async () => {
    let targetRestaurantId = typeof req.query.restaurantId === 'string' ? req.query.restaurantId : null;

    if (!targetRestaurantId && typeof req.query.slug === 'string' && req.query.slug.trim()) {
      const restaurant = await prisma.restaurant.findUnique({
        where: { slug: req.query.slug.trim() },
        select: { id: true },
      });
      targetRestaurantId = restaurant?.id || null;
    }

    const deals = await prisma.deal.findMany({
      where: {
        showOnSite: true,
        isActive: true,
        // Personliga mallar (welcome/referral) ska aldrig listas publikt.
        isPersonalTemplate: false,
        ...(targetRestaurantId
          ? {
              OR: [
                { isGlobal: true },
                { restaurantId: targetRestaurantId },
                { applicableRestaurantIds: { contains: `"${targetRestaurantId}"` } },
              ],
            }
          : {}),
      },
      include: {
        restaurant: {
          select: { id: true, name: true, slug: true },
        },
      },
      orderBy: [
        { sortOrder: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    const comboProductIds = [...new Set(deals.flatMap((deal) => parseDealProductIds(deal.comboProductIds)))];
    const comboProducts = comboProductIds.length
      ? await prisma.product.findMany({
          where: { id: { in: comboProductIds } },
          select: { id: true, name: true },
        })
      : [];

    const productNameMap = new Map(comboProducts.map((product) => [product.id, product.name]));

    return (
      deals
        .filter((deal) => isDealAvailableNow(deal) && (isBasketDeal(deal) || deal.triggerType === 'BOGO_CATEGORY'))
        .map((deal) =>
          formatDealForClient(deal, {
            comboProductNames: parseDealProductIds(deal.comboProductIds).map((productId) => productNameMap.get(productId) || 'Valfri vara'),
            restaurant: deal.restaurant
              ? {
                  id: deal.restaurant.id,
                  name: deal.restaurant.name,
                  slug: deal.restaurant.slug,
                }
              : null,
            applicableRestaurantIds: parseJsonArray(deal.applicableRestaurantIds),
          }),
        )
    );
    });

    res.json(out);
  } catch (error) {
    console.error('Public deals error:', error);
    res.status(500).json({ error: 'Kunde inte hämta deals' });
  }
});

// POST /api/deals/evaluate-cart — server-side BOGO preview for cart UI
// Body: { restaurantId: string, items: Array<{productId: string, quantity: number}> }
router.post('/evaluate-cart', evaluateCartLimiter, async (req, res) => {
  try {
    const { restaurantId, items } = req.body as { restaurantId?: string; items?: Array<{ productId: string; quantity: number }> };
    if (!restaurantId || !Array.isArray(items) || items.length === 0) {
      return res.json({ discountAmountOre: 0, discountAmountKr: 0, message: null, dealTitle: null, maxFreeItems: 0 });
    }

    const productIds = items.map((i) => i.productId).filter(Boolean);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, price: true, categoryId: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const cartItems: CartItemForBogo[] = items.map((item) => {
      const prod = productMap.get(item.productId);
      return {
        productId: item.productId,
        categoryId: prod?.categoryId ?? '',
        basePriceOre: prod?.price ?? 0,
        quantity: item.quantity ?? 1,
      };
    });

    const subtotalOre = cartItems.reduce((sum, item) => sum + item.basePriceOre * item.quantity, 0);
    const productIdsFlat = cartItems.flatMap((item) => Array.from({ length: item.quantity }, () => item.productId));

    const now = new Date();
    const deals = await prisma.deal.findMany({
      where: {
        isActive: true,
        // Exkludera personliga mallar (welcome/referral). De är isGlobal=true
        // men ska INTE visas/appliceras som publik auto-deal i kassan — annars
        // läcker välkomstmallen (t.ex. "25% första beställning") in på varje
        // gäst-cart. De delas bara ut som UserDeals till registrerade kunder.
        isPersonalTemplate: false,
        AND: [
          {
            OR: [
              { isGlobal: true },
              { restaurantId },
              { applicableRestaurantIds: { contains: `"${restaurantId}"` } },
            ],
          },
        ],
      },
    });

    let bestDeal: (typeof deals)[number] | null = null;
    let bestDiscount = 0;
    let bestMaxFreeItems = 0;

    for (const deal of deals) {
      if (!isDealAvailableNow(deal, now)) continue;
      const evaluation = evaluateDeal(deal, {
        subtotalOre,
        productIds: productIdsFlat,
        cartItems,
      });
      if (!evaluation.eligible) continue;
      // Endast BOGO returnerar maxFreeItems — andra deals har bara en
      // bulkrabatt och behöver inte picker-multi-select.
      const maxFree = (evaluation as any).maxFreeItems ?? 0;
      // En "pick-reward"-BOGO (gratis-varan inte plockad än) har discount=0 men
      // maxFreeItems>0. Den ska ändå väljas så pickern kan visas i kassan —
      // annars kan kunden aldrig plocka sin gratis-vara. Deal med faktisk
      // rabatt vinner fortfarande över en väntande pick.
      const isPendingPick = evaluation.discountAmountOre === 0 && maxFree > 0;
      const better =
        evaluation.discountAmountOre > bestDiscount ||
        (bestDeal === null && isPendingPick);
      if (better) {
        bestDiscount = evaluation.discountAmountOre;
        bestDeal = deal;
        bestMaxFreeItems = maxFree;
      }
    }

    // Hämta reward-produkter om det är en BOGO-deal (för att visa i picker-modal i kassan)
    let rewardCategoryName: string | null = null;
    let rewardProducts: { id: string; name: string; price: number; imageUrl: string | null }[] = [];
    if (bestDeal && bestDeal.triggerType === 'BOGO_CATEGORY') {
      const allowedIds = new Set(parseJsonArray((bestDeal as any).bogoRewardProductIds));
      // Om whitelist finns → hämta direkt på produkt-ID (ingen kategori-lookup)
      if (allowedIds.size > 0) {
        const prods = await prisma.product.findMany({
          where: { id: { in: [...allowedIds] }, isActive: true },
          select: { id: true, name: true, price: true, imageUrl: true },
          orderBy: { position: 'asc' },
        });
        rewardProducts = prods.map((p) => ({ id: p.id, name: p.name, price: p.price / 100, imageUrl: p.imageUrl }));
      } else {
        // Fallback: kategoribaserad sökning (gammal logik)
        const rewardCatId = bestDeal.rewardCategoryId || bestDeal.triggerCategoryId;
        const excludedIds = new Set(parseJsonArray(bestDeal.bogoExcludedProductIds));
        const applyExclusions = (prods: { id: string; name: string; price: number; imageUrl: string | null }[]) =>
          prods.filter((p) => !excludedIds.has(p.id));

        if (rewardCatId) {
          const cat = await prisma.category.findUnique({
            where: { id: rewardCatId },
            select: { name: true, products: { where: { isActive: true }, select: { id: true, name: true, price: true, imageUrl: true }, orderBy: { position: 'asc' } } },
          });
          if (cat) {
            rewardCategoryName = cat.name;
            rewardProducts = applyExclusions(cat.products.map((p) => ({ id: p.id, name: p.name, price: p.price / 100, imageUrl: p.imageUrl })));
          }
        } else {
          const allProds = await prisma.product.findMany({
            where: { category: { restaurantId }, isActive: true },
            select: { id: true, name: true, price: true, imageUrl: true },
            orderBy: { position: 'asc' },
            take: 50,
          });
          rewardProducts = applyExclusions(allProds.map((p) => ({ id: p.id, name: p.name, price: p.price / 100, imageUrl: p.imageUrl })));
        }
      }
    }

    const bogoExcludedExtraIds = bestDeal && bestDeal.triggerType === 'BOGO_CATEGORY'
      ? parseJsonArray((bestDeal as any).bogoExcludedExtraIds)
      : [];

    // "Pick-reward" = gratis-varan kommer från en whitelist ELLER en separat
    // reward-kategori (≠ trigger). Då lägger klienten till gratis-varan som en
    // pris-0-rad via pickern → rabatten är redan realiserad i raden och får
    // INTE dras av igen i totalen (annars dubbel rabatt). Cart-UI:n använder
    // även flaggan för att tvinga ett val innan kassan.
    const isPickRewardBogo = !!bestDeal && bestDeal.triggerType === 'BOGO_CATEGORY' && (
      parseJsonArray((bestDeal as any).bogoRewardProductIds).length > 0 ||
      ((bestDeal as any).rewardCategoryId != null && (bestDeal as any).rewardCategoryId !== bestDeal.triggerCategoryId)
    );

    res.json({
      discountAmountOre: bestDiscount,
      discountAmountKr: bestDiscount / 100,
      dealTitle: bestDeal?.title ?? null,
      dealId: bestDeal?.id ?? null,
      isBogo: bestDeal?.triggerType === 'BOGO_CATEGORY',
      isPickReward: isPickRewardBogo,
      rewardCategoryId: bestDeal?.rewardCategoryId ?? bestDeal?.triggerCategoryId ?? null,
      rewardCategoryName,
      rewardProducts,
      bogoExcludedExtraIds,
      // Hur många gratis-varor kunden kan välja för denna BOGO.
      // 0 om inte BOGO eller inte eligible. Cart-UI:n använder detta för
      // multi-pick BogoPickerModal.
      maxFreeItems: bestMaxFreeItems,
    });
  } catch (error) {
    console.error('Cart evaluate error:', error);
    res.json({ discountAmountOre: 0, discountAmountKr: 0, dealTitle: null, dealId: null, isBogo: false, isPickReward: false, rewardCategoryName: null, rewardProducts: [], bogoExcludedExtraIds: [], maxFreeItems: 0 });
  }
});

export default router;
