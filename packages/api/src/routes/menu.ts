import { Router } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/menu/categories - Alla aktiva kategorier med produkter för en specifik restaurang
router.get('/categories', async (req, res) => {
  try {
    const { restaurantId, slug } = req.query;
    const hasRestaurantScope = Boolean(restaurantId || slug);

    const resolvedRestaurantId = await (async () => {
      if (restaurantId) return restaurantId as string;
      if (!slug) return null;
      const restaurant = await prisma.restaurant.findFirst({
        where: { slug: slug as string },
        select: { id: true },
      });
      return restaurant?.id ?? null;
    })();

    const queryActiveMenuByRestaurantId = async (rid: string | null) => {
      return prisma.category.findMany({
        where: {
          OR: [
            { restaurantId: rid },
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
                orderBy: { position: 'asc' },
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
    };

    const primaryRestaurantId = hasRestaurantScope ? (resolvedRestaurantId ?? null) : null;
    let categories = await queryActiveMenuByRestaurantId(primaryRestaurantId);

    // Fallback logic if no categories found (e.g. invalid restaurantId)
    if (hasRestaurantScope && categories.length === 0) {
      console.info(`[menu] No active menu found for restaurant: ${slug || restaurantId}`);
    }

    // Formatera för frontend
    const formatted = categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      imageUrl: cat.imageUrl,
      products: cat.products.map((prod) => ({
        id: prod.id,
        name: prod.name,
        slug: prod.slug,
        description: prod.description,
        price: prod.price / 100, // konvertera ören till kr
        imageUrl: prod.imageUrl,
        isVegan: prod.isVegan,
        isVegetarian: prod.isVegetarian,
        isGlutenFree: prod.isGlutenFree,
        extraGroups: prod.extraGroups.map((peg) => ({
          id: peg.extraGroup.id,
          name: peg.extraGroup.name,
          description: peg.extraGroup.description,
          type: peg.extraGroup.type,
          required: peg.extraGroup.required,
          minSelections: peg.extraGroup.minSelections,
          maxSelections: peg.extraGroup.maxSelections,
          extras: peg.extraGroup.extras.map((e) => ({
            id: e.id,
            name: e.name,
            priceAddon: e.priceAddon / 100,
            isDefault: e.isDefault,
          })),
          position: (peg.extraGroup as any).position || 0,
        })),
      })),
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching menu:', error);
    res.status(500).json({ error: 'Kunde inte hämta menyn' });
  }
});

// GET /api/menu/products/:id - En produkt med extras
router.get('/products/:id', async (req, res) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, isActive: true },
      include: {
        category: true,
        extraGroups: {
          orderBy: { position: 'asc' },
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
    });

    if (!product) {
      res.status(404).json({ error: 'Produkt inte hittad' });
      return;
    }

    res.json({
      id: product.id,
      name: product.name,
      description: product.description,
      price: product.price / 100,
      imageUrl: product.imageUrl,
      category: product.category.name,
      extraGroups: product.extraGroups.map((peg) => ({
        id: peg.extraGroup.id,
        name: peg.extraGroup.name,
        type: peg.extraGroup.type,
        required: peg.extraGroup.required,
        minSelections: peg.extraGroup.minSelections,
        maxSelections: peg.extraGroup.maxSelections,
        extras: peg.extraGroup.extras.map((e) => ({
          id: e.id,
          name: e.name,
          priceAddon: e.priceAddon / 100,
          isDefault: e.isDefault,
        })),
        position: (peg.extraGroup as any).position || 0,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

export default router;
