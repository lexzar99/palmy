import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { ENGINE_DEFS, getEngineSettings, type EngineKey } from '../lib/homePulse';

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
