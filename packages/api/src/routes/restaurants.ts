import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { slugify } from '../lib/slug';
import { authenticate, AuthRequest } from '../middleware/auth';
import { io } from '../index';
import { isRestaurantOpen } from '../lib/openingHours';

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

const restaurantSchema = z.object({
  name: z.string().min(2),
  slug: z.string().optional(),
  description: z.string().optional(),
  cuisine: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  zip: z.string().optional(),
  phone: z.string().optional(),
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
});

const formatRestaurant = (restaurant: any, includeMenu = false) => ({
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
  ratingCount: restaurant.ratingCount ?? 120,
  deliveryFee: fromOre(restaurant.deliveryFee),
  minOrderAmount: fromOre(restaurant.minOrderAmount),
  etaMinutes: restaurant.etaMinutes ?? 30,
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
});

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
        name: 'Palmyra Lund',
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
        name: 'Sushi Nori',
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
        name: 'Kebabino',
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
      include: withMenu === '1' ? {
        categories: {
          orderBy: { position: 'asc' },
          include: {
            products: {
              where: { isActive: true },
              orderBy: { position: 'asc' },
            }
          }
        }
      } : undefined,
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
    const data: any = {
      name: payload.name,
      slug: payload.slug || slugify(payload.name),
      description: payload.description,
      cuisine: payload.cuisine,
      address: payload.address,
      city: payload.city,
      zip: payload.zip,
      phone: payload.phone,
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

    const restaurant = await prisma.restaurant.create({
      data: {
        ...data,
      },
    });
    res.status(201).json(restaurant);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.patch('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const payload = restaurantSchema.partial().parse(req.body);
    const { id } = req.params;

    if (req.admin?.role !== 'SUPER_ADMIN') {
      const rid = req.admin?.restaurantId;
      if (!rid || rid !== id) {
        res.status(403).json({ error: 'Du kan bara uppdatera din egen restaurang' });
        return;
      }
    }
    
    // Build update payload explicitly to avoid accidentally passing unsupported keys.
    const data: any = {};
    if (payload.name !== undefined) data.name = payload.name;
    if (payload.slug !== undefined) data.slug = payload.slug;
    if (payload.description !== undefined) data.description = payload.description;
    if (payload.cuisine !== undefined) data.cuisine = payload.cuisine;
    if (payload.address !== undefined) data.address = payload.address;
    if (payload.city !== undefined) data.city = payload.city;
    if (payload.zip !== undefined) data.zip = payload.zip;
    if (payload.phone !== undefined) data.phone = payload.phone;
    if (payload.imageUrl !== undefined) data.imageUrl = payload.imageUrl;
    if (payload.heroImageUrl !== undefined) data.heroImageUrl = payload.heroImageUrl;
    if (payload.etaMinutes !== undefined) data.etaMinutes = Number(payload.etaMinutes);
    if (payload.featuredClass !== undefined) data.featuredClass = Number(payload.featuredClass);
    if (payload.isOpen !== undefined) data.isOpen = payload.isOpen;
    if (payload.rating !== undefined) data.rating = Number(payload.rating);
    if (payload.ratingCount !== undefined) data.ratingCount = Number(payload.ratingCount);
    if (payload.deliveryFee !== undefined) data.deliveryFee = kr(Number(payload.deliveryFee));
    if (payload.minOrderAmount !== undefined) data.minOrderAmount = kr(Number(payload.minOrderAmount));
    if (payload.tags !== undefined) data.tags = typeof payload.tags === 'string' ? payload.tags : JSON.stringify(payload.tags);
    if (payload.openingHours !== undefined) data.openingHours = typeof payload.openingHours === 'string' ? payload.openingHours : JSON.stringify(payload.openingHours);
    if (payload.internalInfo !== undefined) data.internalInfo = payload.internalInfo;

    const restaurant = await prisma.restaurant.update({
      where: { id },
      data,
    });

    // Handle admin password update if provided
    if (payload.adminPassword) {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash(payload.adminPassword, 12);
      
      // Upsert admin user for this restaurant
      // Restaurant admins use their slug as email
      await prisma.adminUser.upsert({
        where: { email: restaurant.slug },
        update: { password: hashedPassword },
        create: {
          email: restaurant.slug,
          password: hashedPassword,
          name: `${restaurant.name} Admin`,
          role: 'STAFF',
        },
      });
    }
    io.emit('settings:updated', {
      restaurantId: restaurant.id,
      slug: restaurant.slug,
      isOpen: restaurant.isOpen && isRestaurantOpen(restaurant.openingHours),
      manualIsOpen: restaurant.isOpen,
      deliveryFee: fromOre(restaurant.deliveryFee),
      minOrderAmount: fromOre(restaurant.minOrderAmount),
      etaMinutes: restaurant.etaMinutes,
    });

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
      include: {
        categories: {
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
                        extras: true
                      }
                    }
                  }
                }
              }
            }
          }
        },
      },
    });

    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurang hittades inte' });
    }

    return res.json(formatRestaurant(restaurant, true));
  } catch (error) {
    console.error('Error fetching restaurant', error);
    res.status(500).json({ error: 'Kunde inte hämta restaurang' });
  }
});

export default router;
