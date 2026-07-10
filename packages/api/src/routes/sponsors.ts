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
import { cached, bustCache } from '../lib/ttlCache';
import { getShowcaseCarousel } from '../lib/showcase';

const router = Router();
const RECORD_ID = 'global_sponsors';

export interface Sponsor {
  id: string;
  name: string;
  imageUrl: string;
  videoUrl?: string;
  // Korttyp styr layouten i appen:
  // RESTAURANT = partnerkort (tier-guld), DEAL = claim-knapp direkt i kortet,
  // AD = extern annons (märks "Annons"), TEXT = budskap/kampanj utan bild-krav.
  cardType?: 'RESTAURANT' | 'DEAL' | 'AD' | 'TEXT';
  dealId?: string;
  headline?: string;
  bodyText?: string;
  isActive: boolean;
  isClickable: boolean;
  infoText?: string;
  ctaText?: string;
  ctaLink?: string;
  linkType?: 'NONE' | 'EXTERNAL' | 'DEAL' | 'RESTAURANT';
  linkTarget?: string;
  showName?: boolean;
  imageOnly?: boolean;
  category?: string;
  tier?: string;
  tagline?: string;
  color?: string;
  startsAt?: string;
  endsAt?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt?: string;
  placement?: 'HOME_FEATURED' | 'HOME_INLINE' | 'POST_ORDER';
  layout?: 'LARGE_CARD' | 'COMPACT_CARD';
}

export async function readAllSponsors(): Promise<Sponsor[]> {
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
  // Single write path for all sponsor mutations → bust the public cache here so
  // sponsor changes show immediately.
  bustCache('sponsors:public', 'all');
}

// ── GET /api/sponsors — public, returns only active sponsors ─────────────────
router.get('/', async (_req, res) => {
  try {
    // Cache 60s: sponsors change rarely and are identical for everyone.
    const all = await cached('sponsors:public', 'all', 60_000, () => readAllSponsors());
    const now = new Date();
    const visible = all
      .filter(s => s.isActive)
      // Schemafönster: startsAt/endsAt respekteras (tomt = alltid).
      .filter(s => (!s.startsAt || new Date(s.startsAt) <= now) && (!s.endsAt || new Date(s.endsAt) >= now))
      .sort((a, b) => a.sortOrder - b.sortOrder);

    // DEAL-kort berikas med dealens värde så appen kan visa och claima direkt.
    const dealIds = visible.filter(s => (s.cardType === 'DEAL' || s.linkType === 'DEAL') && s.dealId).map(s => s.dealId as string);
    let dealById = new Map<string, any>();
    if (dealIds.length) {
      const deals = await prisma.deal.findMany({
        where: { id: { in: dealIds }, isActive: true, appEnabled: true },
        select: { id: true, title: true, discountType: true, discountValue: true, freeDelivery: true, minOrder: true },
      });
      dealById = new Map(deals.map((d) => [d.id, d]));
    }
    const payload = visible.map(s => {
      const deal = s.dealId ? dealById.get(s.dealId) : null;
      if (!deal) return s;
      const valueLabel = deal.freeDelivery
        ? 'Fri leverans'
        : deal.discountType === 'PERCENTAGE'
          ? `${deal.discountValue}% rabatt`
          : deal.discountType === 'FIXED'
            ? `${Math.round(deal.discountValue) / 100} kr rabatt`
            : '';
      return { ...s, dealInfo: { id: deal.id, title: deal.title, valueLabel, minOrderKr: Math.round(deal.minOrder || 0) / 100 } };
    });

    // Dynamiska hero-kort (rabatter + trendar + ny i stan) läggs först i
    // karusellen, alla distinkta restauranger. Rotation + manuella overrides
    // sköts i lib/showcase. Cache 60s så hemladdningar inte kör hela
    // beräkningen varje gång (rotation är 24-48h).
    const showcaseCards = await cached('sponsors:showcase', 'all', 60_000, () => getShowcaseCarousel(now)).catch(() => []);
    const showcaseSponsors = showcaseCards.map((c, index) => ({
      id: `showcase:${c.kind}:${c.restaurantId}`,
      name: c.restaurantName,
      badge: c.badge,
      tagline: c.subtitle || undefined,
      category: c.footnote || undefined,
      imageUrl: c.imageUrl || '',
      cardType: 'SHOWCASE' as const,
      showcaseKind: c.kind,
      theme: c.theme,
      color: c.theme,
      featuredClass: c.featuredClass,
      percent: c.percent,
      restaurantSlug: c.restaurantSlug,
      isActive: true,
      isClickable: true,
      linkType: 'RESTAURANT' as const,
      linkTarget: c.restaurantSlug,
      showName: false,
      sortOrder: -1000 + index,
      createdAt: new Date(0).toISOString(),
    }));

    res.json([...showcaseSponsors, ...payload]);
  } catch {
    res.status(500).json({ error: 'Kunde inte hämta sponsorer' });
  }
});

// ── GET /api/sponsors/all — admin, returns all sponsors ──────────────────────
router.get('/all', authenticate, requireSuperAdmin, async (_req, res) => {
  try {
    const all = await readAllSponsors();
    res.json(all.sort((a, b) => a.sortOrder - b.sortOrder));
  } catch {
    res.status(500).json({ error: 'Kunde inte hämta sponsorer' });
  }
});

// ── POST /api/sponsors — create sponsor ──────────────────────────────────────
router.post('/', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { name, imageUrl, videoUrl, cardType, dealId, headline, bodyText, isClickable, infoText, ctaText, ctaLink, linkType, linkTarget, showName, imageOnly, category, tier, tagline, color, startsAt, endsAt, placement, layout } = req.body;
    const resolvedCardType = ['RESTAURANT', 'DEAL', 'TEXT'].includes(String(cardType)) ? cardType : 'RESTAURANT';
    // TEXT-kort behöver ingen bild; övriga kräver den som tidigare.
    if (!name || (!imageUrl && resolvedCardType !== 'TEXT')) return res.status(400).json({ error: 'name och imageUrl krävs' });

    const sponsors = await readAllSponsors();
    const newSponsor: Sponsor = {
      id: Math.random().toString(36).slice(2, 12),
      name: String(name),
      imageUrl: String(imageUrl || ''),
      videoUrl: videoUrl || undefined,
      cardType: resolvedCardType,
      dealId: dealId || undefined,
      headline: headline || undefined,
      bodyText: bodyText || undefined,
      isActive: true,
      isClickable: Boolean(isClickable),
      infoText: infoText || undefined,
      ctaText: ctaText || undefined,
      ctaLink: ctaLink || undefined,
      linkType: linkType || 'EXTERNAL',
      linkTarget: linkTarget || undefined,
      imageOnly: Boolean(imageOnly),
      showName: imageOnly ? false : (showName ?? true),
      category: category || undefined,
      tier: tier || undefined,
      tagline: tagline || undefined,
      color: color || undefined,
      startsAt: startsAt || undefined,
      endsAt: endsAt || undefined,
      sortOrder: sponsors.length,
      createdAt: new Date().toISOString(),
      placement: ['HOME_FEATURED', 'HOME_INLINE', 'POST_ORDER'].includes(String(placement)) ? placement : 'HOME_FEATURED',
      layout: layout === 'COMPACT_CARD' ? 'COMPACT_CARD' : 'LARGE_CARD',
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
    const sponsors = await readAllSponsors();
    const idx = sponsors.findIndex(s => s.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Sponsor hittades inte' });

    const next = { ...sponsors[idx], ...req.body, id: sponsors[idx].id, updatedAt: new Date().toISOString() } as Sponsor;
    next.cardType = ['RESTAURANT', 'DEAL', 'TEXT'].includes(String(next.cardType)) ? next.cardType : 'RESTAURANT';
    next.placement = ['HOME_FEATURED', 'HOME_INLINE', 'POST_ORDER'].includes(String(next.placement))
      ? next.placement
      : 'HOME_FEATURED';
    next.layout = next.layout === 'COMPACT_CARD' ? 'COMPACT_CARD' : 'LARGE_CARD';
    sponsors[idx] = next;
    await writeSponsors(sponsors);
    res.json(sponsors[idx]);
  } catch {
    res.status(500).json({ error: 'Kunde inte uppdatera sponsor' });
  }
});

// ── DELETE /api/sponsors/:id ─────────────────────────────────────────────────
router.delete('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const sponsors = await readAllSponsors();
    const filtered = sponsors.filter(s => s.id !== req.params.id);
    await writeSponsors(filtered);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Kunde inte radera sponsor' });
  }
});

export default router;
