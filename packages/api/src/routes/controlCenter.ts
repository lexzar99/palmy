import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { hasOpeningHours } from '../lib/openingHours';
import { computePayout, economyFromSettings } from '../lib/financeCalc';
import {
  PAYOUT_NON_TEST_ORDER_FILTER,
  PAYOUT_ORDER_STATUSES,
  PAYOUT_PAYMENT_STATUSES,
  payoutOrders,
} from '../lib/payoutPolicy';
import { resolveRestaurantAvailability } from '../lib/restaurantAvailability';
import { moneyDto } from '../utils/money';
import { getMollieFinanceReport } from '../lib/mollieFinance';

const router = Router();
router.use(authenticate);

const LIVE_STATUSES = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'DELIVERING'] as const;
const CLOSED_STATUSES = ['CANCELLED', 'REJECTED'] as const;

// Provision + tier-abonnemang bor nu i RestaurantSettings och beräknas via
// lib/financeCalc - samma sanning som Ekonomi-sidan. Tier styr BARA
// abonnemang + ranking, inte provision.

const REPORT_TIME_ZONE = 'Europe/Stockholm';
const datePartsFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: REPORT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const dateLabelFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: REPORT_TIME_ZONE,
  day: 'numeric',
  month: 'short',
});
const weekdayLabelFormatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: REPORT_TIME_ZONE,
  weekday: 'short',
});

type PeriodKey = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth';

const localDateParts = (date: Date) => {
  const parts = datePartsFormatter.formatToParts(date);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: pick('year'), month: pick('month'), day: pick('day') };
};

const zonedOffsetMs = (date: Date) => {
  const { year, month, day } = localDateParts(date);
  const timeParts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: REPORT_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const pick = (type: string) => Number(timeParts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(year, month - 1, day, pick('hour'), pick('minute'), pick('second'));
  return asUtc - date.getTime();
};

const zonedDateToUtc = (year: number, month: number, day: number, hour = 0) => {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, 0, 0, 0));
  return new Date(guess.getTime() - zonedOffsetMs(guess));
};

const startOfZonedDay = (date = new Date()) => {
  const { year, month, day } = localDateParts(date);
  return zonedDateToUtc(year, month, day);
};

const addZonedDays = (date: Date, days: number) => {
  const { year, month, day } = localDateParts(date);
  return zonedDateToUtc(year, month, day + days);
};

const startOfZonedMonth = (date = new Date()) => {
  const { year, month } = localDateParts(date);
  return zonedDateToUtc(year, month, 1);
};

const addZonedMonths = (date: Date, months: number) => {
  const { year, month } = localDateParts(date);
  return zonedDateToUtc(year, month + months, 1);
};

const startOfZonedWeek = (date = new Date()) => {
  const { year, month, day } = localDateParts(date);
  const localNoon = new Date(Date.UTC(year, month - 1, day, 12));
  const daysFromMonday = (localNoon.getUTCDay() + 6) % 7;
  return zonedDateToUtc(year, month, day - daysFromMonday);
};

const dateKey = (date: Date) => {
  const { year, month, day } = localDateParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const resolvePeriod = (raw: unknown): { key: PeriodKey; label: string; start: Date; end: Date } => {
  const key = ['today', 'yesterday', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth'].includes(String(raw))
    ? String(raw) as PeriodKey
    : 'thisMonth';
  const today = startOfZonedDay();
  const thisWeek = startOfZonedWeek();
  const thisMonth = startOfZonedMonth();
  switch (key) {
    case 'today':
      return { key, label: 'Idag', start: today, end: addZonedDays(today, 1) };
    case 'yesterday': {
      const start = addZonedDays(today, -1);
      return { key, label: 'Igår', start, end: today };
    }
    case 'thisWeek':
      return { key, label: 'Denna vecka', start: thisWeek, end: addZonedDays(thisWeek, 7) };
    case 'lastWeek': {
      const start = addZonedDays(thisWeek, -7);
      return { key, label: 'Förra veckan', start, end: thisWeek };
    }
    case 'lastMonth': {
      const start = addZonedMonths(thisMonth, -1);
      return { key, label: 'Förra månaden', start, end: thisMonth };
    }
    case 'thisMonth':
    default:
      return { key: 'thisMonth', label: 'Denna månad', start: thisMonth, end: addZonedMonths(thisMonth, 1) };
  }
};

const netPaidAmount = (order: { total: number; paymentStatus: string; refundAmount?: number | null }) => {
  const total = Math.max(0, Number(order.total || 0));
  if (String(order.paymentStatus || '').toUpperCase() === 'PARTIALLY_REFUNDED') {
    return Math.max(0, total - Math.max(0, Number(order.refundAmount || 0)));
  }
  return total;
};

const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
};

const daysAgo = (days: number) => {
  const now = new Date();
  now.setDate(now.getDate() - days);
  return now;
};

const orderBusinessFilters = {
  ...PAYOUT_NON_TEST_ORDER_FILTER,
};

const severityRank: Record<string, number> = {
  high: 3,
  medium: 2,
  info: 1,
};

router.get('/control-center', async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    // GROWTH_AGENT ("Torget") får LÄSA control-center för smart deal-targeting
    // (vilka restauranger som säljer dåligt/bra). Read-only, ingen skrivrätt här.
    if (authReq.admin?.role !== 'SUPER_ADMIN' && authReq.admin?.role !== 'GROWTH_AGENT') {
      return res.status(403).json({ error: 'Kräver super admin-behörighet' });
    }

    const scopedRestaurantId = req.query.restaurantId ? String(req.query.restaurantId) : null;
    const restaurantWhere = scopedRestaurantId
      ? { id: scopedRestaurantId, archivedAt: null }
      : { archivedAt: null };

    const restaurants = await prisma.restaurant.findMany({
      where: restaurantWhere,
      select: {
        id: true,
        name: true,
        slug: true,
        city: true,
        isOpen: true,
        scheduledOpenNow: true,
        acceptingOrdersMode: true,
        acceptingOrdersOverrideUntil: true,
        acceptingOrdersOverrideReason: true,
        pausedUntil: true,
        comingSoon: true,
        draft: true,
        featuredClass: true,
        selfDelivery: true,
        commissionPctOverride: true,
        tierGoldFeeOverride: true,
        tierSilverFeeOverride: true,
        tierStandardFeeOverride: true,
        rating: true,
        ratingCount: true,
        openingHours: true,
        adminEmail: true,
        imageUrl: true,
        heroImageUrl: true,
        etaMinutes: true,
        deliveryFee: true,
        minOrderAmount: true,
        updatedAt: true,
        city_relation: {
          select: { ordersPaused: true, ordersPausedUntil: true, ordersPauseReason: true },
        },
      },
      orderBy: [{ featuredClass: 'asc' }, { name: 'asc' }],
    });

    const restaurantIds = restaurants.map((restaurant) => restaurant.id);

    if (restaurantIds.length === 0) {
      const period = resolvePeriod(req.query.period);
      return res.json({
        scope: { restaurantId: scopedRestaurantId, isSuperAdmin: true },
        period: {
          key: period.key,
          label: period.label,
          from: period.start.toISOString(),
          to: period.end.toISOString(),
          timeZone: REPORT_TIME_ZONE,
        },
        summary: {
          todayRevenue: 0,
          todayOrders: 0,
          liveOrders: 0,
          openRestaurants: 0,
          totalRestaurants: 0,
          activeCustomers: 0,
          monthlyPayoutExposure: 0,
          periodRevenue: 0,
          periodOrders: 0,
          periodCommission: 0,
          periodPayoutExposure: 0,
          periodRefundAmount: 0,
          periodRefundCount: 0,
          pendingRefundAmount: 0,
          pendingRefundCount: 0,
          avgTicket: 0,
          avgRating: 0,
          incomeAfterFees: null,
          mollieFees: null,
        },
        mollie: {
          feeStatus: 'unavailable',
          feeError: 'Inga restauranger i urvalet',
          totalBalance: null,
          availableBalance: null,
          pendingBalance: null,
          nextPayoutDate: null,
          transferFrequency: null,
        },
        liveStatusCounts: {},
        trend: [],
        paymentMix: [],
        topProducts: [],
        recentReviews: [],
        customerSignals: [],
        restaurantSnapshots: [],
        payoutQueue: [],
        alerts: [],
        security: {
          loginRateLimit: true,
          verifyRateLimit: true,
          socketGuard: true,
          uploadGuard: true,
          r2Configured: Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET && process.env.R2_PUBLIC_BASE_URL),
          aliasSync: false,
          notes: [
            'Adminlogin rate-limitad per IP + identifier',
            'join:admin kräver verifierad token',
          ],
        },
      });
    }

    const period = resolvePeriod(req.query.period);
    const today = startOfZonedDay();
    const thirtyDays = daysAgo(30);
    const ninetyDays = daysAgo(90);

    const whereForRestaurants = { restaurantId: { in: restaurantIds } };
    const settledPaymentStatuses = [...PAYOUT_PAYMENT_STATUSES];

    const [recentOrders, periodOrders, periodRefundOrders, periodPendingRefundOrders, liveOrders, customerOrders, topProductsRows, totalCustomers] = await Promise.all([
      prisma.order.findMany({
        where: {
          ...whereForRestaurants,
          status: { notIn: [...CLOSED_STATUSES] },
          createdAt: { gte: thirtyDays },
          paymentStatus: { in: settledPaymentStatuses },
          ...orderBusinessFilters,
        },
        select: {
          id: true,
          orderNumber: true,
          total: true,
          deliveryFee: true,
          tipAmount: true,
          status: true,
          paymentStatus: true,
          type: true,
          createdAt: true,
          restaurantId: true,
          customerName: true,
          customerPhone: true,
          userId: true,
          paymentMethod: true,
          paymentProvider: true,
          molliePaymentId: true,
          refundAmount: true,
          rating: true,
          review: true,
          reviewedAt: true,
          restaurant: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.findMany({
        where: {
          ...whereForRestaurants,
          status: { notIn: [...CLOSED_STATUSES] },
          paymentStatus: { in: settledPaymentStatuses },
          createdAt: { gte: period.start, lt: period.end },
          ...orderBusinessFilters,
        },
        select: {
          id: true,
          orderNumber: true,
          total: true,
          deliveryFee: true,
          tipAmount: true,
          status: true,
          paymentStatus: true,
          type: true,
          createdAt: true,
          restaurantId: true,
          customerName: true,
          customerPhone: true,
          userId: true,
          paymentMethod: true,
          paymentProvider: true,
          molliePaymentId: true,
          refundAmount: true,
          foodVatPercent: true,
          rating: true,
          review: true,
          reviewedAt: true,
          restaurant: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.findMany({
        where: {
          ...whereForRestaurants,
          status: { in: [...PAYOUT_ORDER_STATUSES] },
          paymentStatus: { in: ['REFUNDED', 'PARTIALLY_REFUNDED'] },
          createdAt: { gte: period.start, lt: period.end },
          ...orderBusinessFilters,
        },
        select: {
          id: true,
          total: true,
          refundAmount: true,
          restaurantId: true,
          paymentStatus: true,
          paymentProvider: true,
          molliePaymentId: true,
        },
      }),
      prisma.order.findMany({
        where: {
          ...whereForRestaurants,
          paymentStatus: 'REFUNDING',
          createdAt: { gte: period.start, lt: period.end },
          ...orderBusinessFilters,
        },
        select: { id: true, total: true, refundAmount: true, restaurantId: true },
      }),
      prisma.order.findMany({
        where: {
          ...whereForRestaurants,
          status: { in: [...LIVE_STATUSES] },
          ...orderBusinessFilters,
        },
        select: {
          id: true,
          total: true,
          status: true,
          createdAt: true,
          restaurantId: true,
        },
      }),
      prisma.order.findMany({
        where: {
          ...whereForRestaurants,
          status: { notIn: [...CLOSED_STATUSES] },
          createdAt: { gte: ninetyDays },
          paymentStatus: { in: settledPaymentStatuses },
          ...orderBusinessFilters,
        },
        select: {
          id: true,
          total: true,
          createdAt: true,
          restaurantId: true,
          customerName: true,
          customerPhone: true,
          userId: true,
          refundAmount: true,
          restaurant: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.orderItem.groupBy({
        by: ['productName'],
        where: {
          order: {
            ...whereForRestaurants,
            status: { notIn: [...CLOSED_STATUSES] },
            paymentStatus: { in: settledPaymentStatuses },
            createdAt: { gte: period.start, lt: period.end },
            ...orderBusinessFilters,
          },
        },
        _count: { id: true },
        _sum: { subtotal: true },
        orderBy: { _count: { id: 'desc' } },
        take: 8,
      }),
      (prisma as any).user.count({ where: { deletedAt: null } }),
    ]);

    const restaurantMap = new Map(restaurants.map((restaurant) => [restaurant.id, restaurant]));

    const liveStatusCounts = liveOrders.reduce<Record<string, number>>((acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {});

    // Trend byggs från vald rapportperiod och grupperas i Stockholm-dygn.
    const trendMap = new Map<string, { label: string; revenue: number; orders: number }>();
    for (let day = period.start; day < period.end; day = addZonedDays(day, 1)) {
      const key = dateKey(day);
      trendMap.set(key, {
        label: period.key === 'today' || period.key === 'yesterday'
          ? weekdayLabelFormatter.format(day)
          : dateLabelFormatter.format(day),
        revenue: 0,
        orders: 0,
      });
    }

    const todayOrders = recentOrders.filter((order) => order.createdAt >= today && order.createdAt < addZonedDays(today, 1));
    for (const order of periodOrders) {
      const key = dateKey(order.createdAt);
      const entry = trendMap.get(key);
      if (entry) {
        entry.revenue += netPaidAmount(order) / 100;
        entry.orders += 1;
      }
    }

    const recentReviews = recentOrders
      .filter((order) => order.rating || order.review)
      .slice(0, 8)
      .map((order) => ({
        id: order.id,
        restaurantName: order.restaurant?.name ?? null,
        customerName: order.customerName,
        rating: order.rating ?? 0,
        review: order.review ?? '',
        reviewedAt: order.reviewedAt?.toISOString() ?? order.createdAt.toISOString(),
      }));

    const groupedByRestaurant = new Map<string, typeof recentOrders>();
    for (const order of recentOrders) {
      const existing = groupedByRestaurant.get(order.restaurantId || 'unknown') || [];
      existing.push(order);
      groupedByRestaurant.set(order.restaurantId || 'unknown', existing);
    }

    const liveByRestaurant = new Map<string, typeof liveOrders>();
    for (const order of liveOrders) {
      const existing = liveByRestaurant.get(order.restaurantId || 'unknown') || [];
      existing.push(order);
      liveByRestaurant.set(order.restaurantId || 'unknown', existing);
    }

    const periodByRestaurant = new Map<string, typeof periodOrders>();
    for (const order of periodOrders) {
      const existing = periodByRestaurant.get(order.restaurantId || 'unknown') || [];
      existing.push(order);
      periodByRestaurant.set(order.restaurantId || 'unknown', existing);
    }

    const platformSettings = await prisma.restaurantSettings.findUnique({ where: { id: 'settings' } });
    const economy = economyFromSettings(platformSettings);

    const restaurantSnapshots = restaurants.map((restaurant) => {
      const orders = groupedByRestaurant.get(restaurant.id) || [];
      const currentLiveOrders = liveByRestaurant.get(restaurant.id) || [];
      const currentPeriodOrders = periodByRestaurant.get(restaurant.id) || [];
      const openingHours = parseJson<Record<string, any>>(restaurant.openingHours, {});
      const hasHours = hasOpeningHours(openingHours);
      const availability = resolveRestaurantAvailability(restaurant, {
        city: restaurant.city_relation,
        platform: platformSettings,
      });
      const effectiveIsOpen = availability.isOpen;
      const tomorrow = addZonedDays(today, 1);
      const todayRestaurantOrders = orders.filter((order) => order.createdAt >= today && order.createdAt < tomorrow);
      const reviewOrders = orders.filter((order) => typeof order.rating === 'number' && order.rating > 0);
      const currentPeriodPayoutOrders = payoutOrders(currentPeriodOrders);
      const econ = computePayout(
        currentPeriodPayoutOrders,
        restaurant,
        economy,
      );
      const periodSales = currentPeriodOrders.reduce((sum, order) => sum + netPaidAmount(order), 0) / 100;
      const tierLabel = econ.tierLabel;
      const commissionEstimate = econ.commissionOre / 100;
      const subscriptionEstimate = econ.subscriptionOre / 100;
      // Netto vi är skyldiga restaurangen — provision + abonnemang + moms på avgifter avdraget.
      const payoutEstimate = Math.max(0, econ.payoutOre / 100);
      const pendingOrders = currentLiveOrders.filter((order) => order.status === 'PENDING').length;
      const reviewScore = reviewOrders.length
        ? reviewOrders.reduce((sum, order) => sum + (order.rating || 0), 0) / reviewOrders.length
        : restaurant.rating ?? 0;

      let focus = 'Stabil';
      if (!hasHours) focus = 'Saknar öppettider';
      else if (pendingOrders >= 5) focus = 'Ordertryck';
      else if (reviewScore > 0 && reviewScore < 4.1) focus = 'Kvalitetsbevakning';
      else if (!effectiveIsOpen) focus = 'Stängd just nu';

      return {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        city: restaurant.city,
        featuredClass: restaurant.featuredClass ?? 3,
        featuredLabel: tierLabel,
        selfDelivery: restaurant.selfDelivery ?? false,
        commissionPct: econ.commissionPct,
        tierGoldFeeOverride: restaurant.tierGoldFeeOverride == null ? null : restaurant.tierGoldFeeOverride / 100,
        tierSilverFeeOverride: restaurant.tierSilverFeeOverride == null ? null : restaurant.tierSilverFeeOverride / 100,
        tierStandardFeeOverride: restaurant.tierStandardFeeOverride == null ? null : restaurant.tierStandardFeeOverride / 100,
        isOpen: effectiveIsOpen,
        manualIsOpen: availability.legacyManualIsOpen,
        scheduledOpenNow: availability.scheduledOpenNow,
        acceptingOrdersMode: availability.configuredMode,
        availabilityReason: availability.reason,
        draft: (restaurant as any).draft ?? false,
        adminEmail: restaurant.adminEmail ?? null,
        hasHours,
        hasVisuals: Boolean(restaurant.imageUrl || restaurant.heroImageUrl),
        // Expose URLs directly so the admin restaurants list can render the
        // profile pic. Previously only the boolean hasVisuals was returned
        // and the frontend had no source for the image.
        imageUrl: restaurant.imageUrl ?? null,
        heroImageUrl: restaurant.heroImageUrl ?? null,
        etaMinutes: restaurant.etaMinutes,
        deliveryFee: restaurant.deliveryFee / 100,
        deliveryFeeOre: restaurant.deliveryFee,
        deliveryFeeMoney: moneyDto(restaurant.deliveryFee),
        minOrderAmount: restaurant.minOrderAmount / 100,
        minOrderAmountOre: restaurant.minOrderAmount,
        minOrderAmountMoney: moneyDto(restaurant.minOrderAmount),
        todayRevenue: todayRestaurantOrders.reduce((sum, order) => sum + order.total, 0) / 100,
        todayOrders: todayRestaurantOrders.length,
        monthRevenue: periodSales,
        periodRevenue: periodSales,
        payoutOrderCount: currentPeriodPayoutOrders.length,
        liveOrders: currentLiveOrders.length,
        pendingOrders,
        avgOrderValue: orders.length > 0 ? orders.reduce((sum, order) => sum + order.total, 0) / 100 / orders.length : 0,
        reviewScore,
        reviewCount: reviewOrders.length,
        payoutEstimate,
        commissionEstimate,
        subscriptionEstimate,
        refundsLast30d: orders.filter((order) => (order.refundAmount || 0) > 0).length,
        setupMissing: !hasHours || !restaurant.adminEmail || !restaurant.imageUrl || !restaurant.heroImageUrl,
        focus,
        updatedAt: restaurant.updatedAt.toISOString(),
      };
    }).sort((a, b) => {
      if (a.pendingOrders > 0 || b.pendingOrders > 0) return b.pendingOrders - a.pendingOrders;
      if (a.liveOrders > 0 || b.liveOrders > 0) return b.liveOrders - a.liveOrders;
      if (a.setupMissing !== b.setupMissing) return a.setupMissing ? 1 : -1;
      if (b.pendingOrders !== a.pendingOrders) return b.pendingOrders - a.pendingOrders;
      return b.periodRevenue - a.periodRevenue;
    });

    const payoutQueue = restaurantSnapshots
      .map((snapshot) => ({
        restaurantId: snapshot.id,
        name: snapshot.name,
        city: snapshot.city,
        featuredClass: snapshot.featuredClass,
        featuredLabel: snapshot.featuredLabel,
        grossSales: snapshot.monthRevenue,
        orderCount: snapshot.payoutOrderCount,
        commission: snapshot.commissionEstimate,
        subscription: snapshot.subscriptionEstimate,
        payout: snapshot.payoutEstimate,
        readiness: snapshot.hasHours ? 'ready' : 'action',
      }))
      .sort((a, b) => b.payout - a.payout);

    const customerMap = new Map<string, {
      id: string;
      label: string;
      phone: string | null;
      totalSpent: number;
      orders: number;
      lastOrderAt: string;
      favoriteRestaurant: string | null;
      refundCount: number;
      verified: boolean;
      restaurantCounts: Record<string, number>;
    }>();

    for (const order of customerOrders) {
      const customerKey = order.userId || order.customerPhone || order.id;
      const current = customerMap.get(customerKey) || {
        id: customerKey,
        label: order.customerName || 'Kund',
        phone: order.customerPhone || null,
        totalSpent: 0,
        orders: 0,
        lastOrderAt: order.createdAt.toISOString(),
        favoriteRestaurant: order.restaurant?.name || null,
        refundCount: 0,
        verified: Boolean(order.userId),
        restaurantCounts: {},
      };

      current.totalSpent += order.total / 100;
      current.orders += 1;
      current.lastOrderAt = current.lastOrderAt > order.createdAt.toISOString()
        ? current.lastOrderAt
        : order.createdAt.toISOString();
      current.refundCount += order.refundAmount ? 1 : 0;

      if (order.restaurant?.name) {
        current.restaurantCounts[order.restaurant.name] = (current.restaurantCounts[order.restaurant.name] || 0) + 1;
      }

      const favorite = Object.entries(current.restaurantCounts).sort((a, b) => b[1] - a[1])[0];
      current.favoriteRestaurant = favorite?.[0] ?? current.favoriteRestaurant;
      customerMap.set(customerKey, current);
    }

    const customerSignals = Array.from(customerMap.values())
      .sort((a, b) => {
        if (b.totalSpent !== a.totalSpent) return b.totalSpent - a.totalSpent;
        return b.orders - a.orders;
      })
      .slice(0, 8)
      .map((customer) => ({
        id: customer.id,
        label: customer.label,
        phone: customer.phone,
        totalSpent: customer.totalSpent,
        orders: customer.orders,
        lastOrderAt: customer.lastOrderAt,
        favoriteRestaurant: customer.favoriteRestaurant,
        refundCount: customer.refundCount,
        verified: customer.verified,
      }));

    const alerts = restaurantSnapshots.flatMap((snapshot) => {
      const restaurantAlerts: Array<{
        id: string;
        severity: 'high' | 'medium' | 'info';
        domain: 'ops' | 'finance' | 'security' | 'quality';
        title: string;
        description: string;
        restaurantId: string;
      }> = [];

      if (!snapshot.hasHours) {
        restaurantAlerts.push({
          id: `${snapshot.id}-hours`,
          severity: 'info',
          domain: 'ops',
          title: `${snapshot.name} saknar öppettider`,
          description: 'Saknar öppettider eller grunddata och ligger därför längst ner i restauranglistan.',
          restaurantId: snapshot.id,
        });
      }

      if (!snapshot.isOpen && snapshot.liveOrders > 0) {
        restaurantAlerts.push({
          id: `${snapshot.id}-closed-live`,
          severity: 'high',
          domain: 'ops',
          title: `${snapshot.name} är stängd men har aktiva ordrar`,
          description: `${snapshot.liveOrders} live-ordrar kräver uppföljning innan nästa skift.`,
          restaurantId: snapshot.id,
        });
      }

      if (snapshot.pendingOrders >= 5) {
        restaurantAlerts.push({
          id: `${snapshot.id}-pending`,
          severity: 'high',
          domain: 'ops',
          title: `${snapshot.name} har orderkö`,
          description: `${snapshot.pendingOrders} väntande ordrar kräver snabb bekräftelse.`,
          restaurantId: snapshot.id,
        });
      }

      if (snapshot.reviewScore > 0 && snapshot.reviewScore < 4.1) {
        restaurantAlerts.push({
          id: `${snapshot.id}-quality`,
          severity: 'medium',
          domain: 'quality',
          title: `${snapshot.name} tappar kvalitetsscore`,
          description: `Nuvarande score ${snapshot.reviewScore.toFixed(1)}. Följ upp recensioner och ETA.`,
          restaurantId: snapshot.id,
        });
      }

      if (snapshot.payoutEstimate > 20000) {
        restaurantAlerts.push({
          id: `${snapshot.id}-payout`,
          severity: 'info',
          domain: 'finance',
          title: `${snapshot.name} närmar sig större utbetalning`,
          description: `Beräknad utbetalning ${snapshot.payoutEstimate.toFixed(0)} kr denna månad.`,
          restaurantId: snapshot.id,
        });
      }

      return restaurantAlerts;
    }).sort((a, b) => severityRank[b.severity] - severityRank[a.severity]).slice(0, 12);

    const weightedRatingBase = restaurants.reduce((sum, restaurant) => sum + (restaurant.ratingCount || 0), 0);
    const weightedRating = weightedRatingBase > 0
      ? restaurants.reduce((sum, restaurant) => sum + ((restaurant.rating || 0) * (restaurant.ratingCount || 0)), 0) / weightedRatingBase
      : 0;

    const activeCustomers = new Set(customerOrders.map((order) => order.userId || order.customerPhone).filter(Boolean)).size;
    const periodRevenueOre = periodOrders.reduce((sum, order) => sum + netPaidAmount(order), 0);
    const periodOrderCount = periodOrders.filter((order) => netPaidAmount(order) > 0).length;
    const periodCommission = restaurantSnapshots.reduce((sum, snapshot) => sum + snapshot.commissionEstimate, 0);
    const periodPayoutExposure = payoutQueue.reduce((sum, row) => sum + row.payout, 0);
    const periodRefundAmountOre = periodRefundOrders.reduce(
      (sum, order) => sum + Math.min(
        Math.max(0, Number(order.total || 0)),
        Math.max(
          0,
          Number(order.refundAmount || (
            String(order.paymentStatus || '').toUpperCase() === 'REFUNDED'
              ? order.total
              : 0
          )),
        ),
      ),
      0,
    );
    const pendingRefundAmountOre = periodPendingRefundOrders.reduce(
      (sum, order) => sum + Math.max(0, Number(order.refundAmount ?? order.total ?? 0)),
      0,
    );
    const todayRevenueOre = todayOrders.reduce((sum, order) => sum + netPaidAmount(order), 0);
    const periodMolliePaymentIds = [...new Set(
      [...periodOrders, ...periodRefundOrders]
        .filter((order) => String(order.paymentProvider || '').toLowerCase() === 'mollie')
        .map((order) => String(order.molliePaymentId || '').trim())
        .filter(Boolean),
    )];
    const mollieReport = await getMollieFinanceReport({
      from: period.start,
      paymentIds: periodMolliePaymentIds,
      refundedPaymentIds: periodRefundOrders
        .map((order) => String(order.molliePaymentId || '').trim())
        .filter(Boolean),
    });
    const mollieFeesOre = mollieReport.feeStatus === 'unavailable'
      ? null
      : [...mollieReport.displayFeeByPaymentId.values()].reduce((sum, amount) => sum + amount, 0);
    const paymentMix = Array.from(periodOrders.reduce((map, order) => {
      const method = order.paymentMethod || 'UNKNOWN';
      const current = map.get(method) || { method, count: 0, revenue: 0 };
      current.count += 1;
      current.revenue += netPaidAmount(order) / 100;
      map.set(method, current);
      return map;
    }, new Map<string, { method: string; count: number; revenue: number }>()).values())
      .sort((a, b) => b.revenue - a.revenue);

    const summary = {
      todayRevenue: todayRevenueOre / 100,
      todayOrders: todayOrders.length,
      liveOrders: liveOrders.length,
      openRestaurants: restaurantSnapshots.filter((snapshot) => snapshot.isOpen).length,
      totalRestaurants: restaurantSnapshots.length,
      activeCustomers,
      monthlyPayoutExposure: periodPayoutExposure,
      periodRevenue: periodRevenueOre / 100,
      periodOrders: periodOrderCount,
      periodCommission,
      periodPayoutExposure,
      periodRefundAmount: periodRefundAmountOre / 100,
      periodRefundCount: periodRefundOrders.length,
      pendingRefundAmount: pendingRefundAmountOre / 100,
      pendingRefundCount: periodPendingRefundOrders.length,
      avgTicket: periodOrderCount > 0 ? (periodRevenueOre / 100) / periodOrderCount : 0,
      avgRating: weightedRating,
      registeredCustomers: totalCustomers,
      incomeAfterFees: mollieFeesOre == null
        ? null
        : (periodRevenueOre - mollieFeesOre) / 100,
      mollieFees: mollieFeesOre == null ? null : mollieFeesOre / 100,
    };

    res.json({
      scope: { restaurantId: scopedRestaurantId, isSuperAdmin: true },
      period: {
        key: period.key,
        label: period.label,
        from: period.start.toISOString(),
        to: period.end.toISOString(),
        timeZone: REPORT_TIME_ZONE,
      },
      summary,
      mollie: {
        feeStatus: mollieReport.feeStatus,
        feeError: mollieReport.feeError,
        totalBalance: mollieReport.totalBalanceOre == null ? null : mollieReport.totalBalanceOre / 100,
        availableBalance: mollieReport.availableBalanceOre == null ? null : mollieReport.availableBalanceOre / 100,
        pendingBalance: mollieReport.pendingBalanceOre == null ? null : mollieReport.pendingBalanceOre / 100,
        nextPayoutDate: mollieReport.nextPayoutDate,
        transferFrequency: mollieReport.transferFrequency,
      },
      liveStatusCounts,
      trend: Array.from(trendMap.values()),
      paymentMix,
      topProducts: topProductsRows.map((row) => ({
        name: row.productName,
        count: row._count.id,
        revenue: (row._sum.subtotal || 0) / 100,
      })),
      recentReviews,
      customerSignals,
      restaurantSnapshots,
      payoutQueue,
      alerts,
      security: {
        loginRateLimit: true,
        verifyRateLimit: true,
        socketGuard: true,
        uploadGuard: true,
        r2Configured: Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET && process.env.R2_PUBLIC_BASE_URL),
        aliasSync: false,
        notes: [
          'Adminlogin rate-limitad per IP + identifier',
          'join:admin kräver verifierad token och scope-kontroll',
          'Receipt-data och rabattkoder är nu superadmin/skop-säkrade',
        ],
      },
    });
  } catch (error) {
    console.error('Control center error:', error);
    res.status(500).json({ error: 'Kunde inte hämta kontrollcenter-data' });
  }
});

export default router;
