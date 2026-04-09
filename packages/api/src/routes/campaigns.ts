import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { normalizeMoneyToOre } from '../utils/deliveryZones';

const router = Router();

// GET /api/campaigns - List all campaigns
router.get('/', authenticate, requireSuperAdmin, async (_req, res) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      include: {
        _count: {
          select: { deals: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(
      campaigns.map((c) => ({
        ...c,
        discountValue:
          c.discountType === 'FIXED'
            ? normalizeMoneyToOre(Number(c.discountValue || 0)) / 100
            : c.discountValue,
        minOrder: normalizeMoneyToOre(Number(c.minOrder || 0)) / 100,
      })),
    );
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte hämta kampanjer' });
  }
});

// POST /api/campaigns - Create a new campaign
router.post('/', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { title, description, discountType, discountValue, minOrder, maxUsagesPerCustomer, validFrom, validUntil } = req.body;
    const discountValueDb =
      discountType === 'FIXED' ? normalizeMoneyToOre(Number(discountValue || 0)) : Math.round(Number(discountValue || 0));
    const minOrderDb = normalizeMoneyToOre(Number(minOrder || 0));
    const campaign = await prisma.campaign.create({
      data: {
        title,
        description,
        discountType,
        discountValue: discountValueDb,
        minOrder: minOrderDb,
        maxUsagesPerCustomer,
        validFrom: validFrom ? new Date(validFrom) : null,
        validUntil: validUntil ? new Date(validUntil) : null,
      }
    });
    res.json({
      ...campaign,
      discountValue:
        campaign.discountType === 'FIXED'
          ? normalizeMoneyToOre(Number(campaign.discountValue || 0)) / 100
          : campaign.discountValue,
      minOrder: normalizeMoneyToOre(Number(campaign.minOrder || 0)) / 100,
    });
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte skapa kampanj' });
  }
});

// GET /api/campaigns/:id - Single campaign details
router.get('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: {
        deals: {
          include: { user: { select: { name: true, phone: true } } },
          take: 100, // Limit for performance
          orderBy: { createdAt: 'desc' }
        }
      }
    });
    if (!campaign) return res.status(404).json({ error: 'Kampanj hittades inte' });
    res.json({
      ...campaign,
      discountValue:
        campaign.discountType === 'FIXED'
          ? normalizeMoneyToOre(Number(campaign.discountValue || 0)) / 100
          : campaign.discountValue,
      minOrder: normalizeMoneyToOre(Number(campaign.minOrder || 0)) / 100,
    });
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte hämta kampanjdetaljer' });
  }
});

// PATCH /api/campaigns/:id - Update campaign
router.patch('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { id, _count, deals, createdAt, updatedAt, ...data } = req.body;

    // If discountValue is provided without discountType, we need the current type to convert correctly.
    const existing = (data.discountValue !== undefined && data.discountType === undefined)
      ? await prisma.campaign.findUnique({ where: { id: req.params.id }, select: { discountType: true } })
      : null;
    const effectiveDiscountType = data.discountType ?? existing?.discountType;

    const updateData: any = { ...data };
    if (data.minOrder !== undefined) updateData.minOrder = normalizeMoneyToOre(Number(data.minOrder || 0));
    if (data.discountValue !== undefined) {
      updateData.discountValue =
        effectiveDiscountType === 'FIXED'
          ? normalizeMoneyToOre(Number(data.discountValue || 0))
          : Math.round(Number(data.discountValue || 0));
    }
    if (data.validFrom !== undefined) updateData.validFrom = data.validFrom ? new Date(data.validFrom) : null;
    if (data.validUntil !== undefined) updateData.validUntil = data.validUntil ? new Date(data.validUntil) : null;

    const campaign = await prisma.campaign.update({
      where: { id: req.params.id },
      data: updateData
    });
    res.json({
      ...campaign,
      discountValue:
        campaign.discountType === 'FIXED'
          ? normalizeMoneyToOre(Number(campaign.discountValue || 0)) / 100
          : campaign.discountValue,
      minOrder: normalizeMoneyToOre(Number(campaign.minOrder || 0)) / 100,
    });
  } catch (error) {
    console.error('Update campaign error:', error);
    res.status(500).json({ error: 'Kunde inte uppdatera kampanj' });
  }
});

// DELETE /api/campaigns/:id - Delete campaign and generated personal deals
router.delete('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const existing = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Kampanj hittades inte' });
    }

    await prisma.$transaction([
      prisma.customerDeal.deleteMany({ where: { campaignId: req.params.id } }),
      prisma.campaign.delete({ where: { id: req.params.id } }),
    ]);

    res.json({ success: true });
  } catch (error) {
    console.error('Delete campaign error:', error);
    res.status(500).json({ error: 'Kunde inte radera kampanj' });
  }
});

// POST /api/campaigns/:id/generate - Bull generate deals for customers
router.post('/:id/generate', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { minOrders, maxOrders, phoneList, userIds } = req.body;
    const campaignId = req.params.id;
    const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!campaign) return res.status(404).json({ error: 'Kampanj hittades inte' });

    // Build the query to find eligible users
    let users: any[] = [];
    if (userIds && userIds.length > 0) {
      // Direct selection
      users = await prisma.user.findMany({ where: { id: { in: userIds } } });
    } else if (phoneList && phoneList.length > 0) {
      // Phone direct selection
      users = await prisma.user.findMany({ where: { phone: { in: phoneList } } });
    } else {
      // Filtering based on order counts
      // Note: prisma doesn't support complex count filtering easily in findMany without aggregate
      // We'll use a more simple approach for this MVP
      const allUsers = await prisma.user.findMany({
        include: { _count: { select: { orders: true } } }
      });
      users = allUsers.filter(u => {
        const count = u._count.orders;
        const minPass = minOrders === undefined || count >= minOrders;
        const maxPass = maxOrders === undefined || count <= maxOrders;
        return minPass && maxPass && u.phone; // Must have phone
      });
    }

    if (users.length === 0) return res.json({ success: true, generated: 0, message: 'Inga matchande kunder hittades.' });

    // Filter out users without phones just in case
    const eligibleUsers = users.filter(u => u.phone);
    if (eligibleUsers.length === 0) return res.json({ success: true, generated: 0, message: 'Inga av de valda kunderna har ett registrerat telefonnummer.' });

    // Generate deals
    let createdCount = 0;
    let alreadyHadCount = 0;
    
    for (const u of eligibleUsers) {
      // Check if user already has a deal for this campaign
      const existing = await prisma.customerDeal.findFirst({
        where: { campaignId, phone: u.phone! }
      });
      if (existing) {
        alreadyHadCount++;
        continue;
      }

      // Unique code: [CAMPAIGN_PREFIX][RANDOM] or specific pattern
      const code = `DEAL-${campaignId.slice(-4)}-${u.phone!.slice(-4)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
      
      try {
        await prisma.customerDeal.create({
          data: {
            campaignId,
            userId: u.id,
            phone: u.phone!,
            code,
            maxUsages: campaign.maxUsagesPerCustomer
          }
        });
        createdCount++;
      } catch (e) {
        console.error('Failed to create deal for user', u.id, e);
      }
    }

    const message = createdCount === 0 && alreadyHadCount > 0 
      ? `Alla valda kunder (${alreadyHadCount} st) har redan aktiva koder för denna kampanj.` 
      : `Klart! Genererade ${createdCount} unika koder. ${alreadyHadCount > 0 ? `(${alreadyHadCount} kunder hade redan koder)` : ""}`;

    res.json({ success: true, generated: createdCount, message });
  } catch (error) {
    console.error('Generate error:', error);
    res.status(500).json({ error: 'Kunde inte generera erbjudanden' });
  }
});

export default router;
