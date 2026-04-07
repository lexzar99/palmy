import { Router } from 'express';
import prisma from '../lib/prisma';

const router = Router();

// GET /api/menu/categories - Alla aktiva kategorier med produkter för en specifik restaurang
router.get('/categories', async (req, res) => {
  try {
    const { restaurantId, slug } = req.query;
    const hasRestaurantScope = Boolean(restaurantId || slug);

    const baseWhere: any = {
      ...(restaurantId ? { restaurantId: restaurantId as string } : {}),
      ...(slug ? { restaurant: { slug: slug as string } } : {}),
      // Om varken id eller slug anges, hämta globala/default (Palmyra)
      ...(!restaurantId && !slug ? { restaurantId: null } : {}),
    };

    const query = async (opts: { onlyActive: boolean }) => {
      const onlyActive = opts.onlyActive;
      return prisma.category.findMany({
        where: {
          ...baseWhere,
          ...(onlyActive ? { isActive: true } : {}),
        },
        orderBy: { position: 'asc' },
        include: {
          products: {
            where: onlyActive ? { isActive: true } : {},
            orderBy: { position: 'asc' },
            include: {
              extraGroups: {
                orderBy: { position: 'asc' },
                include: {
                  extraGroup: {
                    include: {
                      extras: {
                        where: onlyActive ? { isActive: true } : {},
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

    let categories = await query({ onlyActive: true });

    // Compatibility fallback: some older datasets have isActive=false for everything
    // (e.g. after schema changes). If nothing is visible for a restaurant, return
    // the full menu instead of an empty screen.
    if (hasRestaurantScope) {
      const hasAnyProducts = categories.some((cat) => (cat.products || []).length > 0);
      if (categories.length === 0 || !hasAnyProducts) {
        categories = await query({ onlyActive: false });
      }
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
