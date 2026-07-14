import { Router } from 'express';
import prisma from '../lib/prisma';

const router = Router();
const EVENT_TYPES = new Set(['PAGE_VIEW', 'DISCOUNT_CTA_CLICK', 'ACCESS_UNLOCK']);

// Anonymiserad launch-mätning. Ingen IP-adress eller PII sparas här. Samtycke
// styrs i webben; API:t validerar ändå eventtypen och begränsar fältlängder.
router.post('/events', async (req, res) => {
  try {
    const eventType = String(req.body?.eventType || '').trim().toUpperCase();
    if (!EVENT_TYPES.has(eventType)) {
      return res.status(400).json({ error: 'Ogiltig händelsetyp' });
    }

    const sessionId = typeof req.body?.sessionId === 'string'
      ? req.body.sessionId.trim().slice(0, 100) || null
      : null;
    const referrer = typeof req.body?.referrer === 'string'
      ? req.body.referrer.trim().slice(0, 500) || null
      : null;
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 500) || null;

    await (prisma as any).launchEvent.create({
      data: { eventType, sessionId, referrer, userAgent },
    });
    return res.status(204).end();
  } catch (error) {
    console.error('[launch/events] error:', error);
    return res.status(500).json({ error: 'Kunde inte registrera händelsen' });
  }
});

export default router;
