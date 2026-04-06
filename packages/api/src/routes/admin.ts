import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { io } from '../index';
import { eatsmartCatalog, getCatalogStats } from '../lib/eatsmartCatalog';
import { slugify } from '../lib/slug';
import { formatDealForClient, parseDealProductIds } from '../lib/deals';

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
    if (isSuperAdmin(req as AuthRequest)) {
      res.status(403).json({ error: 'SUPER_ADMIN kan inte ta emot/uppdatera beställningar' });
      return;
    }

    const { status, estimatedTime } = req.body;
    const validStatuses = ['ACCEPTED', 'PREPARING', 'READY', 'DELIVERING', 'DELIVERED', 'DELIVERY_FAILED', 'REJECTED', 'CANCELLED'];

    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: 'Ogiltig status' });
      return;
    }

    const adminRestaurantId = requireRestaurantScope(req as AuthRequest, res);
    if (!adminRestaurantId) return;

    const existing = await prisma.order.findUnique({
      where: { id: req.params.id },
      select: { id: true, restaurantId: true },
    });

    if (!existing) {
      res.status(404).json({ error: 'Order hittades inte' });
      return;
    }

    if (existing.restaurantId !== adminRestaurantId) {
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
    io.to(`order:${order.id}`).emit('order:status', {
      orderId: order.id,
      status: order.status,
      estimatedTime: order.estimatedTime,
    });

    // Notifiera admin-rummet
    io.to('admin-room').emit('order:updated', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      restaurantId: order.restaurantId,
    });
    if (order.restaurantId) {
      io.to(`admin-room:${order.restaurantId}`).emit('order:updated', {
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

// Admin: PATCH /api/admin/orders/:id - Update order details (Super Admin etc)
router.patch('/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { customerName, customerPhone, customerEmail, deliveryStreet, deliveryCity, deliveryZip, note, status, paymentMethod } = req.body;
    
    // Scoping check (already handled by common routes, but good to be explicit for Super Admin)
    const order = await prisma.order.update({
      where: { id },
      data: {
        customerName, customerPhone, customerEmail, deliveryStreet, deliveryCity, deliveryZip, note, status, paymentMethod
      },
    });

    const io = req.app.get('io');
    io.emit('order:updated', { id: order.id, status: order.status });
    if (order.restaurantId) {
      io.to(`admin-room:${order.restaurantId}`).emit('order:updated', { id: order.id });
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

    const categories = await prisma.category.findMany({
      where: { 
        OR: [
          { restaurantId: scopedRestaurantId },
          { restaurantId: null }
        ]
      },
      orderBy: { position: 'asc' },
      include: { _count: { select: { products: true } } },
    });
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
  } catch (error) {
    res.status(500).json({ error: 'Serverfel' });
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

    const products = await prisma.product.findMany({
      where: {
        ...(categoryId ? { categoryId: categoryId as string } : {}),
        category: {
          OR: [
            { restaurantId: scopedRestaurantId },
            { restaurantId: null }
          ]
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
// DEALS (scoped by restaurantId)
// =====================

router.get('/deals', async (req, res) => {
  try {
    const { restaurantId } = req.query;
    const scopedRestaurantId = isSuperAdmin(req as AuthRequest)
      ? (restaurantId ? (restaurantId as string) : null)
      : requireRestaurantScope(req as AuthRequest, res);
    if (!isSuperAdmin(req as AuthRequest) && !scopedRestaurantId) return;

    const deals = await prisma.deal.findMany({
      where: { restaurantId: scopedRestaurantId } as any,
      orderBy: { sortOrder: 'asc' },
    });
    res.json(deals);
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

    const deal = await prisma.deal.create({
      data: { ...rest, restaurantId: scopedRestaurantId },
    });
    res.status(201).json(deal);
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
      data
    });
    res.json(deal);
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

    await prisma.deal.delete({ where: { id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Serverfel' });
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

    const groups = await ensureCoreExtraGroups();
    const existingCategories = await prisma.category.findMany({
      select: { id: true, slug: true },
    });
    const existingProducts = await prisma.product.findMany({
      select: { id: true, slug: true },
    });

    const existingCategorySlugs = new Set(existingCategories.map((category) => category.slug));
    const existingProductSlugs = new Set(existingProducts.map((product) => product.slug));
    const importedCategorySlugs = new Set<string>();
    const importedProductSlugs = new Set<string>();

    let createdCategories = 0;
    let updatedCategories = 0;
    let createdProducts = 0;
    let updatedProducts = 0;

    for (const [categoryIndex, category] of eatsmartCatalog.entries()) {
      const categorySlug = slugify(category.name);
      importedCategorySlugs.add(categorySlug);

      const savedCategory = await prisma.category.upsert({
        where: { slug: categorySlug },
        update: {
          name: category.name,
          description: category.description,
          imageUrl: category.imageUrl,
          position: categoryIndex,
          isActive: true,
        },
        create: {
          name: category.name,
          slug: categorySlug,
          description: category.description,
          imageUrl: category.imageUrl,
          position: categoryIndex,
          isActive: true,
        },
      });

      if (existingCategorySlugs.has(categorySlug)) {
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
            imageUrl: null,
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
            imageUrl: null,
            isActive: true,
            isVegan: product.isVegan ?? false,
            isVegetarian: product.isVegetarian ?? false,
            isGlutenFree: product.isGlutenFree ?? false,
            position: productIndex,
          },
        });

        if (existingProductSlugs.has(productSlug)) {
          updatedProducts += 1;
        } else {
          createdProducts += 1;
        }

        const groupIds = getGroupIdsForProduct(category.name, product, groups);
        await prisma.productExtraGroup.deleteMany({
          where: { productId: savedProduct.id },
        });

        if (groupIds.length > 0) {
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

    await prisma.category.updateMany({
      where: { slug: { notIn: [...importedCategorySlugs] } },
      data: { isActive: false },
    });

    await prisma.product.updateMany({
      where: { slug: { notIn: [...importedProductSlugs] } },
      data: { isActive: false },
    });

    res.json({
      success: true,
      summary: {
        ...getCatalogStats(),
        createdCategories,
        updatedCategories,
        createdProducts,
        updatedProducts,
        deactivatedCategories: existingCategories.filter((category) => !importedCategorySlugs.has(category.slug)).length,
        deactivatedProducts: existingProducts.filter((product) => !importedProductSlugs.has(product.slug)).length,
      },
    });
  } catch (error) {
    console.error('Menu import error:', error);
    res.status(500).json({ error: 'Kunde inte importera Eatsmart-menyn' });
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
    res.json(codes.map((c) => ({ ...c, value: c.type === 'FIXED' ? c.value / 100 : c.value })));
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

router.post('/discounts', async (req, res) => {
  try {
    const { code, description, type, value, minOrder, maxUsages, validFrom, validUntil } = req.body;

    const discount = await prisma.discountCode.create({
      data: {
        code: code.toUpperCase(),
        description,
        type: type || 'PERCENTAGE',
        value: type === 'FIXED' ? Math.round(value * 100) : value,
        minOrder: minOrder ? Math.round(minOrder * 100) : 0,
        maxUsages: maxUsages || null,
        validFrom: validFrom ? new Date(validFrom) : null,
        validUntil: validUntil ? new Date(validUntil) : null,
      },
    });
    res.status(201).json(discount);
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
    const { isActive } = req.body;
    const updated = await prisma.discountCode.update({
      where: { id: req.params.id },
      data: { isActive },
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

export default router;
