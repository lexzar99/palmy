import { Router, type NextFunction, type Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, type AuthRequest } from '../middleware/auth';
import { audit } from '../lib/auditLog';
import { cacheResponse, getCachedResponse, getIdempotencyKey } from '../lib/idempotency';
import { isRestaurantOpen, nextOpeningAfterToday } from '../lib/openingHours';
import { buildRestaurantPublicStatus } from '../lib/restaurantPublicStatus';
import { afterRestaurantSettingsChanged } from '../lib/restaurantChangeEffects';
import { broadcastMenuChange } from '../lib/menuBroadcast';
import { notifyTerminalsMenuChanged } from '../lib/menuChangeNotifier';
import { alertTerminalSettingsChanged } from '../lib/restaurantWatch';
import { normalizeDeliveryZones } from '../utils/deliveryZones';
import {
  applyZoneMoneyChanges,
  normalizeTerminalOpeningHours,
  openingHoursView,
  parsePriceChanges,
  parseZoneChanges,
  planPriceChanges,
  priceKey,
  settingsVersion,
  TerminalSettingsError,
  terminalZoneView,
  validatePriceResult,
  type PriceChange,
  type PriceMenu,
} from '../lib/terminalSettings';

// ── Det restaurangen själv ändrar från plattan (partner v2) ─────────────────
//
// Monteras inne i routes/terminal.ts, alltså under /api/terminal. Bara en
// terminalsession (JWT med deviceId) kommer in, och restaurangen tas alltid ur
// token, aldrig ur URL eller body. Belopp skickas i ören. Varje skrivning är
// jämför-och-sätt (se lib/terminalSettings.ts), så ett omförsök eller en
// samtidig ändring från admin aldrig skriver över något i tysthet.

const router = Router();

const ARCHIVE_CATEGORY_NAME = 'Arkiverade produkter';
const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

type TerminalRequest = AuthRequest & { admin: NonNullable<AuthRequest['admin']> & { restaurantId: string; deviceId: string } };

function requireTerminalDevice(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.admin?.deviceId || !req.admin.restaurantId) {
    res.status(403).json({ error: 'Bara restaurangens platta kan ändra detta här', code: 'TERMINAL_ONLY' });
    return;
  }
  next();
}

const kr = (ore: number) => `${new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 }).format(ore / 100)} kr`;

const appVersionOf = (req: AuthRequest) => {
  const match = /ViaEats-Partner-Native-Android\/([\w.\-]+)/.exec(String(req.headers['user-agent'] || ''));
  return match?.[1] ?? null;
};

const sendError = (res: Response, error: unknown, where: string) => {
  if (error instanceof TerminalSettingsError) {
    return res.status(error.status).json({ error: error.message, code: error.code, ...(error.details ?? {}) });
  }
  console.error(`[terminal/${where}] error:`, (error as Error)?.message ?? error);
  return res.status(500).json({ error: 'Kunde inte spara just nu. Försök igen.', code: 'SERVER_ERROR' });
};

/**
 * Första snabba lagret mot dubbeltryck: samma Idempotency-Key från samma platta
 * får samma svar. Den verkliga garantin är jämför-och-sätt, som håller även
 * efter en omstart då minnescachen är tom.
 */
async function idempotent(
  req: TerminalRequest,
  res: Response,
  route: string,
  run: () => Promise<{ status: number; body: unknown }>,
) {
  const key = getIdempotencyKey(req);
  const scope = `terminal:${req.admin.deviceId}:${route}`;
  if (key) {
    const cached = getCachedResponse(scope, key);
    if (cached) return res.status(cached.status).json(cached.body);
  }
  const result = await run();
  if (key && result.status < 300) cacheResponse(scope, key, result.status, result.body);
  return res.status(result.status).json(result.body);
}

const notify = (restaurantId: string, restaurantName: string, summary: string, req: AuthRequest) =>
  void alertTerminalSettingsChanged({ restaurantId, restaurantName, summary, dedupeKey: getIdempotencyKey(req) });

// Spärren sitter per rutt, så att okända /api/terminal-sökvägar fortsätter ge 404.
const guard = [authenticate, requireTerminalDevice];

// ── Leveranszoner ───────────────────────────────────────────────────────────

async function zoneSnapshot(restaurantId: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, name: true, deliveryZones: true, pickupOnly: true, cityId: true },
  });
  if (!restaurant) throw new TerminalSettingsError(404, 'NOT_FOUND', 'Restaurangen finns inte');
  const zones = terminalZoneView(restaurant.deliveryZones);
  let source: 'restaurant' | 'city' | 'none' = zones.length > 0 ? 'restaurant' : 'none';
  if (source === 'none' && restaurant.cityId) {
    const city = await prisma.city.findUnique({ where: { id: restaurant.cityId }, select: { zones: true } });
    let cityZones: unknown[] = [];
    try { cityZones = JSON.parse(city?.zones || '[]'); } catch { cityZones = []; }
    if (normalizeDeliveryZones(cityZones).length > 0) source = 'city';
  }
  return {
    restaurant,
    view: {
      version: settingsVersion(restaurant.deliveryZones),
      source,
      hasDelivery: !restaurant.pickupOnly,
      zones: source === 'restaurant' ? zones : [],
    },
  };
}

// GET /api/terminal/delivery-zones
router.get('/delivery-zones', guard, async (req, res) => {
  try {
    const { view } = await zoneSnapshot((req as TerminalRequest).admin.restaurantId);
    res.json(view);
  } catch (error) {
    sendError(res, error, 'delivery-zones');
  }
});

// PATCH /api/terminal/delivery-zones  { version, changes: [{ id, feeOre, minOrderOre }] }
router.patch('/delivery-zones', guard, async (req, res) => {
  const treq = req as TerminalRequest;
  try {
    await idempotent(treq, res, 'delivery-zones', async () => {
      const { version, changes } = parseZoneChanges(req.body);
      const restaurantId = treq.admin.restaurantId;
      const before = await zoneSnapshot(restaurantId);
      if (before.view.source !== 'restaurant') {
        throw new TerminalSettingsError(403, 'ZONES_READ_ONLY', 'Zonerna styrs av viaeats och kan inte ändras här');
      }
      const stored = before.restaurant.deliveryZones;
      if (before.view.version !== version) {
        // Omspelning av en sparning som redan gått igenom: allt står redan rätt.
        const zonesNow = new Map(before.view.zones.map((zone) => [zone.id, zone]));
        const alreadySaved = changes.every((c) => zonesNow.get(c.id)?.feeOre === c.feeOre && zonesNow.get(c.id)?.minOrderOre === c.minOrderOre);
        if (alreadySaved) return { status: 200, body: before.view };
        return { status: 409, body: { error: 'Zonerna har ändrats sedan du öppnade sidan', code: 'VERSION_CONFLICT', current: before.view } };
      }
      const next = applyZoneMoneyChanges(stored, changes);
      const written = await prisma.restaurant.updateMany({
        where: { id: restaurantId, deliveryZones: stored },
        data: { deliveryZones: next },
      });
      if (written.count !== 1) {
        const current = await zoneSnapshot(restaurantId);
        return { status: 409, body: { error: 'Zonerna har ändrats sedan du öppnade sidan', code: 'VERSION_CONFLICT', current: current.view } };
      }

      const beforeById = new Map(before.view.zones.map((zone) => [zone.id, zone]));
      const diff = changes
        .map((change) => ({ change, prior: beforeById.get(change.id) }))
        .filter(({ change, prior }) => prior && (prior.feeOre !== change.feeOre || prior.minOrderOre !== change.minOrderOre))
        .map(({ change, prior }) => ({
          id: change.id,
          name: prior!.name,
          feeOre: { from: prior!.feeOre, to: change.feeOre },
          minOrderOre: { from: prior!.minOrderOre, to: change.minOrderOre },
        }));
      void audit(treq, 'TERMINAL_DELIVERY_ZONES_UPDATE', {
        resourceType: 'Restaurant',
        resourceId: restaurantId,
        changes: { deviceId: treq.admin.deviceId, appVersion: appVersionOf(treq), zones: diff },
      });
      await afterRestaurantSettingsChanged(restaurantId);
      if (diff.length > 0) {
        const first = diff[0];
        const detail = first.feeOre.from !== first.feeOre.to
          ? `${first.name}: avgift ${kr(first.feeOre.from)} → ${kr(first.feeOre.to)}`
          : `${first.name}: minsta order ${kr(first.minOrderOre.from)} → ${kr(first.minOrderOre.to)}`;
        notify(restaurantId, before.restaurant.name, `ändrade ${diff.length === 1 ? 'en zon' : `${diff.length} zoner`} (${detail})`, treq);
      }
      const after = await zoneSnapshot(restaurantId);
      return { status: 200, body: after.view };
    });
  } catch (error) {
    sendError(res, error, 'delivery-zones');
  }
});

// ── Öppettider ──────────────────────────────────────────────────────────────

async function hoursSnapshot(restaurantId: string) {
  const [restaurant, platform] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: { city_relation: { select: { ordersPaused: true, ordersPausedUntil: true, ordersPauseReason: true } } },
    }),
    prisma.restaurantSettings.findUnique({ where: { id: 'settings' } }),
  ]);
  if (!restaurant) throw new TerminalSettingsError(404, 'NOT_FOUND', 'Restaurangen finns inte');
  const status = buildRestaurantPublicStatus(restaurant as any, { city: restaurant.city_relation, platform });
  return {
    restaurant,
    view: {
      version: settingsVersion(restaurant.openingHours),
      ...openingHoursView(restaurant.openingHours),
      preview: { openNow: status.openNow, changes: status.changes.slice(0, 6) },
    },
  };
}

// GET /api/terminal/opening-hours
router.get('/opening-hours', guard, async (req, res) => {
  try {
    const { view } = await hoursSnapshot((req as TerminalRequest).admin.restaurantId);
    res.json(view);
  } catch (error) {
    sendError(res, error, 'opening-hours');
  }
});

// PUT /api/terminal/opening-hours  { version, week, specialHours }
router.put('/opening-hours', guard, async (req, res) => {
  const treq = req as TerminalRequest;
  try {
    await idempotent(treq, res, 'opening-hours', async () => {
      const restaurantId = treq.admin.restaurantId;
      const before = await hoursSnapshot(restaurantId);
      const version = typeof req.body?.version === 'string' ? req.body.version : '';
      const stored = before.restaurant.openingHours;
      // Valideras före versionskontrollen så ett felaktigt pass alltid ger ett tydligt fel.
      const next = normalizeTerminalOpeningHours(req.body, stored);
      if (!version || before.view.version !== version) {
        // Omspelning av en sparning som redan gått igenom: allt står redan rätt.
        const sameAsNow = JSON.stringify(openingHoursView(next)) === JSON.stringify(openingHoursView(stored));
        if (version && sameAsNow) return { status: 200, body: before.view };
        return { status: 409, body: { error: 'Öppettiderna har ändrats sedan du öppnade sidan', code: 'VERSION_CONFLICT', current: before.view } };
      }

      const now = new Date();
      const data: Record<string, unknown> = { openingHours: next, scheduledOpenNow: isRestaurantOpen(next, now) };
      const r = before.restaurant;
      // "Stängt tills nästa öppning" ska följa de nya tiderna, inte de gamla.
      const overrideUntil = r.acceptingOrdersOverrideUntil ? new Date(r.acceptingOrdersOverrideUntil) : null;
      if (
        r.acceptingOrdersMode === 'FORCE_CLOSED'
        && r.acceptingOrdersOverrideReason === 'CLOSED_UNTIL_NEXT_OPENING'
        && overrideUntil && overrideUntil.getTime() > now.getTime()
      ) {
        data.acceptingOrdersOverrideUntil = nextOpeningAfterToday(next, now);
      }
      const pausedUntil = r.pausedUntil ? new Date(r.pausedUntil) : null;
      if (
        pausedUntil && pausedUntil.getTime() > now.getTime()
        && Math.abs(pausedUntil.getTime() - nextOpeningAfterToday(stored, now).getTime()) <= 2 * 60_000
      ) {
        data.pausedUntil = nextOpeningAfterToday(next, now);
      }

      const written = await prisma.restaurant.updateMany({ where: { id: restaurantId, openingHours: stored }, data });
      if (written.count !== 1) {
        const current = await hoursSnapshot(restaurantId);
        return { status: 409, body: { error: 'Öppettiderna har ändrats sedan du öppnade sidan', code: 'VERSION_CONFLICT', current: current.view } };
      }

      void audit(treq, 'TERMINAL_OPENING_HOURS_UPDATE', {
        resourceType: 'Restaurant',
        resourceId: restaurantId,
        changes: { deviceId: treq.admin.deviceId, appVersion: appVersionOf(treq), before: stored, after: next },
      });
      await afterRestaurantSettingsChanged(restaurantId);
      const after = await hoursSnapshot(restaurantId);
      if (stored !== next) {
        const specialBefore = new Set(before.view.specialHours.map((d) => JSON.stringify(d)));
        const specialNew = after.view.specialHours.filter((d) => !specialBefore.has(JSON.stringify(d)));
        const weekChanged = JSON.stringify(before.view.week) !== JSON.stringify(after.view.week);
        const parts = [
          weekChanged ? 'ändrade veckans öppettider' : null,
          specialNew.length > 0
            ? `lade in ${specialNew.map((d) => `${d.date} ${d.closed ? 'stängt' : d.shifts.map((s) => `${s.open}–${s.close}`).join(', ')}`).join('; ')}`
            : null,
        ].filter(Boolean);
        notify(restaurantId, before.restaurant.name, parts.length ? parts.join(' och ') : 'ändrade avvikande dagar', treq);
      }
      return { status: 200, body: after.view };
    });
  } catch (error) {
    sendError(res, error, 'opening-hours');
  }
});

// ── Menypriser ──────────────────────────────────────────────────────────────

type Db = Pick<typeof prisma, 'restaurant' | 'category' | 'extraGroup'>;

async function priceSnapshot(db: Db, restaurantId: string) {
  const restaurant = await db.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, name: true, brand: { select: { masterRestaurantId: true } } },
  });
  if (!restaurant) throw new TerminalSettingsError(404, 'NOT_FOUND', 'Restaurangen finns inte');
  // En kedjeplats får sina tillval från kedjans huvudmeny vid varje synk. Rätternas
  // pris kan låsas lokalt (localPriceLocked), tillvalen kan inte.
  const chainLocation = Boolean(restaurant.brand?.masterRestaurantId && restaurant.brand.masterRestaurantId !== restaurantId);

  const [categories, groups] = await Promise.all([
    db.category.findMany({
      where: { restaurantId, isActive: true, name: { not: ARCHIVE_CATEGORY_NAME } },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        name: true,
        position: true,
        products: {
          orderBy: { position: 'asc' },
          select: {
            id: true, name: true, price: true, isActive: true, discountActive: true, discountPrice: true,
            extraGroups: { where: { extraGroup: { restaurantId } }, orderBy: { position: 'asc' }, select: { extraGroupId: true } },
          },
        },
      },
    }),
    db.extraGroup.findMany({
      where: { restaurantId },
      orderBy: { position: 'asc' },
      select: { id: true, name: true, extras: { orderBy: { position: 'asc' }, select: { id: true, name: true, priceAddon: true, isActive: true } } },
    }),
  ]);

  const products = categories.flatMap((category) => category.products.map((product) => ({
    id: product.id,
    categoryId: category.id,
    name: product.name,
    priceOre: product.price,
    isActive: product.isActive,
    discountActive: product.discountActive,
    discountPriceOre: product.discountPrice ?? null,
    extraGroupIds: product.extraGroups.map((link) => link.extraGroupId),
  })));
  const extraGroups = groups.map((group) => ({
    id: group.id,
    name: group.name,
    editable: !chainLocation,
    lockedReason: chainLocation ? 'Styrs av kedjans huvudmeny' : null,
    extras: group.extras.map((extra) => ({ id: extra.id, name: extra.name, priceAddonOre: extra.priceAddon, isActive: extra.isActive })),
  }));
  return {
    restaurant,
    chainLocation,
    view: { categories: categories.map(({ id, name, position }) => ({ id, name, position })), products, extraGroups },
  };
}

// GET /api/terminal/menu/prices
router.get('/menu/prices', guard, async (req, res) => {
  try {
    const { view } = await priceSnapshot(prisma, (req as TerminalRequest).admin.restaurantId);
    res.json(view);
  } catch (error) {
    sendError(res, error, 'menu/prices');
  }
});

// POST /api/terminal/menu/prices  { changes: [{ kind, id, fromOre, toOre }] }
// Allt eller inget: en enda konflikt eller ogiltig rad gör att ingenting sparas.
router.post('/menu/prices', guard, async (req, res) => {
  const treq = req as TerminalRequest;
  try {
    await idempotent(treq, res, 'menu/prices', async () => {
      const changes = parsePriceChanges(req.body);
      const restaurantId = treq.admin.restaurantId;

      const outcome = await prisma.$transaction(async (tx) => {
        const snapshot = await priceSnapshot(tx, restaurantId);
        const current = new Map<string, number>();
        snapshot.view.products.forEach((p) => current.set(priceKey('product', p.id), p.priceOre));
        const lockedExtras = new Set<string>();
        snapshot.view.extraGroups.forEach((g) => g.extras.forEach((e) => {
          current.set(priceKey('extra', e.id), e.priceAddonOre);
          if (!g.editable) lockedExtras.add(e.id);
        }));

        const locked = changes.filter((c) => c.kind === 'extra' && lockedExtras.has(c.id));
        if (locked.length > 0) {
          throw new TerminalSettingsError(422, 'LOCKED_GROUP', 'Tillvalen styrs av kedjans huvudmeny', { locked: locked.map((c) => c.id) });
        }
        const plan = planPriceChanges(changes, current);
        if (plan.conflicts.length > 0) return { kind: 'conflict' as const, conflicts: plan.conflicts };

        const menu: PriceMenu = {
          products: snapshot.view.products,
          groups: snapshot.view.extraGroups.map((g) => ({ id: g.id, name: g.name, extras: g.extras })),
        };
        validatePriceResult(menu, plan.apply);

        for (const change of plan.apply) {
          const written = change.kind === 'product'
            ? await tx.product.updateMany({
              where: { id: change.id, price: change.fromOre },
              data: { price: change.toOre, ...(snapshot.chainLocation ? { localPriceLocked: true } : {}) },
            })
            : await tx.extra.updateMany({ where: { id: change.id, priceAddon: change.fromOre }, data: { priceAddon: change.toOre } });
          // Någon hann före mellan läsningen och skrivningen: rulla tillbaka allt.
          if (written.count !== 1) throw new PriceRace(change);
        }
        return { kind: 'ok' as const, plan, snapshot };
      }, TX_OPTIONS).catch(async (error) => {
        if (!(error instanceof PriceRace)) throw error;
        const fresh = await priceSnapshot(prisma, restaurantId);
        const now = error.change.kind === 'product'
          ? fresh.view.products.find((p) => p.id === error.change.id)?.priceOre
          : fresh.view.extraGroups.flatMap((g) => g.extras).find((e) => e.id === error.change.id)?.priceAddonOre;
        return { kind: 'conflict' as const, conflicts: [{ kind: error.change.kind, id: error.change.id, currentOre: now ?? null }] };
      });

      if (outcome.kind === 'conflict') {
        return { status: 409, body: { error: 'Några priser har ändrats sedan du öppnade menyn', code: 'PRICE_CONFLICT', conflicts: outcome.conflicts } };
      }

      const { plan, snapshot } = outcome;
      const body = {
        applied: plan.apply.map(({ kind, id, toOre }) => ({ kind, id, priceOre: toOre })),
        unchanged: plan.unchanged.map(({ kind, id, toOre }) => ({ kind, id, priceOre: toOre })),
      };
      if (plan.apply.length === 0) return { status: 200, body };

      const names = new Map<string, string>();
      snapshot.view.products.forEach((p) => names.set(priceKey('product', p.id), p.name));
      snapshot.view.extraGroups.forEach((g) => g.extras.forEach((e) => names.set(priceKey('extra', e.id), `${e.name} (${g.name})`)));
      const rows = plan.apply.map((c) => ({ ...c, name: names.get(priceKey(c.kind, c.id)) ?? c.id }));
      void audit(treq, 'TERMINAL_MENU_PRICES_UPDATE', {
        resourceType: 'Restaurant',
        resourceId: restaurantId,
        changes: { deviceId: treq.admin.deviceId, appVersion: appVersionOf(treq), prices: rows },
      });
      broadcastMenuChange(restaurantId, { kind: 'terminal-prices', count: rows.length });
      notifyTerminalsMenuChanged(restaurantId);
      notify(restaurantId, snapshot.restaurant.name, priceSummary(rows, req.body?.summary), treq);
      return { status: 200, body };
    });
  } catch (error) {
    sendError(res, error, 'menu/prices');
  }
});

class PriceRace extends Error {
  constructor(public readonly change: PriceChange) {
    super('price race');
  }
}

function priceSummary(rows: Array<PriceChange & { name: string }>, clientSummary: unknown): string {
  const products = rows.filter((r) => r.kind === 'product').length;
  const extras = rows.length - products;
  const counts = [products ? `${products} ${products === 1 ? 'rätt' : 'rätter'}` : null, extras ? `${extras} tillval` : null]
    .filter(Boolean).join(' och ');
  const biggest = [...rows].sort((a, b) => Math.abs(b.toOre - b.fromOre) - Math.abs(a.toOre - a.fromOre))[0];
  const hint = typeof clientSummary === 'string'
    ? clientSummary.replace(/[\r\n\t]+/g, ' ').replace(/[^\p{L}\p{N} .,:%+\-−()&/]/gu, '').trim().slice(0, 80)
    : '';
  return `ändrade priset på ${counts}${hint ? ` (${hint})` : ''}, t.ex. ${biggest.name} ${kr(biggest.fromOre)} → ${kr(biggest.toOre)}`;
}

export default router;
