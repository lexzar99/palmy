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
        discountActive: (prod as any).discountActive ?? false,
        discountPercent: (prod as any).discountPercent ?? null,
        discountPrice: (prod as any).discountPrice != null ? (prod as any).discountPrice / 100 : null,
        discountImageUrl: (prod as any).discountImageUrl ?? null,
        discountLabel: (prod as any).discountLabel ?? null,
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

// GET /api/menu/discounted - Alla produkter som är rabatterade (över alla restauranger)
// Används av "Rea & rabatterat"-sektionen på hemskärmen i web + RN appen.
router.get('/discounted', async (req, res) => {
  try {
    const { cityId } = req.query;

    const products: any[] = await prisma.product.findMany({
      where: {
        isActive: true,
        discountActive: true,
        OR: [
          { discountPercent: { not: null } },
          { discountPrice: { not: null } },
        ],
        category: {
          isActive: true,
          restaurant: {
            isOpen: true,
            ...(cityId ? { cityId: cityId as string } : {}),
          },
        },
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            restaurant: {
              select: {
                id: true,
                slug: true,
                name: true,
                imageUrl: true,
                city: true,
                cuisine: true,
              },
            },
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 30,
    });

    const formatted = products
      .filter((p) => p.category?.restaurant)
      .map((p) => {
        const priceKr = p.price / 100;
        const hasCustomPrice = p.discountPrice != null;
        const discountPriceKr = hasCustomPrice
          ? p.discountPrice / 100
          : p.discountPercent
          ? Math.round(priceKr * (1 - p.discountPercent / 100) * 100) / 100
          : priceKr;
        const percent = p.discountPercent ?? (hasCustomPrice && priceKr > 0
          ? Math.round((1 - discountPriceKr / priceKr) * 100)
          : null);
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          originalPrice: priceKr,
          discountPrice: discountPriceKr,
          discountPercent: percent,
          discountLabel: p.discountLabel,
          imageUrl: p.discountImageUrl || p.imageUrl,
          restaurant: p.category.restaurant,
        };
      });

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching discounted products:', error);
    res.status(500).json({ error: 'Kunde inte hämta rabatterade produkter' });
  }
});

// GET /api/menu/free-delivery - Restauranger som har gratis leverans (antingen ett zon-fee = 0 eller freeDeliveryAbove)
router.get('/free-delivery', async (req, res) => {
  try {
    const { cityId } = req.query;
    const restaurants = await prisma.restaurant.findMany({
      where: {
        isOpen: true,
        ...(cityId ? { cityId: cityId as string } : {}),
      },
      include: { city_relation: true },
      orderBy: [{ featuredClass: 'asc' }, { name: 'asc' }],
    });

    const out = restaurants
      .map((r) => {
        // Parse zones - if any zone has deliveryFee === 0 while isActive, it's "free delivery"
        let zoneFree = false;
        try {
          const zones = JSON.parse(r.deliveryZones || '[]');
          if (Array.isArray(zones) && zones.some((z: any) => z?.isActive !== false && Number(z?.deliveryFee ?? z?.fee ?? -1) === 0)) {
            zoneFree = true;
          }
        } catch {}
        const fee = r.deliveryFee ?? 0;
        const minOrder = r.minOrderAmount ?? 0;
        const freeDeliveryAbove = r.freeDeliveryAbove ?? r.city_relation?.freeDeliveryAbove ?? null;
        const hasFreeDelivery = zoneFree || fee === 0 || (freeDeliveryAbove != null && freeDeliveryAbove > 0);
        return hasFreeDelivery
          ? {
              id: r.id,
              slug: r.slug,
              name: r.name,
              imageUrl: r.imageUrl,
              heroImageUrl: r.heroImageUrl,
              cuisine: r.cuisine,
              city: r.city,
              rating: r.rating,
              etaMinutes: r.etaMinutes,
              isFullyFree: zoneFree || fee === 0,
              freeDeliveryAbove: freeDeliveryAbove != null ? freeDeliveryAbove / 100 : null,
              minOrder: minOrder / 100,
            }
          : null;
      })
      .filter(Boolean);

    res.json(out);
  } catch (error) {
    console.error('Error fetching free delivery restaurants:', error);
    res.status(500).json({ error: 'Kunde inte hämta restauranger' });
  }
});

export default router;
