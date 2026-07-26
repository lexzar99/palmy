import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { slugify } from '../lib/slug';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { bustCache } from '../lib/ttlCache';

const router = Router();

const tagSchema = z.object({
  name: z.string().trim().min(2).max(40),
  nameEn: z.string().trim().max(40).nullable().optional(),
  slug: z.string().trim().max(50).optional(),
  description: z.string().trim().max(240).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().trim().max(40).nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(-10_000).max(10_000).optional(),
});

const dto = (tag: any) => ({
  id: tag.id,
  name: tag.name,
  nameEn: tag.nameEn ?? null,
  slug: tag.slug,
  description: tag.description ?? null,
  color: tag.color,
  icon: tag.icon ?? null,
  isActive: Boolean(tag.isActive),
  sortOrder: Number(tag.sortOrder ?? 0),
  restaurantCount: Number(tag._count?.restaurants ?? 0),
  createdAt: tag.createdAt,
  updatedAt: tag.updatedAt,
});

const includeCount = { _count: { select: { restaurants: true } } } as const;

function invalidateTagCaches() {
  bustCache('restaurant-tags', 'public');
  bustCache('home:categories', 'public');
  bustCache('home:feed');
  bustCache('rest:list');
  bustCache('rest:detail');
}

// Publik katalog för sökchips i web och Swift.
router.get('/', async (_req, res) => {
  try {
    const rows = await prisma.restaurantTag.findMany({
      where: { isActive: true },
      include: includeCount,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json(rows.map(dto));
  } catch (error) {
    console.error('restaurant tags public list error', error);
    res.status(500).json({ error: 'Kunde inte hämta restaurangtaggar' });
  }
});

router.get('/all', authenticate, requireSuperAdmin, async (_req, res) => {
  try {
    const rows = await prisma.restaurantTag.findMany({
      include: includeCount,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json(rows.map(dto));
  } catch (error) {
    console.error('restaurant tags admin list error', error);
    res.status(500).json({ error: 'Kunde inte hämta restaurangtaggar' });
  }
});

router.post('/', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const body = tagSchema.parse(req.body);
    const row = await prisma.restaurantTag.create({
      data: {
        name: body.name,
        nameEn: body.nameEn || null,
        slug: slugify(body.slug || body.name),
        description: body.description || null,
        color: body.color || '#FF6B00',
        icon: body.icon || null,
        isActive: body.isActive ?? true,
        sortOrder: body.sortOrder ?? 0,
      },
      include: includeCount,
    });
    invalidateTagCaches();
    res.status(201).json(dto(row));
  } catch (error: any) {
    console.error('restaurant tags create error', error);
    res.status(400).json({ error: error?.message || 'Kunde inte skapa tagg' });
  }
});

router.patch('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const body = tagSchema.partial().parse(req.body);
    const existing = await prisma.restaurantTag.findUnique({
      where: { id: req.params.id },
      include: { restaurants: { select: { restaurantId: true } } },
    });
    if (!existing) {
      res.status(404).json({ error: 'Taggen hittades inte' });
      return;
    }

    const nextName = body.name ?? existing.name;
    const row = await prisma.$transaction(async (tx) => {
      const updated = await tx.restaurantTag.update({
        where: { id: existing.id },
        data: {
          name: body.name,
          nameEn: body.nameEn === undefined ? undefined : body.nameEn || null,
          slug: body.slug === undefined && body.name === undefined
            ? undefined
            : slugify(body.slug || nextName),
          description: body.description === undefined ? undefined : body.description || null,
          color: body.color,
          icon: body.icon === undefined ? undefined : body.icon || null,
          isActive: body.isActive,
          sortOrder: body.sortOrder,
        },
        include: includeCount,
      });

      // Legacy-projektionen hålls synkad vid namnbyte. Äldre klienter fortsätter
      // därför visa/filtera samma val utan att känna till relationsmodellen.
      if (
        existing.restaurants.length
        && (
          (body.name && body.name !== existing.name)
          || (body.isActive !== undefined && body.isActive !== existing.isActive)
        )
      ) {
        const restaurants = await tx.restaurant.findMany({
          where: { id: { in: existing.restaurants.map((item) => item.restaurantId) } },
          select: { id: true, tags: true },
        });
        for (const restaurant of restaurants) {
          let names: string[] = [];
          try {
            const parsed = JSON.parse(restaurant.tags || '[]');
            names = Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
          } catch {
            names = [];
          }
          const renamed = names.map((name) =>
            name.toLocaleLowerCase('sv') === existing.name.toLocaleLowerCase('sv') ? nextName : name,
          );
          const withoutTag = renamed.filter((name) => name.toLocaleLowerCase('sv') !== nextName.toLocaleLowerCase('sv'));
          const next = body.isActive === false
            ? withoutTag
            : body.isActive === true
              ? [...withoutTag, nextName]
              : renamed;
          await tx.restaurant.update({ where: { id: restaurant.id }, data: { tags: JSON.stringify(next) } });
        }
      }

      return updated;
    });
    invalidateTagCaches();
    res.json(dto(row));
  } catch (error: any) {
    console.error('restaurant tags update error', error);
    res.status(400).json({ error: error?.message || 'Kunde inte uppdatera tagg' });
  }
});

router.delete('/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const tag = await prisma.restaurantTag.findUnique({
      where: { id: req.params.id },
      include: includeCount,
    });
    if (!tag) {
      res.status(404).json({ error: 'Taggen hittades inte' });
      return;
    }
    if (tag._count.restaurants > 0) {
      res.status(409).json({
        error: 'Taggen används av restauranger. Inaktivera den eller ta bort kopplingarna först.',
      });
      return;
    }
    await prisma.restaurantTag.delete({ where: { id: tag.id } });
    invalidateTagCaches();
    res.json({ ok: true });
  } catch (error) {
    console.error('restaurant tags delete error', error);
    res.status(500).json({ error: 'Kunde inte radera tagg' });
  }
});

export default router;
