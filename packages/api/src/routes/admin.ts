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

const kr = (amount: number) => Math.round(amount * 100);

const ensureExtraGroup = async ({
  name,
  description,
  type,
  required,
  minSelections,
  maxSelections,
  extras,
}: {
  name: string;
  description: string;
  type: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  extras: Array<{ name: string; priceAddon: number; isDefault?: boolean }>;
}) => {
  const existing = await prisma.extraGroup.findFirst({
    where: { name },
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
    const { status, limit = '50', offset = '0', date } = req.query;

    const where: Record<string, unknown> = {};
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
        items: {
          include: { product: { select: { name: true } } },
        },
      },
    });

    if (!order) {
      res.status(404).json({ error: 'Order hittades inte' });
      return;
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
    });
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// PATCH /api/admin/orders/:id/status
router.patch('/orders/:id/status', async (req, res) => {
  try {
    const { status, estimatedTime } = req.body;
    const validStatuses = ['ACCEPTED', 'PREPARING', 'READY', 'DELIVERING', 'DELIVERED', 'DELIVERY_FAILED', 'REJECTED', 'CANCELLED'];

    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: 'Ogiltig status' });
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
    });

    res.json({ success: true, status: order.status });
  } catch {
    res.status(500).json({ error: 'Kunde inte uppdatera status' });
  }
});

router.get('/reports/orders', async (req, res) => {
  try {
    const { dateFrom, dateTo, paymentMethod = 'ALL' } = req.query;
    const where: Record<string, unknown> = {
      status: { notIn: ['CANCELLED', 'REJECTED'] },
    };

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

// =====================
// KATEGORIER
// =====================

// GET /api/admin/categories
router.get('/categories', async (_req, res) => {
  try {
    const categories = await prisma.category.findMany({
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
    const { name, description, imageUrl, position } = req.body;
    const slug = name.toLowerCase().replace(/[^a-z0-9åäö]+/g, '-').replace(/^-|-$/g, '');

    const category = await prisma.category.create({
      data: { name, slug, description, imageUrl, position: position || 0 },
    });
    res.status(201).json(category);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2002') {
      res.status(400).json({ error: 'Kategorinamn finns redan' });
      return;
    }
    res.status(500).json({ error: 'Serverfel' });
  }
});

// PATCH /api/admin/categories/:id
router.patch('/categories/:id', async (req, res) => {
  try {
    const { name, description, imageUrl, position, isActive } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) {
      data.name = name;
      data.slug = name.toLowerCase().replace(/[^a-z0-9åäö]+/g, '-').replace(/^-|-$/g, '');
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
    const categoryId = req.params.id;
    
    // Check if category has products
    const productCount = await prisma.product.count({
      where: { categoryId }
    });
    
    if (productCount > 0) {
      res.status(400).json({ error: 'Kategorin är inte tom. Ta bort eller flytta alla produkter först.' });
      return;
    }

    await prisma.category.delete({
      where: { id: categoryId },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Kunde inte radera kategorin' });
  }
});

// =====================
// PRODUKTER
// =====================

const ProductSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.number().positive(), // i kr (konverteras till ören)
  categoryId: z.string(),
  imageUrl: z.string().optional(),
  isActive: z.boolean().optional(),
  isVegan: z.boolean().optional(),
  isVegetarian: z.boolean().optional(),
  isGlutenFree: z.boolean().optional(),
  position: z.number().optional(),
  extraGroupIds: z.array(z.string()).optional(), // vilka extra-grupper som ska kopplas
});

// GET /api/admin/products
router.get('/products', async (req, res) => {
  try {
    const { categoryId } = req.query;
    const products = await prisma.product.findMany({
      where: categoryId ? { categoryId: categoryId as string } : {},
      orderBy: [{ categoryId: 'asc' }, { position: 'asc' }],
      include: {
        category: { select: { name: true } },
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
      include: { extraGroups: { include: { extraGroup: true } } },
    });

    res.status(201).json({ ...product, price: product.price / 100 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Ogiltig data', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Serverfel' });
  }
});

// PATCH /api/admin/products/:id
router.patch('/products/:id', async (req, res) => {
  try {
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
      include: {
        extraGroups: {
          include: { extraGroup: { include: { extras: true } } },
        },
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
    await prisma.product.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// =====================
// EXTRA GRUPPER
// =====================

// GET /api/admin/extra-groups
router.get('/extra-groups', async (_req, res) => {
  try {
    const groups = await prisma.extraGroup.findMany({
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
    const { name, description, type, required, minSelections, maxSelections, extras } = req.body;

    const group = await prisma.extraGroup.create({
      data: {
        name,
        description,
        type: type || 'CHECKBOX',
        required: required || false,
        minSelections: minSelections || 0,
        maxSelections: maxSelections || 99,
        ...(extras && extras.length > 0 ? {
          extras: {
            create: extras.map((e: { name: string; priceAddon: number; isDefault: boolean }, i: number) => ({
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
    const { extras, ...rest } = req.body;

    const group = await prisma.extraGroup.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(extras !== undefined ? {
          extras: {
            deleteMany: {},
            create: extras.map((e: { name: string; priceAddon: number; isDefault: boolean }, i: number) => ({
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
    await prisma.extraGroup.delete({
      where: { id: req.params.id },
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// =====================
// MENYIMPORT
// =====================

router.post('/menu/import-eatsmart', async (_req, res) => {
  try {
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
// STATISTIK
// =====================

router.get('/stats', async (_req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      ordersToday,
      totalOrders,
      revenueToday,
      pendingOrders,
    ] = await Promise.all([
      prisma.order.count({ where: { createdAt: { gte: today } } }),
      prisma.order.count({ where: { status: { not: 'CANCELLED' } } }),
      prisma.order.aggregate({
        where: { createdAt: { gte: today }, status: { notIn: ['CANCELLED', 'REJECTED'] } },
        _sum: { total: true },
      }),
      prisma.order.count({ where: { status: 'PENDING' } }),
    ]);

    res.json({
      ordersToday,
      totalOrders,
      revenueToday: (revenueToday._sum.total || 0) / 100,
      pendingOrders,
    });
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// GET /api/admin/stats/report
router.get('/stats/report', async (_req, res) => {
  try {
    const now = new Date();
    const last7 = new Date(now);
    last7.setDate(now.getDate() - 7);
    const last30 = new Date(now);
    last30.setDate(now.getDate() - 30);

    const [stats7, stats30] = await Promise.all([
      prisma.order.aggregate({
        where: { createdAt: { gte: last7 }, status: { notIn: ['CANCELLED', 'REJECTED'] } },
        _sum: { total: true },
        _count: { id: true },
      }),
      prisma.order.aggregate({
        where: { createdAt: { gte: last30 }, status: { notIn: ['CANCELLED', 'REJECTED'] } },
        _sum: { total: true },
        _count: { id: true },
      }),
    ]);

    res.json({
      last7: {
        revenue: (stats7._sum.total || 0) / 100,
        count: stats7._count.id,
      },
      last30: {
        revenue: (stats30._sum.total || 0) / 100,
        count: stats30._count.id,
      },
    });
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// =====================
// DEALS
// =====================

const DealPayloadSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().max(500).optional().nullable(),
  badgeText: z.string().max(60).optional().nullable(),
  triggerType: z.enum(['NONE', 'MIN_ORDER', 'COMBO']).default('NONE'),
  discountType: z.enum(['PERCENTAGE', 'FIXED']).default('PERCENTAGE'),
  discountValue: z.number().min(1),
  minOrder: z.number().min(0).optional().default(0),
  comboProductIds: z.array(z.string()).optional().default([]),
  isActive: z.boolean().optional().default(true),
  showOnSite: z.boolean().optional().default(true),
  popupEnabled: z.boolean().optional().default(true),
  maxUsages: z.number().int().positive().nullable().optional(),
  maxUsesPerCustomer: z.number().int().positive().nullable().optional(),
  validFrom: z.string().nullable().optional(),
  validUntil: z.string().nullable().optional(),
  sortOrder: z.number().int().min(0).optional().default(0),
});

const serializeDealPayload = (payload: z.infer<typeof DealPayloadSchema>) => ({
  title: payload.title.trim(),
  description: payload.description?.trim() || null,
  badgeText: payload.badgeText?.trim() || null,
  triggerType: payload.triggerType,
  discountType: payload.discountType,
  discountValue: payload.discountType === 'FIXED'
    ? Math.round(payload.discountValue * 100)
    : Math.round(payload.discountValue),
  minOrder: Math.round((payload.minOrder || 0) * 100),
  comboProductIds: JSON.stringify(payload.comboProductIds || []),
  isActive: payload.isActive ?? true,
  showOnSite: payload.showOnSite ?? true,
  popupEnabled: payload.popupEnabled ?? true,
  maxUsages: payload.maxUsages ?? null,
  maxUsesPerCustomer: payload.maxUsesPerCustomer ?? null,
  validFrom: payload.validFrom ? new Date(payload.validFrom) : null,
  validUntil: payload.validUntil ? new Date(payload.validUntil) : null,
  sortOrder: payload.sortOrder ?? 0,
});

router.get('/deals', async (_req, res) => {
  try {
    const deals = await prisma.deal.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

    const comboProductIds = [...new Set(deals.flatMap((deal) => parseDealProductIds(deal.comboProductIds)))];
    const products = comboProductIds.length
      ? await prisma.product.findMany({
          where: { id: { in: comboProductIds } },
          select: { id: true, name: true },
        })
      : [];

    const productNameMap = new Map(products.map((product) => [product.id, product.name]));

    res.json(
      deals.map((deal) =>
        formatDealForClient(deal, {
          comboProductNames: parseDealProductIds(deal.comboProductIds).map((productId) => productNameMap.get(productId) || 'Valfri vara'),
        }),
      ),
    );
  } catch (error) {
    console.error('Admin deals error:', error);
    res.status(500).json({ error: 'Serverfel' });
  }
});

router.post('/deals', async (req, res) => {
  try {
    const parsed = DealPayloadSchema.parse(req.body);
    if (parsed.triggerType === 'COMBO' && (!parsed.comboProductIds || parsed.comboProductIds.length === 0)) {
      res.status(400).json({ error: 'Välj minst en produkt till combo-dealen' });
      return;
    }

    const deal = await prisma.deal.create({
      data: serializeDealPayload(parsed),
    });

    res.status(201).json(formatDealForClient(deal));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Ogiltig deal-data', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Serverfel' });
  }
});

router.patch('/deals/:id', async (req, res) => {
  try {
    const parsed = DealPayloadSchema.partial().parse(req.body);
    const existing = await prisma.deal.findUnique({ where: { id: req.params.id } });

    if (!existing) {
      res.status(404).json({ error: 'Dealen hittades inte' });
      return;
    }

    const merged = {
      title: parsed.title ?? existing.title,
      description: parsed.description ?? existing.description,
      badgeText: parsed.badgeText ?? existing.badgeText,
      triggerType: parsed.triggerType ?? existing.triggerType,
      discountType: parsed.discountType ?? existing.discountType,
      discountValue: parsed.discountValue ?? (existing.discountType === 'FIXED' ? existing.discountValue / 100 : existing.discountValue),
      minOrder: parsed.minOrder ?? existing.minOrder / 100,
      comboProductIds: parsed.comboProductIds ?? parseDealProductIds(existing.comboProductIds),
      isActive: parsed.isActive ?? existing.isActive,
      showOnSite: parsed.showOnSite ?? existing.showOnSite,
      popupEnabled: parsed.popupEnabled ?? existing.popupEnabled,
      maxUsages: parsed.maxUsages ?? existing.maxUsages,
      maxUsesPerCustomer: parsed.maxUsesPerCustomer ?? existing.maxUsesPerCustomer,
      validFrom: parsed.validFrom ?? existing.validFrom?.toISOString() ?? null,
      validUntil: parsed.validUntil ?? existing.validUntil?.toISOString() ?? null,
      sortOrder: parsed.sortOrder ?? existing.sortOrder,
    };

    if (merged.triggerType === 'COMBO' && merged.comboProductIds.length === 0) {
      res.status(400).json({ error: 'Välj minst en produkt till combo-dealen' });
      return;
    }

    const updated = await prisma.deal.update({
      where: { id: req.params.id },
      data: serializeDealPayload(DealPayloadSchema.parse(merged)),
    });

    res.json(formatDealForClient(updated));
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Ogiltig deal-data', details: error.errors });
      return;
    }
    res.status(500).json({ error: 'Serverfel' });
  }
});

router.delete('/deals/:id', async (req, res) => {
  try {
    await prisma.deal.delete({
      where: { id: req.params.id },
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Serverfel' });
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
