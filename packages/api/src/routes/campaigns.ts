import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin } from '../middleware/auth';

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
    res.json(campaigns);
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte hämta kampanjer' });
  }
});

// POST /api/campaigns - Create a new campaign
router.post('/', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { title, description, discountType, discountValue, minOrder, maxUsagesPerCustomer, validFrom, validUntil } = req.body;
    const campaign = await prisma.campaign.create({
      data: {
        title, description, discountType, discountValue, minOrder, maxUsagesPerCustomer,
        validFrom: validFrom ? new Date(validFrom) : null,
        validUntil: validUntil ? new Date(validUntil) : null,
      }
    });
    res.json(campaign);
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
    res.json(campaign);
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte hämta kampanjdetaljer' });
  }
});

// PATCH /api/campaigns/:id - Update campaign
router.patch('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const campaign = await prisma.campaign.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(campaign);
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte uppdatera kampanj' });
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

    if (users.length === 0) return res.json({ success: true, generated: 0, message: 'Inga matchande kunder hittades' });

    // Generate deals
    const batchSize = 100; // Small batches for large user sets
    let createdCount = 0;
    
    for (const u of users) {
      // Check if user already has a deal for this campaign
      const existing = await prisma.customerDeal.findFirst({
        where: { campaignId, phone: u.phone! }
      });
      if (existing) continue;

      // Unique code: [CAMPAIGN_PREFIX][RANDOM] or specific pattern
      const code = `DEAL-${campaignId.slice(-4)}-${u.phone!.slice(-4)}-${Math.random().toString(36).substring(2, 5).toUpperCase()}`;
      
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
    }

    res.json({ success: true, generated: createdCount });
  } catch (error) {
    console.error('Generate error:', error);
    res.status(500).json({ error: 'Kunde inte generera erbjudanden' });
  }
});

export default router;
