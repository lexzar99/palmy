import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { slugify } from '../lib/slug';
import { authenticate, AuthRequest } from '../middleware/auth';

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
  imageUrl: z.string().optional(),
  heroImageUrl: z.string().optional(),
  deliveryFee: z.number().nonnegative().optional(),
  minOrderAmount: z.number().nonnegative().optional(),
  etaMinutes: z.number().int().positive().optional(),
  tags: z.any().optional(),
  featuredClass: z.number().int().min(1).max(3).optional(),
  isOpen: z.boolean().optional(),
  rating: z.number().min(0).max(5).optional(),
  ratingCount: z.number().int().nonnegative().optional(),
  openingHours: z.any().optional(),
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
  isOpen: restaurant.isOpen ?? true,
  featuredClass: restaurant.featuredClass ?? 3,
  tags: parseJson<string[]>(restaurant.tags, []),
  openingHours: parseJson<Record<string, unknown>>(restaurant.openingHours, {}),
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
    if (req.admin?.role !== 'SUPERIOR') {
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
    const payload = restaurantSchema.parse(req.body);
    const restaurant = await prisma.restaurant.create({
      data: {
        ...payload,
        name: payload.name, // Explicitly pass name to satisfy Prisma TS
        slug: payload.slug || slugify(payload.name),
        deliveryFee: kr(payload.deliveryFee ?? 0),
        minOrderAmount: kr(payload.minOrderAmount ?? 0),
        tags: JSON.stringify(payload.tags ?? []),
        openingHours: JSON.stringify(payload.openingHours ?? {}),
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
    
    // Explicitly handle fields that need conversion
    const data: any = { ...payload };
    if (payload.deliveryFee !== undefined) data.deliveryFee = kr(payload.deliveryFee);
    if (payload.minOrderAmount !== undefined) data.minOrderAmount = kr(payload.minOrderAmount);
    if (payload.tags !== undefined) data.tags = JSON.stringify(payload.tags);
    if (payload.openingHours !== undefined) data.openingHours = JSON.stringify(payload.openingHours);

    const restaurant = await prisma.restaurant.update({
      where: { id },
      data,
    });
    res.json(restaurant);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, async (req: AuthRequest, res) => {
  try {
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
      where: { slug },
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
