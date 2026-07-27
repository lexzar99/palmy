import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { slugify } from '../lib/slug';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import {
  ensureDefaultHomeCategorySections,
  effectiveHomeCategorySchedule,
  isHomeCategorySectionVisibleNow,
  normalizeHomeCategoryFilters,
  normalizeHomeCategoryPresentation,
  normalizeHomeCategoryRanking,
  normalizeHomeCategorySchedule,
  serializeHomeCategorySection,
  toPublicHomeCategorySection,
} from '../lib/homeCategorySections';
import { bustCache, cached } from '../lib/ttlCache';
import { loadHomeCategoryFeed } from '../lib/homeCategoryFeed';

const router = Router();
// Defaults are idempotent and only need creating once per process.
let homeDefaultsEnsured = false;

async function assertActiveTagIds(tagIds: string[] | undefined) {
  if (!tagIds?.length) return;
  const uniqueIds = [...new Set(tagIds)];
  const count = await prisma.restaurantTag.count({
    where: { id: { in: uniqueIds }, isActive: true },
  });
  if (count !== uniqueIds.length) {
    throw new TypeError('En eller flera valda taggar finns inte eller är inaktiva');
  }
}

const homeCategorySchema = z.object({
  title: z.string().min(2),
  // EN-översättningar: null/saknad → frontend faller tillbaka på sv-versionen.
  titleEn: z.string().nullable().optional(),
  slug: z.string().optional(),
  subtitle: z.string().nullable().optional(),
  subtitleEn: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  descriptionEn: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  filterMode: z.enum(['FILTER', 'MANUAL', 'HYBRID']).optional(),
  maxRestaurants: z.number().int().min(1).max(24).optional(),
  manualRestaurantIds: z.array(z.string()).optional(),
  filters: z
    .object({
      searchTerm: z.string().nullable().optional(),
      cuisines: z.array(z.string()).optional(),
      tagIds: z.array(z.string()).optional(),
      tags: z.array(z.string()).optional(),
      featuredClasses: z.array(z.number()).optional(),
      minRating: z.number().nullable().optional(),
      maxEtaMinutes: z.number().nullable().optional(),
      maxDeliveryFee: z.number().nullable().optional(),
      freeDeliveryOnly: z.boolean().optional(),
      dealsOnly: z.boolean().optional(),
      openNowOnly: z.boolean().optional(),
      sortBy: z.enum([
        'SMART',
        'FEATURED',
        'ORDERS_TODAY',
        'ORDERS_7D',
        'RATING',
        'ETA',
        'DELIVERY_FEE',
        'DISCOUNT',
        'NAME',
      ]).optional(),
      sortDirection: z.enum(['ASC', 'DESC']).optional(),
    })
    .optional(),
  schedule: z
    .object({
      enabled: z.boolean().optional(),
      daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
      startTime: z.string().nullable().optional(),
      endTime: z.string().nullable().optional(),
    })
    .optional(),
  presentation: z
    .object({
      layout: z.enum(['MEDIUM_RAIL', 'LARGE_RAIL', 'GRID']).optional(),
      accent: z.enum(['ORANGE', 'BLUE', 'GREEN', 'PURPLE', 'NAVY']).optional(),
      accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
      backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
      icon: z.string().max(40).nullable().optional(),
    })
    .optional(),
  ranking: z
    .object({
      strategy: z.enum(['WEIGHTED', 'BALANCED']).optional(),
      weights: z
        .object({
          ordersToday: z.number().min(0).max(100).optional(),
          orders7d: z.number().min(0).max(100).optional(),
          eta: z.number().min(0).max(100).optional(),
          ratingConfidence: z.number().min(0).max(100).optional(),
          deliveryFee: z.number().min(0).max(100).optional(),
          freeDelivery: z.number().min(0).max(100).optional(),
          discount: z.number().min(0).max(100).optional(),
          tier: z.number().min(0).max(25).optional(),
          dailyRotation: z.number().min(0).max(10).optional(),
        })
        .optional(),
      avoidDuplicateFirst: z.boolean().optional(),
      appearancePenalty: z.number().min(0).max(30).optional(),
      maxAdminBoostPoints: z.number().min(0).max(15).optional(),
    })
    .optional(),
});

router.get('/feed', async (req, res) => {
  try {
    if (!homeDefaultsEnsured) {
      await ensureDefaultHomeCategorySections();
      homeDefaultsEnsured = true;
    }
    const city = typeof req.query.city === 'string' ? req.query.city.trim().slice(0, 80) : '';
    // Zone är en opak, grov leveranskontext (t.ex. postnummer/zonslug), aldrig
    // en full adress. Den används bara för deterministisk dagsrotation.
    const zone = typeof req.query.zone === 'string' ? req.query.zone.trim().slice(0, 40) : '';
    const cacheKey = `${city.toLocaleLowerCase('sv')}|${zone.toLocaleLowerCase('sv')}`;
    const payload = await cached('home:feed', cacheKey, 20_000, () =>
      loadHomeCategoryFeed({ city: city || null, zone: zone || null }),
    );
    res.json(payload);
  } catch (error) {
    console.error('home categories feed error', error);
    res.status(500).json({ error: 'Kunde inte hämta hemskärmsflödet' });
  }
});

router.get('/', async (_req, res) => {
  try {
    // Run the 6 serial default-section queries once per process, not per request.
    if (!homeDefaultsEnsured) {
      await ensureDefaultHomeCategorySections();
      homeDefaultsEnsured = true;
    }
    // Cache 30s the serialized DB rows; keep the time-based visibility filter
    // per-request so scheduled sections still flip on time.
    const sections = await cached('home:categories', 'public', 30_000, async () => {
      const rows = await prisma.homeCategorySection.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      return rows.map(serializeHomeCategorySection);
    });

    const payload = sections
      .filter((section) => isHomeCategorySectionVisibleNow(section))
      .map(toPublicHomeCategorySection)
      // Samma sanning som /feed: klienten ser tillfället som filtret använde.
      .map((section) => ({ ...section, schedule: effectiveHomeCategorySchedule(section) }));

    res.json(payload);
  } catch (error) {
    console.error('home categories public error', error);
    res.status(500).json({ error: 'Kunde inte hämta kategorier' });
  }
});

router.get('/all', authenticate, requireSuperAdmin, async (_req, res) => {
  try {
    await ensureDefaultHomeCategorySections();
    const rows = await prisma.homeCategorySection.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    res.json(rows.map(serializeHomeCategorySection));
  } catch (error) {
    console.error('home categories admin list error', error);
    res.status(500).json({ error: 'Kunde inte hämta kategorier' });
  }
});

router.post('/', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const body = homeCategorySchema.parse(req.body);
    await assertActiveTagIds(body.filters?.tagIds);
    const row = await prisma.homeCategorySection.create({
      data: {
        title: body.title.trim(),
        titleEn: body.titleEn?.trim() || null,
        slug: slugify(body.slug || body.title),
        subtitle: body.subtitle?.trim() || null,
        subtitleEn: body.subtitleEn?.trim() || null,
        description: body.description?.trim() || null,
        descriptionEn: body.descriptionEn?.trim() || null,
        isActive: body.isActive ?? true,
        sortOrder: body.sortOrder ?? 0,
        filterMode: body.filterMode || 'FILTER',
        maxRestaurants: body.maxRestaurants ?? 8,
        manualRestaurantIds: JSON.stringify(body.manualRestaurantIds || []),
        filters: JSON.stringify(normalizeHomeCategoryFilters(body.filters)),
        schedule: JSON.stringify(normalizeHomeCategorySchedule(body.schedule)),
        presentation: JSON.stringify(normalizeHomeCategoryPresentation(body.presentation)),
        ranking: JSON.stringify(normalizeHomeCategoryRanking(body.ranking)),
      },
    });
    bustCache('home:categories');
    bustCache('home:feed');
    res.json(serializeHomeCategorySection(row));
  } catch (error: any) {
    console.error('home categories create error', error);
    res.status(400).json({ error: error?.message || 'Kunde inte skapa kategori' });
  }
});

router.patch('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const existing = await prisma.homeCategorySection.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: 'Kategori hittades inte' });
      return;
    }

    const body = homeCategorySchema.partial().parse(req.body);
    await assertActiveTagIds(body.filters?.tagIds);

    const row = await prisma.homeCategorySection.update({
      where: { id: req.params.id },
      data: {
        title: body.title?.trim() ?? existing.title,
        titleEn: body.titleEn !== undefined ? (body.titleEn?.trim() || null) : existing.titleEn,
        slug: body.slug !== undefined ? slugify(body.slug || body.title || existing.title) : existing.slug,
        subtitle: body.subtitle !== undefined ? (body.subtitle?.trim() || null) : existing.subtitle,
        subtitleEn: body.subtitleEn !== undefined ? (body.subtitleEn?.trim() || null) : existing.subtitleEn,
        description: body.description !== undefined ? (body.description?.trim() || null) : existing.description,
        descriptionEn: body.descriptionEn !== undefined ? (body.descriptionEn?.trim() || null) : existing.descriptionEn,
        isActive: body.isActive ?? existing.isActive,
        sortOrder: body.sortOrder ?? existing.sortOrder,
        filterMode: body.filterMode || existing.filterMode,
        maxRestaurants: body.maxRestaurants ?? existing.maxRestaurants,
        manualRestaurantIds: body.manualRestaurantIds ? JSON.stringify(body.manualRestaurantIds) : existing.manualRestaurantIds,
        filters: body.filters ? JSON.stringify(normalizeHomeCategoryFilters(body.filters)) : existing.filters,
        schedule: body.schedule ? JSON.stringify(normalizeHomeCategorySchedule(body.schedule)) : existing.schedule,
        presentation: body.presentation
          ? JSON.stringify(normalizeHomeCategoryPresentation(body.presentation))
          : existing.presentation,
        ranking: body.ranking
          ? JSON.stringify(normalizeHomeCategoryRanking(body.ranking))
          : existing.ranking,
      },
    });

    bustCache('home:categories');
    bustCache('home:feed');
    res.json(serializeHomeCategorySection(row));
  } catch (error: any) {
    console.error('home categories update error', error);
    res.status(400).json({ error: error?.message || 'Kunde inte uppdatera kategori' });
  }
});

router.delete('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    await prisma.homeCategorySection.delete({ where: { id: req.params.id } });
    bustCache('home:categories');
    bustCache('home:feed');
    res.json({ ok: true });
  } catch (error) {
    console.error('home categories delete error', error);
    res.status(500).json({ error: 'Kunde inte radera kategori' });
  }
});

export default router;
