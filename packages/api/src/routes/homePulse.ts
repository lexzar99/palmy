import { Router } from 'express';
import { buildHomePulse } from '../lib/homePulse';
import { cached } from '../lib/ttlCache';
import { authenticateUserOptional } from './auth';

const router = Router();

// GET /api/home/pulse — serverkomponerad, levande hemskärm (max 3 moduler/dag).
// Delade moduler cachas kort; poäng-knuffen är personlig och beräknas per kund.
router.get('/pulse', authenticateUserOptional, async (req: any, res) => {
  try {
    const userId: string | null = req.user?.id || null;
    const payload = userId
      ? await buildHomePulse(userId)
      : await cached('home:pulse', 'anon', 300_000, () => buildHomePulse(null));
    res.json(payload);
  } catch (error: any) {
    console.error('[home/pulse] error:', error?.message);
    res.json({ modules: [] }); // hemskärmen ska aldrig blockeras av pulsen
  }
});

export default router;
