import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin, AuthRequest } from '../middleware/auth';
import { getIO } from '../lib/socket';
import { eatsmartCatalog, getCatalogStats } from '../lib/eatsmartCatalog';
import { slugify } from '../lib/slug';
import { formatDealForClient, parseDealProductIds } from '../lib/deals';
import { normalizeMoneyToOre } from '../utils/deliveryZones';

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

const kr = (amount: number) => Math.round(amount * 100);

const ensureExtraGroup = async ({
  name,
  description,
  type,
  required,
  minSelections,
  maxSelections,
  extras,
  restaurantId,
}: {
  name: string;
  description: string;
  type: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  extras: Array<{ name: string; priceAddon: number; isDefault?: boolean }>;
  restaurantId?: string | null;
}) => {
  const existing = await prisma.extraGroup.findFirst({
    where: { name, restaurantId: restaurantId || null },
    include: { extras: true },
  });

  if (existing) {
    return existing;
  }

  return prisma.extraGroup.create({
    data: {
      name,
      description,
      type,
      required,
      minSelections,
      maxSelections,
      restaurantId: restaurantId || null,
      extras: {
        create: extras.map((extra, index) => ({
          name: extra.name,
          priceAddon: extra.priceAddon,
          isDefault: extra.isDefault ?? false,
          position: index,
        })),
      },
    },
  });
};

const ensureCoreExtraGroups = async () => {
  const [sizeGroup, toppingGroup, sauceGroup, sideGroup, dipGroup] = await Promise.all([
    ensureExtraGroup({
      name: 'Storlek',
      description: 'Välj pizzastorlek',
      type: 'RADIO',
      required: true,
      minSelections: 1,
      maxSelections: 1,
      extras: [
        { name: 'Standard', priceAddon: 0, isDefault: true },
        { name: 'Panpizza', priceAddon: kr(20) },
        { name: 'Familjepizza', priceAddon: kr(110) },
      ],
    }),
    ensureExtraGroup({
      name: 'Pålägg',
      description: 'Valfria extra pålägg',
      type: 'CHECKBOX',
      required: false,
      minSelections: 0,
      maxSelections: 10,
      extras: [
        { name: 'Kebab', priceAddon: kr(25) },
        { name: 'Kyckling', priceAddon: kr(25) },
        { name: 'Räkor', priceAddon: kr(25) },
        { name: 'Tonfisk', priceAddon: kr(25) },
        { name: 'Skinka', priceAddon: kr(25) },
        { name: 'Salami', priceAddon: kr(25) },
        { name: 'Svamp', priceAddon: kr(20) },
        { name: 'Paprika', priceAddon: kr(20) },
        { name: 'Lök', priceAddon: kr(20) },
        { name: 'Tomat', priceAddon: kr(20) },
        { name: 'Jalapeno', priceAddon: kr(20) },
        { name: 'Bacon', priceAddon: kr(25) },
        { name: 'Mozzarella', priceAddon: kr(25) },
        { name: 'Ruccola', priceAddon: kr(20) },
        { name: 'Ananas', priceAddon: kr(15) },
      ],
    }),
    ensureExtraGroup({
      name: 'Sås',
      description: 'Valfri sås',
      type: 'RADIO',
      required: false,
      minSelections: 0,
      maxSelections: 1,
      extras: [
        { name: 'Vitlökssås', priceAddon: 0, isDefault: true },
        { name: 'Stark sås', priceAddon: 0 },
        { name: 'Mamsas', priceAddon: 0 },
        { name: 'Chilisås', priceAddon: 0 },
        { name: 'Pestosås', priceAddon: 0 },
      ],
    }),
    ensureExtraGroup({
      name: 'Tillbehör',
      description: 'Ris eller pommes',
      type: 'RADIO',
      required: true,
      minSelections: 1,
      maxSelections: 1,
      extras: [
        { name: 'Pommes', priceAddon: 0, isDefault: true },
        { name: 'Ris', priceAddon: 0 },
      ],
    }),
    ensureExtraGroup({
      name: 'Dip',
      description: 'Valfri dip',
      type: 'RADIO',
      required: false,
      minSelections: 0,
      maxSelections: 1,
      extras: [
        { name: 'Vitlöksdip', priceAddon: 0, isDefault: true },
        { name: 'BBQ-dip', priceAddon: 0 },
        { name: 'Chimichurri', priceAddon: 0 },
        { name: 'Chili-dip', priceAddon: 0 },
      ],
    }),
  ]);

  return { sizeGroup, toppingGroup, sauceGroup, sideGroup, dipGroup };
};

const getGroupIdsForProduct = (
  categoryName: string,
  product: { name: string; description?: string | null },
  groups: Awaited<ReturnType<typeof ensureCoreExtraGroups>>,
) => {
  const lowerCategory = categoryName.toLowerCase();
  const lowerDescription = (product.description || '').toLowerCase();
  const lowerName = product.name.toLowerCase();
  const groupIds: string[] = [];

  const isPizzaCategory =
    lowerCategory.includes('pizza') ||
    lowerCategory.includes('pizzor') ||
    lowerCategory.includes('veganska') ||
    lowerCategory.includes('italienska');

  if (isPizzaCategory) {
    groupIds.push(groups.sizeGroup.id, groups.toppingGroup.id);
  }

  if (lowerCategory.includes('crispy chicken')) {
    if (lowerName.includes('tallrik')) {
      groupIds.push(groups.sideGroup.id);
    }
    if (lowerName.includes('familj')) {
      groupIds.push(groups.dipGroup.id);
    } else if (lowerName.includes('tallrik')) {
      groupIds.push(groups.dipGroup.id);
    } else if (lowerDescription.includes('valfri sås')) {
      groupIds.push(groups.sauceGroup.id);
    }
  }

  if (
    lowerCategory.includes('tallrik') ||
    lowerCategory.includes('box') ||
    lowerCategory.includes('rullar') ||
    lowerCategory.includes('bröd') ||
    lowerCategory.includes('sallader') ||
    lowerCategory.includes('bakad potatis')
  ) {
    if (
      lowerCategory.includes('tallrik') ||
      lowerCategory.includes('box')
    ) {
      groupIds.push(groups.sideGroup.id);
    }

    if (lowerDescription.includes('valfri sås') || lowerCategory.includes('sallader')) {
      groupIds.push(groups.sauceGroup.id);
    }
  }

  if (lowerDescription.includes('valfri sås') && !groupIds.includes(groups.sauceGroup.id)) {
    groupIds.push(groups.sauceGroup.id);
  }

  return [...new Set(groupIds)];
};

// =====================
// ORDERS
// =====================

// GET /api/admin/orders
router.get('/orders', async (req, res) => {
  try {
    const { status, limit = '50', offset = '0', date, restaurantId } = req.query;

    const where: Record<string, unknown> = {};
    if (isSuperAdmin(req as AuthRequest)) {
      if (restaurantId) where.restaurantId = restaurantId as string;
    } else {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      where.restaurantId = rid;
    }
    if (status) where.status = status;
    if (date) {
      const start = new Date(date as string);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date as string);
      end.setHours(23, 59, 59, 999);
      where.createdAt = { gte: start, lte: end };
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit as string),
        skip: parseInt(offset as string),
        include: {
          restaurant: { select: { name: true } },
          items: {
            include: { product: { select: { name: true } } },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    res.json({
      orders: orders.map((o) => ({
        ...o,
        total: o.total / 100,
        deliveryFee: o.deliveryFee / 100,
        discountAmount: o.discountAmount / 100,
        items: o.items.map((i) => ({
          ...i,
          basePrice: i.basePrice / 100,
          subtotal: i.subtotal / 100,
        })),
        restaurantName: o.restaurant?.name || 'Okänd restaurang',
      })),
      total,
    });
  } catch (error) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

router.get('/orders/:id', async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        restaurant: { select: { name: true } },
        items: {
          include: { product: { select: { name: true } } },
        },
      },
    });

    if (!order) {
      res.status(404).json({ error: 'Order hittades inte' });
      return;
    }

    if (!isSuperAdmin(req as AuthRequest)) {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      if (order.restaurantId !== rid) {
        res.status(403).json({ error: 'Du kan bara se orders för din restaurang' });
        return;
      }
    }

    res.json({
      ...order,
      total: order.total / 100,
      deliveryFee: order.deliveryFee / 100,
      discountAmount: order.discountAmount / 100,
      items: order.items.map((i) => ({
        ...i,
        basePrice: i.basePrice / 100,
        subtotal: i.subtotal / 100,
      })),
      restaurantName: order.restaurant?.name || 'Okänd restaurang',
    });
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// PATCH /api/admin/orders/:id/status
router.patch('/orders/:id/status', async (req, res) => {
  try {
    // SUPER_ADMIN can monitor all restaurants, but cannot accept/handle orders.
    // Super Admin can monitor and handle all orders.

    const { status, estimatedTime } = req.body;
    const validStatuses = ['ACCEPTED', 'PREPARING', 'READY', 'DELIVERING', 'DELIVERED', 'DELIVERY_FAILED', 'REJECTED', 'CANCELLED'];

    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: 'Ogiltig status' });
      return;
    }

    let adminRestaurantId: string | null = null;
    if (isSuperAdmin(req as AuthRequest)) {
      adminRestaurantId = '__super__';
    } else {
      adminRestaurantId = requireRestaurantScope(req as AuthRequest, res);
      if (!adminRestaurantId) return;
    }

    const existing = await prisma.order.findUnique({
      where: { id: req.params.id },
      select: { id: true, restaurantId: true },
    });

    if (!existing) {
      res.status(404).json({ error: 'Order hittades inte' });
      return;
    }

    if (!isSuperAdmin(req as AuthRequest) && existing.restaurantId !== adminRestaurantId) {
      res.status(403).json({ error: 'Du kan bara uppdatera orders för din restaurang' });
      return;
    }

    const order = await prisma.order.update({
      where: { id: req.params.id },
      data: {
        status,
        estimatedTime: estimatedTime || undefined,
      },
    });

    // Notifiera kunden via Socket.IO
    getIO().to(`order:${order.id}`).emit('order:status', {
      orderId: order.id,
      status: order.status,
      estimatedTime: order.estimatedTime,
    });

    // Notifiera admin-rummet
    getIO().to('admin-room').emit('order:updated', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      restaurantId: order.restaurantId,
    });
    if (order.restaurantId) {
      getIO().to(`admin-room:${order.restaurantId}`).emit('order:updated', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        restaurantId: order.restaurantId,
      });
    }

    res.json({ success: true, status: order.status });
  } catch {
    res.status(500).json({ error: 'Kunde inte uppdatera status' });
  }
});

// Admin: PATCH /api/admin/orders/:id - Update order details
router.patch('/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Authorization check
    const existing = await prisma.order.findUnique({
      where: { id },
      select: { id: true, restaurantId: true },
    });
    if (!existing) {
      res.status(404).json({ error: 'Order hittades inte' });
      return;
    }
    
    if (!isSuperAdmin(req as AuthRequest)) {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      if (existing.restaurantId !== rid) {
        res.status(403).json({ error: 'Du kan bara uppdatera orders för din restaurang' });
        return;
      }
    }
    
    const { customerName, customerPhone, customerEmail, deliveryStreet, deliveryCity, deliveryZip, note, status, paymentMethod } = req.body;
    
    const order = await prisma.order.update({
      where: { id },
      data: {
        customerName, customerPhone, customerEmail, deliveryStreet, deliveryCity, deliveryZip, note, status, paymentMethod
      },
    });

    const io = req.app.get('io');
    getIO().emit('order:updated', { id: order.id, status: order.status });
    if (order.restaurantId) {
      getIO().to(`admin-room:${order.restaurantId}`).emit('order:updated', { id: order.id });
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte uppdatera order' });
  }
});

// Admin: reports/orders (scoped by restaurantId)
router.get('/reports/orders', async (req, res) => {
  try {
    const { dateFrom, dateTo, paymentMethod = 'ALL', restaurantId } = req.query;
    const where: Record<string, unknown> = {
      status: { notIn: ['CANCELLED', 'REJECTED'] },
    };
    if (isSuperAdmin(req as AuthRequest)) {
      Object.assign(where, restaurantId ? { restaurantId: restaurantId as string } : {});
    } else {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      Object.assign(where, { restaurantId: rid });
    }

    if (dateFrom || dateTo) {
      const createdAt: Record<string, Date> = {};
      if (dateFrom) {
        const from = new Date(dateFrom as string);
        from.setHours(0, 0, 0, 0);
        createdAt.gte = from;
      }
      if (dateTo) {
        const to = new Date(dateTo as string);
        to.setHours(23, 59, 59, 999);
        createdAt.lte = to;
      }
      where.createdAt = createdAt;
    }

    if (paymentMethod !== 'ALL') {
      where.paymentMethod = paymentMethod;
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { orderNumber: 'asc' },
      select: {
        id: true,
        orderNumber: true,
        customerPhone: true,
        total: true,
        paymentMethod: true,
        createdAt: true,
      },
    });

    res.json({
      orders: orders.map((order) => ({
        ...order,
        total: order.total / 100,
      })),
      availablePaymentMethods: ['ALL', ...new Set(orders.map((order) => order.paymentMethod || 'ONLINE'))],
    });
  } catch (error) {
    console.error('Order report error:', error);
    res.status(500).json({ error: 'Kunde inte skapa utdrag' });
  }
});

// Admin: stats (scoped by restaurantId)
router.get('/stats', async (req, res) => {
  try {
    const { restaurantId } = req.query;
    const where: Record<string, unknown> = {};
    if (isSuperAdmin(req as AuthRequest)) {
      Object.assign(where, restaurantId ? { restaurantId: restaurantId as string } : {});
    } else {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      Object.assign(where, { restaurantId: rid });
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [totalOrders, ordersToday, pendingOrders, revenueToday] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.count({ where: { ...where, createdAt: { gte: startOfDay } } }),
      prisma.order.count({ where: { ...where, status: 'PENDING' } }),
      prisma.order.aggregate({
        where: { ...where, createdAt: { gte: startOfDay }, status: { notIn: ['CANCELLED', 'REJECTED'] } },
        _sum: { total: true },
      }),
    ]);

    res.json({
      totalOrders,
      ordersToday,
      pendingOrders,
      revenueToday: (revenueToday._sum.total || 0) / 100,
    });
  } catch (error) {
    res.status(500).json({ error: 'Serverfel vid statistik' });
  }
});

// Admin: stats/report (scoped by restaurantId)
router.get('/stats/report', async (req, res) => {
  try {
    const { restaurantId } = req.query;
    const where: Record<string, unknown> = {
      status: { notIn: ['CANCELLED', 'REJECTED'] },
    };
    if (isSuperAdmin(req as AuthRequest)) {
      Object.assign(where, restaurantId ? { restaurantId: restaurantId as string } : {});
    } else {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      Object.assign(where, { restaurantId: rid });
    }

    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [stats7, stats30] = await Promise.all([
      prisma.order.aggregate({
        where: { ...where, createdAt: { gte: last7Days } },
        _sum: { total: true },
        _count: true,
      }),
      prisma.order.aggregate({
        where: { ...where, createdAt: { gte: last30Days } },
        _sum: { total: true },
        _count: true,
      }),
    ]);

    res.json({
      last7: {
        revenue: (stats7._sum.total || 0) / 100,
        count: stats7._count,
      },
      last30: {
        revenue: (stats30._sum.total || 0) / 100,
        count: stats30._count,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Serverfel vid rapport' });
  }
});

// =====================
// KATEGORIER
// =====================

// GET /api/admin/categories
router.get('/categories', async (req, res) => {
  try {
    const { restaurantId } = req.query;
    const scopedRestaurantId = isSuperAdmin(req as AuthRequest)
      ? (restaurantId ? (restaurantId as string) : null)
      : requireRestaurantScope(req as AuthRequest, res);
    if (!isSuperAdmin(req as AuthRequest) && !scopedRestaurantId) return;

    const includeProducts = req.query.includeProducts === 'true';
    // includeGlobal=true  → always include categories with restaurantId=null
    // includeGlobal=auto  → include globals only if no restaurant-specific categories exist
    const includeGlobal = req.query.includeGlobal === 'true' || req.query.includeGlobal === '1';
    const includeGlobalAuto = req.query.includeGlobal === 'auto';

    const productInclude = includeProducts ? {
      products: {
        orderBy: { position: 'asc' as const },
        include: {
          extraGroups: {
            orderBy: { position: 'asc' as const },
            include: {
              extraGroup: {
                include: {
                  extras: { orderBy: { position: 'asc' as const } }
                }
              }
            }
          }
        }
      }
    } : {};

    const queryWhere = (withGlobal: boolean) => ({
      ...(scopedRestaurantId
        ? (withGlobal
            ? { OR: [{ restaurantId: scopedRestaurantId }, { restaurantId: null }] }
            : { restaurantId: scopedRestaurantId })
        : {}),
    });

    let categories = await prisma.category.findMany({
      where: queryWhere(includeGlobal),
      orderBy: { position: 'asc' },
      include: { 
        _count: { select: { products: true } },
        ...productInclude,
      },
    });

    // Auto-mode: Palmyra's menu was seeded with restaurantId=null (global).
    // If a restaurant admin has no own categories, fall back to global ones.
    if (includeGlobalAuto && scopedRestaurantId && categories.length === 0) {
      categories = await prisma.category.findMany({
        where: queryWhere(true),
        orderBy: { position: 'asc' },
        include: { 
          _count: { select: { products: true } },
          ...productInclude,
        },
      });
    }

    res.json(categories);
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/admin/categories
router.post('/categories', async (req, res) => {
  try {
    const { name, description, imageUrl, position, restaurantId } = req.body;
    const slug = name.toLowerCase().replace(/[^a-z0-9åäö]+/g, '-').replace(/^-|-$/g, '');
    const scopedRestaurantId = isSuperAdmin(req as AuthRequest)
      ? (restaurantId ? String(restaurantId) : null)
      : requireRestaurantScope(req as AuthRequest, res);
    if (!isSuperAdmin(req as AuthRequest) && !scopedRestaurantId) return;

    const category = await prisma.category.create({
      data: { 
        name, 
        slug: `${slug}-${Date.now()}`, 
        description, 
        imageUrl, 
        position: position || 0,
        restaurantId: scopedRestaurantId
      },
    });
    res.status(201).json(category);
  } catch (error: any) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: error.message || 'Serverfel' });
  }
});

// DELETE /api/admin/orders/:id - Ta bort en order permanent (Endast Super Admin)
router.delete('/orders/:id', async (req, res) => {
  try {
    if (!isSuperAdmin(req as AuthRequest)) {
      res.status(403).json({ error: 'Kräver super admin-behörighet' });
      return;
    }

    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) {
      res.status(404).json({ error: 'Order hittades inte' });
      return;
    }

    // Delete order items first (foreign key constraint)
    await prisma.orderItem.deleteMany({ where: { orderId: req.params.id } });
    await prisma.order.delete({ where: { id: req.params.id } });

    // Notifiera alla om att ordern är borta
    getIO().to('admin-room').emit('order:updated', { orderId: req.params.id });

    res.json({ success: true, message: 'Order raderad' });
  } catch (err) {
    console.error('Delete order error:', err);
    res.status(500).json({ error: 'Kunde inte radera order' });
  }
});

// PATCH /api/admin/categories/:id
router.patch('/categories/:id', async (req, res) => {
  try {
    if (!isSuperAdmin(req as AuthRequest)) {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      const existing = await prisma.category.findUnique({
        where: { id: req.params.id },
        select: { id: true, restaurantId: true },
      });
      if (!existing) {
        res.status(404).json({ error: 'Kategori hittades inte' });
        return;
      }
      if (existing.restaurantId !== rid) {
        res.status(403).json({ error: 'Du kan bara uppdatera kategorier för din restaurang' });
        return;
      }
    }

    const { name, description, imageUrl, position, isActive } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) {
      data.name = name;
    }
    if (description !== undefined) data.description = description;
    if (imageUrl !== undefined) data.imageUrl = imageUrl;
    if (position !== undefined) data.position = position;
    if (isActive !== undefined) data.isActive = isActive;

    const category = await prisma.category.update({
      where: { id: req.params.id },
      data,
    });
    res.json(category);
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// DELETE /api/admin/categories/:id
router.delete('/categories/:id', async (req, res) => {
  try {
    if (!isSuperAdmin(req as AuthRequest)) {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      const existing = await prisma.category.findUnique({
        where: { id: req.params.id },
        select: { id: true, restaurantId: true },
      });
      if (!existing) {
        res.status(404).json({ error: 'Kategori hittades inte' });
        return;
      }
      if (existing.restaurantId !== rid) {
        res.status(403).json({ error: 'Du kan bara radera kategorier för din restaurang' });
        return;
      }
    }

    await prisma.category.delete({
      where: { id: req.params.id },
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// =====================
// PRODUKTER
// =====================

const ProductSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().positive(),
  categoryId: z.string(),
  imageUrl: z.string().optional(),
  isActive: z.boolean().optional(),
  isVegan: z.boolean().optional(),
  isVegetarian: z.boolean().optional(),
  isGlutenFree: z.boolean().optional(),
  position: z.number().optional(),
  extraGroupIds: z.array(z.string()).optional(),
});

// GET /api/admin/products
router.get('/products', async (req, res) => {
  try {
    const { categoryId, restaurantId } = req.query;
    const scopedRestaurantId = isSuperAdmin(req as AuthRequest)
      ? (restaurantId ? (restaurantId as string) : null)
      : requireRestaurantScope(req as AuthRequest, res);
    if (!isSuperAdmin(req as AuthRequest) && !scopedRestaurantId) return;
    const includeGlobal = req.query.includeGlobal === 'true' || req.query.includeGlobal === '1';

    const products = await prisma.product.findMany({
      where: {
        ...(categoryId ? { categoryId: categoryId as string } : {}),
        category: {
          ...(scopedRestaurantId
            ? (includeGlobal
                ? { OR: [{ restaurantId: scopedRestaurantId }, { restaurantId: null }] }
                : { restaurantId: scopedRestaurantId })
            : {}),
        },
      },
      orderBy: [{ categoryId: 'asc' }, { position: 'asc' }],
      include: {
        category: { select: { name: true, restaurantId: true } },
        extraGroups: {
          include: {
            extraGroup: {
              include: { extras: { orderBy: { position: 'asc' } } },
            },
          },
        },
      },
    });

    res.json(products.map((p) => ({
      ...p,
      price: p.price / 100,
      extraGroups: p.extraGroups.map((peg) => ({
        id: peg.extraGroup.id,
        name: peg.extraGroup.name,
        type: peg.extraGroup.type,
        required: peg.extraGroup.required,
        extras: peg.extraGroup.extras.map((e) => ({
          ...e,
          priceAddon: e.priceAddon / 100,
        })),
      })),
    })));
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/admin/products
router.post('/products', async (req, res) => {
  try {
    const data = ProductSchema.parse(req.body);
    const slug = data.name.toLowerCase().replace(/[^a-z0-9åäö]+/g, '-').replace(/^-|-$/g, '');

    if (!isSuperAdmin(req as AuthRequest)) {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      const category = await prisma.category.findUnique({
        where: { id: data.categoryId },
        select: { id: true, restaurantId: true },
      });
      if (!category) {
        res.status(400).json({ error: 'Ogiltig kategori' });
        return;
      }
      if (category.restaurantId !== rid) {
        res.status(403).json({ error: 'Du kan bara skapa produkter i din restaurangs kategorier' });
        return;
      }
    }

    const product = await prisma.product.create({
      data: {
        name: data.name,
        slug: `${slug}-${Date.now()}`,
        description: data.description,
        price: Math.round(data.price * 100),
        categoryId: data.categoryId,
        imageUrl: data.imageUrl,
        isActive: data.isActive ?? true,
        isVegan: data.isVegan ?? false,
        isVegetarian: data.isVegetarian ?? false,
        isGlutenFree: data.isGlutenFree ?? false,
        position: data.position ?? 0,
        ...(data.extraGroupIds && data.extraGroupIds.length > 0 ? {
          extraGroups: {
            create: data.extraGroupIds.map((groupId, i) => ({
              extraGroupId: groupId,
              position: i,
            })),
          },
        } : {}),
      },
    });

    res.status(201).json({ ...product, price: product.price / 100 });
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// PATCH /api/admin/products/:id
router.patch('/products/:id', async (req, res) => {
  try {
    if (!isSuperAdmin(req as AuthRequest)) {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      const existing = await prisma.product.findUnique({
        where: { id: req.params.id },
        select: { id: true, category: { select: { restaurantId: true } } },
      });
      if (!existing) {
        res.status(404).json({ error: 'Produkt hittades inte' });
        return;
      }
      if (existing.category.restaurantId !== rid) {
        res.status(403).json({ error: 'Du kan bara uppdatera produkter för din restaurang' });
        return;
      }
    }

    const { extraGroupIds, price, ...rest } = req.body;
    const updateData: Record<string, unknown> = { ...rest };
    if (price !== undefined) updateData.price = Math.round(price * 100);

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        ...updateData,
        ...(extraGroupIds !== undefined ? {
          extraGroups: {
            deleteMany: {},
            create: (extraGroupIds as string[]).map((groupId, i) => ({
              extraGroupId: groupId,
              position: i,
            })),
          },
        } : {}),
      },
    });

    res.json({ ...product, price: product.price / 100 });
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// DELETE /api/admin/products/:id
router.delete('/products/:id', async (req, res) => {
  try {
    if (!isSuperAdmin(req as AuthRequest)) {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      const existing = await prisma.product.findUnique({
        where: { id: req.params.id },
        select: { id: true, category: { select: { restaurantId: true } } },
      });
      if (!existing) {
        res.status(404).json({ error: 'Produkt hittades inte' });
        return;
      }
      if (existing.category.restaurantId !== rid) {
        res.status(403).json({ error: 'Du kan bara radera produkter för din restaurang' });
        return;
      }
    }

    await prisma.product.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// =====================
// EXTRA GRUPPER (scoped by restaurantId)
// =====================

// GET /api/admin/extra-groups
router.get('/extra-groups', async (req, res) => {
  try {
    const { restaurantId } = req.query;
    const scopedRestaurantId = isSuperAdmin(req as AuthRequest)
      ? (restaurantId ? (restaurantId as string) : null)
      : requireRestaurantScope(req as AuthRequest, res);
    if (!isSuperAdmin(req as AuthRequest) && !scopedRestaurantId) return;

    const groups = await prisma.extraGroup.findMany({
      where: { 
        OR: [
          { restaurantId: scopedRestaurantId },
          { restaurantId: null }
        ]
      },
      include: {
        extras: { orderBy: { position: 'asc' } },
        _count: { select: { productGroups: true } },
      },
    });
    res.json(groups.map((g) => ({
      ...g,
      extras: g.extras.map((e) => ({ ...e, priceAddon: e.priceAddon / 100 })),
    })));
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/admin/extra-groups
router.post('/extra-groups', async (req, res) => {
  try {
    const { extras, restaurantId, categoryIds, ...rest } = req.body;
    const scopedRestaurantId = isSuperAdmin(req as AuthRequest)
      ? (restaurantId ? String(restaurantId) : null)
      : requireRestaurantScope(req as AuthRequest, res);
    if (!isSuperAdmin(req as AuthRequest) && !scopedRestaurantId) return;

    const group = await prisma.extraGroup.create({
      data: {
        ...rest,
        restaurantId: scopedRestaurantId,
        type: rest.type || 'CHECKBOX',
        ...(extras && extras.length > 0 ? {
          extras: {
            create: extras.map((e: any, i: number) => ({
              name: e.name,
              priceAddon: Math.round(Number(e.priceAddon || 0) * 100),
              isDefault: e.isDefault || false,
              position: i,
            })),
          },
        } : {}),
      },
      include: { extras: true },
    });

    // Optional bulk linking: attach this group to all products in the selected categories.
    if (Array.isArray(categoryIds) && categoryIds.length > 0) {
      const products = await prisma.product.findMany({
        where: { categoryId: { in: categoryIds } },
        select: { id: true },
      });

      if (products.length > 0) {
        await prisma.productExtraGroup.createMany({
          data: products.map((p) => ({
            productId: p.id,
            extraGroupId: group.id,
            position: 999,
          })),
          
        });
      }
    }

    res.status(201).json({
      ...group,
      extras: group.extras.map((e) => ({ ...e, priceAddon: e.priceAddon / 100 })),
    });
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// PATCH /api/admin/extra-groups/:id
router.patch('/extra-groups/:id', async (req, res) => {
  try {
    if (!isSuperAdmin(req as AuthRequest)) {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      const existing = await prisma.extraGroup.findUnique({
        where: { id: req.params.id },
        select: { id: true, restaurantId: true },
      });
      if (!existing) {
        res.status(404).json({ error: 'Tillbehörsgrupp hittades inte' });
        return;
      }
      if (existing.restaurantId !== rid) {
        res.status(403).json({ error: 'Du kan bara uppdatera tillbehörsgrupper för din restaurang' });
        return;
      }
    }

    const { extras, categoryIds, restaurantId: _ignoreRestaurantId, ...rest } = req.body;
    const group = await prisma.extraGroup.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(extras !== undefined ? {
          extras: {
            deleteMany: {},
            create: extras.map((e: any, i: number) => ({
              name: e.name,
              priceAddon: Math.round((e.priceAddon || 0) * 100),
              isDefault: e.isDefault || false,
              position: i,
            })),
          },
        } : {}),
      },
      include: { extras: true },
    });

    if (Array.isArray(categoryIds) && categoryIds.length > 0) {
      const products = await prisma.product.findMany({
        where: { categoryId: { in: categoryIds } },
        select: { id: true },
      });

      if (products.length > 0) {
        await prisma.productExtraGroup.createMany({
          data: products.map((p) => ({
            productId: p.id,
            extraGroupId: group.id,
            position: 999,
          })),
          
        });
      }
    }

    res.json({
      ...group,
      extras: group.extras.map((e) => ({ ...e, priceAddon: e.priceAddon / 100 })),
    });
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// DELETE /api/admin/extra-groups/:id
router.delete('/extra-groups/:id', async (req, res) => {
  try {
    if (!isSuperAdmin(req as AuthRequest)) {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      const existing = await prisma.extraGroup.findUnique({
        where: { id: req.params.id },
        select: { id: true, restaurantId: true },
      });
      if (!existing) {
        res.status(404).json({ error: 'Tillbehörsgrupp hittades inte' });
        return;
      }
      if (existing.restaurantId !== rid) {
        res.status(403).json({ error: 'Du kan bara radera tillbehörsgrupper för din restaurang' });
        return;
      }
    }

    await prisma.extraGroup.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// =====================
// ENSKILDA EXTRAS (tillbehör)
// =====================

// PATCH /api/admin/extras/:id — Togglea/uppdatera ett enskilt tillbehör (t.ex. isActive)
// Används av Flutter-appen för att markera enskilda tillbehör som slut.
router.patch('/extras/:id', async (req, res) => {
  try {
    // Verify ownership via the extra's group
    const existing = await prisma.extra.findUnique({
      where: { id: req.params.id },
      include: { extraGroup: { select: { id: true, restaurantId: true } } },
    });

    if (!existing) {
      res.status(404).json({ error: 'Tillbehör hittades inte' });
      return;
    }

    if (!isSuperAdmin(req as AuthRequest)) {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      // Allow if the group belongs to this restaurant OR is a global group (restaurantId=null)
      if (existing.extraGroup.restaurantId !== null && existing.extraGroup.restaurantId !== rid) {
        res.status(403).json({ error: 'Du kan bara uppdatera tillbehör för din restaurang' });
        return;
      }
    }

    const { isActive, name, priceAddon, isDefault, position } = req.body;
    const updateData: Record<string, unknown> = {};
    if (isActive !== undefined) updateData.isActive = isActive;
    if (name !== undefined) updateData.name = name;
    if (priceAddon !== undefined) updateData.priceAddon = Math.round(Number(priceAddon) * 100);
    if (isDefault !== undefined) updateData.isDefault = isDefault;
    if (position !== undefined) updateData.position = position;

    const extra = await prisma.extra.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json({ ...extra, priceAddon: extra.priceAddon / 100 });
  } catch (err) {
    console.error('Error updating extra:', err);
    res.status(500).json({ error: 'Serverfel' });
  }
});



const parseJsonArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
};

const formatDealForAdmin = (deal: any) => ({
  ...deal,
  dealType:
    deal.triggerType === 'COMBO'
      ? 'COMBO'
      : deal.triggerType === 'MIN_ORDER'
        ? 'MIN_ORDER'
        : deal.discountType === 'FIXED'
          ? 'FIXED'
          : 'PERCENTAGE',
  discountValue:
    deal.discountType === 'FIXED'
      ? normalizeMoneyToOre(Number(deal.discountValue || 0)) / 100
      : deal.discountValue,
  minOrder: normalizeMoneyToOre(Number(deal.minOrder || 0)) / 100,
  comboProductIds: parseDealProductIds(deal.comboProductIds),
  applicableRestaurantIds: parseJsonArray(deal.applicableRestaurantIds),
});

const normalizeDealInputForDb = (body: any) => {
  const next: Record<string, unknown> = { ...body };

  delete next.id;
  delete next.createdAt;
  delete next.updatedAt;
  delete next.dealType;
  delete next.restaurant;

  if (body.discountValue !== undefined) {
    const discountType = body.discountType;
    const discountValueRaw = Number(body.discountValue || 0);
    next.discountValue =
      discountType === 'FIXED' ? normalizeMoneyToOre(discountValueRaw) : Math.round(discountValueRaw);
  }

  if (body.minOrder !== undefined) {
    const minOrderRaw = Number(body.minOrder || 0);
    next.minOrder = normalizeMoneyToOre(minOrderRaw);
  }

  if (body.comboProductIds !== undefined) {
    next.comboProductIds =
      typeof body.comboProductIds === 'string'
        ? body.comboProductIds
        : JSON.stringify(body.comboProductIds || []);
  }

  if (body.applicableRestaurantIds !== undefined) {
    const applicableRestaurantIds =
      typeof body.applicableRestaurantIds === 'string'
        ? parseJsonArray(body.applicableRestaurantIds)
        : Array.isArray(body.applicableRestaurantIds)
          ? body.applicableRestaurantIds.filter((value: unknown): value is string => typeof value === 'string')
          : [];

    next.applicableRestaurantIds =
      typeof body.applicableRestaurantIds === 'string'
        ? body.applicableRestaurantIds
        : JSON.stringify(applicableRestaurantIds);

    if (body.restaurantId === undefined && body.isGlobal !== true) {
      next.restaurantId = applicableRestaurantIds.length === 1 ? applicableRestaurantIds[0] : null;
    }
  }

  if (body.restaurantId !== undefined) {
    next.restaurantId = body.restaurantId ? String(body.restaurantId) : null;
  }

  if (body.isGlobal !== undefined) {
    next.isGlobal = Boolean(body.isGlobal);
    if (body.isGlobal) {
      next.restaurantId = null;
      next.applicableRestaurantIds = JSON.stringify([]);
    }
  }

  if (body.validFrom !== undefined) {
    const validFrom =
      body.validFrom && typeof body.validFrom === 'string' ? new Date(body.validFrom) : body.validFrom;
    next.validFrom = validFrom instanceof Date && Number.isFinite(validFrom.getTime()) ? validFrom : null;
  }

  if (body.validUntil !== undefined) {
    const validUntil =
      body.validUntil && typeof body.validUntil === 'string' ? new Date(body.validUntil) : body.validUntil;
    next.validUntil = validUntil instanceof Date && Number.isFinite(validUntil.getTime()) ? validUntil : null;
  }

  return next;
};

// =====================
// DEALS & CUSTOMER DEALS
// =====================

router.get('/customer-deals', async (req, res) => {
  try {
    const { restaurantId } = req.query;
    const scopedRestaurantId = isSuperAdmin(req as AuthRequest)
      ? (restaurantId ? (restaurantId as string) : null)
      : requireRestaurantScope(req as AuthRequest, res);
    
    // Om restaurantId är satt kan vi filtrera personal deals baserat på restaurant info,
    // men för tillfället returnera alla (eller filtrerade).
    if (!isSuperAdmin(req as AuthRequest) && !scopedRestaurantId) return;

    const deals = await prisma.customerDeal.findMany({
      include: {
        user: { select: { name: true, phone: true } },
        campaign: { select: { title: true, discountType: true, discountValue: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(deals);
  } catch (error) {
    console.error('Error fetching customer deals:', error);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// PATCH /api/admin/customer-deals/:id — mark as used/unused or update
router.patch('/customer-deals/:id', authenticate, async (req, res) => {
  try {
    const { isUsed, maxUsages } = req.body;
    const updated = await prisma.customerDeal.update({
      where: { id: req.params.id },
      data: {
        ...(isUsed !== undefined ? { isUsed: Boolean(isUsed) } : {}),
        ...(maxUsages !== undefined ? { maxUsages: Number(maxUsages) } : {}),
      },
      include: {
        user: { select: { name: true, phone: true } },
        campaign: { select: { title: true, discountType: true, discountValue: true } },
      },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Kunde inte uppdatera deal' });
  }
});

// DELETE /api/admin/customer-deals/:id — delete a single personal deal
router.delete('/customer-deals/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    await prisma.customerDeal.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Kunde inte radera deal' });
  }
});

router.get('/deals', async (req, res) => {
  try {
    const { restaurantId } = req.query;
    const scopedRestaurantId = isSuperAdmin(req as AuthRequest)
      ? (restaurantId ? (restaurantId as string) : null)
      : requireRestaurantScope(req as AuthRequest, res);
    if (!isSuperAdmin(req as AuthRequest) && !scopedRestaurantId) return;

    const deals = await prisma.deal.findMany({
      where: scopedRestaurantId ? { restaurantId: scopedRestaurantId } as any : {},
      include: {
        restaurant: {
          select: { id: true, name: true, slug: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
    res.json(deals.map(formatDealForAdmin));
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

router.post('/deals', async (req, res) => {
  try {
    const { restaurantId, ...rest } = req.body;
    const scopedRestaurantId = isSuperAdmin(req as AuthRequest)
      ? (restaurantId ? String(restaurantId) : null)
      : requireRestaurantScope(req as AuthRequest, res);
    if (!isSuperAdmin(req as AuthRequest) && !scopedRestaurantId) return;

    const normalized = normalizeDealInputForDb(rest);
    const deal = await prisma.deal.create({
      data: {
        ...(normalized as any),
        ...(scopedRestaurantId ? { restaurant: { connect: { id: scopedRestaurantId } } } : {}),
      },
    });
    res.status(201).json(formatDealForAdmin(deal));
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

router.patch('/deals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { restaurantId, ...data } = req.body;
    
    if (!isSuperAdmin(req as AuthRequest)) {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      const existing = await prisma.deal.findUnique({ where: { id } });
      if (!existing || existing.restaurantId !== rid) {
        return res.status(403).json({ error: 'Ej behörig' });
      }
    }

    const deal = await prisma.deal.update({
      where: { id },
      data: normalizeDealInputForDb(data),
    });
    res.json(formatDealForAdmin(deal));
  } catch (error) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

router.delete('/deals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isSuperAdmin(req as AuthRequest)) {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      const existing = await prisma.deal.findUnique({ where: { id } });
      if (!existing || existing.restaurantId !== rid) {
        return res.status(403).json({ error: 'Ej behörig' });
      }
    }

    const existing = await prisma.deal.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      return res.status(404).json({ error: 'Dealen hittades inte' });
    }

    await prisma.deal.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete deal error:', error);
    res.status(500).json({ error: 'Serverfel' });
  }
});


// =====================
// SYSTEM HEALTH / MONITORING
// =====================
router.get('/system/health', async (req, res) => {
  try {
    if (!isSuperAdmin(req as AuthRequest)) {
      return res.status(403).json({ error: 'Behörighet saknas' });
    }

    // 1. DB Ping
    const startDb = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbPing = Date.now() - startDb;

    // 2. Memory Usage
    const memory = process.memoryUsage();
    
    // 3. Uptime
    const uptime = process.uptime();

    res.json({
      status: "ONLINE",
      uptime,
      dbPingMs: dbPing,
      memory: {
        rss: memory.rss,
        heapTotal: memory.heapTotal,
        heapUsed: memory.heapUsed,
      },
      timestamp: new Date(),
      alerts: [] // MOCK for driftstörningar
    });
  } catch (error) {
    res.status(500).json({ error: 'System Health Error', details: String(error) });
  }
});

// =====================
// MENYIMPORT
// =====================

router.post('/menu/import-eatsmart', async (req, res) => {
  try {
    if (!isSuperAdmin(req as AuthRequest)) {
      res.status(403).json({ error: 'Kräver super admin-behörighet' });
      return;
    }

    const restaurantId = req.body?.restaurantId as string | undefined;
    if (!restaurantId) {
      res.status(400).json({ error: 'restaurantId krävs' });
      return;
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, slug: true },
    });
    if (!restaurant) {
      res.status(404).json({ error: 'Restaurang hittades inte' });
      return;
    }

    console.log(`Starting EatSmart import for restaurant: ${restaurant.slug}`);

    const groups = await ensureCoreExtraGroups();
    
    // Fetch all existing categories for this restaurant to avoid duplicate slugs within restaurant
    const existingCategories = await prisma.category.findMany({
      where: { restaurantId: restaurant.id },
      select: { id: true, slug: true },
    });
    const categoryIdMap = new Map(existingCategories.map(c => [c.slug, c.id]));

    let createdCategories = 0;
    let updatedCategories = 0;
    let createdProducts = 0;
    let updatedProducts = 0;

    const importedCategorySlugs = new Set<string>();
    const importedProductSlugs = new Set<string>();

    for (const [categoryIndex, category] of eatsmartCatalog.entries()) {
      const categorySlug = `${slugify(category.name)}-${restaurant.slug}`;
      importedCategorySlugs.add(categorySlug);

      const savedCategory = await prisma.category.upsert({
        where: { slug: categorySlug },
        update: {
          name: category.name,
          description: category.description,
          imageUrl: category.imageUrl,
          position: categoryIndex,
          isActive: true,
          restaurantId: restaurant.id,
        },
        create: {
          name: category.name,
          slug: categorySlug,
          description: category.description,
          imageUrl: category.imageUrl,
          position: categoryIndex,
          isActive: true,
          restaurantId: restaurant.id,
        },
      });

      if (categoryIdMap.has(categorySlug)) {
        updatedCategories += 1;
      } else {
        createdCategories += 1;
      }

      for (const [productIndex, product] of category.products.entries()) {
        const productSlug = `${categorySlug}-${slugify(product.name)}`;
        importedProductSlugs.add(productSlug);

        const savedProduct = await prisma.product.upsert({
          where: { slug: productSlug },
          update: {
            name: product.name,
            description: product.description,
            price: product.price,
            categoryId: savedCategory.id,
            isActive: true,
            isVegan: product.isVegan ?? false,
            isVegetarian: product.isVegetarian ?? false,
            isGlutenFree: product.isGlutenFree ?? false,
            position: productIndex,
          },
          create: {
            name: product.name,
            slug: productSlug,
            description: product.description,
            price: product.price,
            categoryId: savedCategory.id,
            isActive: true,
            isVegan: product.isVegan ?? false,
            isVegetarian: product.isVegetarian ?? false,
            isGlutenFree: product.isGlutenFree ?? false,
            position: productIndex,
          },
        });

        if (productSlug.includes('pizza') || productSlug.includes('pizzor')) {
           // We might want to track updated products more accurately, but for now:
           updatedProducts++; // Rough estimate as we are upserting
        } else {
           createdProducts++; // Rough estimate
        }

        const groupIds = getGroupIdsForProduct(category.name, product, groups);
        
        // Link groups
        if (groupIds.length > 0) {
          await prisma.productExtraGroup.deleteMany({
            where: { productId: savedProduct.id },
          });
          await prisma.productExtraGroup.createMany({
            data: groupIds.map((groupId, index) => ({
              productId: savedProduct.id,
              extraGroupId: groupId,
              position: index,
            })),
          });
        }
      }
    }

    // summary from the catalog stats for the client
    const stats = getCatalogStats();

    res.json({
      success: true,
      summary: {
        categoryCount: stats.categoryCount,
        productCount: stats.productCount,
        createdCategories,
        updatedCategories,
        createdProducts: stats.productCount, // Simpler reporting
        updatedProducts: 0,
      },
    });
  } catch (error: any) {
    console.error('Menu import error:', error);
    res.status(500).json({ error: error.message || 'Kunde inte importera Eatsmart-menyn' });
  }
});

router.post('/menu/bulk-import', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      res.status(400).json({ error: 'Ingen text tillhandahållen' });
      return;
    }

    const lines = text.split('\n').filter((l: string) => l.trim().length > 0);
    const results = {
      created: 0,
      errors: 0,
    };

    for (const line of lines) {
      const parts = line.split(':').map((p) => p.trim());
      if (parts.length < 3) {
        results.errors += 1;
        continue;
      }

      const [categoryName, productName, priceStr, description = ''] = parts;
      const price = parseFloat(priceStr.replace(',', '.'));

      if (isNaN(price)) {
        results.errors += 1;
        continue;
      }

      const categorySlug = categoryName.toLowerCase().replace(/[^a-z0-9åäö]+/g, '-').replace(/^-|-$/g, '');
      const productSlugBase = productName.toLowerCase().replace(/[^a-z0-9åäö]+/g, '-').replace(/^-|-$/g, '');

      try {
        const category = await prisma.category.upsert({
          where: { slug: categorySlug },
          update: {},
          create: {
            name: categoryName,
            slug: categorySlug,
            position: 0,
          },
        });

        await prisma.product.create({
          data: {
            name: productName,
            slug: `${categorySlug}-${productSlugBase}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            description,
            price: Math.round(price * 100),
            categoryId: category.id,
            isActive: true,
          },
        });

        results.created += 1;
      } catch (err) {
        console.error('Bulk import error for line:', line, err);
        results.errors += 1;
      }
    }

    res.json({ success: true, ...results });
  } catch (error) {
    console.error('Bulk import fatal error:', error);
    res.status(500).json({ error: 'Internt serverfel vid import' });
  }
});

// =====================
// RABATTKODER
// =====================

router.get('/discounts', async (_req, res) => {
  try {
    const codes = await prisma.discountCode.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(codes.map((c: any) => ({
      id: c.id,
      code: c.code,
      discountType: c.type === 'FIXED' ? 'fixed' : 'percentage',
      discountValue: c.type === 'FIXED' ? c.value / 100 : c.value,
      minOrderAmount: c.minOrder,
      maxUses: c.maxUsages,
      usedCount: c.usageCount,
      startsAt: c.validFrom,
      expiresAt: c.validUntil,
      restaurantId: c.restaurantId,
      isActive: c.isActive,
      createdAt: c.createdAt,
    })));
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

router.post('/discounts', async (req, res) => {
  try {
    const { code, description, type, value, minOrder, maxUsages, validFrom, validUntil, restaurantId } = req.body;

    const discountData: any = {
      code: code.toUpperCase(),
      description,
      type: type || 'PERCENTAGE',
      value: type === 'FIXED' ? Math.round(value * 100) : value,
      minOrder: minOrder ? Math.round(minOrder * 100) : 0,
      maxUsages: maxUsages || null,
      validFrom: validFrom ? new Date(validFrom) : null,
      validUntil: validUntil ? new Date(validUntil) : null,
    };
    if (restaurantId) discountData.restaurantId = restaurantId;

    const discount = await prisma.discountCode.create({
      data: discountData,
    });
    res.status(201).json({
      ...discount,
      value: discount.type === 'FIXED' ? discount.value / 100 : discount.value,
    });
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2002') {
      res.status(400).json({ error: 'Rabattkod finns redan' });
      return;
    }
    res.status(500).json({ error: 'Serverfel' });
  }
});

router.patch('/discounts/:id', async (req, res) => {
  try {
    const { isActive, code, description, type, value, minOrder, maxUsages, validFrom, validUntil, restaurantId } = req.body;
    const updateData: any = {};
    if (isActive !== undefined) updateData.isActive = isActive;
    if (code) updateData.code = code.toUpperCase();
    if (description !== undefined) updateData.description = description;
    if (type) updateData.type = type;
    if (value !== undefined) updateData.value = type === 'FIXED' ? Math.round(value * 100) : value;
    if (minOrder !== undefined) updateData.minOrder = minOrder ? Math.round(minOrder * 100) : 0;
    if (maxUsages !== undefined) updateData.maxUsages = maxUsages || null;
    if (validFrom !== undefined) updateData.validFrom = validFrom ? new Date(validFrom) : null;
    if (validUntil !== undefined) updateData.validUntil = validUntil ? new Date(validUntil) : null;
    if (restaurantId !== undefined) updateData.restaurantId = restaurantId || null;

    const updated = await prisma.discountCode.update({
      where: { id: req.params.id },
      data: updateData,
    });
    res.json({
      ...updated,
      discountType: updated.type === 'FIXED' ? 'fixed' : 'percentage',
      discountValue: updated.type === 'FIXED' ? updated.value / 100 : updated.value,
      minOrderAmount: updated.minOrder,
      maxUses: updated.maxUsages,
      usedCount: updated.usageCount,
      startsAt: updated.validFrom,
      expiresAt: updated.validUntil,
    });
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

router.delete('/discounts/:id', async (req, res) => {
  try {
    await prisma.discountCode.delete({
      where: { id: req.params.id },
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// ─── Refunds (Super Admin) ──────────────────────────────────────────────────

router.post('/orders/:id/refund', async (req: any, res: any) => {
  try {
    const authReq = req as AuthRequest;
    if (!isSuperAdmin(authReq)) {
      return res.status(403).json({ error: 'Kräver super admin-behörighet' });
    }

    const { amount, reason } = req.body; // amount in kr
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) return res.status(404).json({ error: 'Order hittades inte' });
    if (!order.stripePaymentIntentId || order.stripePaymentIntentId === 'TEST_PAYMENT' || order.stripePaymentIntentId === 'FREE_PROMO') {
      return res.status(400).json({ error: 'Denna order har ingen Stripe-betalning att återbetala' });
    }
    if (order.refundedAt) {
      return res.status(400).json({ error: 'Denna order har redan återbetalats' });
    }

    const Stripe = require('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
    const refundAmountOre = amount ? Math.round(amount * 100) : order.total;
    
    await stripe.refunds.create({
      payment_intent: order.stripePaymentIntentId,
      amount: refundAmountOre,
      reason: 'requested_by_customer',
    });

    await prisma.order.update({
      where: { id: req.params.id },
      data: {
        refundAmount: refundAmountOre,
        refundReason: reason || 'Återbetalning via admin',
        refundedAt: new Date(),
        status: 'CANCELLED',
      }
    });

    res.json({ success: true, refundedAmount: refundAmountOre / 100 });
  } catch (error: any) {
    console.error('Refund error:', error);
    res.status(500).json({ error: error?.message || 'Kunde inte genomföra återbetalning' });
  }
});


// (Duplicate delete handler removed — primary handler is at line ~622)


// ─── Receipt Data (JSON for Flutter/Printers) ───────────────────────────────

router.get('/orders/:id/receipt-data', async (req: any, res: any) => {
  try {
    const order: any = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: { items: true, restaurant: true }
    });
    if (!order) return res.status(404).json({ error: 'Order hittades inte' });

    res.json({
      header: {
        restaurantName: order.restaurant?.name || 'MatGo',
        address: order.restaurant?.address || '',
        city: order.restaurant?.city || '',
        zip: order.restaurant?.zip || '',
        phone: order.restaurant?.phone || '',
      },
      orderInfo: {
        number: order.orderNumber,
        type: order.type,
        status: order.status,
        time: new Date(order.createdAt).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }),
        date: new Date(order.createdAt).toLocaleDateString('sv-SE'),
        estimatedTime: order.estimatedTime,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
      },
      customer: {
        name: order.customerName,
        phone: order.customerPhone,
        email: order.customerEmail,
        street: order.deliveryStreet,
        city: order.deliveryCity,
        zip: order.deliveryZip,
        instructions: order.deliveryInstructions,
        note: order.note,
      },
      items: order.items.map((item: any) => ({
        name: item.productName,
        qty: item.quantity,
        unitPrice: item.basePrice / 100,
        subtotal: item.subtotal / 100,
        extras: (typeof item.selectedExtras === 'string' ? JSON.parse(item.selectedExtras) : item.selectedExtras || [])
          .map((ex: any) => ({ name: ex.extraName || ex.name, price: ex.priceAddon || 0 })),
        note: item.note,
      })),
      totals: {
        subtotal: (order.total + order.discountAmount - order.deliveryFee) / 100,
        deliveryFee: order.deliveryFee / 100,
        discount: order.discountAmount / 100,
        discountCode: order.discountCode,
        dealTitle: order.appliedDealTitle,
        total: order.total / 100,
      },
      footer: 'Tack för din beställning! — MatGo',
    });
  } catch (error) {
    console.error('Receipt data error:', error);
    res.status(500).json({ error: 'Kunde inte hämta kvittodata' });
  }
});

// ─── Analytics Dashboard ────────────────────────────────────────────────────

router.get('/analytics', async (req: any, res: any) => {
  try {
    const authReq = req as AuthRequest;
    const restaurantId = isSuperAdmin(authReq) 
      ? (req.query.restaurantId as string || undefined)
      : authReq.admin?.restaurantId || undefined;

    const where: any = {};
    if (restaurantId) where.restaurantId = restaurantId;
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(todayStart);
    monthStart.setDate(monthStart.getDate() - 30);

    // Revenue & order counts
    const [todayStats, weekStats, monthStats, allTimeStats] = await Promise.all([
      prisma.order.aggregate({
        where: { ...where, createdAt: { gte: todayStart }, paymentStatus: 'PAID' },
        _sum: { total: true }, _count: { id: true }, _avg: { total: true }
      }),
      prisma.order.aggregate({
        where: { ...where, createdAt: { gte: weekStart }, paymentStatus: 'PAID' },
        _sum: { total: true }, _count: { id: true }, _avg: { total: true }
      }),
      prisma.order.aggregate({
        where: { ...where, createdAt: { gte: monthStart }, paymentStatus: 'PAID' },
        _sum: { total: true }, _count: { id: true }, _avg: { total: true }
      }),
      prisma.order.aggregate({
        where: { ...where, paymentStatus: 'PAID' },
        _sum: { total: true }, _count: { id: true }, _avg: { total: true }
      }),
    ]);

    // Top selling products (last 30 days)
    const topItems = await prisma.orderItem.groupBy({
      by: ['productName'],
      where: { order: { ...where, createdAt: { gte: monthStart }, paymentStatus: 'PAID' } },
      _sum: { quantity: true, subtotal: true },
      _count: { id: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10,
    });

    // Orders by hour (for heatmap) — last 7 days
    const recentOrders = await prisma.order.findMany({
      where: { ...where, createdAt: { gte: weekStart }, paymentStatus: 'PAID' },
      select: { createdAt: true },
    });
    const hourlyDistribution = Array(24).fill(0);
    recentOrders.forEach(o => { hourlyDistribution[new Date(o.createdAt).getHours()]++; });

    // Revenue per day (last 7 days)
    const dailyOrders = await prisma.order.findMany({
      where: { ...where, createdAt: { gte: weekStart }, paymentStatus: 'PAID' },
      select: { createdAt: true, total: true },
    });
    const dailyRevenue: Record<string, number> = {};
    dailyOrders.forEach(o => {
      const day = new Date(o.createdAt).toLocaleDateString('sv-SE');
      dailyRevenue[day] = (dailyRevenue[day] || 0) + o.total;
    });

    // Order type breakdown
    const typeBreakdown = await prisma.order.groupBy({
      by: ['type'],
      where: { ...where, createdAt: { gte: monthStart }, paymentStatus: 'PAID' },
      _count: { id: true },
    });

    // Recent reviews
    const recentReviews = await prisma.order.findMany({
      where: { ...where, rating: { not: null } },
      select: { id: true, orderNumber: true, customerName: true, rating: true, review: true, reviewedAt: true },
      orderBy: { reviewedAt: 'desc' },
      take: 10,
    });

    const fmt = (v: number | null) => ((v || 0) / 100);

    res.json({
      today: { revenue: fmt(todayStats._sum.total), orders: todayStats._count.id, avgOrder: fmt(todayStats._avg.total) },
      week: { revenue: fmt(weekStats._sum.total), orders: weekStats._count.id, avgOrder: fmt(weekStats._avg.total) },
      month: { revenue: fmt(monthStats._sum.total), orders: monthStats._count.id, avgOrder: fmt(monthStats._avg.total) },
      allTime: { revenue: fmt(allTimeStats._sum.total), orders: allTimeStats._count.id, avgOrder: fmt(allTimeStats._avg.total) },
      topProducts: topItems.map(p => ({
        name: p.productName,
        totalSold: p._sum.quantity || 0,
        revenue: ((p._sum.subtotal || 0) / 100),
        orders: p._count.id,
      })),
      hourlyDistribution,
      dailyRevenue: Object.entries(dailyRevenue).map(([date, total]) => ({ date, revenue: total / 100 })).sort((a, b) => a.date.localeCompare(b.date)),
      orderTypes: typeBreakdown.map(t => ({ type: t.type, count: t._count.id })),
      recentReviews,
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Kunde inte hämta statistik' });
  }
});

export default router;
