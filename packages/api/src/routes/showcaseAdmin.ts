/**
 * Admin-styrning av hemskärmens dynamiska kort (rabatter / trendar / ny i stan).
 * Ersätter den gamla Motorn-sidan. Allt beräknas dynamiskt i lib/showcase;
 * här kan super-admin se urvalet, toggla bort/lägga till manuellt och sätta
 * rotationstiden per yta. Manuella overrides gäller tills nästa rotation.
 */
import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { getShowcaseAdmin, patchShowcase, ShowcaseSurface } from '../lib/showcase';

const router = Router();
const SURFACES: ShowcaseSurface[] = ['discounts', 'trending', 'new'];

// ── GET /api/admin/showcase — urval + kandidater + rotationskonfig ───────────
router.get('/', authenticate, requireSuperAdmin, async (_req, res) => {
  try {
    const surfaces = await getShowcaseAdmin();
    // Alla aktiva restauranger för den manuella plockaren (trend/ny kan peka på
    // vilken restaurang som helst; rabatter begränsas av kandidatlistan).
    const restaurants = await prisma.restaurant.findMany({
      where: { comingSoon: false },
      select: { id: true, name: true, slug: true, featuredClass: true },
      orderBy: { name: 'asc' },
    });
    res.json({ surfaces, restaurants });
  } catch (e: any) {
    console.error('[showcase admin] error:', e?.message);
    res.status(500).json({ error: 'Kunde inte hämta showcase' });
  }
});

// ── PATCH /api/admin/showcase/:surface — override + rotationstid ─────────────
router.patch('/:surface', authenticate, requireSuperAdmin, async (req, res) => {
  const surface = req.params.surface as ShowcaseSurface;
  if (!SURFACES.includes(surface)) return res.status(400).json({ error: 'Okänd yta' });
  try {
    const { rotationHours, hide, unhide, pin, unpin } = req.body || {};
    await patchShowcase(surface, {
      rotationHours: rotationHours != null ? Number(rotationHours) : undefined,
      hide: typeof hide === 'string' ? hide : undefined,
      unhide: typeof unhide === 'string' ? unhide : undefined,
      pin: typeof pin === 'string' ? pin : undefined,
      unpin: typeof unpin === 'string' ? unpin : undefined,
    });
    const surfaces = await getShowcaseAdmin();
    res.json({ surfaces });
  } catch (e: any) {
    console.error('[showcase admin] patch error:', e?.message);
    res.status(500).json({ error: 'Kunde inte uppdatera showcase' });
  }
});

export default router;
