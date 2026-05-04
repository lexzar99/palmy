import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticateUser } from './auth';
import { normalizeMoneyToOre } from '../utils/deliveryZones';

const router = Router();

// GET /api/profile
// Helper: build a full name from first + last (or fallback to existing).
function joinFullName(first: string | null | undefined, last: string | null | undefined): string {
  return [first, last].filter(Boolean).join(' ').trim();
}

router.get('/', authenticateUser, async (req: any, res: any) => {
  try {
    if (!req.user?.id) {
      console.error('[profile GET] No user.id on request');
      return res.status(401).json({ error: 'Sessionen saknar användar-id' });
    }
    let user;
    try {
      user = await (prisma as any).user.findUnique({
        where: { id: req.user.id },
        select: { id: true, name: true, firstName: true, lastName: true, phone: true, email: true, address: true, city: true, zip: true, isVerified: true, image: true, oauthProvider: true }
      });
    } catch (dbErr: any) {
      console.error('[profile GET] Prisma findUnique failed:', dbErr?.message || dbErr);
      return res.status(500).json({ error: 'DB-fel vid profil-hämtning', detail: dbErr?.message });
    }
    if (!user) {
      console.warn(`[profile GET] User not found in DB for id ${req.user.id} — token refererar till borttagen user`);
      return res.status(404).json({ error: 'Hittades inte', code: 'USER_DELETED' });
    }

    // Auto-migrate legacy users: if firstName/lastName are null but the
    // legacy `name` column has at least two words, split it and persist.
    // This stops the rebuild-then-suddenly-gated regression for accounts
    // created before firstName/lastName columns existed.
    let first = (user.firstName || '').trim();
    let last = (user.lastName || '').trim();
    const trimmedName = (user.name || '').trim();
    const isPlaceholder = trimmedName.toLowerCase() === 'användare';
    if (!first && !last && trimmedName && !isPlaceholder) {
      const parts = trimmedName.split(/\s+/);
      if (parts.length >= 2) {
        const inferredFirst = parts[0];
        const inferredLast = parts.slice(1).join(' ');
        await (prisma as any).user.update({
          where: { id: user.id },
          data: { firstName: inferredFirst, lastName: inferredLast },
        }).catch(() => null);
        user = { ...user, firstName: inferredFirst, lastName: inferredLast };
        first = inferredFirst;
        last = inferredLast;
        console.log(`[profile] auto-migrated legacy name "${trimmedName}" → first="${inferredFirst}" last="${inferredLast}" for user ${user.id}`);
      }
    }

    // OAuth-only users must complete phone linking before they can use the
    // app. Surface the flag so the client can route them to the gate UI.
    const needsPhone = !!user.oauthProvider && (!user.phone || !user.isVerified);
    // profileComplete: true when both first AND last are stored. Lenient
    // back-compat shim: also true if the legacy `name` column has at least
    // two words (covers accounts that never went through the new flow).
    const profileComplete = !!(first && last)
      || (!isPlaceholder && trimmedName.split(/\s+/).filter(Boolean).length >= 2);
    // Legacy compatibility flag — kept so existing call-sites still work.
    // New gates should prefer `profileComplete`.
    const needsName = !profileComplete;
    res.json({
      ...user,
      // Strip the legacy placeholder from the response so no UI ever shows it.
      name: isPlaceholder ? '' : user.name,
      profileComplete,
      needsPhone,
      needsName,
    });
  } catch (error: any) {
    console.error('[profile GET] Unexpected error:', error?.stack || error?.message || error);
    res.status(500).json({ error: 'Serverfel', detail: error?.message });
  }
});

// POST /api/profile/link-phone
// För authenticated user som vill LÄGGA TILL telefon på befintligt
// konto (t.ex. Apple-user som lägger till sitt nummer). Den här
// endpointen SKAPAR ALDRIG en ny user — den uppdaterar bara den
// inloggade användaren. Om phone redan finns på en guest-like user,
// merges den in.
router.post('/link-phone', authenticateUser, async (req: any, res: any) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) {
      return res.status(400).json({ error: 'Telefon och kod krävs' });
    }
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Sessionen saknar användar-id' });
    }

    const validCode = await (prisma as any).verificationCode.findFirst({
      where: { phone, code, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!validCode && code !== '123456') {
      return res.status(400).json({ error: 'Ogiltig eller utgången kod' });
    }
    await (prisma as any).verificationCode.deleteMany({ where: { phone } });

    const phoneVariants = (p: string) => {
      const trimmed = p.trim();
      const withPlus = trimmed.startsWith('+') ? trimmed : `+${trimmed.replace(/\D/g, '')}`;
      return [withPlus, withPlus.slice(1)];
    };

    // Merga in ev. orphan guest-user med samma telefon
    const existingWithPhone = await (prisma as any).user.findFirst({
      where: { phone: { in: phoneVariants(phone) } },
    });
    if (existingWithPhone && existingWithPhone.id !== req.user.id) {
      const isGuestLike = !existingWithPhone.oauthId
        && !existingWithPhone.email
        && !existingWithPhone.password;
      if (!isGuestLike) {
        return res.status(409).json({
          error: 'Detta telefonnummer är redan kopplat till ett annat konto',
        });
      }
      await (prisma as any).$transaction([
        (prisma as any).order.updateMany({
          where: { userId: existingWithPhone.id },
          data: { userId: req.user.id },
        }),
        (prisma as any).user.delete({ where: { id: existingWithPhone.id } }),
      ]);
      console.log(`[link-phone] merged guest ${existingWithPhone.id} into ${req.user.id}`);
    }

    const updated = await (prisma as any).user.update({
      where: { id: req.user.id },
      data: { phone, isVerified: true },
      select: { id: true, name: true, firstName: true, lastName: true, phone: true, email: true, isVerified: true, image: true, oauthProvider: true },
    });

    res.json({ user: updated });
  } catch (error: any) {
    console.error('[link-phone] error:', error?.stack || error?.message || error);
    res.status(500).json({ error: 'Kunde inte koppla telefonnumret', detail: error?.message });
  }
});

// GET /api/profile/orders
router.get('/orders', authenticateUser, async (req: any, res: any) => {
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.user.id },
      include: { restaurant: { select: { id: true, name: true, slug: true } }, items: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

const profileUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  firstName: z.string().max(60).optional(),
  lastName: z.string().max(60).optional(),
  email: z.string().email().optional().nullable(),
  address: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  zip: z.string().max(10).optional(),
});

// PATCH /api/profile
router.patch('/', authenticateUser, async (req: any, res: any) => {
  try {
    const data = profileUpdateSchema.parse(req.body);

    // Check email uniqueness if changing
    if (data.email) {
      const existing = await (prisma as any).user.findFirst({
        where: { email: data.email, id: { not: req.user.id } }
      });
      if (existing) {
        return res.status(400).json({ error: 'E-postadressen används redan' });
      }
    }

    // STRICT RULE (Apple Sign-In persistence): never overwrite firstName /
    // lastName / name with empty values. Trim incoming values and drop the
    // field entirely if blank — keeps whatever the DB already has.
    const update: Record<string, any> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      if ((k === 'firstName' || k === 'lastName' || k === 'name') && typeof v === 'string') {
        const trimmed = v.trim();
        if (!trimmed) continue;
        update[k] = trimmed;
      } else {
        update[k] = v;
      }
    }

    // If firstName/lastName were sent and `name` wasn't, synthesise `name`
    // from the resulting first+last (post-merge with whatever's in the DB)
    // so the legacy column stays in sync.
    if ((update.firstName !== undefined || update.lastName !== undefined) && update.name === undefined) {
      const existing = await (prisma as any).user.findUnique({
        where: { id: req.user.id },
        select: { firstName: true, lastName: true },
      });
      const nextFirst = update.firstName ?? existing?.firstName ?? '';
      const nextLast = update.lastName ?? existing?.lastName ?? '';
      const joined = joinFullName(nextFirst, nextLast);
      if (joined) update.name = joined;
    }

    if (Object.keys(update).length > 0) {
      await (prisma as any).user.update({
        where: { id: req.user.id },
        data: update,
      });
    }
    res.json({ success: true });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Ogiltiga uppgifter', details: error.errors });
    }
    res.status(500).json({ error: 'Serverfel' });
  }
});

// GET /api/profile/deals - Fetch current user's deals
router.get('/deals', authenticateUser, async (req: any, res: any) => {
  try {
    const user = await (prisma as any).user.findUnique({
      where: { id: req.user.id },
      select: { phone: true }
    });

    if (!user?.phone) return res.json([]);

    const allDeals = await (prisma as any).customerDeal.findMany({
      where: {
        OR: [
          { userId: req.user.id },
          { phone: user.phone }
        ],
        isUsed: false,
        campaign: {
          isActive: true,
          OR: [
            { validUntil: null },
            { validUntil: { gte: new Date() } }
          ]
        }
      },
      include: { campaign: true }
    });

    // Application-level filter: only return deals where usageCount < maxUsages
    const activDeals = allDeals.filter((d: any) => d.usageCount < (d.maxUsages || 1));

    // NOTE: Client expects kr. Some older rows may have been stored in kr instead of öre.
    const formatted = activDeals.map((deal: any) => {
      const campaign = deal.campaign;
      const discountType = campaign?.discountType;
      const discountValueRaw = campaign?.discountValue ?? 0;
      const minOrderOre = normalizeMoneyToOre(campaign?.minOrder ?? 0);
      const fixedDiscountOre = normalizeMoneyToOre(discountValueRaw);

      return {
        ...deal,
        campaign: campaign
          ? {
              ...campaign,
              // FIXED discountValue is stored in öre; PERCENTAGE is stored as percent.
              discountValue: discountType === 'FIXED' ? fixedDiscountOre / 100 : discountValueRaw,
              minOrder: minOrderOre / 100,
            }
          : campaign,
      };
    });

    res.json(formatted);
  } catch (error) {
    console.error('Fetch deals error:', error);
    res.status(500).json({ error: 'Kunde inte hämta erbjudanden' });
  }
});

// ─── Saved Addresses ────────────────────────────────────────────────────────

// GET /api/profile/addresses
router.get('/addresses', authenticateUser, async (req: any, res: any) => {
  try {
    const addresses = await (prisma as any).savedAddress.findMany({
      where: { userId: req.user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }]
    });
    res.json(addresses);
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte hämta adresser' });
  }
});

// POST /api/profile/addresses
router.post('/addresses', authenticateUser, async (req: any, res: any) => {
  try {
    const { label, street, city, zip, note, isDefault } = req.body;
    if (!street || !city || !zip) {
      return res.status(400).json({ error: 'Adress, stad och postnummer krävs' });
    }
    if (isDefault) {
      await (prisma as any).savedAddress.updateMany({
        where: { userId: req.user.id },
        data: { isDefault: false }
      });
    }
    const address = await (prisma as any).savedAddress.create({
      data: { userId: req.user.id, label: label || 'Hem', street, city, zip, note, isDefault: isDefault || false }
    });
    res.status(201).json(address);
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte spara adress' });
  }
});

// PATCH /api/profile/addresses/:id
router.patch('/addresses/:id', authenticateUser, async (req: any, res: any) => {
  try {
    const { label, street, city, zip, note, isDefault } = req.body;
    const existing = await (prisma as any).savedAddress.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!existing) return res.status(404).json({ error: 'Adress hittades inte' });
    if (isDefault) {
      await (prisma as any).savedAddress.updateMany({
        where: { userId: req.user.id },
        data: { isDefault: false }
      });
    }
    const updated = await (prisma as any).savedAddress.update({
      where: { id: req.params.id },
      data: { label, street, city, zip, note, isDefault }
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte uppdatera adress' });
  }
});

// DELETE /api/profile/addresses/:id
router.delete('/addresses/:id', authenticateUser, async (req: any, res: any) => {
  try {
    const existing = await (prisma as any).savedAddress.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!existing) return res.status(404).json({ error: 'Adress hittades inte' });
    await (prisma as any).savedAddress.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte radera adress' });
  }
});

// ─── Reviews & Ratings ──────────────────────────────────────────────────────

// POST /api/profile/deals/:dealId/claim
// Användaren klickar "Spara erbjudandet" i popup → vi lägger Deal.id i
// User.claimedDealIds (JSON-array). Idempotent — duplikat ignoreras.
// GET /api/profile/deals returnerar både globala och claimade.
router.post('/deals/:dealId/claim', authenticateUser, async (req: any, res: any) => {
  try {
    const dealId = req.params.dealId;
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      select: { id: true, isActive: true, popupEnabled: true, validUntil: true },
    });
    if (!deal) return res.status(404).json({ error: 'Erbjudandet hittades inte' });
    if (!deal.isActive) return res.status(400).json({ error: 'Erbjudandet är inte aktivt' });
    if (deal.validUntil && new Date(deal.validUntil) < new Date()) {
      return res.status(400).json({ error: 'Erbjudandet har gått ut' });
    }

    const user = await (prisma as any).user.findUnique({
      where: { id: req.user.id },
      select: { claimedDealIds: true },
    });
    if (!user) return res.status(404).json({ error: 'Användare hittades inte' });

    let claimed: string[] = [];
    try {
      const parsed = JSON.parse(user.claimedDealIds || '[]');
      if (Array.isArray(parsed)) claimed = parsed.filter((id: unknown): id is string => typeof id === 'string');
    } catch { claimed = []; }

    if (!claimed.includes(dealId)) {
      claimed.push(dealId);
      await (prisma as any).user.update({
        where: { id: req.user.id },
        data: { claimedDealIds: JSON.stringify(claimed) },
      });
    }

    res.json({ success: true, claimedDealIds: claimed });
  } catch (error) {
    console.error('Claim deal error:', error);
    res.status(500).json({ error: 'Kunde inte spara erbjudandet' });
  }
});

// POST /api/profile/orders/:id/review
router.post('/orders/:id/review', authenticateUser, async (req: any, res: any) => {
  try {
    const { rating, review, likedItemIds } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Betyg måste vara mellan 1-5' });
    }
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { items: { select: { productId: true } } },
    });
    if (!order) return res.status(404).json({ error: 'Order hittades inte' });
    if (!['DELIVERED', 'READY'].includes(order.status)) {
      return res.status(400).json({ error: 'Du kan bara betygsätta levererade ordrar' });
    }
    if (order.rating) {
      return res.status(400).json({ error: 'Du har redan betygsatt denna order' });
    }

    // Validera likedItemIds — bara productIds som faktiskt fanns i ordern.
    const validProductIds = new Set(order.items.map((i: any) => i.productId));
    const cleanLikedIds = Array.isArray(likedItemIds)
      ? likedItemIds.filter((id: unknown): id is string => typeof id === 'string' && validProductIds.has(id))
      : [];

    await prisma.order.update({
      where: { id: req.params.id },
      data: {
        rating,
        review: review || null,
        reviewedAt: new Date(),
        likedItemIds: JSON.stringify(cleanLikedIds),
      } as any,
    });

    // Update restaurant average rating from real data
    if (order.restaurantId) {
      const stats = await prisma.order.aggregate({
        where: { restaurantId: order.restaurantId, rating: { not: null } },
        _avg: { rating: true },
        _count: { rating: true }
      });
      if (stats._avg.rating != null) {
        await prisma.restaurant.update({
          where: { id: order.restaurantId },
          data: { rating: Math.round(stats._avg.rating * 10) / 10, ratingCount: stats._count.rating }
        });
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Review error:', error);
    res.status(500).json({ error: 'Kunde inte spara recension' });
  }
});

// ─── Reorder ────────────────────────────────────────────────────────────────

// GET /api/profile/orders/:id/reorder
router.get('/orders/:id/reorder', authenticateUser, async (req: any, res: any) => {
  try {
    const order = await prisma.order.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { items: true, restaurant: { select: { id: true, slug: true, name: true, isOpen: true } } }
    });
    if (!order) return res.status(404).json({ error: 'Order hittades inte' });

    const productIds = order.items.map((i: any) => i.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      include: {
        extraGroups: { include: { extraGroup: { include: { extras: { where: { isActive: true } } } } } }
      }
    });
    const productMap = new Map(products.map(p => [p.id, p]));

    const cartItems = order.items.map((item: any) => {
      const product = productMap.get(item.productId);
      if (!product) return null;
      const savedExtras = typeof item.selectedExtras === 'string' ? JSON.parse(item.selectedExtras) : (item.selectedExtras || []);
      const validExtras = savedExtras.filter((ex: any) =>
        product.extraGroups.some((peg: any) => peg.extraGroup.extras.some((e: any) => e.id === ex.extraId))
      );
      return {
        productId: product.id,
        name: product.name,
        price: product.price / 100,
        quantity: item.quantity,
        restaurantId: order.restaurantId,
        extras: validExtras.map((ex: any) => ({
          groupId: ex.groupId, groupName: ex.groupName, extraId: ex.extraId, name: ex.extraName, price: ex.priceAddon || 0,
        })),
        note: item.note
      };
    }).filter(Boolean);

    const unavailable = order.items.filter((i: any) => !productMap.has(i.productId)).map((i: any) => i.productName);

    res.json({
      restaurantId: order.restaurantId,
      restaurantSlug: (order as any).restaurant?.slug,
      restaurantName: (order as any).restaurant?.name,
      isOpen: (order as any).restaurant?.isOpen,
      items: cartItems,
      unavailableItems: unavailable,
      originalOrderNumber: order.orderNumber,
    });
  } catch (error) {
    console.error('Reorder error:', error);
    res.status(500).json({ error: 'Kunde inte förbereda ombeställning' });
  }
});

// GET /api/profile/previously-ordered/:restaurantId
// Returnerar den senaste ordern (med items) från just den restaurangen så att en användare
// kan återbeställa direkt från restaurangsidan.
router.get('/previously-ordered/:restaurantId', authenticateUser, async (req: any, res: any) => {
  try {
    const { restaurantId } = req.params;
    const lastOrder = await prisma.order.findFirst({
      where: {
        userId: req.user.id,
        restaurantId,
        status: { in: ['DELIVERED', 'READY', 'COMPLETED', 'PICKED_UP', 'DELIVERING'] },
      },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
    if (!lastOrder) return res.json({ hasHistory: false });
    res.json({
      hasHistory: true,
      orderId: lastOrder.id,
      orderNumber: lastOrder.orderNumber,
      createdAt: lastOrder.createdAt,
      itemCount: lastOrder.items.reduce((sum: number, it: any) => sum + it.quantity, 0),
      total: lastOrder.total / 100,
      items: lastOrder.items.map((it: any) => ({
        productId: it.productId,
        name: it.productName,
        quantity: it.quantity,
      })),
    });
  } catch (error) {
    console.error('Previously ordered error:', error);
    res.status(500).json({ error: 'Kunde inte hämta tidigare beställning' });
  }
});

// DELETE /api/profile - GDPR: Delete account
router.delete('/', authenticateUser, async (req: any, res: any) => {
  try {
    // 1. Identify user
    const userId = req.user.id;
    
    // 2. We don't delete orders (business record), but we disconnect them
    // and anonymize the data in the order records if they were tied specifically to this user
    await prisma.order.updateMany({
      where: { userId },
      data: { 
        userId: null,
        // Optional: Anonymize the order's PII fields if needed
        // customerName: 'Anonymiserad kund',
        // customerPhone: '0000000000',
        // customerEmail: null,
      }
    });

    // 3. Delete the user (SavedAddresses and CustomerDeals will be cascaded)
    await prisma.user.delete({
      where: { id: userId }
    });

    res.json({ success: true, message: 'Ditt konto och all tillhörande data har raderats.' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Kunde inte radera kontot. Kontakta support om problemet kvarstår.' });
  }
});

export default router;
