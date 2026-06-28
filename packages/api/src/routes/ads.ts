/**
 * Tracking Ads API
 *
 * Ads are the small "ANNONS" banners shown below active order tracking on the
 * customer home screen. They are intentionally separate from sponsor cards.
 *
 * Storage mirrors sponsors for now: a JSON blob in RestaurantSettings. This keeps
 * the feature deployable without a schema migration while still being fully
 * backend-driven and editable from admin.
 */
import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { cached, bustCache } from '../lib/ttlCache';

const router = Router();
const RECORD_ID = 'global_tracking_ads';

export interface TrackingAd {
  id: string;
  brand: string;
  title: string;
  subtitle: string;
  imageUrl?: string;
  url?: string;
  imageOnly?: boolean;
  startsAt?: string;
  endsAt?: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt?: string;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeDate(value: any): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function isCurrentlyVisible(ad: TrackingAd) {
  if (!ad.isActive) return false;
  const now = Date.now();
  const startsAt = ad.startsAt ? new Date(ad.startsAt).getTime() : null;
  const endsAt = ad.endsAt ? new Date(ad.endsAt).getTime() : null;
  if (startsAt && startsAt > now) return false;
  if (endsAt && endsAt < now) return false;
  return true;
}

async function readAds(): Promise<TrackingAd[]> {
  try {
    const row = await (prisma as any).restaurantSettings.findUnique({ where: { id: RECORD_ID } });
    if (!row) return [];
    const parsed = JSON.parse(row.openingHours || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAds(ads: TrackingAd[]): Promise<void> {
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
      openingHours: JSON.stringify(ads),
    },
    update: { openingHours: JSON.stringify(ads) },
  });
  bustCache('tracking-ads:public', 'all');
}

function writeData(input: any, current?: TrackingAd): TrackingAd {
  const createdAt = current?.createdAt || nowIso();
  return {
    id: current?.id || Math.random().toString(36).slice(2, 12),
    brand: String(input.brand ?? current?.brand ?? '').trim(),
    title: String(input.title ?? current?.title ?? '').trim(),
    subtitle: String(input.subtitle ?? input.text ?? current?.subtitle ?? '').trim(),
    imageUrl: input.imageUrl !== undefined ? (input.imageUrl || undefined) : current?.imageUrl,
    url: input.url !== undefined ? (input.url || undefined) : current?.url,
    imageOnly: input.imageOnly !== undefined ? !!input.imageOnly : (current?.imageOnly ?? false),
    startsAt: input.startsAt !== undefined ? normalizeDate(input.startsAt) : current?.startsAt,
    endsAt: input.endsAt !== undefined ? normalizeDate(input.endsAt) : current?.endsAt,
    isActive: input.isActive !== undefined ? !!input.isActive : (current?.isActive ?? true),
    sortOrder: input.sortOrder !== undefined ? Math.max(0, Math.round(Number(input.sortOrder) || 0)) : (current?.sortOrder ?? 0),
    createdAt,
    updatedAt: current ? nowIso() : undefined,
  };
}

router.get('/', async (_req, res) => {
  try {
    const all = await cached('tracking-ads:public', 'all', 60_000, () => readAds());
    res.json(all.filter(isCurrentlyVisible).sort((a, b) => a.sortOrder - b.sortOrder));
  } catch {
    res.status(500).json({ error: 'Kunde inte hämta annonser' });
  }
});

router.get('/all', authenticate, requireSuperAdmin, async (_req, res) => {
  try {
    const all = await readAds();
    res.json(all.sort((a, b) => a.sortOrder - b.sortOrder));
  } catch {
    res.status(500).json({ error: 'Kunde inte hämta annonser' });
  }
});

router.post('/', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const next = writeData(req.body || {});
    if (!next.brand || !next.title) return res.status(400).json({ error: 'Företag och rubrik krävs' });
    const ads = await readAds();
    next.sortOrder = req.body?.sortOrder !== undefined ? next.sortOrder : ads.length;
    ads.push(next);
    await writeAds(ads);
    res.status(201).json(next);
  } catch {
    res.status(500).json({ error: 'Kunde inte skapa annons' });
  }
});

router.patch('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const ads = await readAds();
    const idx = ads.findIndex((ad) => ad.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: 'Annons hittades inte' });
    const next = writeData(req.body || {}, ads[idx]);
    if (!next.brand || !next.title) return res.status(400).json({ error: 'Företag och rubrik krävs' });
    ads[idx] = next;
    await writeAds(ads);
    res.json(next);
  } catch {
    res.status(500).json({ error: 'Kunde inte uppdatera annons' });
  }
});

router.delete('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const ads = await readAds();
    await writeAds(ads.filter((ad) => ad.id !== req.params.id));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Kunde inte radera annons' });
  }
});

export default router;
