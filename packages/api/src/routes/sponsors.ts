/**
 * Sponsors API
 *
 * Sponsors are ads/partner images displayed in a horizontal scroll on the home pages.
 * Each sponsor can optionally flip to show info + a CTA link.
 *
 * Storage: JSON blob saved in RestaurantSettings with id='global_sponsors'.
 * This avoids a schema migration while keeping data in Postgres.
 */
import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { cached } from '../lib/ttlCache';

const router = Router();
const RECORD_ID = 'global_sponsors';

interface Sponsor {
  id: string;
  name: string;
  imageUrl: string;
  isActive: boolean;
  isClickable: boolean;
  infoText?: string;
  ctaText?: string;
  ctaLink?: string;
  linkType?: 'EXTERNAL' | 'DEAL' | 'RESTAURANT';
  linkTarget?: string;
  showName?: boolean;
  sortOrder: number;
  createdAt: string;
}

async function readSponsors(): Promise<Sponsor[]> {
  try {
    const row = await (prisma as any).restaurantSettings.findUnique({ where: { id: RECORD_ID } });
    if (!row) return [];
    return JSON.parse(row.openingHours || '[]') as Sponsor[];
  } catch {
    return [];
  }
}

async function writeSponsors(sponsors: Sponsor[]): Promise<void> {
  const json = JSON.stringify(sponsors);
  await (prisma as any).restaurantSettings.upsert({
    where: { id: RECORD_ID },
    create: {
      id: RECORD_ID,
      isOpen: true,
      deliveryFee: 0,
      minOrderAmount: 0,
      deliveryRadius: 0,
      estimatedPickupTime: 0,
      estimatedDeliveryTime: 0,
      notificationSound: 'none',
      openingHours: json,
    },
    update: { openingHours: json },
  });
}

// ── GET /api/sponsors — public, returns only active sponsors ─────────────────
router.get('/', async (_req, res) => {
  try {
    // Cache 60s: sponsors change rarely and are identical for everyone.
    const all = await cached('sponsors:public', 'all', 60_000, () => readSponsors());
    res.json(all.filter(s => s.isActive).sort((a, b) => a.sortOrder - b.sortOrder));
  } catch {
    res.status(500).json({ error: 'Kunde inte hämta sponsorer' });
  }
});

// ── GET /api/sponsors/all — admin, returns all sponsors ──────────────────────
router.get('/all', authenticate, requireSuperAdmin, async (_req, res) => {
  try {
    const all = await readSponsors();
    res.json(all.sort((a, b) => a.sortOrder - b.sortOrder));
  } catch {
    res.status(500).json({ error: 'Kunde inte hämta sponsorer' });
  }
});

// ── POST /api/sponsors — create sponsor ──────────────────────────────────────
router.post('/', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { name, imageUrl, isClickable, infoText, ctaText, ctaLink, linkType, linkTarget, showName } = req.body;
    if (!name || !imageUrl) return res.status(400).json({ error: 'name och imageUrl krävs' });

    const sponsors = await readSponsors();
    const newSponsor: Sponsor = {
      id: Math.random().toString(36).slice(2, 12),
      name: String(name),
      imageUrl: String(imageUrl),
      isActive: true,
      isClickable: Boolean(isClickable),
      infoText: infoText || undefined,
      ctaText: ctaText || undefined,
      ctaLink: ctaLink || undefined,
      linkType: linkType || 'EXTERNAL',
      linkTarget: linkTarget || undefined,
      showName: showName ?? true,
      sortOrder: sponsors.length,
      createdAt: new Date().toISOString(),
    };
    sponsors.push(newSponsor);
    await writeSponsors(sponsors);
    res.json(newSponsor);
  } catch {
    res.status(500).json({ error: 'Kunde inte skapa sponsor' });
  }
});

// ── PATCH /api/sponsors/:id — update sponsor ─────────────────────────────────
router.patch('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const sponsors = await readSponsors();
    const idx = sponsors.findIndex(s => s.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Sponsor hittades inte' });

    sponsors[idx] = { ...sponsors[idx], ...req.body, id: sponsors[idx].id };
    await writeSponsors(sponsors);
    res.json(sponsors[idx]);
  } catch {
    res.status(500).json({ error: 'Kunde inte uppdatera sponsor' });
  }
});

// ── DELETE /api/sponsors/:id ─────────────────────────────────────────────────
router.delete('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const sponsors = await readSponsors();
    const filtered = sponsors.filter(s => s.id !== req.params.id);
    await writeSponsors(filtered);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Kunde inte radera sponsor' });
  }
});

export default router;
