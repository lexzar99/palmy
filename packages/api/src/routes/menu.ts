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

    const query = async (opts: { onlyActive: boolean; includeGlobal: boolean }) => {
      const onlyActive = opts.onlyActive;
      const includeGlobal = opts.includeGlobal;

      const where: any = {
        // Om varken id eller slug anges, hämta globala/default (Palmyra)
        ...(!hasRestaurantScope ? { restaurantId: null } : {}),
        ...(onlyActive ? { isActive: true } : {}),
      };

      if (hasRestaurantScope) {
        // Primary: restaurant-scoped menu. Fallback: include global categories too.
        if (includeGlobal) {
          where.OR = [
            ...(resolvedRestaurantId ? [{ restaurantId: resolvedRestaurantId }] : []),
            { restaurantId: null },
          ];
        } else if (resolvedRestaurantId) {
          where.restaurantId = resolvedRestaurantId;
        } else {
          // Unknown slug -> treat as global
          where.restaurantId = null;
        }
      }

      return prisma.category.findMany({
        where,
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

    // 1) Prefer restaurant-linked categories only.
    let categories = await query({ onlyActive: true, includeGlobal: false });
    let hasAnyProducts = categories.some((cat) => (cat.products || []).length > 0);

    // 2) If restaurant has no visible menu, include global categories too (common in legacy datasets).
    if (hasRestaurantScope && (!resolvedRestaurantId || categories.length === 0 || !hasAnyProducts)) {
      categories = await query({ onlyActive: true, includeGlobal: true });
      hasAnyProducts = categories.some((cat) => (cat.products || []).length > 0);
    }

    // 3) Last-resort compatibility fallback: return even inactive items instead of a blank page.
    if (hasRestaurantScope && (categories.length === 0 || !hasAnyProducts)) {
      console.warn('[menu] No active menu found; falling back to include inactive items', {
        slug,
        restaurantId,
        resolvedRestaurantId,
      });
      categories = await query({ onlyActive: false, includeGlobal: true });
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
