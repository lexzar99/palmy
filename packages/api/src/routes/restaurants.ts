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
  tags: z.array(z.string()).optional(),
  isFeatured: z.boolean().optional(),
  isOpen: z.boolean().optional(),
  rating: z.number().min(0).max(5).optional(),
  ratingCount: z.number().int().nonnegative().optional(),
  openingHours: z.record(z.string(), z.any()).optional(),
});

const categorySchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  position: z.number().int().optional(),
});

const itemSchema = z.object({
  categoryId: z.string(),
  name: z.string().min(2),
  description: z.string().optional(),
  price: z.number().nonnegative(),
  imageUrl: z.string().optional(),
  tags: z.array(z.string()).optional(),
  isPopular: z.boolean().optional(),
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
  isFeatured: restaurant.isFeatured ?? false,
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
        items: (cat.items || []).map((item: any) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          price: fromOre(item.price),
          imageUrl: item.imageUrl,
          tags: parseJson<string[]>(item.tags, []),
          isPopular: item.isPopular,
        })),
      }))
    : undefined,
});

const seedRestaurants = async () => {
  const count = await prisma.restaurant.count();
  if (count > 0) return;

  const palmyra = await prisma.restaurant.create({
    data: {
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
      isFeatured: true,
      tags: JSON.stringify(['Pizza', 'Kebab', 'Rullar']),
    },
  });

  await prisma.restaurant.create({
    data: {
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
      isFeatured: true,
      tags: JSON.stringify(['Sushi', 'Poké', 'Japanskt']),
      categories: {
        create: [
          {
            name: 'Signaturrätter',
            position: 0,
            items: {
              create: [
                { name: 'Salmon Poké', description: 'Lax, edamame, mango, ponzu', price: kr(139), isPopular: true },
                { name: 'Crispy Ebi Roll', description: 'Tempuraräka, avocado, chilimajo', price: kr(119) },
                { name: 'Veggie Garden', description: 'Avocado, tofu, gurka, sesam', price: kr(109), isPopular: true },
              ],
            },
          },
        ],
      },
    },
  });

  await prisma.restaurant.create({
    data: {
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
      tags: JSON.stringify(['Kebab', 'Halal', 'Durum']),
      categories: {
        create: [
          {
            name: 'Klassiker',
            position: 0,
            items: {
              create: [
                { name: 'Kebabtallrik', description: 'Pommes, sallad, två valfria såser', price: kr(119), isPopular: true },
                { name: 'Durum Kebab', description: 'Nygrillat tunnbröd, sallad, sås', price: kr(105) },
              ],
            },
          },
        ],
      },
    },
  });

  console.log('🌱 Seeded default restaurants (incl. Palmyra)');
  return palmyra;
};

// Public: list restaurants
router.get('/', async (req, res) => {
  try {
    await seedRestaurants();
    const { search = '', cuisine, withMenu } = req.query;
    const includeMenu = withMenu === '1' || withMenu === 'true';

    const restaurants = await prisma.restaurant.findMany({
      where: {
        name: { contains: search as string, mode: 'insensitive' },
        ...(cuisine ? { cuisine: { contains: cuisine as string, mode: 'insensitive' } } : {}),
      },
      orderBy: [
        { isFeatured: 'desc' },
        { name: 'asc' },
      ],
      include: includeMenu
        ? { categories: { orderBy: { position: 'asc' }, include: { items: { orderBy: { createdAt: 'asc' } } } } }
        : undefined,
    });

    res.json(restaurants.map((r) => formatRestaurant(r, includeMenu)));
  } catch (error) {
    console.error('Error fetching restaurants', error);
    res.status(500).json({ error: 'Kunde inte hämta restauranger' });
  }
});

// Admin: create restaurant
router.post('/', authenticate, async (req: AuthRequest, res) => {
  try {
    const payload = restaurantSchema.parse(req.body);
    const slug = payload.slug ? slugify(payload.slug) : slugify(payload.name);

    const restaurant = await prisma.restaurant.create({
      data: {
        ...payload,
        slug,
        deliveryFee: kr(payload.deliveryFee ?? 0),
        minOrderAmount: kr(payload.minOrderAmount ?? 0),
        tags: JSON.stringify(payload.tags ?? []),
        openingHours: JSON.stringify(payload.openingHours ?? {}),
      },
    });

    res.status(201).json(formatRestaurant(restaurant));
  } catch (err: any) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Kunde inte skapa restaurangen' });
  }
});

// Admin: update restaurant
router.patch('/:restaurantId', authenticate, async (req: AuthRequest, res) => {
  try {
    const payload = restaurantSchema.partial().parse(req.body);
    const { restaurantId } = req.params;

    const restaurant = await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        ...payload,
        ...(payload.slug ? { slug: slugify(payload.slug) } : {}),
        ...(payload.deliveryFee !== undefined ? { deliveryFee: kr(payload.deliveryFee) } : {}),
        ...(payload.minOrderAmount !== undefined ? { minOrderAmount: kr(payload.minOrderAmount) } : {}),
        ...(payload.tags ? { tags: JSON.stringify(payload.tags) } : {}),
        ...(payload.openingHours ? { openingHours: JSON.stringify(payload.openingHours) } : {}),
      },
    });

    res.json(formatRestaurant(restaurant));
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Kunde inte uppdatera restaurangen' });
  }
});

router.delete('/:restaurantId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { restaurantId } = req.params;
    await prisma.restaurant.delete({ where: { id: restaurantId } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: 'Kunde inte radera restaurangen' });
  }
});

// Admin: category CRUD
router.post('/:restaurantId/categories', authenticate, async (req: AuthRequest, res) => {
  try {
    const payload = categorySchema.parse(req.body);
    const category = await prisma.restaurantCategory.create({
      data: {
        restaurantId: req.params.restaurantId,
        name: payload.name,
        description: payload.description,
        position: payload.position ?? 0,
      },
    });
    res.status(201).json(category);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Kunde inte skapa kategori' });
  }
});

router.patch('/:restaurantId/categories/:categoryId', authenticate, async (req: AuthRequest, res) => {
  try {
    const payload = categorySchema.partial().parse(req.body);
    const { categoryId } = req.params;
    const category = await prisma.restaurantCategory.update({
      where: { id: categoryId },
      data: {
        ...payload,
      },
    });
    res.json(category);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Kunde inte uppdatera kategori' });
  }
});

router.delete('/:restaurantId/categories/:categoryId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { categoryId } = req.params;
    await prisma.restaurantCategory.delete({ where: { id: categoryId } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Kunde inte radera kategori' });
  }
});

// Admin: items
router.post('/:restaurantId/items', authenticate, async (req: AuthRequest, res) => {
  try {
    const payload = itemSchema.parse(req.body);
    const item = await prisma.restaurantItem.create({
      data: {
        categoryId: payload.categoryId,
        name: payload.name,
        description: payload.description,
        price: kr(payload.price),
        imageUrl: payload.imageUrl,
        tags: JSON.stringify(payload.tags ?? []),
        isPopular: payload.isPopular ?? false,
      },
    });
    res.status(201).json(item);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Kunde inte skapa menyobjekt' });
  }
});

router.patch('/:restaurantId/items/:itemId', authenticate, async (req: AuthRequest, res) => {
  try {
    const payload = itemSchema.partial().parse(req.body);
    const { itemId } = req.params;
    const item = await prisma.restaurantItem.update({
      where: { id: itemId },
      data: {
        ...payload,
        ...(payload.price !== undefined ? { price: kr(payload.price) } : {}),
        ...(payload.tags ? { tags: JSON.stringify(payload.tags) } : {}),
      },
    });
    res.json(item);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Kunde inte uppdatera menyobjekt' });
  }
});

router.delete('/:restaurantId/items/:itemId', authenticate, async (req: AuthRequest, res) => {
  try {
    const { itemId } = req.params;
    await prisma.restaurantItem.delete({ where: { id: itemId } });
    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: 'Kunde inte radera menyobjekt' });
  }
});

// Public: restaurant detail (including Palmyra core menu)
router.get('/:slug', async (req, res) => {
  try {
    await seedRestaurants();
    const { slug } = req.params;
    const restaurant = await prisma.restaurant.findFirst({
      where: { slug },
      include: {
        categories: {
          orderBy: { position: 'asc' },
          include: { items: { orderBy: { createdAt: 'asc' } } },
        },
      },
    });

    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurang hittades inte' });
    }

    // Special-case Palmyra: return live meny från core menytabeller
    if (slug === 'palmyra') {
      const categories = await prisma.category.findMany({
        where: { isActive: true },
        orderBy: { position: 'asc' },
        include: {
          products: {
            where: { isActive: true },
            orderBy: { position: 'asc' },
          },
        },
      });

      const menu = categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        description: cat.description,
        items: cat.products.map((prod) => ({
          id: prod.id,
          name: prod.name,
          description: prod.description,
          price: fromOre(prod.price),
          imageUrl: prod.imageUrl,
          tags: [],
        })),
      }));

      return res.json({
        ...formatRestaurant(restaurant, false),
        canOrderOnline: true,
        menuSource: 'palmyra-core',
        menu,
      });
    }

    return res.json({
      ...formatRestaurant(restaurant, true),
      canOrderOnline: false,
      menuSource: 'custom',
    });
  } catch (error) {
    console.error('Error fetching restaurant', error);
    res.status(500).json({ error: 'Kunde inte hämta restaurang' });
  }
});

export default router;
