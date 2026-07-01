import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { DEAL_SEGMENTS, isDealSegment, countSegment } from '../lib/segments';
import { runDealCampaign } from '../lib/dealAssignment';

const router = Router();

const VariantSchema = z.object({
  dealTemplateId: z.string().min(1),
  weight: z.number().int().positive(),
});

const CampaignSchema = z.object({
  title: z.string().min(1),
  status: z.enum(['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'DONE']).optional(),
  segment: z.string().refine(isDealSegment, 'Okänt segment'),
  restaurantId: z.string().nullable().optional(),
  brandId: z.string().nullable().optional(),
  variants: z.array(VariantSchema).min(1, 'Lägg minst en variant'),
  capPerCustomer: z.number().int().positive().max(50).optional(),
  validDays: z.number().int().positive().max(365).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
});

// Segment-lista för admin-dropdownen.
router.get('/segments', authenticate, requireSuperAdmin, async (_req, res) => {
  res.json({ segments: DEAL_SEGMENTS });
});

// Mall-deals (variant-poolen bygger på dessa).
router.get('/templates', authenticate, requireSuperAdmin, async (_req, res) => {
  const templates = await prisma.deal.findMany({
    where: { isTemplate: true },
    select: {
      id: true,
      title: true,
      discountType: true,
      discountValue: true,
      freeDelivery: true,
      minOrder: true,
      appDpointsBonus: true,
      appTemplate: true,
      appTheme: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ templates });
});

const TemplateSchema = z.object({
  title: z.string().min(1),
  discountType: z.enum(['PERCENTAGE', 'FIXED', 'NONE']),
  discountValue: z.number().nonnegative(), // PERCENTAGE = procent, FIXED = kr
  freeDelivery: z.boolean().optional().default(false),
  appDpointsBonus: z.number().int().nonnegative().optional().default(0),
  minOrderKr: z.number().nonnegative().optional().default(0),
  appTemplate: z.string().optional(),
  appTheme: z.string().nullable().optional(),
});

// Skapa en mall (Deal med isTemplate=true). Syns inte i browse-feeden; används
// bara av variant-poolen. Belopp anges i kr, lagras i öre.
router.post('/templates', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const data = TemplateSchema.parse(req.body);
    const discountValue =
      data.discountType === 'FIXED'
        ? Math.round(data.discountValue * 100) // kr -> öre
        : data.discountType === 'PERCENTAGE'
          ? Math.round(data.discountValue)
          : 0;
    const template = await prisma.deal.create({
      data: {
        title: data.title,
        discountType: data.discountType,
        discountValue,
        freeDelivery: data.freeDelivery,
        minOrder: Math.round((data.minOrderKr || 0) * 100),
        appDpointsBonus: data.appDpointsBonus,
        appTemplate: data.appTemplate || 'PERCENT',
        appTheme: data.appTheme ?? null,
        isTemplate: true,
        appEnabled: false,
        isActive: true,
        isGlobal: true,
      },
    });
    res.status(201).json({ template });
  } catch (error: any) {
    if (error?.name === 'ZodError') return res.status(400).json({ error: error.issues?.[0]?.message || 'Ogiltig mall' });
    console.error('[dealCampaigns template create] error:', error?.message);
    res.status(500).json({ error: 'Kunde inte skapa mallen' });
  }
});

// Preview: hur många kunder matchar ett segment just nu.
router.get('/preview', authenticate, requireSuperAdmin, async (req, res) => {
  const segment = String(req.query.segment || 'ALL');
  if (!isDealSegment(segment)) return res.status(400).json({ error: 'Okänt segment' });
  const count = await countSegment(segment);
  res.json({ segment, count });
});

router.get('/', authenticate, requireSuperAdmin, async (_req, res) => {
  const campaigns = await prisma.dealCampaign.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ campaigns });
});

router.get('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  const campaign = await prisma.dealCampaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return res.status(404).json({ error: 'Kampanjen hittades inte' });
  res.json({ campaign });
});

router.post('/', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const data = CampaignSchema.parse(req.body);
    const campaign = await prisma.dealCampaign.create({
      data: {
        title: data.title,
        status: data.status ?? 'DRAFT',
        segment: data.segment,
        restaurantId: data.restaurantId ?? null,
        brandId: data.brandId ?? null,
        variants: data.variants,
        capPerCustomer: data.capPerCustomer ?? 1,
        validDays: data.validDays ?? 7,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      },
    });
    res.status(201).json({ campaign });
  } catch (error: any) {
    if (error?.name === 'ZodError') return res.status(400).json({ error: error.issues?.[0]?.message || 'Ogiltig kampanj' });
    console.error('[dealCampaigns create] error:', error?.message);
    res.status(500).json({ error: 'Kunde inte skapa kampanjen' });
  }
});

router.patch('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const data = CampaignSchema.partial().parse(req.body);
    const patch: any = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.status !== undefined) patch.status = data.status;
    if (data.segment !== undefined) patch.segment = data.segment;
    if (data.restaurantId !== undefined) patch.restaurantId = data.restaurantId;
    if (data.brandId !== undefined) patch.brandId = data.brandId;
    if (data.variants !== undefined) patch.variants = data.variants;
    if (data.capPerCustomer !== undefined) patch.capPerCustomer = data.capPerCustomer;
    if (data.validDays !== undefined) patch.validDays = data.validDays;
    if (data.scheduledAt !== undefined) patch.scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null;
    const campaign = await prisma.dealCampaign.update({ where: { id: req.params.id }, data: patch });
    res.json({ campaign });
  } catch (error: any) {
    if (error?.name === 'ZodError') return res.status(400).json({ error: error.issues?.[0]?.message || 'Ogiltig kampanj' });
    console.error('[dealCampaigns patch] error:', error?.message);
    res.status(500).json({ error: 'Kunde inte spara kampanjen' });
  }
});

router.delete('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  await prisma.dealCampaign.delete({ where: { id: req.params.id } }).catch(() => null);
  res.json({ ok: true });
});

// Kör kampanjen direkt (tilldelar deals nu).
router.post('/:id/run', authenticate, requireSuperAdmin, async (req, res) => {
  const campaign = await prisma.dealCampaign.findUnique({ where: { id: req.params.id } });
  if (!campaign) return res.status(404).json({ error: 'Kampanjen hittades inte' });
  try {
    const result = await runDealCampaign(campaign);
    res.json(result);
  } catch (error: any) {
    console.error('[dealCampaigns run] error:', error?.message);
    res.status(500).json({ error: 'Kunde inte köra kampanjen' });
  }
});

export default router;
