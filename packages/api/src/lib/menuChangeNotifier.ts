import type { NextFunction, Request, Response } from 'express';
import prisma from './prisma';
import { getIO } from './socket';

/**
 * Meddelar restaurangens terminaler när menyn ändrats (kategorier, rätter, tillvalsgrupper,
 * tillval). Terminalen hämtar då om menyn, i stället för att fråga servern hela tiden.
 *
 * Restaurangen slås upp innan ändringen körs, så att även en borttagen rätt hittar rätt
 * restaurang. Flera ändringar i följd (t.ex. en sortering eller massimport) buntas till ett
 * meddelande per restaurang. Globala kategorier/grupper (utan restaurang) meddelas till alla.
 */
const MENU_PATH = /^\/(categories|products|extra-groups|extras)(?:\/([^/]+))?/;
const DEBOUNCE_MS = 1500;
const pending = new Map<string, NodeJS.Timeout>();

function schedule(restaurantId: string | null) {
  const key = restaurantId ?? '*';
  const existing = pending.get(key);
  if (existing) clearTimeout(existing);
  pending.set(key, setTimeout(() => {
    pending.delete(key);
    try {
      const payload = { restaurantId, at: new Date().toISOString() };
      if (restaurantId) getIO().to(`admin-room:${restaurantId}`).emit('menu:updated', payload);
      else getIO().emit('menu:updated', payload);
    } catch (error) {
      console.warn('[menu:updated] kunde inte skicka:', (error as Error)?.message);
    }
  }, DEBOUNCE_MS));
}

async function restaurantFor(resource: string, id: string | undefined, body: any): Promise<string | null | undefined> {
  const looksLikeId = (v: unknown): v is string => typeof v === 'string' && v.length >= 8 && !['reorder', 'copy', 'duplicate'].includes(v);
  if (looksLikeId(id)) {
    if (resource === 'products') {
      const p = await prisma.product.findUnique({ where: { id }, select: { category: { select: { restaurantId: true } } } });
      if (p) return p.category?.restaurantId ?? null;
    } else if (resource === 'categories') {
      const c = await prisma.category.findUnique({ where: { id }, select: { restaurantId: true } });
      if (c) return c.restaurantId ?? null;
    } else if (resource === 'extra-groups') {
      const g = await prisma.extraGroup.findUnique({ where: { id }, select: { restaurantId: true } });
      if (g) return g.restaurantId ?? null;
    } else if (resource === 'extras') {
      const e = await prisma.extra.findUnique({ where: { id }, select: { extraGroup: { select: { restaurantId: true } } } });
      if (e) return e.extraGroup?.restaurantId ?? null;
    }
  }
  if (typeof body?.restaurantId === 'string' && body.restaurantId) return body.restaurantId;
  if (typeof body?.categoryId === 'string' && body.categoryId) {
    const c = await prisma.category.findUnique({ where: { id: body.categoryId }, select: { restaurantId: true } });
    if (c) return c.restaurantId ?? null;
  }
  return undefined;
}

export function menuChangeNotifier(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const match = MENU_PATH.exec(req.path);
  if (!match) return next();
  const [, resource, id] = match;
  const adminRestaurantId: string | undefined = (req as any).admin?.restaurantId || undefined;
  restaurantFor(resource, id, req.body)
    .catch(() => undefined)
    .then((resolved) => {
      res.on('finish', () => {
        if (res.statusCode >= 400) return;
        const restaurantId = resolved !== undefined ? resolved : adminRestaurantId ?? undefined;
        if (restaurantId === undefined) return;
        schedule(restaurantId);
      });
      next();
    });
}
