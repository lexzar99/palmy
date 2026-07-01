import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { ENGINE_DEFS, getEngineSettings, readOccasions, writeOccasions, type EngineKey, type OccasionItem } from '../lib/homePulse';
import { readABTests, writeABTests, abTestStats, type ABTestItem } from '../lib/abTests';

const router = Router();
router.use(authenticate, requireSuperAdmin);

// GET /api/admin/engines — motorlista med inställningar för Motorn-sidan.
router.get('/', async (_req, res) => {
  try {
    const settings = await getEngineSettings();
    res.json({
      engines: ENGINE_DEFS.map((def) => ({
        key: def.key,
        title: def.title,
        description: def.description,
        paramLabels: def.paramLabels,
        enabled: settings[def.key].enabled,
        params: settings[def.key].params,
      })),
    });
  } catch (error: any) {
    console.error('[engines list] error:', error?.message);
    res.status(500).json({ error: 'Kunde inte läsa motorerna' });
  }
});

const PatchSchema = z.object({
  enabled: z.boolean().optional(),
  params: z.record(z.string(), z.number()).optional(),
});

// PATCH /api/admin/engines/:key — slå på/av eller ändra parametrar.
router.patch('/:key', async (req, res) => {
  const key = req.params.key as EngineKey;
  const def = ENGINE_DEFS.find((d) => d.key === key);
  if (!def) return res.status(404).json({ error: 'Okänd motor' });
  try {
    const data = PatchSchema.parse(req.body);
    const current = await (prisma as any).engineSetting.findUnique({ where: { key } });
    const params = { ...def.defaultParams, ...((current?.params as any) || {}), ...(data.params || {}) };
    const row = await (prisma as any).engineSetting.upsert({
      where: { key },
      create: { key, enabled: data.enabled ?? true, params },
      update: { ...(data.enabled !== undefined ? { enabled: data.enabled } : {}), params },
    });
    res.json({ key, enabled: row.enabled, params: row.params });
  } catch (error: any) {
    if (error?.name === 'ZodError') return res.status(400).json({ error: 'Ogiltiga parametrar' });
    console.error('[engines patch] error:', error?.message);
    res.status(500).json({ error: 'Kunde inte spara motorn' });
  }
});

// ── Occasions-kalendern: återkommande tillfällen (lagras som JSON) ──────────
router.get('/occasions', async (_req, res) => {
  res.json({ items: await readOccasions() });
});

const OccasionSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      title: z.string().min(1),
      subtitle: z.string().optional(),
      theme: z.string().optional(),
      days: z.array(z.number().int().min(0).max(6)),
      startHour: z.number().int().min(0).max(23),
      endHour: z.number().int().min(1).max(24),
      active: z.boolean(),
    }),
  ),
});

router.put('/occasions', async (req, res) => {
  try {
    const data = OccasionSchema.parse(req.body);
    await writeOccasions(data.items as OccasionItem[]);
    res.json({ items: data.items });
  } catch (error: any) {
    if (error?.name === 'ZodError') return res.status(400).json({ error: 'Ogiltiga tillfällen' });
    console.error('[occasions put] error:', error?.message);
    res.status(500).json({ error: 'Kunde inte spara tillfällena' });
  }
});

// ── A/B-tester: två deals mot varandra, deterministisk split per kund ───────
router.get('/ab-tests', async (_req, res) => {
  try {
    const items = await readABTests();
    const dealIds = [...new Set(items.flatMap((t) => [t.dealAId, t.dealBId]).filter(Boolean))];
    const deals = dealIds.length
      ? await prisma.deal.findMany({ where: { id: { in: dealIds } }, select: { id: true, title: true } })
      : [];
    const titleById = new Map(deals.map((d) => [d.id, d.title]));
    const withStats = await Promise.all(
      items.map(async (test) => ({
        ...test,
        dealATitle: titleById.get(test.dealAId) || test.dealAId,
        dealBTitle: titleById.get(test.dealBId) || test.dealBId,
        stats: await abTestStats(test),
      })),
    );
    res.json({ items: withStats });
  } catch (error: any) {
    console.error('[ab-tests get] error:', error?.message);
    res.status(500).json({ error: 'Kunde inte läsa A/B-testerna' });
  }
});

const ABTestSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      dealAId: z.string().min(1),
      dealBId: z.string().min(1),
      active: z.boolean(),
      createdAt: z.string().optional(),
    }),
  ),
});

router.put('/ab-tests', async (req, res) => {
  try {
    const data = ABTestSchema.parse(req.body);
    await writeABTests(data.items as ABTestItem[]);
    res.json({ items: data.items });
  } catch (error: any) {
    if (error?.name === 'ZodError') return res.status(400).json({ error: 'Ogiltiga A/B-tester' });
    console.error('[ab-tests put] error:', error?.message);
    res.status(500).json({ error: 'Kunde inte spara A/B-testerna' });
  }
});

// ── Utjämnaren: restauranger under sitt snitt + skapa deal-utkast ───────────
// Beräknas på begäran (ingen lagring): denna vecka vs snittet av 4 föregående.
router.get('/underperformers', async (_req, res) => {
  try {
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const [thisWeek, prior] = await Promise.all([
      (prisma.order.groupBy as any)({
        by: ['restaurantId'],
        where: { createdAt: { gte: new Date(now - weekMs) }, status: { notIn: ['CANCELLED', 'REJECTED'] }, restaurantId: { not: null } },
        _count: { _all: true },
      }),
      (prisma.order.groupBy as any)({
        by: ['restaurantId'],
        where: { createdAt: { gte: new Date(now - 5 * weekMs), lt: new Date(now - weekMs) }, status: { notIn: ['CANCELLED', 'REJECTED'] }, restaurantId: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const thisByRestaurant = new Map<string, number>((thisWeek as any[]).map((g) => [g.restaurantId, g._count._all]));
    const suggestions: any[] = [];
    for (const g of prior as any[]) {
      const avgPerWeek = g._count._all / 4;
      if (avgPerWeek < 3) continue; // för lite historik för att dra slutsatser
      const current = thisByRestaurant.get(g.restaurantId) || 0;
      if (current >= avgPerWeek * 0.6) continue;
      suggestions.push({ restaurantId: g.restaurantId, thisWeek: current, avgPerWeek: Math.round(avgPerWeek * 10) / 10 });
    }
    if (!suggestions.length) return res.json({ suggestions: [] });
    const restaurants = await prisma.restaurant.findMany({
      where: { id: { in: suggestions.map((s) => s.restaurantId) } },
      select: { id: true, name: true, slug: true },
    });
    const byId = new Map(restaurants.map((r) => [r.id, r]));
    // Finns redan ett aktivt/utkast-deal från utjämnaren? Visa inte förslaget igen.
    const existing = await prisma.deal.findMany({
      where: { restaurantId: { in: suggestions.map((s) => s.restaurantId) }, badgeText: 'Utjämnaren', OR: [{ isActive: true }, { validUntil: { gte: new Date() } }] },
      select: { restaurantId: true },
    });
    const hasDeal = new Set(existing.map((d) => d.restaurantId));
    res.json({
      suggestions: suggestions
        .filter((s) => !hasDeal.has(s.restaurantId))
        .map((s) => ({ ...s, restaurant: byId.get(s.restaurantId) || null, suggestedPercent: 15 }))
        .filter((s) => s.restaurant),
    });
  } catch (error: any) {
    console.error('[underperformers] error:', error?.message);
    res.status(500).json({ error: 'Kunde inte beräkna förslagen' });
  }
});

// Skapar ett deal-UTKAST (inaktivt) — admin aktiverar i App-deals-fliken.
router.post('/underperformers/:restaurantId/create-deal', async (req, res) => {
  try {
    const percent = Math.min(30, Math.max(5, Math.round(Number(req.body?.percent) || 15)));
    const restaurant = await prisma.restaurant.findUnique({ where: { id: req.params.restaurantId }, select: { id: true, name: true } });
    if (!restaurant) return res.status(404).json({ error: 'Restaurangen hittades inte' });
    const validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const deal = await prisma.deal.create({
      data: {
        title: `${percent}% hos ${restaurant.name}`,
        description: 'Skapad av utjämnaren. Aktivera under Deals → App-deals.',
        badgeText: 'Utjämnaren',
        discountType: 'PERCENTAGE',
        discountValue: percent,
        minOrder: 0,
        isActive: false,
        showOnSite: false,
        popupEnabled: false,
        restaurantId: restaurant.id,
        triggerType: 'NONE',
        appEnabled: true,
        appPlacement: 'HOME_TOP',
        validUntil,
      } as any,
    });
    await (prisma as any).engineEvent.create({
      data: {
        id: `ev${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        engine: 'underperformers',
        message: `Deal-utkast skapat: ${percent}% hos ${restaurant.name} (aktiveras i App-deals)`,
        meta: { dealId: deal.id, restaurantId: restaurant.id, percent },
      },
    }).catch(() => null);
    res.status(201).json({ dealId: deal.id });
  } catch (error: any) {
    console.error('[underperformers create-deal] error:', error?.message);
    res.status(500).json({ error: 'Kunde inte skapa utkastet' });
  }
});

// GET /api/admin/engines/events — händelseloggen ("allt som händer ska synas").
router.get('/events', async (req, res) => {
  try {
    const engine = typeof req.query.engine === 'string' && req.query.engine ? req.query.engine : undefined;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const events = await (prisma as any).engineEvent.findMany({
      where: engine ? { engine } : {},
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    res.json({ events });
  } catch (error: any) {
    console.error('[engines events] error:', error?.message);
    res.status(500).json({ error: 'Kunde inte läsa händelserna' });
  }
});

export default router;
