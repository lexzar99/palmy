import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { PARTNER_INBOX, PartnerApplicationSchema, partnerApplicationId, partnerApplicationBody, partnerRetentionCutoff } from '../lib/partnerApplications';

const router = Router();
const limiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 8, standardHeaders: true, legacyHeaders: false, message: { error: 'För många försök. Försök igen om en stund.' } });
const scope = { authorName: PARTNER_INBOX, restaurantId: null, orderId: null, customerPhone: null };
// Egen namnrymd i befintlig anteckningslagring. Ingen schemamigrering krävs.
async function expireApplications() {
  await prisma.note.deleteMany({ where: { ...scope, createdAt: { lt: partnerRetentionCutoff() } } });
}
router.post('/interest', limiter, async (req, res) => {
  const parsed = PartnerApplicationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Kontrollera namn, e-post och obligatoriska fält.' });
  if (parsed.data.website) return res.status(200).json({ ok: true });
  try {
    await expireApplications();
    const input = parsed.data;
    // Oautentiserade återförsök får inte skriva över en tidigare anmälan.
    await prisma.note.upsert({ where: { id: partnerApplicationId(input) }, update: {}, create: {
      id: partnerApplicationId(input), ...scope, body: partnerApplicationBody(input),
    } });
    return res.status(200).json({ ok: true });
  } catch {
    console.error('[partner-inbox] Anmälan kunde inte sparas');
    return res.status(503).json({ error: 'Anmälan kunde inte sparas. Försök igen om en stund.' });
  }
});
router.get('/admin', authenticate, requireSuperAdmin, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const page = z.coerce.number().int().min(1).max(10000).safeParse(req.query.page ?? 1);
  if (!page.success) return res.status(400).json({ error: 'Ogiltig sida' });
  try {
    await expireApplications();
    const where = { ...scope, createdAt: { gte: partnerRetentionCutoff() } };
    const [rows, total] = await Promise.all([
      prisma.note.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50, skip: (page.data - 1) * 50 }),
      prisma.note.count({ where }),
    ]);
    return res.json({ items: rows.map(row => ({ ...JSON.parse(row.body), id: row.id, createdAt: row.createdAt })), total, page: page.data });
  } catch {
    return res.status(503).json({ error: 'Kunde inte läsa anmälningarna' });
  }
});
router.patch('/admin/:id', authenticate, requireSuperAdmin, async (req, res) => {
  const input = z.object({ status: z.enum(['new', 'contacted']) }).strict().safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Ogiltig status' });
  try {
    const row = await prisma.note.findFirst({ where: { ...scope, id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'Anmälan finns inte' });
    await prisma.note.update({ where: { id: row.id }, data: { body: JSON.stringify({ ...JSON.parse(row.body), status: input.data.status }) } });
    return res.json({ ok: true });
  } catch { return res.status(503).json({ error: 'Kunde inte ändra status' }); }
});
router.delete('/admin/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    await prisma.note.deleteMany({ where: { ...scope, id: req.params.id } });
    return res.json({ ok: true });
  } catch { return res.status(503).json({ error: 'Kunde inte radera anmälan' }); }
});
export default router;
