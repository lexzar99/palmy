import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { isRestaurantOpen, hasOpeningHours } from '../lib/openingHours';

const router = Router();
router.use(authenticate);

const LIVE_STATUSES = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'DELIVERING'] as const;
const CLOSED_STATUSES = ['CANCELLED', 'REJECTED'] as const;

const TIER_CONFIG: Record<number, { label: string; commissionPct: number; subscriptionFee: number }> = {
  1: { label: 'Guld', commissionPct: 8, subscriptionFee: 1990 },
  2: { label: 'Silver', commissionPct: 10, subscriptionFee: 990 },
  3: { label: 'Standard', commissionPct: 12, subscriptionFee: 490 },
  0: { label: 'Dold', commissionPct: 12, subscriptionFee: 0 },
};

const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
};

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const daysAgo = (days: number) => {
  const now = new Date();
  now.setDate(now.getDate() - days);
  return now;
};

const startOfMonth = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

const orderBusinessFilters = {
  NOT: [
    { discountCode: { in: ['test', 'testa', 'TEST', 'TESTA'] } },
    { stripePaymentIntentId: 'TEST_PAYMENT' },
    { customerName: 'AUTOTEST' },
  ],
};

const severityRank: Record<string, number> = {
  high: 3,
  medium: 2,
  info: 1,
};

router.get('/control-center', async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    if (authReq.admin?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Kräver super admin-behörighet' });
    }

    const scopedRestaurantId = req.query.restaurantId ? String(req.query.restaurantId) : null;
    const restaurantWhere = scopedRestaurantId ? { id: scopedRestaurantId } : {};

    const restaurants = await prisma.restaurant.findMany({
      where: restaurantWhere,
      select: {
        id: true,
        name: true,
        slug: true,
        city: true,
        isOpen: true,
        featuredClass: true,
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
      },
      orderBy: [{ featuredClass: 'asc' }, { name: 'asc' }],
    });

    const restaurantIds = restaurants.map((restaurant) => restaurant.id);

    if (restaurantIds.length === 0) {
      return res.json({
        scope: { restaurantId: scopedRestaurantId, isSuperAdmin: true },
        summary: {
          todayRevenue: 0,
          todayOrders: 0,
          liveOrders: 0,
          openRestaurants: 0,
          totalRestaurants: 0,
          activeCustomers: 0,
          monthlyPayoutExposure: 0,
          avgTicket: 0,
          avgRating: 0,
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
          cloudinaryConfigured: Boolean(process.env.CLOUDINARY_URL || (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)),
          aliasSync: false,
          notes: [
            'Adminlogin rate-limitad per IP + identifier',
            'join:admin kräver verifierad token',
          ],
        },
      });
    }

    const today = startOfToday();
    const thirtyDays = daysAgo(30);
    const ninetyDays = daysAgo(90);
    const monthStart = startOfMonth();

    const whereForRestaurants = { restaurantId: { in: restaurantIds } };

    const [recentOrders, liveOrders, customerOrders, paymentMixRows, topProductsRows, totalCustomers] = await Promise.all([
      prisma.order.findMany({
        where: {
          ...whereForRestaurants,
          status: { notIn: [...CLOSED_STATUSES] },
          createdAt: { gte: thirtyDays },
          ...orderBusinessFilters,
        },
        select: {
          id: true,
          orderNumber: true,
          total: true,
          status: true,
          type: true,
          createdAt: true,
          restaurantId: true,
          customerName: true,
          customerPhone: true,
          userId: true,
          paymentMethod: true,
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
      prisma.order.groupBy({
        by: ['paymentMethod'],
        where: {
          ...whereForRestaurants,
          status: { notIn: [...CLOSED_STATUSES] },
          createdAt: { gte: thirtyDays },
          ...orderBusinessFilters,
        },
        _count: { id: true },
        _sum: { total: true },
      }),
      prisma.orderItem.groupBy({
        by: ['productName'],
        where: {
          order: {
            ...whereForRestaurants,
            status: { notIn: [...CLOSED_STATUSES] },
            createdAt: { gte: thirtyDays },
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

    const trendMap = new Map<string, { label: string; revenue: number; orders: number }>();
    for (let offset = 6; offset >= 0; offset -= 1) {
      const day = startOfToday();
      day.setDate(day.getDate() - offset);
      const key = day.toISOString().slice(0, 10);
      trendMap.set(key, {
        label: day.toLocaleDateString('sv-SE', { weekday: 'short' }),
        revenue: 0,
        orders: 0,
      });
    }

    const todayOrders = recentOrders.filter((order) => new Date(order.createdAt) >= today);
    for (const order of recentOrders) {
      const key = new Date(order.createdAt).toISOString().slice(0, 10);
      const entry = trendMap.get(key);
      if (entry) {
        entry.revenue += order.total / 100;
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

    const monthOrders = recentOrders.filter((order) => new Date(order.createdAt) >= monthStart);

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

    const monthByRestaurant = new Map<string, typeof monthOrders>();
    for (const order of monthOrders) {
      const existing = monthByRestaurant.get(order.restaurantId || 'unknown') || [];
      existing.push(order);
      monthByRestaurant.set(order.restaurantId || 'unknown', existing);
    }

    const restaurantSnapshots = restaurants.map((restaurant) => {
      const orders = groupedByRestaurant.get(restaurant.id) || [];
      const currentLiveOrders = liveByRestaurant.get(restaurant.id) || [];
      const currentMonthOrders = monthByRestaurant.get(restaurant.id) || [];
      const openingHours = parseJson<Record<string, any>>(restaurant.openingHours, {});
      const hasHours = hasOpeningHours(openingHours);
      let effectiveIsOpen = restaurant.isOpen;
      try {
        effectiveIsOpen = restaurant.isOpen && isRestaurantOpen(restaurant.openingHours);
      } catch {
        effectiveIsOpen = restaurant.isOpen;
      }
      const todayRestaurantOrders = orders.filter((order) => new Date(order.createdAt) >= today);
      const reviewOrders = orders.filter((order) => typeof order.rating === 'number' && order.rating > 0);
      const monthSales = currentMonthOrders.reduce((sum, order) => sum + order.total, 0) / 100;
      const tier = TIER_CONFIG[restaurant.featuredClass ?? 3] || TIER_CONFIG[3];
      const commissionEstimate = (monthSales * tier.commissionPct) / 100;
      // Payout = what we owe the restaurant. Floored at 0 — subscription is billed separately,
      // not subtracted from a payout the restaurant didn't earn (was the source of the
      // bogus negative "Utbetalning (mån)" on the dashboard).
      const payoutEstimate = Math.max(0, monthSales - commissionEstimate - tier.subscriptionFee);
      const subscriptionLiability = monthSales > 0 ? 0 : tier.subscriptionFee;
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
        featuredLabel: tier.label,
        isOpen: effectiveIsOpen,
        manualIsOpen: restaurant.isOpen,
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
        minOrderAmount: restaurant.minOrderAmount / 100,
        todayRevenue: todayRestaurantOrders.reduce((sum, order) => sum + order.total, 0) / 100,
        todayOrders: todayRestaurantOrders.length,
        monthRevenue: monthSales,
        liveOrders: currentLiveOrders.length,
        pendingOrders,
        avgOrderValue: orders.length > 0 ? orders.reduce((sum, order) => sum + order.total, 0) / 100 / orders.length : 0,
        reviewScore,
        reviewCount: reviewOrders.length,
        payoutEstimate,
        commissionEstimate,
        subscriptionEstimate: tier.subscriptionFee,
        refundsLast30d: orders.filter((order) => (order.refundAmount || 0) > 0).length,
        focus,
        updatedAt: restaurant.updatedAt.toISOString(),
      };
    }).sort((a, b) => {
      if (b.pendingOrders !== a.pendingOrders) return b.pendingOrders - a.pendingOrders;
      return b.todayRevenue - a.todayRevenue;
    });

    const payoutQueue = restaurantSnapshots
      .map((snapshot) => ({
        restaurantId: snapshot.id,
        name: snapshot.name,
        city: snapshot.city,
        featuredClass: snapshot.featuredClass,
        featuredLabel: snapshot.featuredLabel,
        grossSales: snapshot.monthRevenue,
        orderCount: monthByRestaurant.get(snapshot.id)?.length || 0,
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
          severity: 'medium',
          domain: 'ops',
          title: `${snapshot.name} saknar öppettider`,
          description: 'Lägg in veckoschema i restauranghubben för korrekt öppet/stängt-status.',
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

    const summary = {
      todayRevenue: todayOrders.reduce((sum, order) => sum + order.total, 0) / 100,
      todayOrders: todayOrders.length,
      liveOrders: liveOrders.length,
      openRestaurants: restaurantSnapshots.filter((snapshot) => snapshot.isOpen).length,
      totalRestaurants: restaurantSnapshots.length,
      activeCustomers,
      monthlyPayoutExposure: payoutQueue.reduce((sum, row) => sum + row.payout, 0),
      avgTicket: recentOrders.length > 0 ? recentOrders.reduce((sum, order) => sum + order.total, 0) / 100 / recentOrders.length : 0,
      avgRating: weightedRating,
      registeredCustomers: totalCustomers,
    };

    res.json({
      scope: { restaurantId: scopedRestaurantId, isSuperAdmin: true },
      summary,
      liveStatusCounts,
      trend: Array.from(trendMap.values()),
      paymentMix: paymentMixRows
        .map((row) => ({
          method: row.paymentMethod || 'UNKNOWN',
          count: row._count.id,
          revenue: (row._sum.total || 0) / 100,
        }))
        .sort((a, b) => b.revenue - a.revenue),
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
        cloudinaryConfigured: Boolean(process.env.CLOUDINARY_URL || (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)),
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
