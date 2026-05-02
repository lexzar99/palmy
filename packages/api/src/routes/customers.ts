import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { normalizeMoneyToOre } from '../utils/deliveryZones';

const router = Router();

// GET /api/customers - List all users with order summary
router.get('/', authenticate, requireSuperAdmin, async (_req, res) => {
  try {
    const users = await (prisma as any).user.findMany({
      // Hide soft-deleted rows from the admin list — the row stays in the
      // DB so a re-signed-in customer can be revived (auth.ts handles that),
      // but the admin shouldn't see them as if they're still around.
      where: { deletedAt: null },
      include: {
        _count: {
          select: { orders: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte hämta kunder' });
  }
});

// GET /api/customers/:id - Single customer details
router.get('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        orders: {
          include: { restaurant: { select: { name: true } } },
          orderBy: { createdAt: 'desc' }
        }
      }
    });
    if (!user) return res.status(404).json({ error: 'Kunden hittades inte' });

    const personalDeals = await prisma.customerDeal.findMany({
      where: {
        OR: [
          { userId: user.id },
          ...(user.phone ? [{ phone: user.phone }] : []),
        ],
      },
      include: { campaign: true },
      orderBy: { createdAt: 'desc' },
    });

    const dedupedDeals = Array.from(new Map(personalDeals.map((deal) => [deal.id, deal])).values());

    res.json({
      ...user,
      deals: dedupedDeals,
    });
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte hämta kunddetaljer' });
  }
});

// PATCH /api/customers/:id - Update customer (Super Admin)
router.patch('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { name, phone, email, address, city, zip, isActive, isVerified, internalInfo } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { name, phone, email, address, city, zip, isActive, isVerified, internalInfo }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte uppdatera kunden' });
  }
});

// DELETE /api/customers/:id - Soft-delete customer
//
// Hard-deleting wouldn't stick: the customer's Supabase JWT (Apple / Google)
// stays valid, so the next authenticated API call would silently re-create
// the same row via authenticateUser's upsert and they'd appear "logged in
// again". Instead we mark deletedAt + scrub identifying columns; the auth
// middleware checks deletedAt and rejects with 401, the mobile axios
// interceptor catches that and clears the local token, forcing re-login.
router.delete('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    // Cast to any because Railway's Docker build can sometimes serve a stale
    // Prisma client where the freshly-added `deletedAt` field hasn't been
    // re-generated into the typings yet — the SQL `prisma db push` on start
    // applies the column regardless, so the runtime write is fine.
    await (prisma as any).user.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        // Free up the unique email/phone slots so a future signup with
        // the same address isn't blocked by the soft-deleted row.
        email: null,
        phone: null,
        pushToken: null,
        apnsDeviceToken: null,
        // NOTE: isActive stays true. The admin "delete" action is a
        // RESET — clears the data and lets the user register fresh next
        // time they sign in (auth.ts revives the row). Use isActive=false
        // separately if you actually need to permanently ban someone.
      },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Soft-delete customer failed:', error);
    res.status(500).json({ error: 'Kunde inte ta bort kunden' });
  }
});

// Granular Deal Management
router.delete('/:id/deals/:dealId', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const customer = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, phone: true },
    });

    if (!customer) {
      return res.status(404).json({ error: 'Kunden hittades inte' });
    }

    const existing = await prisma.customerDeal.findFirst({
      where: {
        id: req.params.dealId,
        OR: [
          { userId: customer.id },
          ...(customer.phone ? [{ phone: customer.phone }] : []),
        ],
      },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Erbjudandet hittades inte för kunden' });
    }

    await prisma.customerDeal.delete({
      where: { id: req.params.dealId }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte radera erbjudandet' });
  }
});

router.patch('/:id/deals/:dealId', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { isUsed, usageCount } = req.body;

    const customer = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, phone: true },
    });

    if (!customer) {
      return res.status(404).json({ error: 'Kunden hittades inte' });
    }

    const existing = await prisma.customerDeal.findFirst({
      where: {
        id: req.params.dealId,
        OR: [
          { userId: customer.id },
          ...(customer.phone ? [{ phone: customer.phone }] : []),
        ],
      },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Erbjudandet hittades inte för kunden' });
    }

    const deal = await prisma.customerDeal.update({
      where: { id: req.params.dealId },
      data: { isUsed, usageCount: Number(usageCount) }
    });
    res.json(deal);
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte uppdatera erbjudandet' });
  }
});

router.post('/:id/deals', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { title, code, discountType, discountValue, maxUsages, validUntil } = req.body;

    if (!title || !code || discountValue === undefined || discountValue === null) {
      return res.status(400).json({ error: 'Titel, kod och rabattvärde krävs' });
    }

    const customer = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, phone: true },
    });

    if (!customer || !customer.phone) {
      return res.status(404).json({ error: 'Kunden hittades inte eller saknar telefonnummer' });
    }

    const normalizedCode = String(code).trim().toUpperCase();
    const normalizedType = discountType === 'FIXED' ? 'FIXED' : 'PERCENTAGE';
    const normalizedValue = normalizedType === 'FIXED'
      ? normalizeMoneyToOre(Number(discountValue || 0))
      : Math.round(Number(discountValue || 0));

    const deal = await prisma.$transaction(async (tx) => {
      const campaign = await tx.campaign.create({
        data: {
          title: String(title).trim(),
          description: 'Personligt kunddeal från adminpanelen',
          discountType: normalizedType,
          discountValue: normalizedValue,
          maxUsagesPerCustomer: Math.max(1, Number(maxUsages || 1)),
          validUntil: validUntil ? new Date(validUntil) : null,
        },
      });

      return tx.customerDeal.create({
        data: {
          campaignId: campaign.id,
          userId: customer.id,
          phone: customer.phone,
          code: normalizedCode,
          maxUsages: Math.max(1, Number(maxUsages || 1)),
        },
        include: {
          campaign: true,
          user: { select: { name: true, phone: true } },
        },
      });
    });

    res.status(201).json(deal);
  } catch (error: any) {
    if (error?.code === 'P2002') {
      return res.status(400).json({ error: 'Denna kod används redan' });
    }

    res.status(500).json({ error: 'Kunde inte skapa personlig deal' });
  }
});

export default router;
