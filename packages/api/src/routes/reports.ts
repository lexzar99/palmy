import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { PAYOUT_NON_TEST_ORDER_FILTER } from '../lib/payoutPolicy';

const router = Router();
router.use(authenticate);

const isSuperAdmin = (req: AuthRequest) => req.admin?.role === 'SUPER_ADMIN';

const requireRestaurantScope = (req: AuthRequest, res: any): string | null => {
  if (isSuperAdmin(req)) return null;
  const rid = req.admin?.restaurantId;
  if (!rid) {
    res.status(403).json({ error: 'Kontot är inte kopplat till en restaurang' });
    return null;
  }
  return rid;
};

// Common where clause to exclude test orders from business reports.
const excludeTestOrders = PAYOUT_NON_TEST_ORDER_FILTER;

// GET /api/admin/reports/bi - Business Intelligence Overview
router.get('/bi', async (req, res) => {
  try {
    const { restaurantId, months = 6 } = req.query;
    const scopedId = isSuperAdmin(req as AuthRequest) 
      ? (restaurantId ? (restaurantId as string) : null)
      : requireRestaurantScope(req as AuthRequest, res);

    if (!isSuperAdmin(req as AuthRequest) && scopedId === null && !res.headersSent) return;

    const limitMonths = parseInt(months as string) || 6;
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - limitMonths, 1);

    // Business Logic: Growth Analysis
    const [orders, customers, revenueByMonth] = await Promise.all([
      // 1. Total Growth
      prisma.order.count({
        where: {
          ...(scopedId ? { restaurantId: scopedId } : {}),
          status: { notIn: ['CANCELLED', 'REJECTED'] },
          ...excludeTestOrders,
        }
      }),
      // 2. New Customers (Registered) - Only available for Super Admin or global context
      isSuperAdmin(req as AuthRequest) ? prisma.user.count({
        where: { createdAt: { gte: startDate } }
      }) : Promise.resolve(0),
      // 3. Revenue over time (Monthly buckets)
      prisma.order.groupBy({
        by: ['createdAt'],
        where: {
          ...(scopedId ? { restaurantId: scopedId } : {}),
          status: { notIn: ['CANCELLED', 'REJECTED'] },
          createdAt: { gte: startDate },
          ...excludeTestOrders,
        },
        _sum: { total: true },
        _count: { id: true }
      })
    ]);

    // Aggregate products for popularity (Top 10)
    const topProducts = await prisma.orderItem.groupBy({
      by: ['productName'],
      where: {
        order: {
          ...(scopedId ? { restaurantId: scopedId } : {}),
          status: { notIn: ['CANCELLED', 'REJECTED'] },
          ...excludeTestOrders,
        }
      },
      _count: { id: true },
      _sum: { subtotal: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10
    });

    // Process monthly revenue data for charts
    const monthlyData: Record<string, { revenue: number; orders: number }> = {};
    revenueByMonth.forEach((row) => {
      const monthKey = row.createdAt.toISOString().slice(0, 7); // YYYY-MM
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { revenue: 0, orders: 0 };
      }
      monthlyData[monthKey].revenue += (row._sum.total || 0) / 100;
      monthlyData[monthKey].orders += row._count.id;
    });

    const chartData = Object.entries(monthlyData)
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.month.localeCompare(b.month));

    res.json({
      summary: {
        totalOrders: orders,
        newCustomersSinceStart: customers,
        currentMonthRevenue: chartData[chartData.length - 1]?.revenue || 0,
        prevMonthRevenue: chartData[chartData.length - 2]?.revenue || 0,
      },
      chartData,
      topProducts: topProducts.map(p => ({
        name: p.productName,
        count: p._count.id,
        revenue: (p._sum.subtotal || 0) / 100
      }))
    });
  } catch (error) {
    console.error('BI report error:', error);
    res.status(500).json({ error: 'Serverfel vid BI-analys' });
  }
});

// GET /api/admin/reports/comparison - Compare two months
router.get('/comparison', async (req, res) => {
  try {
    const { monthA, monthB, restaurantId } = req.query; // Format: YYYY-MM
    if (!monthA || !monthB) return res.status(400).json({ error: 'Ange två månader att jämföra' });

    const scopedId = isSuperAdmin(req as AuthRequest) 
      ? (restaurantId ? (restaurantId as string) : null)
      : requireRestaurantScope(req as AuthRequest, res);

    const getMonthData = async (monthStr: string) => {
      const start = new Date(monthStr + '-01');
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
      
      const stats = await prisma.order.aggregate({
        where: {
          ...(scopedId ? { restaurantId: scopedId } : {}),
          status: { notIn: ['CANCELLED', 'REJECTED'] },
          createdAt: { gte: start, lte: end },
          ...excludeTestOrders,
        },
        _sum: { total: true },
        _count: { id: true },
        _avg: { total: true }
      });

      return {
        month: monthStr,
        revenue: (stats._sum.total || 0) / 100,
        orders: stats._count.id,
        avgOrder: (stats._avg.total || 0) / 100
      };
    };

    const [dataA, dataB] = await Promise.all([
      getMonthData(monthA as string),
      getMonthData(monthB as string)
    ]);

    res.json({ dataA, dataB });
  } catch (error) {
    res.status(500).json({ error: 'Serverfel vid jämförelse' });
  }
});

// GET /api/admin/reports/customers - Customer Growth & Retention
router.get('/customers', async (req, res) => {
  try {
    if (!isSuperAdmin(req as AuthRequest)) {
      return res.status(403).json({ error: 'Bara super-admin kan se global kundstatistik' });
    }

    const { days = 30 } = req.query;
    const limitDays = parseInt(days as string) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - limitDays);

    const [totalCustomers, newCustomers, activeUsers] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: startDate } } }),
      prisma.order.groupBy({
        by: ['userId'],
        where: { 
          createdAt: { gte: startDate },
          ...excludeTestOrders,
        },
        _count: { id: true }
      })
    ]);

    res.json({
      total: totalCustomers,
      newlyRegistered: newCustomers,
      activeLastPeriod: activeUsers.length,
      retentionRate: totalCustomers > 0 ? (activeUsers.length / totalCustomers) * 100 : 0
    });
  } catch (error) {
    res.status(500).json({ error: 'Serverfel vid kundanalys' });
  }
});

// GET /api/admin/reports/restaurant/:id - Per-restaurant detailed report + commission calc
router.get('/restaurant/:restaurantId', async (req, res) => {
  try {
    if (!isSuperAdmin(req as AuthRequest)) {
      return res.status(403).json({ error: 'Kräver super-admin' });
    }

    const { restaurantId } = req.params;
    const { from, to } = req.query;

    const startDate = from ? new Date(from as string) : (() => {
      const d = new Date(); d.setDate(d.getDate() - 30); return d;
    })();
    const endDate = to ? new Date(to as string) : new Date();
    // Make endDate inclusive (end of day)
    endDate.setHours(23, 59, 59, 999);

    const whereBase = {
      restaurantId,
      status: { notIn: ['CANCELLED', 'REJECTED'] as any },
      createdAt: { gte: startDate, lte: endDate },
      ...excludeTestOrders,
    };

    const [restaurant, orders, newCustomers, topProducts, ordersByDay] = await Promise.all([
      prisma.restaurant.findUnique({ where: { id: restaurantId } }),

      prisma.order.findMany({
        where: whereBase,
        select: {
          id: true, orderNumber: true, total: true, deliveryFee: true,
          discountAmount: true, status: true, createdAt: true,
          customerName: true, userId: true, type: true,
        },
        orderBy: { createdAt: 'asc' },
      }),

      prisma.order.groupBy({
        by: ['userId'],
        where: {
          restaurantId,
          status: { notIn: ['CANCELLED', 'REJECTED'] as any },
          createdAt: { lte: endDate },
          ...excludeTestOrders,
        },
        having: {
          userId: { _count: { equals: 1 } },
        },
        _count: { id: true },
      }).then((rows) =>
        rows.filter((r) => r.userId !== null).length
      ),

      prisma.orderItem.groupBy({
        by: ['productName'],
        where: {
          order: { ...whereBase },
        },
        _count: { id: true },
        _sum: { subtotal: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),

      prisma.order.groupBy({
        by: ['createdAt'],
        where: whereBase,
        _sum: { total: true },
        _count: { id: true },
      }),
    ]);

    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurang hittades inte' });
    }

    const totalRevenue = orders.reduce((s, o) => s + o.total, 0) / 100;
    const totalOrders = orders.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const pickupOrders = orders.filter((o) => o.type === 'PICKUP').length;
    const deliveryOrders = orders.filter((o) => o.type === 'DELIVERY').length;

    // Daily revenue aggregation
    const dailyMap: Record<string, { revenue: number; orders: number }> = {};
    ordersByDay.forEach((row) => {
      const dayKey = row.createdAt.toISOString().slice(0, 10);
      if (!dailyMap[dayKey]) dailyMap[dayKey] = { revenue: 0, orders: 0 };
      dailyMap[dayKey].revenue += (row._sum.total || 0) / 100;
      dailyMap[dayKey].orders += row._count.id;
    });
    const dailyData = Object.entries(dailyMap)
      .map(([date, d]) => ({ date, ...d }))
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        featuredClass: restaurant.featuredClass,
      },
      period: { from: startDate.toISOString(), to: endDate.toISOString() },
      summary: {
        totalOrders,
        totalRevenue,
        avgOrderValue,
        pickupOrders,
        deliveryOrders,
        newCustomers,
      },
      topProducts: topProducts.map((p) => ({
        name: p.productName,
        count: p._count.id,
        revenue: (p._sum.subtotal || 0) / 100,
      })),
      dailyData,
      orders: orders.map((o) => ({
        ...o,
        total: o.total / 100,
        deliveryFee: o.deliveryFee / 100,
        discountAmount: o.discountAmount / 100,
      })),
    });
  } catch (error) {
    console.error('Restaurant report error:', error);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/admin/reports/restaurant/:restaurantId/send - Skicka rapport via mail
router.post('/restaurant/:restaurantId/send', async (req, res) => {
  try {
    if (!isSuperAdmin(req as AuthRequest)) {
      return res.status(403).json({ error: 'Kräver super-admin' });
    }

    const { restaurantId } = req.params;
    const { email, period } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Mottagaradress saknas' });
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { name: true },
    });

    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurangen hittades inte' });
    }

    // MOCK: simulate sending email
    console.log(`[MOCK EMAIL SEND] Skickar rapport för ${restaurant.name} (${period}) till ${email}...`);

    res.json({ success: true, message: 'Rapporten skickades (MOCK)' });
  } catch (error) {
    console.error('Send report error:', error);
    res.status(500).json({ error: 'Kunde inte skicka e-post' });
  }
});

export default router;
