import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin, AuthRequest } from '../middleware/auth';
import { audit } from '../lib/auditLog';
import {
  decideKioskOrigin,
  ensureRestaurantDomains,
  invalidateRestaurantDomains,
  normalizeDomainHost,
  normalizeMenuPath,
  restaurantDomainsForSlug,
  type KioskOriginDecision,
} from '../lib/restaurantDomains';

/**
 * Restaurangdomäner (fas 3).
 *
 * Publikt: GET /api/embed/partner?slug=&origin= svarar om partnerns domän hör
 * till restaurangen. Webbens /api/kiosk/session frågar här innan den lämnar ut
 * ett kioskbevis, och iframen får tillbaka returadressens sökväg.
 *
 * Admin: /api/admin/restaurant-domains, bara superadmin.
 */

const router = Router();

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

router.get('/partner', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const slug = typeof req.query.slug === 'string' ? req.query.slug.trim() : '';
  const origin = typeof req.query.origin === 'string' ? req.query.origin.trim() : '';
  if (!slug || slug.length > 120 || !SLUG_PATTERN.test(slug) || origin.length > 300) {
    res.status(400).json({ allowed: false, reason: 'BAD_REQUEST' });
    return;
  }
  await ensureRestaurantDomains();
  const decision = decideKioskOrigin(slug, origin || undefined);
  if ('reason' in decision) {
    // Samma svarsform för okänd domän och fel restaurang: anroparen får inte
    // veta vilken restaurang en domän tillhör.
    res.status(decision.reason === 'RESTAURANT_NOT_ALLOWED' ? 404 : 403).json({
      allowed: false,
      reason: decision.reason === 'ORIGIN_SLUG_MISMATCH' ? 'ORIGIN_UNKNOWN' : decision.reason,
    });
    return;
  }
  const { source, partner } = decision as Extract<KioskOriginDecision, { allowed: true }>;
  const primary = restaurantDomainsForSlug(slug)[0] || null;
  res.json({
    allowed: true,
    source,
    partner: partner
      ? {
          origin: partner.origin,
          restaurantSlug: partner.restaurantSlug,
          menuPath: partner.menuPath,
          primaryOrigin: primary?.origin || partner.origin,
        }
      : null,
  });
});

export default router;

// ── Admin ───────────────────────────────────────────────────────────────────

export const restaurantDomainsAdminRouter = Router();
restaurantDomainsAdminRouter.use(authenticate, requireSuperAdmin);

const domainSelect = {
  id: true,
  restaurantId: true,
  host: true,
  isPrimary: true,
  menuPath: true,
  embedEnabled: true,
  createdAt: true,
} as const;

function missingTable(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return code === 'P2021' || code === '42P01';
}

function sendStoreError(res: any, error: unknown, fallback: string) {
  if (missingTable(error)) {
    res.status(503).json({
      error: 'Domäntabellen finns inte än. Kör prisma/migrations_manual/20261103_restaurant_domains.sql först.',
      code: 'RESTAURANT_DOMAIN_TABLE_MISSING',
    });
    return;
  }
  if ((error as { code?: string })?.code === 'P2002') {
    res.status(409).json({ error: 'Domänen är redan kopplad till en restaurang.', code: 'DOMAIN_TAKEN' });
    return;
  }
  console.error('[restaurant-domains]', fallback, error);
  res.status(500).json({ error: fallback });
}

restaurantDomainsAdminRouter.get('/', async (req, res) => {
  const restaurantId = typeof req.query.restaurantId === 'string' ? req.query.restaurantId : '';
  if (!restaurantId || restaurantId.length > 64) {
    res.status(400).json({ error: 'restaurantId krävs' });
    return;
  }
  try {
    const domains = await prisma.restaurantDomain.findMany({
      where: { restaurantId },
      select: domainSelect,
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
    res.json({ domains });
  } catch (error) {
    sendStoreError(res, error, 'Kunde inte hämta domänerna');
  }
});

const createSchema = z.object({
  restaurantId: z.string().min(1).max(64),
  host: z.string().min(1).max(300),
  menuPath: z.string().max(128).optional().nullable(),
  isPrimary: z.boolean().optional(),
  embedEnabled: z.boolean().optional(),
}).strict();

restaurantDomainsAdminRouter.post('/', async (req: AuthRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Ogiltiga fält' });
    return;
  }
  const host = normalizeDomainHost(parsed.data.host);
  if (!host) {
    res.status(400).json({
      error: 'Ange ett rent domännamn, till exempel fredspizza.se. Utan sökväg, port eller viaeats egna domäner.',
      code: 'INVALID_HOST',
    });
    return;
  }
  const menuPath = normalizeMenuPath(parsed.data.menuPath);
  if (!menuPath) {
    res.status(400).json({ error: 'Menysidan måste vara en sökväg som börjar med /, till exempel /meny.', code: 'INVALID_MENU_PATH' });
    return;
  }
  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: parsed.data.restaurantId },
      select: { id: true },
    });
    if (!restaurant) {
      res.status(404).json({ error: 'Restaurangen finns inte' });
      return;
    }
    const created = await prisma.$transaction(async (tx) => {
      const existing = await tx.restaurantDomain.count({ where: { restaurantId: restaurant.id } });
      const isPrimary = existing === 0 || parsed.data.isPrimary === true;
      if (isPrimary) {
        await tx.restaurantDomain.updateMany({
          where: { restaurantId: restaurant.id, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return tx.restaurantDomain.create({
        data: {
          restaurantId: restaurant.id,
          host,
          menuPath,
          isPrimary,
          embedEnabled: parsed.data.embedEnabled ?? true,
        },
        select: domainSelect,
      });
    });
    await invalidateRestaurantDomains();
    await audit(req, 'restaurant_domain.create', {
      resourceType: 'restaurant',
      resourceId: restaurant.id,
      changes: { host, menuPath, isPrimary: created.isPrimary, embedEnabled: created.embedEnabled },
    });
    res.status(201).json({ domain: created });
  } catch (error) {
    sendStoreError(res, error, 'Kunde inte spara domänen');
  }
});

const updateSchema = z.object({
  menuPath: z.string().max(128).optional(),
  isPrimary: z.literal(true).optional(),
  embedEnabled: z.boolean().optional(),
}).strict();

restaurantDomainsAdminRouter.patch('/:id', async (req: AuthRequest, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: 'Ogiltiga fält' });
    return;
  }
  let menuPath: string | undefined;
  if (parsed.data.menuPath !== undefined) {
    const normalized = normalizeMenuPath(parsed.data.menuPath);
    if (!normalized) {
      res.status(400).json({ error: 'Menysidan måste vara en sökväg som börjar med /, till exempel /meny.', code: 'INVALID_MENU_PATH' });
      return;
    }
    menuPath = normalized;
  }
  try {
    const current = await prisma.restaurantDomain.findUnique({ where: { id: req.params.id }, select: domainSelect });
    if (!current) {
      res.status(404).json({ error: 'Domänen finns inte' });
      return;
    }
    const updated = await prisma.$transaction(async (tx) => {
      if (parsed.data.isPrimary) {
        await tx.restaurantDomain.updateMany({
          where: { restaurantId: current.restaurantId, isPrimary: true, NOT: { id: current.id } },
          data: { isPrimary: false },
        });
      }
      return tx.restaurantDomain.update({
        where: { id: current.id },
        data: {
          ...(menuPath !== undefined ? { menuPath } : {}),
          ...(parsed.data.isPrimary ? { isPrimary: true } : {}),
          ...(parsed.data.embedEnabled !== undefined ? { embedEnabled: parsed.data.embedEnabled } : {}),
        },
        select: domainSelect,
      });
    });
    await invalidateRestaurantDomains();
    await audit(req, 'restaurant_domain.update', {
      resourceType: 'restaurant',
      resourceId: current.restaurantId,
      changes: { host: current.host, before: current, after: updated },
    });
    res.json({ domain: updated });
  } catch (error) {
    sendStoreError(res, error, 'Kunde inte uppdatera domänen');
  }
});

restaurantDomainsAdminRouter.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const current = await prisma.restaurantDomain.findUnique({ where: { id: req.params.id }, select: domainSelect });
    if (!current) {
      res.status(404).json({ error: 'Domänen finns inte' });
      return;
    }
    await prisma.$transaction(async (tx) => {
      await tx.restaurantDomain.delete({ where: { id: current.id } });
      // Restaurangen ska alltid ha en huvuddomän så länge den har någon domän.
      if (current.isPrimary) {
        const next = await tx.restaurantDomain.findFirst({
          where: { restaurantId: current.restaurantId },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        if (next) await tx.restaurantDomain.update({ where: { id: next.id }, data: { isPrimary: true } });
      }
    });
    await invalidateRestaurantDomains();
    await audit(req, 'restaurant_domain.delete', {
      resourceType: 'restaurant',
      resourceId: current.restaurantId,
      changes: { host: current.host },
    });
    res.json({ ok: true });
  } catch (error) {
    sendStoreError(res, error, 'Kunde inte ta bort domänen');
  }
});
