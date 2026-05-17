import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { slugify } from '../lib/slug';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import {
  ensureDefaultHomeCategorySections,
  isHomeCategoryVisibleNow,
  normalizeHomeCategoryFilters,
  normalizeHomeCategorySchedule,
  serializeHomeCategorySection,
} from '../lib/homeCategorySections';

const router = Router();

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
      tags: z.array(z.string()).optional(),
      featuredClasses: z.array(z.number()).optional(),
      minRating: z.number().nullable().optional(),
      maxEtaMinutes: z.number().nullable().optional(),
      maxDeliveryFee: z.number().nullable().optional(),
      freeDeliveryOnly: z.boolean().optional(),
      dealsOnly: z.boolean().optional(),
      openNowOnly: z.boolean().optional(),
      sortBy: z.enum(['FEATURED', 'RATING', 'ETA', 'NAME']).optional(),
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
});

router.get('/', async (_req, res) => {
  try {
    await ensureDefaultHomeCategorySections();
    const rows = await prisma.homeCategorySection.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    const payload = rows
      .map(serializeHomeCategorySection)
      .filter((section) => isHomeCategoryVisibleNow(section.schedule));

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
      },
    });
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
      },
    });

    res.json(serializeHomeCategorySection(row));
  } catch (error: any) {
    console.error('home categories update error', error);
    res.status(400).json({ error: error?.message || 'Kunde inte uppdatera kategori' });
  }
});

router.delete('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    await prisma.homeCategorySection.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (error) {
    console.error('home categories delete error', error);
    res.status(500).json({ error: 'Kunde inte radera kategori' });
  }
});

export default router;
