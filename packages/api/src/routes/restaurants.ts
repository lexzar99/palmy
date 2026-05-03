import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { slugify } from '../lib/slug';
import { authenticate, AuthRequest, resolveAdminSessionFromToken } from '../middleware/auth';
import { getIO } from '../lib/socket';
import { isRestaurantOpen } from '../lib/openingHours';
import { normalizeDeliveryZones, normalizeMoneyToOre } from '../utils/deliveryZones';

const router = Router();

const kr = (amount: number) => Math.round(amount * 100);
const fromOre = (amount?: number | null) => (amount ?? 0) / 100;
const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  try {
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
};

const safeParseAnyJson = <T>(value: unknown, fallback: T): T => {
  if (typeof value === 'string') return parseJson<T>(value, fallback);
  return (value as T) ?? fallback;
};

const restaurantSchema = z.object({
  name: z.string().min(2),
  slug: z.string().optional(),
  // Some clients send null for optional text fields (e.g. when DB value is null).
  description: z.string().nullable().optional(),
  cuisine: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  zip: z.string().optional(),
  phone: z.string().optional(),
  adminEmail: z.string().optional(),
  imageUrl: z.string().nullable().optional(),
  heroImageUrl: z.string().nullable().optional(),
  deliveryFee: z.any().optional(),
  minOrderAmount: z.any().optional(),
  etaMinutes: z.any().optional(),
  tags: z.any().optional(),
  featuredClass: z.any().optional(),
  isOpen: z.boolean().optional(),
  rating: z.any().optional(),
  ratingCount: z.any().optional(),
  openingHours: z.any().optional(),
  adminPassword: z.string().optional(),
  internalInfo: z.string().nullable().optional(),
  latitude: z.any().optional(),
  longitude: z.any().optional(),
  deliveryZones: z.any().optional(),
  freeDeliveryAbove: z.any().optional(),
  deliveryRadius: z.number().optional(),
  logoutCode: z.string().nullable().optional(),
});

const formatRestaurant = (restaurant: any, includeMenu = false) => {
  const activeOrdersCount = (restaurant.orders || []).length;
  const dynamicEta = restaurant.etaMinutes ?? 35;
  // Previously we added +10/20 min based on load, but this confused the admin.
  // Letting the base value be the source of truth.

  return {
    id: restaurant.id,
    name: restaurant.name,
    slug: restaurant.slug,
    description: restaurant.description,
    cuisine: restaurant.cuisine,
    address: restaurant.address,
    city: restaurant.city,
    zip: restaurant.zip,
    phone: restaurant.phone,
    imageUrl: restaurant.imageUrl,
    heroImageUrl: restaurant.heroImageUrl,
    rating: restaurant.rating ?? 4.6,
    ratingCount: restaurant.ratingCount ?? 0,
    deliveryFee: fromOre(restaurant.deliveryFee),
    minOrderAmount: fromOre(restaurant.minOrderAmount),
    etaMinutes: dynamicEta,
    baseEtaMinutes: restaurant.etaMinutes ?? 35, // raw stored value, without dynamic adjustment
    activeOrdersCount,
  isOpen: (() => {
    try {
      return restaurant.isOpen && isRestaurantOpen(restaurant.openingHours);
    } catch (e) {
      console.error('Error calculating isOpen:', e);
      return restaurant.isOpen; // Fallback to manual status
    }
  })(),
  manualIsOpen: restaurant.isOpen,
  featuredClass: restaurant.featuredClass ?? 3,
  tags: parseJson<string[]>(restaurant.tags, []),
  openingHours: parseJson<Record<string, any>>(restaurant.openingHours, {}),
  internalInfo: restaurant.internalInfo,
  createdAt: restaurant.createdAt,
  updatedAt: restaurant.updatedAt,
  deliveryRadius: restaurant.deliveryRadius ?? 5.0,
  deliveryZones: parseJson<any[]>(restaurant.deliveryZones, []),
  menu: includeMenu
    ? (restaurant.categories || []).map((cat: any) => ({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        position: cat.position,
        items: (cat.products || []).map((prod: any) => ({
          id: prod.id,
          name: prod.name,
          description: prod.description,
          price: fromOre(prod.price),
          imageUrl: prod.imageUrl,
          isVegan: prod.isVegan,
          isVegetarian: prod.isVegetarian,
          isGlutenFree: prod.isGlutenFree,
          extraGroups: (prod.extraGroups || []).map((peg: any) => ({
            id: peg.extraGroup.id,
            name: peg.extraGroup.name,
            type: peg.extraGroup.type,
            required: peg.extraGroup.required,
            minSelections: peg.extraGroup.minSelections,
            maxSelections: peg.extraGroup.maxSelections,
            extras: (peg.extraGroup.extras || []).map((e: any) => ({
              id: e.id,
              name: e.name,
              priceAddon: fromOre(e.priceAddon),
              isDefault: e.isDefault,
            })),
          })),
        })),
      }))
    : undefined,
  };
};

// Seed data
router.post('/seed', authenticate, async (req: AuthRequest, res) => {
  try {
    if (req.admin?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Endast superior admin kan seeda' });
    }

    // Palmyra (huvudrestaurang)
    await prisma.restaurant.upsert({
      where: { slug: 'palmyra' },
      update: {},
      create: {
        name: 'Palmyra Pizzeria',
        slug: 'palmyra',
        description: 'Lunds klassiker med pizza, kebab och rullar.',
        cuisine: 'Pizza & Kebab',
        address: 'Västra Mårtensgatan 10',
        city: 'Lund',
        zip: '223 51',
        phone: '046-120 612',
        imageUrl: '/hero.png',
        heroImageUrl: '/hero-palmyra.svg',
        deliveryFee: kr(39),
        minOrderAmount: kr(150),
        etaMinutes: 32,
        featuredClass: 1,
        tags: JSON.stringify(['Pizza', 'Kebab', 'Rullar']),
      },
    });

    await prisma.restaurant.upsert({
      where: { slug: 'sushi-nori' },
      update: {},
      create: {
        name: 'Sushi Lounge',
        slug: 'sushi-nori',
        description: 'Poké bowls, nigiri och varma rullar.',
        cuisine: 'Sushi',
        city: 'Lund',
        imageUrl: '/burger_new.jpg',
        heroImageUrl: '/hero.png',
        deliveryFee: kr(29),
        minOrderAmount: kr(150),
        etaMinutes: 28,
        rating: 4.8,
        ratingCount: 230,
        featuredClass: 1,
        tags: JSON.stringify(['Sushi', 'Poké', 'Japanskt']),
      },
    });

    await prisma.restaurant.upsert({
      where: { slug: 'kebabino' },
      update: {},
      create: {
        name: 'Kebab House',
        slug: 'kebabino',
        description: 'Durum, tallrikar och halal kebab.',
        cuisine: 'Kebab',
        city: 'Lund',
        imageUrl: '/kebab_new.png',
        heroImageUrl: '/hero.png',
        deliveryFee: kr(25),
        minOrderAmount: kr(140),
        etaMinutes: 24,
        rating: 4.5,
        ratingCount: 180,
        featuredClass: 2,
        tags: JSON.stringify(['Kebab', 'Halal', 'Durum']),
      },
    });

    res.json({ success: true, message: 'Restauranger seedade' });
  } catch (err: any) {
    console.error('Seed error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Public: list restaurants
router.get('/', async (req, res) => {
  try {
    const { withMenu, city } = req.query;
    const restaurants = await prisma.restaurant.findMany({
      where: city ? { city: city as string } : {},
      include: {
        ...(withMenu === '1' ? {
          categories: {
            orderBy: { position: 'asc' },
            include: {
              products: {
                where: { isActive: true },
                orderBy: { position: 'asc' },
                include: {
                  extraGroups: {
                    include: { extraGroup: { include: { extras: { orderBy: { position: 'asc' } } } } }
                  }
                }
              }
            }
          }
        } : {}),
        orders: {
          where: { status: { in: ['PENDING', 'ACCEPTED', 'COOKING', 'DELIVERING'] } },
          select: { id: true }
        }
      },
      orderBy: { featuredClass: 'asc' },
    });

    res.json(restaurants.map(r => formatRestaurant(r, withMenu === '1')));
  } catch (err) {
    res.status(500).json({ error: 'Kunde inte hämta restauranger' });
  }
});

router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    if (req.admin?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Kräver super admin-behörighet' });
      return;
    }

    const payload = restaurantSchema.parse(req.body);
    const slug = slugify(payload.slug || payload.name);
    const data: any = {
      name: payload.name,
      slug: slug,
      description: payload.description,
      cuisine: payload.cuisine,
      address: payload.address,
      city: payload.city,
      zip: payload.zip,
      phone: payload.phone,
      adminEmail: payload.adminEmail?.trim().toLowerCase() || undefined,
      imageUrl: payload.imageUrl,
      heroImageUrl: payload.heroImageUrl,
      etaMinutes: payload.etaMinutes !== undefined ? Number(payload.etaMinutes) : undefined,
      featuredClass: payload.featuredClass !== undefined ? Number(payload.featuredClass) : undefined,
      isOpen: payload.isOpen,
      rating: payload.rating !== undefined ? Number(payload.rating) : undefined,
      ratingCount: payload.ratingCount !== undefined ? Number(payload.ratingCount) : undefined,
      deliveryFee: kr(Number(payload.deliveryFee ?? 0)),
      minOrderAmount: kr(Number(payload.minOrderAmount ?? 0)),
      tags: JSON.stringify(payload.tags ?? []),
      openingHours: JSON.stringify(payload.openingHours ?? {}),
      internalInfo: payload.internalInfo,
    };
    if (payload.latitude !== undefined) data.latitude = payload.latitude === null ? null : Number(payload.latitude);
    if (payload.longitude !== undefined) data.longitude = payload.longitude === null ? null : Number(payload.longitude);
    if (payload.freeDeliveryAbove !== undefined) data.freeDeliveryAbove = normalizeMoneyToOre(Number(payload.freeDeliveryAbove || 0));
    if (payload.deliveryZones !== undefined) {
      const zonesRaw = safeParseAnyJson<any[]>(payload.deliveryZones, []);
      data.deliveryZones = JSON.stringify(normalizeDeliveryZones(zonesRaw));
    }

    const restaurant = await prisma.restaurant.create({
      data: {
        ...data,
      },
    });

    // Create admin user for the new restaurant if password provided
    let adminCreated = false;
    if (payload.adminPassword && payload.adminPassword.trim().length > 0) {
      try {
        const hashedPassword = await bcrypt.hash(payload.adminPassword.trim(), 10);
        const adminEmail = (restaurant.adminEmail || restaurant.slug).toLowerCase();
        
        const adminUser = await prisma.adminUser.upsert({
          where: { email: adminEmail },
          update: { password: hashedPassword, isActive: true, name: `${restaurant.name} Admin` },
          create: {
            email: adminEmail,
            password: hashedPassword,
            name: `${restaurant.name} Admin`,
            role: 'ADMIN',
            isActive: true,
          },
        });
        adminCreated = true;
        console.log(`✅ Admin account created/updated for restaurant "${restaurant.name}" (login: ${adminEmail}, id: ${adminUser.id})`);
      } catch (adminErr: any) {
        console.error(`❌ Failed to create admin account for restaurant "${restaurant.name}":`, adminErr.message);
      }
    } else {
      console.warn(`⚠️  Restaurant "${restaurant.name}" created WITHOUT an admin password. No login account was created.`);
    }

    res.status(201).json({ ...restaurant, adminCreated });
  } catch (err: any) {
    console.error('[restaurants POST] Error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const { id: paramId } = req.params;
    
    // Find the ACTUAL restaurant first to support slug OR id in the URL
    const existingRestaurant = await prisma.restaurant.findFirst({
      where: {
        OR: [
          { id: paramId },
          { slug: paramId }
        ]
      }
    });

    if (!existingRestaurant) {
      return res.status(404).json({ error: 'Restaurang hittades inte' });
    }

    const id = existingRestaurant.id;

    if (req.admin?.role !== 'SUPER_ADMIN') {
      const rid = req.admin?.restaurantId;
      if (!rid || rid !== id) {
        res.status(403).json({ error: 'Du kan bara uppdatera din egen restaurang' });
        return;
      }
    }

    const payload = restaurantSchema.partial().parse(req.body);
    
    // Build update payload explicitly to avoid accidentally passing unsupported keys.
    const data: any = {};
    if (payload.name !== undefined) data.name = payload.name;
    if (payload.slug !== undefined) data.slug = slugify(payload.slug);
    if (payload.description !== undefined) data.description = payload.description;
    if (payload.cuisine !== undefined) data.cuisine = payload.cuisine;
    if (payload.address !== undefined) data.address = payload.address;
    if (payload.city !== undefined) data.city = payload.city;
    if (payload.zip !== undefined) data.zip = payload.zip;
    if (payload.phone !== undefined) data.phone = payload.phone;
    if (payload.adminEmail !== undefined) data.adminEmail = payload.adminEmail ? payload.adminEmail.trim().toLowerCase() : null;
    
    // Pictures
    if (payload.imageUrl !== undefined) data.imageUrl = payload.imageUrl;
    if (payload.heroImageUrl !== undefined) data.heroImageUrl = payload.heroImageUrl;
    
    // Numbers - with safety against NaN
    const toSafeNum = (v: any) => {
      const n = Number(v);
      return isNaN(n) ? undefined : n;
    };

    if (payload.etaMinutes !== undefined) data.etaMinutes = toSafeNum(payload.etaMinutes);
    if (payload.featuredClass !== undefined) data.featuredClass = toSafeNum(payload.featuredClass);
    if (payload.isOpen !== undefined) data.isOpen = payload.isOpen;
    if (payload.rating !== undefined) data.rating = toSafeNum(payload.rating);
    if (payload.ratingCount !== undefined) data.ratingCount = toSafeNum(payload.ratingCount);
    
    if (payload.deliveryFee !== undefined) data.deliveryFee = kr(toSafeNum(payload.deliveryFee) ?? 0);
    if (payload.minOrderAmount !== undefined) data.minOrderAmount = kr(toSafeNum(payload.minOrderAmount) ?? 0);
    
    // JSON fields - ensure they aren't double-stringified
    const safeStringify = (val: any) => {
      if (typeof val === 'string') return val;
      return JSON.stringify(val ?? {});
    };

    if (payload.tags !== undefined) data.tags = safeStringify(payload.tags);
    if (payload.openingHours !== undefined) data.openingHours = safeStringify(payload.openingHours);
    if (payload.internalInfo !== undefined) data.internalInfo = payload.internalInfo;
    
    if (payload.latitude !== undefined) data.latitude = payload.latitude === null ? null : toSafeNum(payload.latitude);
    if (payload.longitude !== undefined) data.longitude = payload.longitude === null ? null : toSafeNum(payload.longitude);
    if (payload.deliveryRadius !== undefined) data.deliveryRadius = toSafeNum(payload.deliveryRadius);
    
    if (payload.freeDeliveryAbove !== undefined) {
      data.freeDeliveryAbove = normalizeMoneyToOre(toSafeNum(payload.freeDeliveryAbove) ?? 0);
    }

    if (payload.logoutCode !== undefined) data.logoutCode = payload.logoutCode || null;

    if (payload.deliveryZones !== undefined) {
      const zonesRaw = safeParseAnyJson<any[]>(payload.deliveryZones, []);
      data.deliveryZones = JSON.stringify(normalizeDeliveryZones(zonesRaw));
    }

    // KEY FIX: When opening hours change, compute the correct isOpen immediately
    // and include it in the SAME DB write (one atomic operation, no race conditions).
    if (payload.openingHours !== undefined) {
      const newHoursStr = data.openingHours as string;
      data.isOpen = isRestaurantOpen(newHoursStr);
      console.log(`[Hours] Updating isOpen for ${existingRestaurant.name} -> ${data.isOpen} based on new schedule`);
    }

    const previousAdminLogin =
      (existingRestaurant.adminEmail || existingRestaurant.slug).toLowerCase();

    const restaurant = await prisma.restaurant.update({
      where: { id },
      data,
    });

    const nextAdminLogin = (restaurant.adminEmail || restaurant.slug).toLowerCase();

    if (previousAdminLogin !== nextAdminLogin) {
      try {
        await prisma.adminUser.updateMany({
          where: {
            email: previousAdminLogin,
            role: { not: 'SUPER_ADMIN' },
          },
          data: {
            email: nextAdminLogin,
            name: `${restaurant.name} Admin`,
          },
        });
      } catch (adminSyncError: any) {
        console.error(`[restaurants PATCH] Failed to sync admin alias for ${restaurant.name}:`, adminSyncError.message);
      }
    }

    // Handle admin password update if provided
    if (payload.adminPassword && payload.adminPassword.trim().length > 0) {
      try {
        const hashedPassword = await bcrypt.hash(payload.adminPassword.trim(), 10);
        const adminEmail = (restaurant.adminEmail || restaurant.slug).toLowerCase();
        const adminUser = await prisma.adminUser.upsert({
          where: { email: adminEmail },
          update: { password: hashedPassword, isActive: true, name: `${restaurant.name} Admin` },
          create: {
            email: adminEmail,
            password: hashedPassword,
            name: `${restaurant.name} Admin`,
            role: 'ADMIN',
            isActive: true,
          },
        });
        console.log(`✅ Admin password updated for "${restaurant.name}" (login: ${adminEmail}, id: ${adminUser.id})`);
      } catch (adminErr: any) {
        console.error(`❌ Failed to update admin password for "${restaurant.name}":`, adminErr.message);
      }
    }

    // The effective isOpen is now just restaurant.isOpen (already includes schedule)
    const effectiveIsOpen = restaurant.isOpen && isRestaurantOpen(restaurant.openingHours);

    // Sync global RestaurantSettings so Hero.tsx / Navbar.tsx polling stays correct
    if (payload.openingHours !== undefined || payload.isOpen !== undefined || payload.deliveryFee !== undefined) {
      try {
        await prisma.restaurantSettings.upsert({
          where: { id: 'settings' },
          update: {
            isOpen: restaurant.isOpen,
            ...(payload.deliveryFee !== undefined ? { deliveryFee: restaurant.deliveryFee } : {}),
            ...(payload.minOrderAmount !== undefined ? { minOrderAmount: restaurant.minOrderAmount } : {}),
          },
          create: {
            id: 'settings',
            isOpen: restaurant.isOpen,
            deliveryFee: restaurant.deliveryFee ?? 0,
            minOrderAmount: restaurant.minOrderAmount ?? 0,
          },
        });
      } catch {
        // Non-critical
      }
    }

    // Emit per-restaurant socket event + global event (for Hero/Navbar)
    getIO().emit('settings:updated', {
      restaurantId: restaurant.id,
      slug: restaurant.slug,
      isOpen: effectiveIsOpen,
      manualIsOpen: restaurant.isOpen,
      deliveryFee: fromOre(restaurant.deliveryFee),
      minOrderAmount: fromOre(restaurant.minOrderAmount),
      etaMinutes: restaurant.etaMinutes,
    });
    getIO().emit('settings:updated', { isOpen: effectiveIsOpen });

    res.json(restaurant);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    if (req.admin?.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Kräver super admin-behörighet' });
      return;
    }

    await prisma.restaurant.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: 'Kunde inte radera restaurang' });
  }
});

// Category/Item management (Admin)
router.post('/:restaurantId/categories', authenticate, async (req: AuthRequest, res) => {
  try {
    const { name, description } = req.body;
    const { restaurantId } = req.params;
    if (req.admin?.role !== 'SUPER_ADMIN') {
      const rid = req.admin?.restaurantId;
      if (!rid || rid !== restaurantId) {
        res.status(403).json({ error: 'Du kan bara skapa kategorier för din egen restaurang' });
        return;
      }
    }
    const category = await prisma.category.create({
      data: {
        name,
        description,
        slug: slugify(name) + '-' + Math.random().toString(36).substring(7),
        restaurantId,
      },
    });
    res.status(201).json(category);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/:restaurantId/items', authenticate, async (req: AuthRequest, res) => {
  try {
    const { categoryId, name, description, price } = req.body;
    const { restaurantId } = req.params;

    if (req.admin?.role !== 'SUPER_ADMIN') {
      const rid = req.admin?.restaurantId;
      if (!rid || rid !== restaurantId) {
        res.status(403).json({ error: 'Du kan bara skapa produkter för din egen restaurang' });
        return;
      }
    }

    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, restaurantId: true },
    });

    if (!category || category.restaurantId !== restaurantId) {
      res.status(400).json({ error: 'Ogiltig kategori för vald restaurang' });
      return;
    }

    const item = await prisma.product.create({
      data: {
        categoryId,
        name,
        description,
        slug: slugify(name) + '-' + Math.random().toString(36).substring(7),
        price: kr(price),
      },
    });
    res.status(201).json(item);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Public: restaurant detail
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const restaurant = await prisma.restaurant.findFirst({
      where: {
        OR: [
          { slug },
          { id: slug }
        ]
      },
    });

    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurang hittades inte' });
    }

    // Explicitly fetch categories using the same unified logic as the admin/app
    const categories = await prisma.category.findMany({
      where: {
        OR: [
          { restaurantId: restaurant.id },
          { restaurantId: null }
        ],
        isActive: true,
      },
      orderBy: { position: 'asc' },
      include: {
        products: {
          where: { isActive: true },
          orderBy: { position: 'asc' },
          include: {
            extraGroups: {
              include: {
                extraGroup: {
                  include: {
                    extras: {
                      where: { isActive: true },
                      orderBy: { position: 'asc' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Attach categories to the restaurant object for formatting
    const restaurantWithMenu = {
      ...restaurant,
      categories
    };

    const formatted = formatRestaurant(restaurantWithMenu, true);

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    let canViewSensitiveAdminFields = false;

    if (token) {
      try {
        const session = await resolveAdminSessionFromToken(token);
        canViewSensitiveAdminFields = Boolean(
          session && (session.role === 'SUPER_ADMIN' || session.restaurantId === restaurant.id)
        );
      } catch {
        canViewSensitiveAdminFields = false;
      }
    }

    return res.json(
      canViewSensitiveAdminFields
        ? { ...formatted, adminEmail: restaurant.adminEmail ?? null, logoutCode: restaurant.logoutCode ?? null }
        : formatted
    );
  } catch (error) {
    console.error('Error fetching restaurant', error);
    res.status(500).json({ error: 'Kunde inte hämta restaurang' });
  }
});

// GET /api/restaurants/:slug/reviews
// Public list of customer reviews for a restaurant. Drives the in-app
// reviews modal so users can read what others wrote before ordering.
// Filters out flagged reviews + entries without a written comment so the
// list reads like real reviews, not "anonymous gave 4 stars".
router.get('/:slug/reviews', async (req, res) => {
  try {
    const { slug } = req.params;
    const restaurant = await prisma.restaurant.findFirst({
      where: { OR: [{ slug }, { id: slug }] },
      select: { id: true },
    });
    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurang hittades inte' });
    }
    const reviews = await prisma.order.findMany({
      where: {
        restaurantId: restaurant.id,
        rating: { not: null },
        reviewFlagged: false,
      },
      select: {
        id: true,
        customerName: true,
        rating: true,
        review: true,
        reviewReply: true,
        reviewedAt: true,
        createdAt: true,
      },
      orderBy: [{ reviewedAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
    const summary = reviews.reduce(
      (acc, r) => {
        acc.count += 1;
        acc.sum += r.rating ?? 0;
        return acc;
      },
      { count: 0, sum: 0 },
    );
    res.json({
      averageRating: summary.count ? summary.sum / summary.count : 0,
      totalCount: summary.count,
      reviews: reviews.map((r) => ({
        id: r.id,
        // Show first name + last initial for privacy. "Jarir Alshher" → "Jarir A."
        customerName: formatReviewerName(r.customerName),
        rating: r.rating,
        comment: (r.review || '').trim(),
        reply: (r.reviewReply || '').trim(),
        createdAt: (r.reviewedAt || r.createdAt).toISOString(),
      })),
    });
  } catch (error) {
    console.error('Error fetching restaurant reviews', error);
    res.status(500).json({ error: 'Kunde inte hämta recensioner' });
  }
});

function formatReviewerName(raw: string | null | undefined): string {
  const name = (raw || '').trim();
  if (!name) return 'Anonym';
  const parts = name.split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

export default router;
