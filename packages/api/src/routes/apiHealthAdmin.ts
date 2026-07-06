/**
 * GET /api/admin/api-health — admin "API-hälsa"-dashboard.
 * Visar per extern tjänst: konfigurerad? + live-status (testanrop) + vår
 * användning denna månad vs ev. free-tier-gräns. Exponerar ALDRIG nyckelvärden.
 */
import { Router } from 'express';
import { authenticate, requireOpsViewer } from '../middleware/auth';
import { getApiHealth } from '../lib/apiHealth';
import { getCapacityMetrics } from '../lib/capacity';

const router = Router();

// requireOpsViewer: SUPER_ADMIN + GLOBAL_VIEWER (Falken analyserar drift).
// Svaret exponerar aldrig nyckelvärden, bara status/metrik.
router.get('/', authenticate, requireOpsViewer, async (_req, res) => {
  try {
    const [health, capacity] = await Promise.all([getApiHealth(), getCapacityMetrics()]);
    res.json({ ...health, capacity });
  } catch (e: any) {
    console.error('[api-health] error:', e?.message);
    res.status(500).json({ error: 'Kunde inte hämta API-status' });
  }
});

export default router;
