import { Router } from 'express';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin, autoRoleGate, AuthRequest } from '../middleware/auth';
import { audit } from '../lib/auditLog';
import { getIO } from '../lib/socket';
import { eatsmartCatalog, getCatalogStats } from '../lib/eatsmartCatalog';
import { slugify, uniqueMenuSlug } from '../lib/slug';
import { formatDealForClient, getDealScopeType, parseDealProductIds, parseDealTargetIds, PARTNER_DEAL_MARKER } from '../lib/deals';
import { normalizeMoneyToOre } from '../utils/deliveryZones';
import { notifyCouriersOfNewJob, notifyCouriersOrderReady } from '../lib/courierPush';
import { isTestOrder } from '../lib/testOrderDetection';
import { dispatchCustomerOrderStatus } from '../lib/customerOrderNotifier';
import { recalculateRestaurantEta } from '../lib/restaurantEta';
import { recalculateRestaurantZoneEtas } from '../lib/restaurantZoneEta';
import { customerStepEtaEndsAt, etaResponseFields, refreshOrderEta } from '../lib/orderEta';
import { sanitizeError } from '../lib/errors';
import { menuCacheBust } from './menu';
import { bustCache } from '../lib/ttlCache';
import { parseMenuImport, runMenuImport } from '../lib/menuImport';
import { runMenuSyncSafe } from '../lib/menuSync';
import {
  isRefundRequiredTerminalStatus,
  refundRestaurantScope,
} from '../lib/payments/refunds';
import {
  RefundPersistenceConflict,
} from '../lib/payments/refundPersistence';
import {
  refundOrderForAdmin,
  RefundWorkflowError,
} from '../lib/payments/refundWorkflow';
import { resolveRestaurantAvailability } from '../lib/restaurantAvailability';
import { moneyDto, nullableMoneyDto } from '../utils/money';
import { isRestaurantOrderTransitionAllowed } from '../lib/orderStatusMachine';
import { buildAdminReceiptData, getServerPrintArtifact, warmServerPrintArtifacts } from '../lib/serverPrintArtifact';
import { deleteServerTerminalTestOrder } from '../lib/terminalTestOrder';

const router = Router();
router.use(authenticate);

// Den "bullriga" fan-outen (socket-emit till alla klienter + web SSR-revalidate)
// — separerad så den kan debouncas. Cache-bust ligger UTANFÖR (alltid synkron).
function fanoutMenuChange(restaurantId: string | null, payload: Record<string, unknown>) {
  const event = { restaurantId, ...payload, at: new Date().toISOString() };
  if (restaurantId) getIO().to(`menu:${restaurantId}`).emit('menu:changed', event);
  getIO().to('admin-room').emit('menu:changed', event);
  if (restaurantId) getIO().to(`admin-room:${restaurantId}`).emit('menu:changed', event);
  // Fire-and-forget: rensa kund-webbens SSR-cache för denna slug.
  void revalidateWebMenu(restaurantId);
}

// Per-restaurang debounce-state för fan-outen (leading + trailing).
const menuBroadcastState = new Map<string, { timer: NodeJS.Timeout; pending: boolean; restaurantId: string | null; payload: Record<string, unknown> }>();
const MENU_BROADCAST_WINDOW_MS = 1200;

/**
 * Broadcast a menu change so customer apps refresh in real-time and
 * the server-side TTL cache for /api/menu/categories is busted.
 * Idempotent — safe to call after every product/category/extra mutation.
 *
 * Cache-bust körs SYNKRONT varje anrop (korrekthet). Den bullriga fan-outen
 * (socket-emit + web-revalidate) DEBOUNCAS per restaurang: leading edge emittar
 * direkt (enstaka redigering känns omedelbar), och en burst (t.ex. bulk-pris på
 * 50 produkter via parallella PATCH) coalescas till EN trailing emit ~1.2s
 * efter sista ändringen — i stället för 50 emits/revalidates mot varje klient.
 */
function broadcastMenuChange(restaurantId: string | null, payload: Record<string, unknown> = {}) {
  try {
    menuCacheBust(restaurantId);
    // The public restaurant list (?withMenu) and the /:slug detail both embed the
    // full menu in a SEPARATE cache, so a menu change must clear them too — else
    // the menu looks updated on the menu route but stale on those.
    bustCache('rest:detail');
    bustCache('rest:list');
    // Deals cachas 30s i /api/deals. En ny/ändrad deal måste busta den så
    // restaurangsidor och kassan inte visar stale kampanjdata.
    bustCache('deals:public');
  } catch (err) {
    console.warn('[menu] cache bust failed', err);
  }

  const key = restaurantId ?? '_global';
  const existing = menuBroadcastState.get(key);
  if (!existing) {
    // Leading edge — emit direkt och öppna ett suppressions-fönster.
    try { fanoutMenuChange(restaurantId, payload); } catch (err) { console.warn('[menu] broadcast failed', err); }
    const timer = setTimeout(() => {
      const st = menuBroadcastState.get(key);
      menuBroadcastState.delete(key);
      // Trailing — bara om fler ändringar kom under fönstret (annars redan emittat).
      if (st?.pending) {
        try { fanoutMenuChange(st.restaurantId, st.payload); } catch (err) { console.warn('[menu] trailing broadcast failed', err); }
      }
    }, MENU_BROADCAST_WINDOW_MS);
    menuBroadcastState.set(key, { timer, pending: false, restaurantId, payload });
  } else {
    // Inom fönstret — markera trailing-emit och behåll senaste payload.
    existing.pending = true;
    existing.restaurantId = restaurantId;
    existing.payload = payload;
  }
}

// POST to the customer web app's on-demand revalidation endpoint so the SSR'd
// menu for this restaurant refreshes instantly on any menu change. Safe no-op
// until REVALIDATE_SECRET + FRONTEND_URL are configured on both services.
async function revalidateWebMenu(restaurantId: string | null) {
  if (!restaurantId) return;
  const secret = process.env.REVALIDATE_SECRET;
  const webUrl = process.env.FRONTEND_URL;
  if (!secret || !webUrl) return;
  try {
    const r = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { slug: true },
    });
    if (!r?.slug) return;
    const axios = (await import('axios')).default;
    await axios.post(
      `${webUrl.replace(/\/$/, '')}/api/revalidate`,
      { slug: r.slug },
      { headers: { 'x-revalidate-secret': secret }, timeout: 4000 },
    );
  } catch (err) {
    console.warn('[menu] web revalidate failed', (err as any)?.message ?? err);
  }
}
// RBAC: VIEWER kan bara läsa, STAFF kan läsa+skriva men inte radera,
// ADMIN/RESTAURANT_ADMIN/SUPER_ADMIN kan allt. Per-route `requireSuperAdmin`
// gäller fortfarande för känsliga ops (refund och staff-management).
router.use(autoRoleGate);

const hasHermesApproval = (req: AuthRequest) => {
  const bodyApproval = String(req.body?.hermesApproval || req.body?.approval || '').trim().toUpperCase();
  const headerApproval = String(req.headers['x-hermes-approved'] || '').trim().toLowerCase();
  return bodyApproval === 'JAG GODKÄNNER' || bodyApproval === 'APPROVED' || headerApproval === 'true' || headerApproval === '1';
};

// menuAgentDraftGate: MENU_AGENT får bara skriva mot EDITING-restauranger
// (tekniskt Restaurant.draft=true). Resolvar vilken restaurang requesten pekar på
// (via path-resursen OCH alla mål-referenser i body: restaurantId,
// categoryId, categoryIds) och kräver att SAMTLIGA är utkast. Globala
// resurser (restaurantId=null) är låsta — annars hade agenten kunnat påverka
// alla restauranger via en global kategori/tillvalsgrupp.
router.use(async (req: AuthRequest, res, next) => {
  if (req.admin?.role !== 'MENU_AGENT' || req.method.toUpperCase() === 'GET') return next();
  // upload-r2/images: multipart-body parsas inte här (multer sitter i upload-routen).
  // Släpp igenom, upload-routen kräver själv att målrestaurangen är i editing.
  if (req.path === '/upload-r2') return next();
  if (req.path === '/images/delete') return next();
  try {
    const p = req.path;
    const ids = new Set<string>();
    let ownsNothing = false; // path-resursen saknar restaurang (global) → block
    let m: RegExpMatchArray | null;

    const addCategoryOwner = async (categoryId: string) => {
      const cat = await prisma.category.findUnique({ where: { id: categoryId }, select: { restaurantId: true } });
      if (cat?.restaurantId) ids.add(cat.restaurantId); else ownsNothing = true;
    };

    if (p === '/categories' || p === '/extra-groups') {
      if (req.body?.restaurantId) ids.add(String(req.body.restaurantId)); else ownsNothing = true;
    } else if ((m = p.match(/^\/categories\/([^/]+)$/))) {
      const cat = await prisma.category.findUnique({ where: { id: m[1] }, select: { restaurantId: true } });
      if (cat?.restaurantId) ids.add(cat.restaurantId); else ownsNothing = true;
    } else if (p === '/products') {
      if (req.body?.categoryId) await addCategoryOwner(String(req.body.categoryId)); else ownsNothing = true;
    } else if ((m = p.match(/^\/products\/([^/]+)$/))) {
      const prod = await prisma.product.findUnique({ where: { id: m[1] }, select: { category: { select: { restaurantId: true } } } });
      if (prod?.category?.restaurantId) ids.add(prod.category.restaurantId); else ownsNothing = true;
    } else if ((m = p.match(/^\/extra-groups\/([^/]+)$/))) {
      const grp = await prisma.extraGroup.findUnique({ where: { id: m[1] }, select: { restaurantId: true } });
      if (grp?.restaurantId) ids.add(grp.restaurantId); else ownsNothing = true;
    } else if ((m = p.match(/^\/extras\/([^/]+)$/))) {
      const extra = await prisma.extra.findUnique({ where: { id: m[1] }, select: { extraGroup: { select: { restaurantId: true } } } });
      if (extra?.extraGroup?.restaurantId) ids.add(extra.extraGroup.restaurantId); else ownsNothing = true;
    } else {
      res.status(403).json({ error: 'Menyagenten får bara ändra kategorier, produkter och tillvalsgrupper' });
      return;
    }

    if (req.method.toUpperCase() === 'DELETE' && !hasHermesApproval(req)) {
      res.status(403).json({ error: 'Kocken får bara radera efter explicit prompt-godkännande: skicka hermesApproval="JAG GODKÄNNER".' });
      return;
    }

    // Mål-referenser i body (flytt/koppling) måste också peka på utkast.
    if (req.body?.restaurantId) ids.add(String(req.body.restaurantId));
    if (req.body?.categoryId) await addCategoryOwner(String(req.body.categoryId));
    if (Array.isArray(req.body?.categoryIds)) {
      for (const cid of req.body.categoryIds) await addCategoryOwner(String(cid));
    }

    if (ownsNothing || ids.size === 0) {
      res.status(403).json({ error: 'Kocken måste jobba mot en specifik editing-restaurang, globala resurser är låsta' });
      return;
    }
    const restaurants = await prisma.restaurant.findMany({
      where: { id: { in: Array.from(ids) } },
      select: { id: true, draft: true, archivedAt: true },
    });
    if (restaurants.length !== ids.size || restaurants.some((r) => !(r as any).draft || r.archivedAt != null)) {
      res.status(403).json({ error: 'Kocken kan bara ändra restauranger i editing. Publicerade restauranger är låsta.' });
      return;
    }
    next();
  } catch (err) {
    console.error('[menuAgentDraftGate] error:', err);
    res.status(500).json({ error: 'Serverfel i menyagent-kontrollen' });
  }
});

// OBS: namnet betyder i praktiken "har globalt scope i denna modul".
// GLOBAL_VIEWER ("Falken"): read-only — autoRoleGate blockerar alla writes.
// MENU_AGENT ("Kocken"): global read + writes ENDAST på meny-resurser
// (autoRoleGate-allowlist) och ENDAST mot utkast-restauranger
// (menuAgentDraftGate nedan). requireSuperAdmin-gatade routes (staff,
// audit-log, customer-search, GDPR-export, login-creds) förblir stängda för
// båda, och kund-PII förblir maskerad via canSeeCustomerPII.
const isSuperAdmin = (req: AuthRequest) =>
  req.admin?.role === 'SUPER_ADMIN' || req.admin?.role === 'GLOBAL_VIEWER' || req.admin?.role === 'MENU_AGENT' || req.admin?.role === 'GROWTH_AGENT';

// GROWTH_AGENT ("Torget"): pengar-backstop. Allt den skapar föds inaktivt och
// den får aldrig aktivera (isActive=true). Bara SUPER_ADMIN aktiverar.
const isGrowthAgent = (req: AuthRequest) => req.admin?.role === 'GROWTH_AGENT';

// Roll som får se ofiltrerad customer-PII (full telefon, email, adress).
// STAFF och VIEWER ser maskerad data för GDPR-skäl — de behöver veta att en
// order finns men inte kunna exportera kundens kontaktuppgifter.
// ADMIN/RESTAURANT_ADMIN behöver telefon för att kunna ringa kund vid problem.
const canSeeCustomerPII = (req: AuthRequest): boolean => {
  const role = req.admin?.role;
  return role === 'SUPER_ADMIN' || role === 'ADMIN' || role === 'RESTAURANT_ADMIN';
};

// Kund-läsning: SUPER_ADMIN + GLOBAL_VIEWER ("Kundvakten"/"Falken", read-only
// data-agenter). GLOBAL_VIEWER ser kunder men med MASKERAD PII (canSeeCustomerPII
// släpper inte in den) och kan aldrig skriva/radera (autoRoleGate blockerar).
const canReadCustomers = (req: AuthRequest): boolean => {
  const role = req.admin?.role;
  return role === 'SUPER_ADMIN' || role === 'GLOBAL_VIEWER';
};

const maskPhone = (phone: string | null | undefined): string | null => {
  if (!phone) return null;
  // Behåll landkod + sista 2 siffrorna: "+4670*****12"
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  const head = phone.startsWith('+') ? `+${digits.slice(0, Math.min(3, digits.length - 2))}` : digits.slice(0, Math.min(3, digits.length - 2));
  return `${head}${'*'.repeat(Math.max(2, digits.length - 5))}${digits.slice(-2)}`;
};

const maskEmail = (email: string | null | undefined): string | null => {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!domain) return '***@***';
  const localMasked = local.length <= 2 ? local[0] + '*' : `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}`;
  return `${localMasked}@${domain}`;
};

const maskOrderPII = <T extends { customerPhone?: string | null; customerEmail?: string | null; deliveryStreet?: string | null; deliveryZip?: string | null }>(order: T): T => ({
  ...order,
  customerPhone: maskPhone(order.customerPhone),
  customerEmail: maskEmail(order.customerEmail),
  deliveryStreet: order.deliveryStreet ? order.deliveryStreet.replace(/\d+/g, '##') : null,
  deliveryZip: order.deliveryZip ? '***' : null,
});

const requireRestaurantScope = (req: AuthRequest, res: any): string | null => {
  if (isSuperAdmin(req)) return null;
  const rid = req.admin?.restaurantId;
  if (!rid) {
    res.status(403).json({ error: 'Kontot är inte kopplat till en restaurang' });
    return null;
  }
  return rid;
};

const kr = (amount: number) => Math.round(amount * 100);

const ensureExtraGroup = async ({
  name,
  description,
  type,
  required,
  minSelections,
  maxSelections,
  extras,
  restaurantId,
}: {
  name: string;
  description: string;
  type: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  extras: Array<{ name: string; priceAddon: number; isDefault?: boolean }>;
  restaurantId?: string | null;
}) => {
  const existing = await prisma.extraGroup.findFirst({
    where: { name, restaurantId: restaurantId || null },
    include: { extras: true },
  });

  if (existing) {
    return existing;
  }

  return prisma.extraGroup.create({
    data: {
      name,
      description,
      type,
      required,
      minSelections,
      maxSelections,
      restaurantId: restaurantId || null,
      extras: {
        create: extras.map((extra, index) => ({
          name: extra.name,
          priceAddon: extra.priceAddon,
          isDefault: extra.isDefault ?? false,
          position: index,
        })),
      },
    },
  });
};

const ensureCoreExtraGroups = async () => {
  const [sizeGroup, toppingGroup, sauceGroup, sideGroup, dipGroup] = await Promise.all([
    ensureExtraGroup({
      name: 'Storlek',
      description: 'Välj pizzastorlek',
      type: 'RADIO',
      required: true,
      minSelections: 1,
      maxSelections: 1,
      extras: [
        { name: 'Standard', priceAddon: 0, isDefault: true },
        { name: 'Panpizza', priceAddon: kr(20) },
        { name: 'Familjepizza', priceAddon: kr(110) },
      ],
    }),
    ensureExtraGroup({
      name: 'Pålägg',
      description: 'Valfria extra pålägg',
      type: 'CHECKBOX',
      required: false,
      minSelections: 0,
      maxSelections: 10,
      extras: [
        { name: 'Kebab', priceAddon: kr(25) },
        { name: 'Kyckling', priceAddon: kr(25) },
        { name: 'Räkor', priceAddon: kr(25) },
        { name: 'Tonfisk', priceAddon: kr(25) },
        { name: 'Skinka', priceAddon: kr(25) },
        { name: 'Salami', priceAddon: kr(25) },
        { name: 'Svamp', priceAddon: kr(20) },
        { name: 'Paprika', priceAddon: kr(20) },
        { name: 'Lök', priceAddon: kr(20) },
        { name: 'Tomat', priceAddon: kr(20) },
        { name: 'Jalapeno', priceAddon: kr(20) },
        { name: 'Bacon', priceAddon: kr(25) },
        { name: 'Mozzarella', priceAddon: kr(25) },
        { name: 'Ruccola', priceAddon: kr(20) },
        { name: 'Ananas', priceAddon: kr(15) },
      ],
    }),
    ensureExtraGroup({
      name: 'Sås',
      description: 'Valfri sås',
      type: 'RADIO',
      required: false,
      minSelections: 0,
      maxSelections: 1,
      extras: [
        { name: 'Vitlökssås', priceAddon: 0, isDefault: true },
        { name: 'Stark sås', priceAddon: 0 },
        { name: 'Mamsas', priceAddon: 0 },
        { name: 'Chilisås', priceAddon: 0 },
        { name: 'Pestosås', priceAddon: 0 },
      ],
    }),
    ensureExtraGroup({
      name: 'Tillbehör',
      description: 'Ris eller pommes',
      type: 'RADIO',
      required: true,
      minSelections: 1,
      maxSelections: 1,
      extras: [
        { name: 'Pommes', priceAddon: 0, isDefault: true },
        { name: 'Ris', priceAddon: 0 },
      ],
    }),
    ensureExtraGroup({
      name: 'Dip',
      description: 'Valfri dip',
      type: 'RADIO',
      required: false,
      minSelections: 0,
      maxSelections: 1,
      extras: [
        { name: 'Vitlöksdip', priceAddon: 0, isDefault: true },
        { name: 'BBQ-dip', priceAddon: 0 },
        { name: 'Chimichurri', priceAddon: 0 },
        { name: 'Chili-dip', priceAddon: 0 },
      ],
    }),
  ]);

  return { sizeGroup, toppingGroup, sauceGroup, sideGroup, dipGroup };
};

const getGroupIdsForProduct = (
  categoryName: string,
  product: { name: string; description?: string | null },
  groups: Awaited<ReturnType<typeof ensureCoreExtraGroups>>,
) => {
  const lowerCategory = categoryName.toLowerCase();
  const lowerDescription = (product.description || '').toLowerCase();
  const lowerName = product.name.toLowerCase();
  const groupIds: string[] = [];

  const isPizzaCategory =
    lowerCategory.includes('pizza') ||
    lowerCategory.includes('pizzor') ||
    lowerCategory.includes('veganska') ||
    lowerCategory.includes('italienska');

  if (isPizzaCategory) {
    groupIds.push(groups.sizeGroup.id, groups.toppingGroup.id);
  }

  if (lowerCategory.includes('crispy chicken')) {
    if (lowerName.includes('tallrik')) {
      groupIds.push(groups.sideGroup.id);
    }
    if (lowerName.includes('familj')) {
      groupIds.push(groups.dipGroup.id);
    } else if (lowerName.includes('tallrik')) {
      groupIds.push(groups.dipGroup.id);
    } else if (lowerDescription.includes('valfri sås')) {
      groupIds.push(groups.sauceGroup.id);
    }
  }

  if (
    lowerCategory.includes('tallrik') ||
    lowerCategory.includes('box') ||
    lowerCategory.includes('rullar') ||
    lowerCategory.includes('bröd') ||
    lowerCategory.includes('sallader') ||
    lowerCategory.includes('bakad potatis')
  ) {
    if (
      lowerCategory.includes('tallrik') ||
      lowerCategory.includes('box')
    ) {
      groupIds.push(groups.sideGroup.id);
    }

    if (lowerDescription.includes('valfri sås') || lowerCategory.includes('sallader')) {
      groupIds.push(groups.sauceGroup.id);
    }
  }

  if (lowerDescription.includes('valfri sås') && !groupIds.includes(groups.sauceGroup.id)) {
    groupIds.push(groups.sauceGroup.id);
  }

  return [...new Set(groupIds)];
};

// =====================
// ORDERS
// =====================

// GET /api/admin/orders
router.get('/orders', async (req, res) => {
  try {
    // Retired legacy watcher. It duplicated every order status in WhatsApp;
    // the API notifier now owns that channel.
    if (req.get('user-agent') === 'Falken-ViaEats-Monitor/1.0') {
      res.json({ orders: [], total: 0 });
      return;
    }
    const { status, limit: rawLimit = '50', offset: rawOffset = '0', date, restaurantId, from, to } = req.query;

    // Klampa limit till max 200 så en klient inte kan be om alla 50k ordrar
    // och spiska minnet. offset clampas till 0+ för att förhindra negativa
    // skip-värden (Prisma kraschar på negativ skip).
    const parsedLimit = parseInt(rawLimit as string, 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 50;
    const parsedOffset = parseInt(rawOffset as string, 10);
    const offset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;

    const where: Record<string, unknown> = {};
    if (isSuperAdmin(req as AuthRequest)) {
      if (restaurantId) where.restaurantId = restaurantId as string;
    } else {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      where.restaurantId = rid;
    }
    if (status && status !== 'ALL') {
      where.status = status;
    } else {
      // Hide orders awaiting payment confirmation (not yet visible to restaurant)
      (where as any).NOT = { status: 'AWAITING_PAYMENT' };
    }
    // Stöd för (a) date=YYYY-MM-DD som tidigare, (b) from/to som ISO-datetime
    // (inkl. klockslag) för order-historik-sidan i admin. from och to vinner
    // över date om de är satta.
    if (from || to) {
      const range: any = {};
      if (from) range.gte = new Date(from as string);
      if (to) range.lte = new Date(to as string);
      where.createdAt = range;
    } else if (date) {
      const start = new Date(date as string);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date as string);
      end.setHours(23, 59, 59, 999);
      where.createdAt = { gte: start, lte: end };
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          restaurant: { select: { name: true } },
          items: {
            include: { product: { select: { name: true } } },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    // Customer context: lifetime order/refund counts per userId for any
    // user-linked orders in this page. Single grouped query, no N+1.
    const userIds = Array.from(new Set(orders.map((o) => o.userId).filter((id): id is string => Boolean(id))));
    const statsByUser = new Map<string, { orderCount: number; refundCount: number; firstOrderAt: Date | null }>();
    if (userIds.length > 0) {
      const [allCounts, refundCounts, firstByUser] = await Promise.all([
        prisma.order.groupBy({
          by: ['userId'],
          where: { userId: { in: userIds } },
          _count: { _all: true },
        }),
        prisma.order.groupBy({
          by: ['userId'],
          where: { userId: { in: userIds }, refundedAt: { not: null } },
          _count: { _all: true },
        }),
        prisma.order.groupBy({
          by: ['userId'],
          where: { userId: { in: userIds } },
          _min: { createdAt: true },
        }),
      ]);
      for (const row of allCounts) {
        if (row.userId) statsByUser.set(row.userId, { orderCount: row._count._all, refundCount: 0, firstOrderAt: null });
      }
      for (const row of refundCounts) {
        if (row.userId && statsByUser.has(row.userId)) {
          statsByUser.get(row.userId)!.refundCount = row._count._all;
        }
      }
      for (const row of firstByUser) {
        if (row.userId && statsByUser.has(row.userId)) {
          statsByUser.get(row.userId)!.firstOrderAt = row._min.createdAt ?? null;
        }
      }
    }

    const showFullPII = canSeeCustomerPII(req as AuthRequest);
    res.json({
      orders: orders.map((o) => {
        const stats = o.userId ? statsByUser.get(o.userId) : undefined;
        const base = {
          ...o,
          totalOre: o.total,
          totalMoney: moneyDto(o.total),
          total: o.total / 100,
          deliveryFeeOre: o.deliveryFee,
          deliveryFeeMoney: moneyDto(o.deliveryFee),
          deliveryFee: o.deliveryFee / 100,
          discountAmountOre: o.discountAmount,
          discountAmountMoney: moneyDto(o.discountAmount),
          discountAmount: o.discountAmount / 100,
          tipAmountOre: o.tipAmount ?? 0,
          tipAmountMoney: moneyDto(o.tipAmount ?? 0),
          // Legacy/admin display field is SEK. It used to leak raw ore.
          tipAmount: (o.tipAmount ?? 0) / 100,
          // refundAmount lagras i öre i DB — konvertera till kr som
          // alla andra monetära fält ovan, annars visar admin "500 kr"
          // när det egentligen var en 5 kr-refund.
          refundAmountOre: o.refundAmount ?? null,
          refundAmountMoney: nullableMoneyDto(o.refundAmount),
          refundAmount: o.refundAmount != null ? o.refundAmount / 100 : null,
          items: o.items.map((i) => ({
            ...i,
            basePriceOre: i.basePrice,
            basePriceMoney: moneyDto(i.basePrice),
            basePrice: i.basePrice / 100,
            subtotalOre: i.subtotal,
            subtotalMoney: moneyDto(i.subtotal),
            subtotal: i.subtotal / 100,
          })),
          restaurantName: o.restaurant?.name || 'Okänd restaurang',
          // Customer context for inline badges (null for guest checkouts)
          customerStats: stats
            ? {
                orderCount: stats.orderCount,
                refundCount: stats.refundCount,
                firstOrderAt: stats.firstOrderAt?.toISOString() ?? null,
                refundRate: stats.orderCount > 0 ? stats.refundCount / stats.orderCount : 0,
              }
            : null,
        };
        return showFullPII ? base : maskOrderPII(base);
      }),
      total,
    });
  } catch (error) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// Bulk refunds are deliberately unavailable. Refunds must be reviewed and
// initiated one order at a time so an outage cannot create an irreversible
// high-value batch by mistake. Keep the tombstone route fail-closed for old UI
// versions and integrations.
router.post('/orders/bulk-refund', (_req, res) => {
  res.status(410).json({
    error: 'Massåterbetalning är permanent avstängd. Återbetala en order i taget efter manuell kontroll.',
    code: 'BULK_REFUND_DISABLED',
  });
});

router.get('/orders/:id', async (req, res) => {
  try {
    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        restaurant: { select: { name: true, address: true, city: true, latitude: true, longitude: true, selfDelivery: true } },
        items: {
          include: { product: { select: { name: true } } },
        },
        delivery: { include: { courier: { select: { id: true, name: true, phone: true, vehicle: true, city: true, currentLat: true, currentLng: true, lastSeenAt: true } } } },
        paymentRefunds: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!order) {
      res.status(404).json({ error: 'Order hittades inte' });
      return;
    }

    if (!isSuperAdmin(req as AuthRequest)) {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      if (order.restaurantId !== rid) {
        res.status(403).json({ error: 'Du kan bara se orders för din restaurang' });
        return;
      }
    }

    // Tilldelad kurir + statusövergångs-tider (för order-modalen). null när
    // ingen leverans/kurir finns (avhämtning, self-leverans, ej tilldelad än).
    const dlv = (order as any).delivery;
    const tMin = (a: Date | null, b: Date | null) => (a && b ? Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000) : null);
    const courier = dlv
      ? {
          id: dlv.courier?.id ?? null,
          name: dlv.courier?.name ?? null,
          phone: dlv.courier?.phone ?? null,
          vehicle: dlv.courier?.vehicle ?? null,
          currentLat: dlv.courier?.currentLat ?? null,
          currentLng: dlv.courier?.currentLng ?? null,
          lastSeenAt: dlv.courier?.lastSeenAt ?? null,
          deliveryStatus: dlv.status,
          acceptedAt: dlv.acceptedAt ?? null,
          pickedUpAt: dlv.pickedUpAt ?? null,
          deliveredAt: dlv.deliveredAt ?? null,
          pickupMin: tMin(dlv.acceptedAt, dlv.pickedUpAt), // accept → hämtad
          deliverMin: tMin(dlv.pickedUpAt, dlv.deliveredAt), // hämtad → levererad
          totalMin: tMin(dlv.acceptedAt, dlv.deliveredAt), // accept → levererad
          // Leveransbevis: hur maten lämnades, kurirens notering, foto (TTL 2 dygn).
          proofMethod: dlv.proofMethod ?? null, // HANDED | LEFT_AT_DOOR
          proofMessage: dlv.proofMessage ?? null,
          proofPhotoUrl: dlv.proofPhotoUrl ?? null,
        }
      : null;

    const showFullPII = canSeeCustomerPII(req as AuthRequest);
    const base = {
      ...order,
      courier,
      totalOre: order.total,
      totalMoney: moneyDto(order.total),
      total: order.total / 100,
      deliveryFeeOre: order.deliveryFee,
      deliveryFeeMoney: moneyDto(order.deliveryFee),
      deliveryFee: order.deliveryFee / 100,
      discountAmountOre: order.discountAmount,
      discountAmountMoney: moneyDto(order.discountAmount),
      discountAmount: order.discountAmount / 100,
      tipAmountOre: order.tipAmount ?? 0,
      tipAmountMoney: moneyDto(order.tipAmount ?? 0),
      tipAmount: (order.tipAmount ?? 0) / 100,
      // refundAmount lagras i öre i DB — konvertera till kr för konsekvent
      // display i admin (annars visas 500 när det var en 5 kr-refund).
      refundAmountOre: order.refundAmount ?? null,
      refundAmountMoney: nullableMoneyDto(order.refundAmount),
      refundAmount: order.refundAmount != null ? order.refundAmount / 100 : null,
      paymentRefunds: order.paymentRefunds.map((refund) => ({
        ...refund,
        amountOre: refund.amount,
        amountMoney: moneyDto(refund.amount),
        amount: refund.amount / 100,
        cumulativeAmountOre: refund.cumulativeAmount,
        cumulativeAmountMoney: moneyDto(refund.cumulativeAmount),
        cumulativeAmount: refund.cumulativeAmount / 100,
      })),
      items: order.items.map((i) => ({
        ...i,
        basePriceOre: i.basePrice,
        basePriceMoney: moneyDto(i.basePrice),
        basePrice: i.basePrice / 100,
        subtotalOre: i.subtotal,
        subtotalMoney: moneyDto(i.subtotal),
        subtotal: i.subtotal / 100,
      })),
      restaurantName: order.restaurant?.name || 'Okänd restaurang',
      restaurantAddress: order.restaurant?.address ?? null,
      restaurantCity: order.restaurant?.city ?? null,
      restaurantLat: order.restaurant?.latitude ?? null,
      restaurantLng: order.restaurant?.longitude ?? null,
      restaurantSelfDelivery: order.restaurant?.selfDelivery ?? null,
    };
    res.json(showFullPII ? base : maskOrderPII(base));
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// PATCH /api/admin/orders/:id/status
router.patch('/orders/:id/status', async (req, res) => {
  try {
    // SUPER_ADMIN can monitor all restaurants, but cannot accept/handle orders.
    // Super Admin can monitor and handle all orders.

    const { status, estimatedTime, printPaperWidth } = req.body;
    const validStatuses = ['ACCEPTED', 'PREPARING', 'READY', 'DELIVERING', 'DELIVERED', 'DELIVERY_FAILED', 'REJECTED', 'CANCELLED'];

    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: 'Ogiltig status' });
      return;
    }

    const normalizedEstimatedTime =
      estimatedTime === undefined || estimatedTime === null || estimatedTime === ''
        ? undefined
        : Number(estimatedTime);
    if (
      normalizedEstimatedTime !== undefined &&
      (!Number.isInteger(normalizedEstimatedTime) || normalizedEstimatedTime < 1 || normalizedEstimatedTime > 180)
    ) {
      res.status(400).json({ error: 'Beräknad tid måste vara ett heltal mellan 1 och 180 minuter.' });
      return;
    }
    const normalizedPrintPaperWidth = ['58mm', '72mm', '80mm'].includes(String(printPaperWidth || ''))
      ? String(printPaperWidth)
      : undefined;

    let adminRestaurantId: string | null = null;
    if (isSuperAdmin(req as AuthRequest)) {
      adminRestaurantId = '__super__';
    } else {
      adminRestaurantId = requireRestaurantScope(req as AuthRequest, res);
      if (!adminRestaurantId) return;
    }

    const existing = await prisma.order.findUnique({
      where: { id: req.params.id },
      select: { id: true, orderNumber: true, status: true, paymentStatus: true, estimatedTime: true, restaurantId: true, userId: true, customerPhone: true, customerName: true, type: true, liveActivityToken: true, discountCode: true, stripePaymentIntentId: true, restaurant: { select: { selfDelivery: true } } },
    });

    if (!existing) {
      res.status(404).json({ error: 'Order hittades inte' });
      return;
    }

    const allowedStatusByType =
      existing.type === 'PICKUP'
        ? new Set(['ACCEPTED', 'PREPARING', 'READY', 'DELIVERED', 'REJECTED', 'CANCELLED'])
        : new Set(['ACCEPTED', 'PREPARING', 'READY', 'DELIVERING', 'DELIVERED', 'DELIVERY_FAILED', 'REJECTED', 'CANCELLED']);

    if (!allowedStatusByType.has(status)) {
      res.status(400).json({
        error:
          existing.type === 'PICKUP'
            ? 'Avhämtningsorder kan bara ändras till tillagas, redo att hämtas, hämtad, nekad eller avbruten.'
            : 'Leveransorder kan bara ändras till tillagas, redo för hämtning, på väg, levererad, misslyckad, nekad eller avbruten.',
      });
      return;
    }

    if (!isSuperAdmin(req as AuthRequest) && existing.restaurantId !== adminRestaurantId) {
      res.status(403).json({ error: 'Du kan bara uppdatera orders för din restaurang' });
      return;
    }

    const isPreparingTransition = status === 'PREPARING';
    const isDeliveringTransition = status === 'DELIVERING';
    // Test-order i VI-LEVERERAR-flödet (platform-delivery): vid READY finns inget
    // riktigt bud som kan hämta, så ordern skulle hänga för evigt i kurir-kön.
    // Auto-slutför den direkt (DELIVERED) så den försvinner ur aktiv-vyn. Gäller
    // bara DELIVERY + icke-self-delivery + test-markörer. Hämtning + self-delivery
    // + riktiga ordrar påverkas inte.
    const isTestDeliveryReady =
      status === 'READY' &&
      existing.type === 'DELIVERY' &&
      !existing.restaurant?.selfDelivery &&
      isTestOrder(existing);
    const dbStatus = isTestDeliveryReady ? 'DELIVERED' : status;
    const customerStatus = isTestDeliveryReady ? 'DELIVERED' : status; // Always send the requested status to the customer
    const deleteAfterTestAccept =
      existing.status === 'PENDING' &&
      (dbStatus === 'ACCEPTED' || dbStatus === 'PREPARING') &&
      existing.orderNumber.startsWith('TEST-') &&
      isTestOrder(existing);

    if (
      existing.status !== dbStatus &&
      !isSuperAdmin(req as AuthRequest) &&
      !isRestaurantOrderTransitionAllowed({
        from: existing.status,
        to: status,
        type: existing.type,
        selfDelivery: Boolean(existing.restaurant?.selfDelivery),
      })
    ) {
      res.status(409).json({
        error: `Ordern kan inte ändras från ${existing.status} till ${status}. Uppdatera orderlistan och försök igen.`,
        currentStatus: existing.status,
      });
      return;
    }

    let refundClaimedTerminalStatus = false;
    let requiredRefundStatus: string | undefined;
    if (isRefundRequiredTerminalStatus(dbStatus)) {
      if (existing.paymentStatus === 'REFUNDING' && existing.status !== dbStatus) {
        res.status(409).json({
          error: 'En återbetalning behandlas redan. Vänta tills den har stämts av innan ordern avslutas.',
          refundRequired: true,
          paymentStatus: 'REFUNDING',
        });
        return;
      }
      if (existing.paymentStatus === 'PAID' || existing.paymentStatus === 'PARTIALLY_REFUNDED') {
        try {
          const refundOutcome = await refundOrderForAdmin(
            existing.id,
            dbStatus === 'REJECTED'
              ? 'Automatisk full återbetalning när restaurangen nekade ordern'
              : 'Automatisk full återbetalning när restaurangen avbröt ordern',
            {
              actorAdminId: (req as AuthRequest).admin?.id ?? null,
              restaurantIdScope: existing.restaurantId ?? undefined,
              terminalStatus: dbStatus,
              expectedOrderStatus: existing.status,
              // Statusflödet nedan äger kundnotifieringen. Async completion
              // annonseras av webhook/reconcile när pengarna är bekräftade.
              announce: false,
            },
          );
          refundClaimedTerminalStatus = refundOutcome.status !== 'already_refunded';
          requiredRefundStatus = refundOutcome.refundStatus;
        } catch (error: any) {
          const code = error instanceof RefundWorkflowError ? error.code : 'refund_initiation_failed';
          res.status(code === 'refund_in_progress' ? 409 : 502).json({
            error: error?.message || 'Återbetalningen kunde inte initieras; orderstatusen ändrades inte.',
            code,
            refundRequired: true,
          });
          return;
        }
      }
    }

    // En nätverksretry från terminalen får inte skicka dubbla notifieringar,
    // skriva ut två gånger eller backa en redan färdig order. ETA får däremot
    // korrigeras inom samma status utan att statusens side effects körs igen.
    if (existing.status === dbStatus) {
      if (
        normalizedEstimatedTime !== undefined &&
        normalizedEstimatedTime !== existing.estimatedTime
      ) {
        let etaOrder = await prisma.order.update({
          where: { id: existing.id },
          data: { estimatedTime: normalizedEstimatedTime },
        });
        const refreshedEta = await refreshOrderEta(etaOrder.id).catch(() => null);
        if (refreshedEta) etaOrder = { ...etaOrder, ...refreshedEta };
        if (dbStatus === 'ACCEPTED' || dbStatus === 'PREPARING') {
          // Warm in the background. The tablet starts fetching the ready
          // artifact immediately after the status response; the artifact
          // endpoint shares the same in-flight promise, so accept never waits
          // for Sharp/font rendering and the UI does not look frozen.
          void warmServerPrintArtifacts(etaOrder.id, normalizedPrintPaperWidth).catch((error) =>
            console.warn('[admin] receipt warm failed:', error),
          );
        }
        bustCache('order:byid', etaOrder.id);
        getIO().to(`order:${etaOrder.id}`).emit('order:status', {
          orderId: etaOrder.id,
          status: customerStatus,
          estimatedTime: etaOrder.estimatedTime,
          ...etaResponseFields(etaOrder),
        });
        void dispatchCustomerOrderStatus(etaOrder.id, customerStatus);
        await audit(req as AuthRequest, 'ORDER_ETA_UPDATE', {
          resourceType: 'Order',
          resourceId: etaOrder.id,
          changes: { estimatedTime: normalizedEstimatedTime },
        });
        res.json({ success: true, status: etaOrder.status, idempotent: true, etaUpdated: true });
        return;
      }
      res.json({
        success: true,
        status: existing.status,
        idempotent: true,
        ...(requiredRefundStatus
          ? {
              refundRequired: true,
              refundProcessing: requiredRefundStatus !== 'refunded',
              refundStatus: requiredRefundStatus,
            }
          : existing.paymentStatus === 'REFUNDING'
            ? { refundRequired: true, refundProcessing: true, refundStatus: 'pending' }
            : {}),
      });
      return;
    }

    if (
      !isSuperAdmin(req as AuthRequest) &&
      !isRestaurantOrderTransitionAllowed({
        from: existing.status,
        to: status,
        type: existing.type,
        selfDelivery: Boolean(existing.restaurant?.selfDelivery),
      })
    ) {
      res.status(409).json({
        error: `Ordern kan inte ändras från ${existing.status} till ${status}. Uppdatera orderlistan och försök igen.`,
        currentStatus: existing.status,
      });
      return;
    }

    // Compare-and-swap gör statusbytet atomiskt. Två tryck eller en timeout-
    // retry kan därför inte båda vinna och utlösa samma notifieringar.
    const changed = refundClaimedTerminalStatus
      ? { count: 1 }
      : await prisma.order.updateMany({
          where: { id: req.params.id, status: existing.status },
          data: {
            status: dbStatus,
            estimatedTime: normalizedEstimatedTime,
            ...(isPreparingTransition ? { preparingAt: new Date() } : {}),
            ...(isDeliveringTransition ? { deliveringAt: new Date() } : {}),
            // When admin explicitly clicks DELIVERED (not the auto DELIVERING→DELIVERED
            // path), clear deliveringAt. Otherwise orders.ts keeps returning
            // status:'DELIVERING' for 15 min, the banner stays visible and the LA
            // never flips to "Levererad".
            ...(status === 'DELIVERED' && !isDeliveringTransition ? { deliveringAt: null } : {}),
          },
        });
    if (changed.count !== 1) {
      const latest = await prisma.order.findUnique({
        where: { id: req.params.id },
        select: { status: true },
      });
      if (latest?.status === dbStatus) {
        res.json({ success: true, status: latest.status, idempotent: true });
        return;
      }
      res.status(409).json({
        error: 'Ordern uppdaterades på en annan enhet. Uppdatera orderlistan och försök igen.',
        currentStatus: latest?.status,
      });
      return;
    }

    let order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) {
      res.status(404).json({ error: 'Order hittades inte efter uppdateringen' });
      return;
    }
    const refreshedEta = await refreshOrderEta(order.id).catch((e: any) => {
      console.warn('[admin] order ETA refresh failed:', e?.message);
      return null;
    });
    if (refreshedEta) order = { ...order, ...refreshedEta };
    // Starta serverrenderingen direkt men blockera inte status-svaret på en
    // svag terminal. För riktiga order hämtar plattan artefakten parallellt;
    // testordrar måste däremot hinna renderas innan de raderas nedan.
    if (dbStatus === 'ACCEPTED' || dbStatus === 'PREPARING') {
      const warm = warmServerPrintArtifacts(order.id, normalizedPrintPaperWidth);
      if (deleteAfterTestAccept) {
        await warm;
      } else {
        void warm.catch((error) => console.warn('[admin] receipt warm failed:', error));
      }
    }
    bustCache('order:byid', order.id);
    if (dbStatus === 'DELIVERED' || dbStatus === 'COMPLETED') {
      void import('./referrals').then(({ maybeTriggerReferralReward }) =>
        maybeTriggerReferralReward(order.id),
      );
    }

    // När en order går till DELIVERING får vi en ny datapunkt för
    // restaurangens dynamiska ETA: tiden från createdAt till deliveringAt.
    // Räkna om snittet av senaste 20 ordrarna fire-and-forget — felar det
    // får default-värdet täcka in tills nästa lyckade omräkning.
    if (isDeliveringTransition && existing.restaurantId) {
      void recalculateRestaurantEta(existing.restaurantId).catch(() => null);
      // Per-zon ETA: samma triggerpunkt. Räknar ETA per zon från senaste
      // ordrarnas coords + tider, applicerar monotonic-guard (närmare zon
      // får aldrig högre ETA än längre), sparar tillbaka i deliveryZones JSON.
      void recalculateRestaurantZoneEtas(existing.restaurantId).catch(() => null);
    }

    // Notifiera kunden via Socket.IO
    // For DELIVERING transition, send DELIVERING status to customer (they'll see "PÅ VÄG")
    // The client will auto-switch to DELIVERED after 10-15 min based on deliveringAt
    const preparingAtTs = isPreparingTransition ? new Date() : (order.preparingAt ? new Date(order.preparingAt) : null);
    const emitEtaEndsAt = customerStepEtaEndsAt(
      {
        ...order,
        preparingAt: preparingAtTs,
        selfDelivery: existing.restaurant?.selfDelivery,
      },
      customerStatus,
    )?.toISOString() ?? null;
    getIO().to(`order:${order.id}`).emit('order:status', {
      orderId: order.id,
      status: customerStatus,
      estimatedTime: order.estimatedTime,
      etaEndsAt: emitEtaEndsAt,
      ...etaResponseFields(order),
      deliveringAt: isDeliveringTransition ? new Date().toISOString() : undefined,
    });
    // Samma notifieringspolicy för webb, APNs/Expo och iOS Live Activity,
    // oavsett om statusen kommer från admin, kurir eller timer.
    void dispatchCustomerOrderStatus(order.id, customerStatus);

    // Ny tillgänglig order → push till online-kurirer i restaurangens stad så de
    // notifieras (med ny-order-ljudet) ÄVEN med appen helt stängd. Triggas vid
    // PREPARING: det är där restaurangen FAKTISKT accepterar i Flutter-appen
    // (den hoppar över ACCEPTED). Vi tar även ACCEPTED för ev. andra flöden.
    // Endast vi-levererar + DELIVERY (gate:as i helpern). Fire-and-forget.
    // Triggas vid PREPARING (Flutter-appen accepterar dit) ELLER ACCEPTED.
    // Dubbel-notis vid ACCEPTED→PREPARING hindras av dedup INNE i helpern (90s),
    // så vi behöver ingen strikt PENDING-guard som riskerade att blocka helt.
    if (status === 'PREPARING' || status === 'ACCEPTED') {
      void notifyCouriersOfNewJob({
        orderId: order.id,
        restaurantId: existing.restaurantId,
        orderType: existing.type,
        orderNumber: order.orderNumber,
        estimatedTime: order.estimatedTime,
      });
    }

    // "Klar för hämtning" (READY) på en vi-levererar-order → notifiera budet
    // (tilldelat eller alla i staden) att maten väntar. Fire-and-forget.
    if (status === 'READY' && !isTestDeliveryReady) {
      void notifyCouriersOrderReady({
        orderId: order.id,
        restaurantId: existing.restaurantId,
        orderType: existing.type,
        orderNumber: order.orderNumber,
      });
    }

    // Notifiera admin-rummet — admin always sees the real DB status
    getIO().to('admin-room').emit('order:updated', {
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      restaurantId: order.restaurantId,
    });
    if (order.restaurantId) {
      getIO().to(`admin-room:${order.restaurantId}`).emit('order:updated', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        restaurantId: order.restaurantId,
      });
    }

    await audit(req as AuthRequest, 'ORDER_STATUS_UPDATE', {
      resourceType: 'Order',
      resourceId: order.id,
      changes: { orderNumber: order.orderNumber, newStatus: order.status, estimatedTime },
    });
    if (deleteAfterTestAccept) {
      // Bitmapen är redan genererad ovan och ligger kvar i den begränsade
      // artefaktcachen tills plattan hämtar den. Prisma cascade tar endast
      // testorderns OrderItem-rader; produkt/restaurang påverkas inte.
      const deleted = await deleteServerTerminalTestOrder(order.id);
      if (!deleted) throw new Error('Serverns testorder matchade inte raderingsskyddet');
      getIO().to('admin-room').emit('order:deleted', { orderId: order.id, testOrder: true });
      if (order.restaurantId) {
        getIO().to(`admin-room:${order.restaurantId}`).emit('order:deleted', {
          orderId: order.id,
          testOrder: true,
        });
      }
    }
    res.json({
      success: true,
      status: order.status,
      ...(deleteAfterTestAccept ? { deletedTestOrder: true } : {}),
      ...(requiredRefundStatus ? {
        refundRequired: true,
        refundProcessing: requiredRefundStatus !== 'refunded',
        refundStatus: requiredRefundStatus,
      } : {}),
    });
  } catch (error) {
    console.error('[admin] order status update failed:', error);
    res.status(500).json({ error: 'Kunde inte uppdatera status' });
  }
});

// Admin: PATCH /api/admin/orders/:id - Update order details
router.patch('/orders/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Authorization check
    const existing = await prisma.order.findUnique({
      where: { id },
      select: { id: true, restaurantId: true },
    });
    if (!existing) {
      res.status(404).json({ error: 'Order hittades inte' });
      return;
    }
    
    if (!isSuperAdmin(req as AuthRequest)) {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      if (existing.restaurantId !== rid) {
        res.status(403).json({ error: 'Du kan bara uppdatera orders för din restaurang' });
        return;
      }
    }
    
    const { customerName, customerPhone, customerEmail, deliveryStreet, deliveryCity, deliveryZip, note, status, paymentMethod } = req.body;
    if (status !== undefined) {
      res.status(400).json({ error: 'Ändra orderstatus via den dedikerade statusåtgärden' });
      return;
    }
    
    const order = await prisma.order.update({
      where: { id },
      data: {
        customerName, customerPhone, customerEmail, deliveryStreet, deliveryCity, deliveryZip, note, paymentMethod
      },
    });

    const io = req.app.get('io');
    getIO().emit('order:updated', { id: order.id, status: order.status });
    if (order.restaurantId) {
      getIO().to(`admin-room:${order.restaurantId}`).emit('order:updated', { id: order.id });
    }

    await audit(req as AuthRequest, 'ORDER_UPDATE', {
      resourceType: 'Order',
      resourceId: order.id,
      changes: { customerName, customerPhone, deliveryStreet, status, paymentMethod },
    });
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte uppdatera order' });
  }
});

// Admin: reports/orders (scoped by restaurantId)
router.get('/reports/orders', async (req, res) => {
  try {
    const { dateFrom, dateTo, paymentMethod = 'ALL', restaurantId } = req.query;
    const where: Record<string, unknown> = {
      status: { notIn: ['CANCELLED', 'REJECTED'] },
    };
    if (isSuperAdmin(req as AuthRequest)) {
      Object.assign(where, restaurantId ? { restaurantId: restaurantId as string } : {});
    } else {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      Object.assign(where, { restaurantId: rid });
    }

    if (dateFrom || dateTo) {
      const createdAt: Record<string, Date> = {};
      if (dateFrom) {
        const from = new Date(dateFrom as string);
        from.setHours(0, 0, 0, 0);
        createdAt.gte = from;
      }
      if (dateTo) {
        const to = new Date(dateTo as string);
        to.setHours(23, 59, 59, 999);
        createdAt.lte = to;
      }
      where.createdAt = createdAt;
    }

    if (paymentMethod !== 'ALL') {
      where.paymentMethod = paymentMethod;
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { orderNumber: 'asc' },
      select: {
        id: true,
        orderNumber: true,
        customerPhone: true,
        total: true,
        paymentMethod: true,
        createdAt: true,
      },
    });

    res.json({
      orders: orders.map((order) => ({
        ...order,
        total: order.total / 100,
      })),
      availablePaymentMethods: ['ALL', ...new Set(orders.map((order) => order.paymentMethod || 'ONLINE'))],
    });
  } catch (error) {
    console.error('Order report error:', error);
    res.status(500).json({ error: 'Kunde inte skapa utdrag' });
  }
});

// Admin: backfilla auto-ETA för alla (eller en) restaurang(er) baserat på
// historik. Räknar samma sak som status-update-hooken men på alla samtidigt.
// Kallas en gång efter migration eller manuellt om något ser konstigt ut.
router.post('/restaurants/recalculate-eta', requireSuperAdmin, async (req, res) => {
  try {
    const { restaurantId } = req.body || {};
    const ids: string[] = restaurantId
      ? [String(restaurantId)]
      : (await prisma.restaurant.findMany({ select: { id: true } })).map((r) => r.id);

    const results: { restaurantId: string; eta: number | null }[] = [];
    for (const id of ids) {
      const eta = await recalculateRestaurantEta(id, { force: true });
      results.push({ restaurantId: id, eta });
    }
    res.json({ count: results.length, results });
  } catch (err: any) {
    console.error('[admin] recalculate-eta failed', err);
    res.status(500).json({ error: sanitizeError(err, 'Serverfel') });
  }
});

// Admin: stats (scoped by restaurantId)
router.get('/stats', async (req, res) => {
  try {
    const { restaurantId } = req.query;
    const where: Record<string, unknown> = {};
    if (isSuperAdmin(req as AuthRequest)) {
      Object.assign(where, restaurantId ? { restaurantId: restaurantId as string } : {});
    } else {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      Object.assign(where, { restaurantId: rid });
    }

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [totalOrders, ordersToday, pendingOrders, revenueToday] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.count({ where: { ...where, createdAt: { gte: startOfDay } } }),
      prisma.order.count({ where: { ...where, status: 'PENDING' } }),
      prisma.order.aggregate({
        where: { ...where, createdAt: { gte: startOfDay }, status: { notIn: ['CANCELLED', 'REJECTED'] } },
        _sum: { total: true },
      }),
    ]);

    res.json({
      totalOrders,
      ordersToday,
      pendingOrders,
      revenueToday: (revenueToday._sum.total || 0) / 100,
    });
  } catch (error) {
    res.status(500).json({ error: 'Serverfel vid statistik' });
  }
});

// Admin: stats/report (scoped by restaurantId)
router.get('/stats/report', async (req, res) => {
  try {
    const { restaurantId } = req.query;
    const where: Record<string, unknown> = {
      status: { notIn: ['CANCELLED', 'REJECTED'] },
    };
    if (isSuperAdmin(req as AuthRequest)) {
      Object.assign(where, restaurantId ? { restaurantId: restaurantId as string } : {});
    } else {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      Object.assign(where, { restaurantId: rid });
    }

    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [stats7, stats30] = await Promise.all([
      prisma.order.aggregate({
        where: { ...where, createdAt: { gte: last7Days } },
        _sum: { total: true },
        _count: true,
      }),
      prisma.order.aggregate({
        where: { ...where, createdAt: { gte: last30Days } },
        _sum: { total: true },
        _count: true,
      }),
    ]);

    res.json({
      last7: {
        revenue: (stats7._sum.total || 0) / 100,
        count: stats7._count,
      },
      last30: {
        revenue: (stats30._sum.total || 0) / 100,
        count: stats30._count,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Serverfel vid rapport' });
  }
});

// =====================
// KATEGORIER
// =====================

const ARCHIVE_CATEGORY_NAME = 'Arkiverade produkter';

// GET /api/admin/categories
router.get('/categories', async (req, res) => {
  try {
    const { restaurantId } = req.query;
    const scopedRestaurantId = isSuperAdmin(req as AuthRequest)
      ? (restaurantId ? (restaurantId as string) : null)
      : requireRestaurantScope(req as AuthRequest, res);
    if (!isSuperAdmin(req as AuthRequest) && !scopedRestaurantId) return;
    if (!scopedRestaurantId) {
      return res.status(400).json({ error: 'restaurantId krävs' });
    }

    const includeProducts = req.query.includeProducts === 'true';
    const productInclude = includeProducts ? {
      products: {
        orderBy: { position: 'asc' as const },
        include: {
          extraGroups: {
            where: { extraGroup: { restaurantId: scopedRestaurantId } },
            orderBy: { position: 'asc' as const },
            include: {
              extraGroup: {
                include: {
                  extras: { orderBy: { position: 'asc' as const } }
                }
              }
            }
          }
        }
      }
    } : {};

    const queryWhere = {
      isActive: true,
      name: { not: ARCHIVE_CATEGORY_NAME },
      restaurantId: scopedRestaurantId,
    };

    const baseInclude = {
      _count: { select: { products: true } },
      ...productInclude,
    };

    const categories = await prisma.category.findMany({
      where: queryWhere,
      orderBy: { position: 'asc' },
      include: baseInclude,
    });

    res.json(categories);
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/admin/categories
router.post('/categories', async (req, res) => {
  try {
    const { name, description, imageUrl, position, restaurantId } = req.body;
    const scopedRestaurantId = isSuperAdmin(req as AuthRequest)
      ? (restaurantId ? String(restaurantId) : null)
      : requireRestaurantScope(req as AuthRequest, res);
    if (!isSuperAdmin(req as AuthRequest) && !scopedRestaurantId) return;
    if (!scopedRestaurantId) {
      return res.status(400).json({ error: 'restaurantId krävs' });
    }

    const restaurant = await prisma.restaurant.findUnique({ where: { id: scopedRestaurantId }, select: { slug: true } });
    if (!restaurant) return res.status(404).json({ error: 'Restaurang hittades inte' });
    const restSlug = restaurant.slug;
    const slug = await uniqueMenuSlug(
      name,
      restSlug,
      async (s) => !(await prisma.category.findUnique({ where: { slug: s }, select: { id: true } })),
    );

    const category = await prisma.category.create({
      data: {
        name,
        slug,
        description,
        imageUrl,
        position: position || 0,
        restaurantId: scopedRestaurantId,
      },
    });
    await audit(req as AuthRequest, 'CATEGORY_CREATE', {
      resourceType: 'Category',
      resourceId: category.id,
      changes: { name, restaurantId: scopedRestaurantId },
    });
    broadcastMenuChange(scopedRestaurantId ?? null, { kind: 'category', categoryId: category.id });
    res.status(201).json(category);
  } catch (error: any) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: sanitizeError(error, 'Serverfel') });
  }
});

// Orders and their financial trail are immutable records. Keep this route as a
// fail-closed tombstone for old admin clients; cancellation/refund is the only
// supported correction workflow.
router.delete('/orders/:id', (_req, res) => {
  res.status(410).json({
    error: 'Permanent radering av order är avstängd. Avbryt eller återbetala ordern i stället.',
    code: 'ORDER_HARD_DELETE_DISABLED',
  });
});

// PATCH /api/admin/categories/:id
router.patch('/categories/:id', async (req, res) => {
  try {
    if (!isSuperAdmin(req as AuthRequest)) {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      const existing = await prisma.category.findUnique({
        where: { id: req.params.id },
        select: { id: true, restaurantId: true },
      });
      if (!existing) {
        res.status(404).json({ error: 'Kategori hittades inte' });
        return;
      }
      if (existing.restaurantId !== rid) {
        res.status(403).json({ error: 'Du kan bara uppdatera kategorier för din restaurang' });
        return;
      }
    }

    const { name, description, imageUrl, position, isActive } = req.body;
    const data: Record<string, unknown> = {};
    if (name !== undefined) {
      data.name = name;
    }
    if (description !== undefined) data.description = description;
    if (imageUrl !== undefined) data.imageUrl = imageUrl;
    if (position !== undefined) data.position = position;
    if (isActive !== undefined) data.isActive = isActive;

    const category = await prisma.category.update({
      where: { id: req.params.id },
      data,
    });
    await audit(req as AuthRequest, 'CATEGORY_UPDATE', {
      resourceType: 'Category',
      resourceId: category.id,
      changes: data,
    });
    broadcastMenuChange(category.restaurantId ?? null, { kind: 'category', categoryId: category.id });
    res.json(category);
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// DELETE /api/admin/categories/:id
router.delete('/categories/:id', async (req, res) => {
  try {
    if (!isSuperAdmin(req as AuthRequest)) {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      const existing = await prisma.category.findUnique({
        where: { id: req.params.id },
        select: { id: true, restaurantId: true },
      });
      if (!existing) {
        res.status(404).json({ error: 'Kategori hittades inte' });
        return;
      }
      if (existing.restaurantId !== rid) {
        res.status(403).json({ error: 'Du kan bara radera kategorier för din restaurang' });
        return;
      }
    }

    const doomedCat = await prisma.category.findUnique({
      where: { id: req.params.id },
      select: { restaurantId: true },
    });
    if (!doomedCat) {
      res.status(404).json({ error: 'Kategori hittades inte' });
      return;
    }

    // Produkter med orderhistorik kan inte hårdraderas utan att slå sönder gamla
    // ordrar. Vi skapar däremot inte längre någon "Arkiverade produkter"-kategori:
    // historikprodukter inaktiveras och själva kategorin göms som en tombstone.
    const productsInCat = await prisma.product.findMany({
      where: { categoryId: req.params.id },
      select: { id: true, _count: { select: { orderItems: true } } },
    });
    const safeIds = productsInCat.filter((p) => p._count.orderItems === 0).map((p) => p.id);
    const referencedIds = productsInCat.filter((p) => p._count.orderItems > 0).map((p) => p.id);

    await prisma.$transaction(async (tx) => {
      if (referencedIds.length > 0) {
        await tx.product.updateMany({
          where: { id: { in: referencedIds } },
          data: { isActive: false },
        });
      }
      if (safeIds.length > 0) {
        await tx.product.deleteMany({ where: { id: { in: safeIds } } });
      }
      if (referencedIds.length > 0) {
        await tx.category.update({
          where: { id: req.params.id },
          data: {
            isActive: false,
            name: `Raderad kategori ${req.params.id.slice(-6)}`,
            position: 9999,
          },
        });
      } else {
        await tx.category.delete({ where: { id: req.params.id } });
      }
    });

    await audit(req as AuthRequest, 'CATEGORY_DELETE', {
      resourceType: 'Category',
      resourceId: req.params.id,
      changes: { deletedProducts: safeIds.length, archivedProducts: referencedIds.length },
    });
    broadcastMenuChange(doomedCat.restaurantId ?? null, { kind: 'category', categoryId: req.params.id, deleted: true });
    res.json({ success: true, deleted: safeIds.length, archived: referencedIds.length });
  } catch (error: any) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: sanitizeError(error, 'Kunde inte radera kategorin') });
  }
});


// =====================
// PRODUKTER
// =====================

// Bas-schema utan price-validering — används för PATCH där alla fält är frivilliga
// och vi inte vill blockera spara-flowet bara för att admin råkat ändra fel fält.
// För CREATE förstärker vi schemat med `.required({ ... })`-ish via runtime-check
// av name/categoryId, men tillåter price >= 0 (gratis-rätter / placeholder).
const ProductSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  // Tillåt 0 (gratis-rätter och nya produkter där admin sätter pris efteråt).
  // Tidigare krav `.positive()` blockerade både skapande och uppdatering om
  // formuläret någonsin innehöll 0 — utan att frontend visade vettigt fel.
  price: z.number().min(0),
  vatPercent: z.union([z.literal(0), z.literal(6), z.literal(12), z.literal(25)]).nullable().optional(),
  categoryId: z.string(),
  imageUrl: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  isVegan: z.boolean().optional(),
  isVegetarian: z.boolean().optional(),
  isGlutenFree: z.boolean().optional(),
  position: z.number().optional(),
  extraGroupIds: z.array(z.string()).optional(),
  // Visningsläge i menyn: FULL (1-per-rad) eller COMPACT (2-per-rad).
  displayMode: z.enum(["FULL", "COMPACT"]).optional(),
  hideDescription: z.boolean().optional(),
  // Valfri notering som visas längst ner i produktmodalen i appen.
  note: z.string().nullable().optional(),
  // Discount fields
  discountPercent: z.number().int().min(1).max(95).nullable().optional(),
  discountPrice: z.number().positive().nullable().optional(),
  discountImageUrl: z.string().nullable().optional(),
  discountLabel: z.string().nullable().optional(),
  discountActive: z.boolean().optional(),
  // Kedja: lås lokalt pris (master→plats-synk skriver inte över priset här).
  localPriceLocked: z.boolean().optional(),
});

// PATCH-schema: alla fält frivilliga. Vi använder `.partial()` så zod släpper
// igenom delvisa uppdateringar utan att kräva name/price/categoryId.
const ProductPatchSchema = ProductSchema.partial();

// En produkt får bara länkas till valgrupper med samma scope som kategorin.
// Detta gäller även super-admin, annars kan en felaktig import eller kopiering
// göra att en restaurang börjar läsa en annan restaurangs valgrupper.
async function validateProductExtraGroupScope(
  extraGroupIds: string[] | undefined,
  restaurantId: string | null,
): Promise<string | null> {
  if (!extraGroupIds?.length) return null;
  const ids = [...new Set(extraGroupIds)];
  const groups = await prisma.extraGroup.findMany({
    where: { id: { in: ids } },
    select: { id: true, restaurantId: true },
  });
  if (groups.length !== ids.length || groups.some((group) => group.restaurantId !== restaurantId)) {
    return 'Valgrupperna måste tillhöra samma restaurang som kategorin';
  }
  return null;
}

// GET /api/admin/products
router.get('/products', async (req, res) => {
  try {
    const { categoryId, restaurantId } = req.query;
    const scopedRestaurantId = isSuperAdmin(req as AuthRequest)
      ? (restaurantId ? (restaurantId as string) : null)
      : requireRestaurantScope(req as AuthRequest, res);
    if (!isSuperAdmin(req as AuthRequest) && !scopedRestaurantId) return;
    if (!scopedRestaurantId) return res.status(400).json({ error: 'restaurantId krävs' });
    const categoryWhere = {
      isActive: true,
      name: { not: ARCHIVE_CATEGORY_NAME },
      restaurantId: scopedRestaurantId,
    };

    const products = await prisma.product.findMany({
      where: {
        ...(categoryId ? { categoryId: categoryId as string } : {}),
        category: categoryWhere,
      },
      orderBy: [{ categoryId: 'asc' as const }, { position: 'asc' as const }],
      include: {
        category: { select: { name: true, restaurantId: true } },
        extraGroups: {
          where: { extraGroup: { restaurantId: scopedRestaurantId } },
          include: {
            extraGroup: {
              include: { extras: { orderBy: { position: 'asc' as const } } },
            },
          },
        },
      },
    });

    res.json(products.map((p) => ({
      ...p,
      price: p.price / 100,
      discountPrice: p.discountPrice != null ? p.discountPrice / 100 : null,
      extraGroups: p.extraGroups.map((peg) => ({
        id: peg.extraGroup.id,
        name: peg.extraGroup.name,
        type: peg.extraGroup.type,
        required: peg.extraGroup.required,
        extras: peg.extraGroup.extras.map((e) => ({
          ...e,
          priceAddon: e.priceAddon / 100,
        })),
      })),
    })));
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/admin/menu/bulk-import
// Massimport av kategorier → produkter → pålägg från YAML eller JSON.
// apply=false → dry-run (plan + validering, inga skrivningar). apply=true → kör.
// Idempotent upsert (matchar på namn per restaurang). Priser i kronor → öre.
router.post('/menu/bulk-import', async (req, res) => {
  try {
    const restaurantId = isSuperAdmin(req as AuthRequest)
      ? (req.body.restaurantId ? String(req.body.restaurantId) : null)
      : requireRestaurantScope(req as AuthRequest, res);
    if (!isSuperAdmin(req as AuthRequest) && !restaurantId) return;
    if (!restaurantId) { res.status(400).json({ error: 'restaurantId krävs (välj restaurang)' }); return; }

    const content = String(req.body.content || '');
    if (!content.trim()) { res.status(400).json({ error: 'Tom import — klistra in YAML eller JSON.' }); return; }
    const apply = req.body.apply === true || req.body.apply === 'true';

    let spec;
    try {
      spec = parseMenuImport(content);
    } catch (e: any) {
      res.status(400).json({ error: e?.message || 'Kunde inte tolka filen' });
      return;
    }

    const result = await runMenuImport(prisma, restaurantId, spec, apply);

    if (apply && result.ok) {
      menuCacheBust(restaurantId);
      broadcastMenuChange(restaurantId, { kind: 'bulk-import' });
      await audit(req as AuthRequest, 'MENU_BULK_IMPORT', {
        resourceType: 'Restaurant', resourceId: restaurantId, changes: result.summary,
      });
    }
    res.json(result);
  } catch (error: any) {
    console.error('bulk-import error:', error);
    res.status(500).json({ error: sanitizeError(error, 'Import misslyckades') });
  }
});

// POST /api/admin/menu/sync — kedjesynk master→platser (steg 3).
// body: { sourceRestaurantId, targetRestaurantIds: string[], apply?: boolean }
// Kopierar källans meny till varje vald plats. Idempotent (deterministisk
// scopad slug → andra körningen uppdaterar). Lokal isActive bevaras per plats.
// apply=false → dry-run. Endast super-admin (kedjeoperation över restauranger).
router.post('/menu/sync', async (req, res) => {
  try {
    if (!isSuperAdmin(req as AuthRequest)) {
      res.status(403).json({ error: 'Endast super-admin kan synka meny mellan restauranger' });
      return;
    }
    const sourceRestaurantId = String(req.body.sourceRestaurantId || '');
    const targetRestaurantIds: string[] = Array.isArray(req.body.targetRestaurantIds)
      ? req.body.targetRestaurantIds.map((x: unknown) => String(x))
      : [];
    const apply = req.body.apply === true || req.body.apply === 'true';

    if (!sourceRestaurantId) { res.status(400).json({ error: 'sourceRestaurantId krävs' }); return; }
    const targets = targetRestaurantIds.filter((id) => id && id !== sourceRestaurantId);
    if (targets.length === 0) { res.status(400).json({ error: 'Välj minst en målrestaurang (≠ källan)' }); return; }

    const results = [];
    for (const targetId of targets) {
      const result = await runMenuSyncSafe(prisma, sourceRestaurantId, targetId, apply);
      results.push(result);
      if (apply && result.ok) {
        menuCacheBust(targetId);
        broadcastMenuChange(targetId, { kind: 'menu-sync', sourceRestaurantId });
      }
    }

    if (apply) {
      await audit(req as AuthRequest, 'MENU_SYNC', {
        resourceType: 'Restaurant', resourceId: sourceRestaurantId,
        changes: { targets, summaries: results.map((r) => r.summary) },
      });
    }
    res.json({ ok: results.every((r) => r.ok), dryRun: !apply, results });
  } catch (error: any) {
    console.error('menu-sync error:', error);
    res.status(500).json({ error: sanitizeError(error, 'Synk misslyckades') });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// KEDJOR (Brands) — gruppera platser, utse master, synka alla på en knapp.
// Allt super-admin (kedjeoperationer spänner över restauranger).
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/admin/brands — alla kedjor + deras platser (lättviktigt).
router.get('/brands', requireSuperAdmin, async (_req, res) => {
  try {
    const brands = await prisma.brand.findMany({
      orderBy: { name: 'asc' },
      include: { restaurants: { select: { id: true, name: true, slug: true, city: true }, orderBy: { name: 'asc' } } },
    });
    res.json(brands.map((b) => ({
      id: b.id, name: b.name, slug: b.slug, logoUrl: b.logoUrl,
      masterRestaurantId: b.masterRestaurantId,
      restaurants: b.restaurants,
      locationCount: b.restaurants.length,
    })));
  } catch (error: any) {
    console.error('brands list error:', error);
    res.status(500).json({ error: sanitizeError(error, 'Kunde inte hämta kedjor') });
  }
});

// POST /api/admin/brands — skapa kedja { name, logoUrl? }.
router.post('/brands', requireSuperAdmin, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) { res.status(400).json({ error: 'Namn krävs' }); return; }
    const base = slugify(name) || 'brand';
    // Unik slug (slug är @unique). Disambiguera vid krock.
    let slug = base;
    for (let n = 2; await prisma.brand.findUnique({ where: { slug }, select: { id: true } }); n += 1) slug = `${base}-${n}`;
    const brand = await prisma.brand.create({ data: { name, slug, logoUrl: req.body.logoUrl ? String(req.body.logoUrl) : null } });
    await audit(req as AuthRequest, 'BRAND_CREATE', { resourceType: 'Brand', resourceId: brand.id, changes: { name } });
    res.status(201).json(brand);
  } catch (error: any) {
    console.error('brand create error:', error);
    res.status(500).json({ error: sanitizeError(error, 'Kunde inte skapa kedja') });
  }
});

// PATCH /api/admin/brands/:id — namn, logga, master-plats.
router.patch('/brands/:id', requireSuperAdmin, async (req, res) => {
  try {
    const data: Record<string, unknown> = {};
    if (typeof req.body.name === 'string') data.name = req.body.name.trim();
    if ('logoUrl' in req.body) data.logoUrl = req.body.logoUrl ? String(req.body.logoUrl) : null;
    if ('masterRestaurantId' in req.body) {
      const mid = req.body.masterRestaurantId ? String(req.body.masterRestaurantId) : null;
      // Master MÅSTE vara en plats i kedjan.
      if (mid) {
        const inBrand = await prisma.restaurant.findFirst({ where: { id: mid, brandId: req.params.id }, select: { id: true } });
        if (!inBrand) { res.status(400).json({ error: 'Master måste vara en plats som tillhör kedjan' }); return; }
      }
      data.masterRestaurantId = mid;
    }
    const brand = await prisma.brand.update({ where: { id: req.params.id }, data });
    await audit(req as AuthRequest, 'BRAND_UPDATE', { resourceType: 'Brand', resourceId: brand.id, changes: data });
    res.json(brand);
  } catch (error: any) {
    console.error('brand update error:', error);
    res.status(500).json({ error: sanitizeError(error, 'Kunde inte uppdatera kedja') });
  }
});

// PUT /api/admin/brands/:id/restaurants — sätt EXAKT medlemslistan.
// body: { restaurantIds: string[] }. Tilldelar listade, kopplar bort övriga.
router.put('/brands/:id/restaurants', requireSuperAdmin, async (req, res) => {
  try {
    const brandId = req.params.id;
    const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { id: true, masterRestaurantId: true } });
    if (!brand) { res.status(404).json({ error: 'Kedja hittades inte' }); return; }
    const ids: string[] = Array.isArray(req.body.restaurantIds) ? req.body.restaurantIds.map((x: unknown) => String(x)) : [];
    // Koppla bort platser som inte längre är med, tilldela de nya.
    await prisma.restaurant.updateMany({ where: { brandId, id: { notIn: ids.length ? ids : ['__none__'] } }, data: { brandId: null } });
    if (ids.length) await prisma.restaurant.updateMany({ where: { id: { in: ids } }, data: { brandId } });
    // Om master kopplades bort → nolla master.
    const data: Record<string, unknown> = {};
    if (brand.masterRestaurantId && !ids.includes(brand.masterRestaurantId)) data.masterRestaurantId = null;
    if (Object.keys(data).length) await prisma.brand.update({ where: { id: brandId }, data });
    // Räkna om kedje-scopade deals så nya platser ärver och borttagna tappar dem.
    await resyncBrandDealScopes(brandId);
    await audit(req as AuthRequest, 'BRAND_MEMBERS_SET', { resourceType: 'Brand', resourceId: brandId, changes: { count: ids.length } });
    res.json({ ok: true, count: ids.length });
  } catch (error: any) {
    console.error('brand members error:', error);
    res.status(500).json({ error: sanitizeError(error, 'Kunde inte uppdatera platser') });
  }
});

// POST /api/admin/brands/:id/sync — synka master-menyn till ALLA platser i kedjan.
// body: { apply?: boolean }. Återanvänder runMenuSync (idempotent; lokala
// undantag — isActive, localPriceLocked, plats-deals — bevaras).
router.post('/brands/:id/sync', requireSuperAdmin, async (req, res) => {
  try {
    const brand = await prisma.brand.findUnique({
      where: { id: req.params.id },
      include: { restaurants: { select: { id: true } } },
    });
    if (!brand) { res.status(404).json({ error: 'Kedja hittades inte' }); return; }
    if (!brand.masterRestaurantId) { res.status(400).json({ error: 'Välj en master-plats för kedjan först' }); return; }
    const apply = req.body.apply === true || req.body.apply === 'true';
    const targets = brand.restaurants.map((r) => r.id).filter((id) => id !== brand.masterRestaurantId);
    if (targets.length === 0) { res.status(400).json({ error: 'Kedjan har inga andra platser att synka till' }); return; }

    const results = [];
    for (const targetId of targets) {
      const result = await runMenuSyncSafe(prisma, brand.masterRestaurantId, targetId, apply);
      results.push(result);
      if (apply && result.ok) {
        menuCacheBust(targetId);
        broadcastMenuChange(targetId, { kind: 'brand-sync', brandId: brand.id });
      }
    }
    if (apply) {
      await audit(req as AuthRequest, 'BRAND_SYNC', { resourceType: 'Brand', resourceId: brand.id, changes: { targets, summaries: results.map((r) => r.summary) } });
    }
    res.json({ ok: results.every((r) => r.ok), dryRun: !apply, results });
  } catch (error: any) {
    console.error('brand sync error:', error);
    res.status(500).json({ error: sanitizeError(error, 'Synk misslyckades') });
  }
});

// DELETE /api/admin/brands/:id — ta bort kedjan (platser kopplas bort via FK SetNull).
router.delete('/brands/:id', requireSuperAdmin, async (req, res) => {
  try {
    await prisma.restaurant.updateMany({ where: { brandId: req.params.id }, data: { brandId: null } });
    await prisma.brand.delete({ where: { id: req.params.id } });
    await audit(req as AuthRequest, 'BRAND_DELETE', { resourceType: 'Brand', resourceId: req.params.id, changes: {} });
    res.json({ ok: true });
  } catch (error: any) {
    console.error('brand delete error:', error);
    res.status(500).json({ error: sanitizeError(error, 'Kunde inte ta bort kedja') });
  }
});

// ── Support-anteckningar (delade) ───────────────────────────────────────────
// Polymorf: en anteckning hänger på restaurang, order ELLER kund (telefon).
// Super-admin-only i v1 (support är en plattformsroll; kund-anteckningar spänner
// över restauranger så merchant-synlighet skulle läcka). Append + radera.

// GET /api/admin/notes?restaurantId= | ?orderId= | ?customerPhone=
router.get('/notes', requireSuperAdmin, async (req, res) => {
  try {
    const restaurantId = typeof req.query.restaurantId === 'string' ? req.query.restaurantId : undefined;
    const orderId = typeof req.query.orderId === 'string' ? req.query.orderId : undefined;
    const customerPhone = typeof req.query.customerPhone === 'string' ? req.query.customerPhone : undefined;
    if (!restaurantId && !orderId && !customerPhone) {
      res.status(400).json({ error: 'Ange restaurantId, orderId eller customerPhone' });
      return;
    }
    const notes = await prisma.note.findMany({
      where: { restaurantId, orderId, customerPhone },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(notes);
  } catch (error: any) {
    console.error('notes list error:', error);
    res.status(500).json({ error: sanitizeError(error, 'Kunde inte hämta anteckningar') });
  }
});

// POST /api/admin/notes  body: { body, restaurantId?, orderId?, customerPhone? }
router.post('/notes', requireSuperAdmin, async (req, res) => {
  try {
    const admin = (req as AuthRequest).admin;
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    if (!body) { res.status(400).json({ error: 'Tom anteckning' }); return; }
    const restaurantId = req.body?.restaurantId ? String(req.body.restaurantId) : null;
    const orderId = req.body?.orderId ? String(req.body.orderId) : null;
    const customerPhone = req.body?.customerPhone ? String(req.body.customerPhone) : null;
    if (!restaurantId && !orderId && !customerPhone) {
      res.status(400).json({ error: 'Anteckningen måste kopplas till restaurang, order eller kund' });
      return;
    }
    const note = await prisma.note.create({
      data: {
        body: body.slice(0, 4000),
        authorId: admin?.id ?? null,
        authorName: admin?.name || admin?.email || 'Okänd',
        restaurantId, orderId, customerPhone,
      },
    });
    await audit(req as AuthRequest, 'NOTE_CREATE', { resourceType: 'Note', resourceId: note.id, changes: { restaurantId, orderId, customerPhone } });
    res.status(201).json(note);
  } catch (error: any) {
    console.error('note create error:', error);
    res.status(500).json({ error: sanitizeError(error, 'Kunde inte spara anteckning') });
  }
});

// DELETE /api/admin/notes/:id
router.delete('/notes/:id', requireSuperAdmin, async (req, res) => {
  try {
    await prisma.note.delete({ where: { id: req.params.id } });
    await audit(req as AuthRequest, 'NOTE_DELETE', { resourceType: 'Note', resourceId: req.params.id, changes: {} });
    res.json({ ok: true });
  } catch (error: any) {
    console.error('note delete error:', error);
    res.status(500).json({ error: sanitizeError(error, 'Kunde inte ta bort anteckning') });
  }
});

// POST /api/admin/products
router.post('/products', async (req, res) => {
  try {
    const parsed = ProductSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Ogiltig produktdata', details: parsed.error.flatten() });
      return;
    }
    const data = parsed.data;

    // Resolva kategorin EN gång → restaurang-id (auth) + restaurang-slug
    // (slug-scope) + broadcast-target. Tidigare slogs den upp två gånger.
    const category = await prisma.category.findUnique({
      where: { id: data.categoryId },
      select: { id: true, restaurantId: true, restaurant: { select: { slug: true } } },
    });
    if (!category) {
      res.status(400).json({ error: 'Ogiltig kategori' });
      return;
    }

    if (!isSuperAdmin(req as AuthRequest)) {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      if (category.restaurantId !== rid) {
        res.status(403).json({ error: 'Du kan bara skapa produkter i din restaurangs kategorier' });
        return;
      }
    }

    const extraGroupScopeError = await validateProductExtraGroupScope(
      data.extraGroupIds,
      category.restaurantId,
    );
    if (extraGroupScopeError) {
      res.status(400).json({ error: extraGroupScopeError });
      return;
    }

    // Deterministisk, restaurang-scopad slug — kedjeplatser kan ha samma
    // produktnamn utan global slug-krock (se lib/slug.ts).
    const slug = await uniqueMenuSlug(
      data.name,
      category.restaurant?.slug ?? category.restaurantId ?? 'r',
      async (s) => !(await prisma.product.findUnique({ where: { slug: s }, select: { id: true } })),
    );

    const product = await prisma.product.create({
      data: {
        name: data.name,
        slug,
        description: data.description ?? null,
        price: Math.round(data.price * 100),
        vatPercent: data.vatPercent ?? null,
        categoryId: data.categoryId,
        imageUrl: data.imageUrl ?? null,
        // GROWTH_AGENT-backstop: nya produkter på LIVE-restauranger föds dolda
        // (isActive=false) tills Jalle granskar och aktiverar.
        isActive: isGrowthAgent(req as AuthRequest) ? false : (data.isActive ?? true),
        isVegan: data.isVegan ?? false,
        isVegetarian: data.isVegetarian ?? false,
        isGlutenFree: data.isGlutenFree ?? false,
        position: data.position ?? 0,
        displayMode: data.displayMode ?? "FULL",
        hideDescription: data.hideDescription ?? false,
        note: data.note ?? null,
        discountPercent: data.discountPercent ?? null,
        discountPrice: data.discountPrice != null ? Math.round(data.discountPrice * 100) : null,
        discountImageUrl: data.discountImageUrl ?? null,
        discountLabel: data.discountLabel ?? null,
        discountActive: data.discountActive ?? false,
        localPriceLocked: data.localPriceLocked ?? false,
        ...(data.extraGroupIds && data.extraGroupIds.length > 0 ? {
          extraGroups: {
            create: data.extraGroupIds.map((groupId, i) => ({
              extraGroupId: groupId,
              position: i,
            })),
          },
        } : {}),
      },
    });

    await audit(req as AuthRequest, 'PRODUCT_CREATE', {
      resourceType: 'Product',
      resourceId: product.id,
      changes: { name: data.name, price: data.price, categoryId: data.categoryId },
    });
    broadcastMenuChange(category.restaurantId ?? null, { kind: 'product', productId: product.id, created: true });
    res.status(201).json({ ...product, price: product.price / 100 });
  } catch (error: any) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: sanitizeError(error, 'Serverfel') });
  }
});

// PATCH /api/admin/products/:id
router.patch('/products/:id', async (req, res) => {
  try {
    const existing = await prisma.product.findUnique({
      where: { id: req.params.id },
      select: { id: true, category: { select: { restaurantId: true } } },
    });
    if (!existing) {
      res.status(404).json({ error: 'Produkt hittades inte' });
      return;
    }

    if (!isSuperAdmin(req as AuthRequest)) {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      if (existing.category.restaurantId !== rid) {
        res.status(403).json({ error: 'Du kan bara uppdatera produkter för din restaurang' });
        return;
      }
    }

    // Zod-parse PATCH-payloaden. `.partial()` släpper igenom delvisa
    // uppdateringar. Viktigast: okända fält (t.ex. `restaurantId` som admin-UI
    // skickar med på varje save) strippas så de inte når Prisma och kraschar
    // hela updaten med "Unknown argument" → tidigare "Serverfel" 500.
    const parsed = ProductPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Ogiltig produktdata', details: parsed.error.flatten() });
      return;
    }
    const { extraGroupIds, price, discountPrice, ...rest } = parsed.data;
    const extraGroupScopeError = await validateProductExtraGroupScope(
      extraGroupIds,
      existing.category.restaurantId,
    );
    if (extraGroupScopeError) {
      res.status(400).json({ error: extraGroupScopeError });
      return;
    }
    const updateData: Record<string, unknown> = { ...rest };
    if (price !== undefined) updateData.price = Math.round(price * 100);
    if (discountPrice !== undefined) {
      updateData.discountPrice = discountPrice == null
        ? null
        : Math.round(Number(discountPrice) * 100);
    }

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: {
        ...updateData,
        ...(extraGroupIds !== undefined ? {
          extraGroups: {
            deleteMany: {},
            create: (extraGroupIds as string[]).map((groupId, i) => ({
              extraGroupId: groupId,
              position: i,
            })),
          },
        } : {}),
      },
      include: { category: { select: { restaurantId: true } } },
    });

    await audit(req as AuthRequest, 'PRODUCT_UPDATE', {
      resourceType: 'Product',
      resourceId: product.id,
      changes: updateData,
    });
    broadcastMenuChange(product.category?.restaurantId ?? null, {
      kind: 'product',
      productId: product.id,
      isActive: product.isActive,
    });
    res.json({ ...product, price: product.price / 100 });
  } catch (error: any) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: sanitizeError(error, 'Serverfel') });
  }
});

// DELETE /api/admin/products/:id
router.delete('/products/:id', async (req, res) => {
  try {
    if (!isSuperAdmin(req as AuthRequest)) {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      const existing = await prisma.product.findUnique({
        where: { id: req.params.id },
        select: { id: true, category: { select: { restaurantId: true } } },
      });
      if (!existing) {
        res.status(404).json({ error: 'Produkt hittades inte' });
        return;
      }
      if (existing.category.restaurantId !== rid) {
        res.status(403).json({ error: 'Du kan bara radera produkter för din restaurang' });
        return;
      }
    }

    const doomed = await prisma.product.findUnique({
      where: { id: req.params.id },
      select: { category: { select: { restaurantId: true } } },
    });
    await prisma.product.delete({ where: { id: req.params.id } });
    await audit(req as AuthRequest, 'PRODUCT_DELETE', {
      resourceType: 'Product',
      resourceId: req.params.id,
    });
    broadcastMenuChange(doomed?.category?.restaurantId ?? null, {
      kind: 'product',
      productId: req.params.id,
      deleted: true,
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/admin/products/reorder
// body: { ids: string[] } — sätter position = index för varje produkt-id i
// listans ordning. Persisterar drag/pil-omordning inom en kategori. Scope:
// varje produkt måste tillhöra anroparens restaurang (icke-super-admin).
router.post('/products/reorder', async (req, res) => {
  try {
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map((x: unknown) => String(x)) : [];
    if (ids.length === 0) {
      res.status(400).json({ error: 'ids krävs (array av produkt-id)' });
      return;
    }

    const products = await prisma.product.findMany({
      where: { id: { in: ids } },
      select: { id: true, category: { select: { restaurantId: true } } },
    });
    if (products.length !== ids.length) {
      res.status(404).json({ error: 'En eller flera produkter hittades inte' });
      return;
    }

    if (!isSuperAdmin(req as AuthRequest)) {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      if (products.some((p) => p.category.restaurantId !== rid)) {
        res.status(403).json({ error: 'Du kan bara omordna produkter för din restaurang' });
        return;
      }
    }

    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.product.update({ where: { id }, data: { position: index } }),
      ),
    );

    const restaurantId = products[0]?.category.restaurantId ?? null;
    await audit(req as AuthRequest, 'PRODUCT_REORDER', {
      resourceType: 'Product',
      resourceId: null,
      changes: { ids },
    });
    broadcastMenuChange(restaurantId, { kind: 'product', reordered: true });
    res.json({ ok: true });
  } catch (error: any) {
    console.error('Error reordering products:', error);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/admin/categories/reorder
// body: { ids: string[] } — sätter position = index för varje kategori-id i
// listans ordning. Scope: varje kategori måste tillhöra anroparens restaurang.
router.post('/categories/reorder', async (req, res) => {
  try {
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map((x: unknown) => String(x)) : [];
    if (ids.length === 0) {
      res.status(400).json({ error: 'ids krävs (array av kategori-id)' });
      return;
    }

    const categories = await prisma.category.findMany({
      where: { id: { in: ids } },
      select: { id: true, restaurantId: true },
    });
    if (categories.length !== ids.length) {
      res.status(404).json({ error: 'En eller flera kategorier hittades inte' });
      return;
    }

    if (!isSuperAdmin(req as AuthRequest)) {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      if (categories.some((c) => c.restaurantId !== rid)) {
        res.status(403).json({ error: 'Du kan bara omordna kategorier för din restaurang' });
        return;
      }
    }

    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.category.update({ where: { id }, data: { position: index } }),
      ),
    );

    const restaurantId = categories[0]?.restaurantId ?? null;
    await audit(req as AuthRequest, 'CATEGORY_REORDER', {
      resourceType: 'Category',
      resourceId: null,
      changes: { ids },
    });
    broadcastMenuChange(restaurantId, { kind: 'category', reordered: true });
    res.json({ ok: true });
  } catch (error: any) {
    console.error('Error reordering categories:', error);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/admin/products/:id/duplicate
// Duplicerar en produkt inom SAMMA kategori (samma restaurang). Namn får
// suffixet " (kopia)", position = original + 1, och extra-grupp-länkarna
// återskapas mot samma grupper. Scope-kontroll mot anroparens restaurang.
router.post('/products/:id/duplicate', async (req, res) => {
  try {
    const source = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: {
        category: { select: { restaurantId: true, restaurant: { select: { slug: true } } } },
        extraGroups: {
          orderBy: { position: 'asc' },
          select: { extraGroupId: true, position: true, extraGroup: { select: { restaurantId: true } } },
        },
      },
    });
    if (!source) {
      res.status(404).json({ error: 'Produkt hittades inte' });
      return;
    }

    if (!isSuperAdmin(req as AuthRequest)) {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      if (source.category.restaurantId !== rid) {
        res.status(403).json({ error: 'Du kan bara duplicera produkter för din restaurang' });
        return;
      }
    }

    const name = `${source.name} (kopia)`;
    const slug = await uniqueMenuSlug(
      name,
      source.category.restaurant?.slug ?? source.category.restaurantId ?? 'r',
      async (s) => !(await prisma.product.findUnique({ where: { slug: s }, select: { id: true } })),
    );

    const copy = await prisma.product.create({
      data: {
        name,
        slug,
        description: source.description,
        price: source.price,
        vatPercent: source.vatPercent,
        categoryId: source.categoryId,
        imageUrl: source.imageUrl,
        isActive: source.isActive,
        isVegan: source.isVegan,
        isVegetarian: source.isVegetarian,
        isGlutenFree: source.isGlutenFree,
        position: source.position + 1,
        displayMode: source.displayMode,
        hideDescription: source.hideDescription,
        discountPercent: source.discountPercent,
        discountPrice: source.discountPrice,
        discountImageUrl: source.discountImageUrl,
        discountLabel: source.discountLabel,
        discountActive: source.discountActive,
        localPriceLocked: source.localPriceLocked,
        ...(source.extraGroups.length > 0 ? {
          extraGroups: {
            create: source.extraGroups
              .filter((peg) => peg.extraGroup.restaurantId === source.category.restaurantId)
              .map((peg, i) => ({
                extraGroupId: peg.extraGroupId,
                position: peg.position ?? i,
              })),
          },
        } : {}),
      },
      include: {
        category: { select: { name: true, restaurantId: true } },
        extraGroups: {
          include: {
            extraGroup: {
              include: { extras: { orderBy: { position: 'asc' } } },
            },
          },
        },
      },
    });

    await audit(req as AuthRequest, 'PRODUCT_DUPLICATE', {
      resourceType: 'Product',
      resourceId: copy.id,
      changes: { sourceId: source.id, categoryId: source.categoryId },
    });
    broadcastMenuChange(source.category.restaurantId ?? null, { kind: 'product', productId: copy.id, created: true });

    res.status(201).json({
      ...copy,
      price: copy.price / 100,
      discountPrice: copy.discountPrice != null ? copy.discountPrice / 100 : null,
      extraGroups: copy.extraGroups.map((peg) => ({
        id: peg.extraGroup.id,
        name: peg.extraGroup.name,
        type: peg.extraGroup.type,
        required: peg.extraGroup.required,
        extras: peg.extraGroup.extras.map((e) => ({
          ...e,
          priceAddon: e.priceAddon / 100,
        })),
      })),
    });
  } catch (error: any) {
    console.error('Error duplicating product:', error);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// =====================
// EXTRA GRUPPER (scoped by restaurantId)
// =====================

/**
 * Synka en extra-grupps kategori-kopplingar (icke-destruktiv diff).
 *
 * En "kategori-koppling" betyder att gruppen är länkad till ALLA produkter i
 * kategorin via ProductExtraGroup — exakt samma definition som GET /extra-groups
 * använder för att räkna fram `categoryIds`. Eftersom grupper oftast länkas till
 * enskilda produkter (inte hela kategorier) returnerar GET ofta en TOM
 * categoryIds. Vi får därför ALDRIG radera en kategori bara för att den saknas i
 * inkommande lista — det skulle radera individuella länkar och få gruppen att
 * försvinna från produkten.
 *
 * Vi diffar mot nuläget:
 *   - toAdd    = inkommande `categoryIds` (kryssade) → createMany(skipDuplicates)
 *                på kategorins produkter.
 *   - toRemove = kategorier som TIDIGARE var fullt kopplade (currentlyAssigned)
 *                men som nu är avkryssade → deleteMany på just de kategorierna.
 *   - Kategorier som inte var fullt kopplade rörs aldrig.
 *
 * Rör bara den scopade restaurangens kategorier. Hoppar helt över om
 * `categoryIds` inte är en array (PATCH som utelämnar fältet ska inte radera).
 */
async function syncExtraGroupCategories(
  groupId: string,
  categoryIds: unknown,
  restaurantId: string | null,
): Promise<void> {
  if (!Array.isArray(categoryIds)) return;
  if (!restaurantId) return;

  const checked = new Set<string>(categoryIds.map((id) => String(id)));

  const categories = await prisma.category.findMany({
    where: { restaurantId },
    select: { id: true, products: { select: { id: true } } },
  });

  // Gruppens nuvarande produkt-länkar (samma datakälla som GET:s productGroups).
  const linked = await prisma.productExtraGroup.findMany({
    where: { extraGroupId: groupId },
    select: { productId: true },
  });
  const linkedProductIds = new Set(linked.map((pg) => pg.productId));

  // currentlyAssigned = kategorier som har >=1 produkt OCH där VARJE produkt är
  // länkad till gruppen. Identisk definition som GET /extra-groups (rad ~2138).
  const currentlyAssigned = new Set(
    categories
      .filter((c) => c.products.length > 0 && c.products.every((p) => linkedProductIds.has(p.id)))
      .map((c) => c.id),
  );

  for (const cat of categories) {
    if (checked.has(cat.id)) {
      // toAdd: länka alla kategorins produkter (skipDuplicates gör det idempotent).
      if (cat.products.length > 0) {
        await prisma.productExtraGroup.createMany({
          data: cat.products.map((p) => ({
            productId: p.id,
            extraGroupId: groupId,
            position: 999,
          })),
          skipDuplicates: true,
        });
      }
    } else if (currentlyAssigned.has(cat.id)) {
      // toRemove: bara kategorier som var FULLT kopplade och nu uttryckligen
      // avkryssats. Kategorier som bara hade enstaka/partiella länkar rörs ej.
      await prisma.productExtraGroup.deleteMany({
        where: { extraGroupId: groupId, product: { categoryId: cat.id } },
      });
    }
  }
}

// GET /api/admin/extra-groups
router.get('/extra-groups', async (req, res) => {
  try {
    const { restaurantId } = req.query;
    const scopedRestaurantId = isSuperAdmin(req as AuthRequest)
      ? (restaurantId ? (restaurantId as string) : null)
      : requireRestaurantScope(req as AuthRequest, res);
    if (!isSuperAdmin(req as AuthRequest) && !scopedRestaurantId) return;
    if (!scopedRestaurantId) return res.status(400).json({ error: 'restaurantId krävs' });

    // Admin ska aldrig blanda tillvalsgrupper mellan restauranger. Palmyra ser
    // bara Palmyras grupper, Aiko bara Aikos. Globala/plattformsgrupper visas
    // inte här eftersom de gör produktkopplingar otydliga och riskabla.
    const groups = await prisma.extraGroup.findMany({
      where: { restaurantId: scopedRestaurantId },
      orderBy: { name: 'asc' },
      include: {
        extras: { orderBy: { position: 'asc' } },
        productGroups: { select: { productId: true } },
        _count: { select: { productGroups: true } },
      },
    });

    // En kategori räknas som "kopplad" till en grupp om VARJE produkt i
    // kategorin (inom den scopade restaurangen) är länkad till gruppen.
    // Hämta restaurangens kategorier + deras produkt-id en gång.
    const scopedCategories = scopedRestaurantId
      ? await prisma.category.findMany({
          where: { restaurantId: scopedRestaurantId },
          select: { id: true, products: { select: { id: true } } },
        })
      : [];

    res.json(groups.map((g) => {
      const linkedProductIds = new Set(g.productGroups.map((pg) => pg.productId));
      const categoryIds = scopedCategories
        .filter((c) => c.products.length > 0 && c.products.every((p) => linkedProductIds.has(p.id)))
        .map((c) => c.id);
      const { productGroups: _productGroups, ...rest } = g;
      return {
        ...rest,
        categoryIds,
        extras: g.extras.map((e) => ({ ...e, priceAddon: e.priceAddon / 100 })),
      };
    }));
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/admin/extra-groups
router.post('/extra-groups', async (req, res) => {
  try {
    const { extras, restaurantId, categoryIds, ...rest } = req.body;
    const scopedRestaurantId = isSuperAdmin(req as AuthRequest)
      ? (restaurantId ? String(restaurantId) : null)
      : requireRestaurantScope(req as AuthRequest, res);
    if (!isSuperAdmin(req as AuthRequest) && !scopedRestaurantId) return;
    if (!scopedRestaurantId) return res.status(400).json({ error: 'restaurantId krävs' });

    const group = await prisma.extraGroup.create({
      data: {
        ...rest,
        restaurantId: scopedRestaurantId,
        type: rest.type || 'CHECKBOX',
        displayStyle: rest.displayStyle || 'LIST',
        allowQuantity: rest.allowQuantity ?? false,
        ...(extras && extras.length > 0 ? {
          extras: {
            create: extras.map((e: any, i: number) => ({
              name: e.name,
              priceAddon: Math.round(Number(e.priceAddon || 0) * 100),
              isDefault: e.isDefault || false,
              imageUrl: e.imageUrl ?? null,
              position: i,
            })),
          },
        } : {}),
      },
      include: { extras: true },
    });

    // Synka kategori-kopplingarna (idempotent add/remove-toggle).
    await syncExtraGroupCategories(group.id, categoryIds, scopedRestaurantId);

    await audit(req as AuthRequest, 'EXTRA_GROUP_CREATE', {
      resourceType: 'ExtraGroup',
      resourceId: group.id,
      changes: { name: group.name, restaurantId: scopedRestaurantId },
    });
    res.status(201).json({
      ...group,
      extras: group.extras.map((e) => ({ ...e, priceAddon: e.priceAddon / 100 })),
    });
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// PATCH /api/admin/extra-groups/:id
router.patch('/extra-groups/:id', async (req, res) => {
  try {
    if (!isSuperAdmin(req as AuthRequest)) {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      const existing = await prisma.extraGroup.findUnique({
        where: { id: req.params.id },
        select: { id: true, restaurantId: true },
      });
      if (!existing) {
        res.status(404).json({ error: 'Tillbehörsgrupp hittades inte' });
        return;
      }
      if (existing.restaurantId !== rid) {
        res.status(403).json({ error: 'Du kan bara uppdatera tillbehörsgrupper för din restaurang' });
        return;
      }
    }

    const { extras, categoryIds, restaurantId: _ignoreRestaurantId, ...rest } = req.body;
    const group = await prisma.extraGroup.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        // Bara sätt nya fälten om klienten skickar dem (partial update); fall
        // tillbaka på defaults när nyckeln finns men är null/odefinierad.
        ...(rest.displayStyle !== undefined ? { displayStyle: rest.displayStyle || 'LIST' } : {}),
        ...(rest.allowQuantity !== undefined ? { allowQuantity: rest.allowQuantity ?? false } : {}),
        ...(extras !== undefined ? {
          extras: {
            deleteMany: {},
            create: extras.map((e: any, i: number) => ({
              name: e.name,
              priceAddon: Math.round((e.priceAddon || 0) * 100),
              isDefault: e.isDefault || false,
              imageUrl: e.imageUrl ?? null,
              position: i,
            })),
          },
        } : {}),
      },
      include: { extras: true },
    });

    // Synka kategori-kopplingarna (idempotent add/remove-toggle). Om klienten
    // helt utelämnar categoryIds (inte en array) hoppar vi över — annars skulle
    // en partiell uppdatering radera alla länkar.
    await syncExtraGroupCategories(group.id, categoryIds, group.restaurantId);

    await audit(req as AuthRequest, 'EXTRA_GROUP_UPDATE', {
      resourceType: 'ExtraGroup',
      resourceId: group.id,
    });
    res.json({
      ...group,
      extras: group.extras.map((e) => ({ ...e, priceAddon: e.priceAddon / 100 })),
    });
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// DELETE /api/admin/extra-groups/:id
router.delete('/extra-groups/:id', async (req, res) => {
  try {
    if (!isSuperAdmin(req as AuthRequest)) {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      const existing = await prisma.extraGroup.findUnique({
        where: { id: req.params.id },
        select: { id: true, restaurantId: true },
      });
      if (!existing) {
        res.status(404).json({ error: 'Tillbehörsgrupp hittades inte' });
        return;
      }
      if (existing.restaurantId !== rid) {
        res.status(403).json({ error: 'Du kan bara radera tillbehörsgrupper för din restaurang' });
        return;
      }
    }

    await prisma.extraGroup.delete({ where: { id: req.params.id } });
    await audit(req as AuthRequest, 'EXTRA_GROUP_DELETE', {
      resourceType: 'ExtraGroup',
      resourceId: req.params.id,
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/admin/extra-groups/:id/duplicate
// Duplicerar en tillbehörsgrupp inom SAMMA restaurang. Namn får suffixet
// " (kopia)", och alla extras återskapas. Scope-kontroll mot anroparens
// restaurang (globala grupper utan restaurantId får bara super-admin röra).
router.post('/extra-groups/:id/duplicate', async (req, res) => {
  try {
    const source = await prisma.extraGroup.findUnique({
      where: { id: req.params.id },
      include: { extras: { orderBy: { position: 'asc' } } },
    });
    if (!source) {
      res.status(404).json({ error: 'Tillbehörsgrupp hittades inte' });
      return;
    }

    if (!isSuperAdmin(req as AuthRequest)) {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      if (source.restaurantId !== rid) {
        res.status(403).json({ error: 'Du kan bara duplicera tillbehörsgrupper för din restaurang' });
        return;
      }
    }

    const copy = await prisma.extraGroup.create({
      data: {
        name: `${source.name} (kopia)`,
        description: source.description,
        type: source.type,
        required: source.required,
        minSelections: source.minSelections,
        maxSelections: source.maxSelections,
        displayStyle: source.displayStyle,
        allowQuantity: source.allowQuantity,
        position: source.position,
        restaurantId: source.restaurantId,
        extras: {
          create: source.extras.map((e, i) => ({
            name: e.name,
            priceAddon: e.priceAddon,
            imageUrl: e.imageUrl,
            isDefault: e.isDefault,
            isActive: e.isActive,
            position: e.position ?? i,
          })),
        },
      },
      include: { extras: { orderBy: { position: 'asc' } } },
    });

    await audit(req as AuthRequest, 'EXTRA_GROUP_DUPLICATE', {
      resourceType: 'ExtraGroup',
      resourceId: copy.id,
      changes: { sourceId: source.id },
    });

    res.status(201).json({
      ...copy,
      extras: copy.extras.map((e) => ({ ...e, priceAddon: e.priceAddon / 100 })),
    });
  } catch (error: any) {
    console.error('Error duplicating extra-group:', error);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// =====================
// COPY/IMPORT — kopiera kategori/produkt/extra-grupp från en restaurang till en annan.
// Nya id genereras, originalet rörs inte.
// =====================


// POST /api/admin/extra-groups/:id/copy
router.post('/extra-groups/:id/copy', async (req, res) => {
  try {
    if (!isSuperAdmin(req as AuthRequest)) {
      res.status(403).json({ error: 'Endast super-admin kan kopiera mellan restauranger' });
      return;
    }
    const { targetRestaurantId } = req.body;
    if (!targetRestaurantId) {
      res.status(400).json({ error: 'targetRestaurantId krävs' });
      return;
    }
    const source = await prisma.extraGroup.findUnique({
      where: { id: req.params.id },
      include: { extras: { orderBy: { position: 'asc' } } },
    });
    if (!source) {
      res.status(404).json({ error: 'Källan hittades inte' });
      return;
    }
    const copy = await prisma.extraGroup.create({
      data: {
        name: source.name,
        description: source.description,
        type: source.type,
        required: source.required,
        minSelections: source.minSelections,
        maxSelections: source.maxSelections,
        position: source.position,
        restaurantId: String(targetRestaurantId),
        extras: {
          create: source.extras.map((e, i) => ({
            name: e.name,
            priceAddon: e.priceAddon,
            isDefault: e.isDefault,
            isActive: e.isActive,
            position: i,
          })),
        },
      },
      include: { extras: true },
    });
    await audit(req as AuthRequest, 'EXTRA_GROUP_COPY', {
      resourceType: 'ExtraGroup',
      resourceId: copy.id,
      changes: { sourceId: source.id, targetRestaurantId: String(targetRestaurantId) },
    });
    res.status(201).json({
      ...copy,
      extras: copy.extras.map((e) => ({ ...e, priceAddon: e.priceAddon / 100 })),
    });
  } catch (err) {
    console.error('Copy extra-group error:', err);
    res.status(500).json({ error: 'Kunde inte kopiera tillbehörsgrupp' });
  }
});

// POST /api/admin/categories/:id/copy
router.post('/categories/:id/copy', async (req, res) => {
  try {
    if (!isSuperAdmin(req as AuthRequest)) {
      res.status(403).json({ error: 'Endast super-admin kan kopiera mellan restauranger' });
      return;
    }
    const { targetRestaurantId } = req.body;
    if (!targetRestaurantId) {
      res.status(400).json({ error: 'targetRestaurantId krävs' });
      return;
    }
    const source = await prisma.category.findUnique({ where: { id: req.params.id } });
    if (!source) {
      res.status(404).json({ error: 'Källan hittades inte' });
      return;
    }
    const targetSlug = (await prisma.restaurant.findUnique({ where: { id: String(targetRestaurantId) }, select: { slug: true } }))?.slug ?? String(targetRestaurantId);
    const copy = await prisma.category.create({
      data: {
        name: source.name,
        // Deterministisk scopad slug mot målrestaurangen (kollisionssäker,
        // ersätter random copySlug). Re-kopiering ger samma slug → grund för
        // master→plats-synk.
        slug: await uniqueMenuSlug(source.name, targetSlug, async (s) => !(await prisma.category.findUnique({ where: { slug: s }, select: { id: true } }))),
        description: source.description,
        position: source.position,
        isActive: source.isActive,
        imageUrl: source.imageUrl,
        restaurantId: String(targetRestaurantId),
      },
    });
    await audit(req as AuthRequest, 'CATEGORY_COPY', {
      resourceType: 'Category',
      resourceId: copy.id,
      changes: { sourceId: source.id, targetRestaurantId: String(targetRestaurantId) },
    });
    res.status(201).json(copy);
  } catch (err) {
    console.error('Copy category error:', err);
    res.status(500).json({ error: 'Kunde inte kopiera kategori' });
  }
});

// POST /api/admin/products/:id/copy
// body: { targetRestaurantId, targetCategoryId } — kategorin MÅSTE tillhöra
// målrestaurangen, annars 400.
router.post('/products/:id/copy', async (req, res) => {
  try {
    if (!isSuperAdmin(req as AuthRequest)) {
      res.status(403).json({ error: 'Endast super-admin kan kopiera mellan restauranger' });
      return;
    }
    const { targetRestaurantId, targetCategoryId } = req.body;
    if (!targetRestaurantId || !targetCategoryId) {
      res.status(400).json({ error: 'targetRestaurantId + targetCategoryId krävs' });
      return;
    }
    const targetCategory = await prisma.category.findUnique({
      where: { id: String(targetCategoryId) },
      select: { id: true, restaurantId: true, restaurant: { select: { slug: true } } },
    });
    if (!targetCategory || targetCategory.restaurantId !== String(targetRestaurantId)) {
      res.status(400).json({ error: 'Målkategorin tillhör inte målrestaurangen' });
      return;
    }
    const source = await prisma.product.findUnique({ where: { id: req.params.id } });
    if (!source) {
      res.status(404).json({ error: 'Källan hittades inte' });
      return;
    }
    const copy = await prisma.product.create({
      data: {
        name: source.name,
        // Deterministisk scopad slug mot målrestaurangen (ersätter random
        // copySlug → kollisionssäker även vid hela kedjemenyer).
        slug: await uniqueMenuSlug(source.name, targetCategory.restaurant?.slug ?? String(targetRestaurantId), async (s) => !(await prisma.product.findUnique({ where: { slug: s }, select: { id: true } }))),
        description: source.description,
        price: source.price,
        vatPercent: source.vatPercent,
        categoryId: String(targetCategoryId),
        imageUrl: source.imageUrl,
        isActive: source.isActive,
        isVegan: source.isVegan,
        isVegetarian: source.isVegetarian,
        isGlutenFree: source.isGlutenFree,
        position: source.position,
        discountPercent: source.discountPercent,
        discountPrice: source.discountPrice,
        discountImageUrl: source.discountImageUrl,
        discountLabel: source.discountLabel,
        discountActive: source.discountActive,
      },
    });
    await audit(req as AuthRequest, 'PRODUCT_COPY', {
      resourceType: 'Product',
      resourceId: copy.id,
      changes: {
        sourceId: source.id,
        targetRestaurantId: String(targetRestaurantId),
        targetCategoryId: String(targetCategoryId),
      },
    });
    res.status(201).json({ ...copy, price: copy.price / 100 });
  } catch (err) {
    console.error('Copy product error:', err);
    res.status(500).json({ error: 'Kunde inte kopiera produkt' });
  }
});

// =====================
// ENSKILDA EXTRAS (tillbehör)
// =====================

// PATCH /api/admin/extras/:id — Togglea/uppdatera ett enskilt tillbehör (t.ex. isActive)
// Används av Flutter-appen för att markera enskilda tillbehör som slut.
router.patch('/extras/:id', async (req, res) => {
  try {
    // Verify ownership via the extra's group
    const existing = await prisma.extra.findUnique({
      where: { id: req.params.id },
      include: { extraGroup: { select: { id: true, restaurantId: true } } },
    });

    if (!existing) {
      res.status(404).json({ error: 'Tillbehör hittades inte' });
      return;
    }

    if (!isSuperAdmin(req as AuthRequest)) {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      if (existing.extraGroup.restaurantId !== rid) {
        res.status(403).json({ error: 'Du kan bara uppdatera tillbehör för din restaurang' });
        return;
      }
    }

    const { isActive, name, priceAddon, isDefault, position } = req.body;
    const updateData: Record<string, unknown> = {};
    if (isActive !== undefined) updateData.isActive = isActive;
    if (name !== undefined) updateData.name = name;
    if (priceAddon !== undefined) updateData.priceAddon = Math.round(Number(priceAddon) * 100);
    if (isDefault !== undefined) updateData.isDefault = isDefault;
    if (position !== undefined) updateData.position = position;

    const extra = await prisma.extra.update({
      where: { id: req.params.id },
      data: updateData,
    });

    await audit(req as AuthRequest, 'EXTRA_UPDATE', {
      resourceType: 'Extra',
      resourceId: extra.id,
      changes: updateData,
    });
    broadcastMenuChange(existing.extraGroup.restaurantId ?? null, {
      kind: 'extra',
      extraId: extra.id,
      isActive: extra.isActive,
    });
    res.json({ ...extra, priceAddon: extra.priceAddon / 100 });
  } catch (err) {
    console.error('Error updating extra:', err);
    res.status(500).json({ error: 'Serverfel' });
  }
});



const parseJsonArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
};

const formatDealForAdmin = (deal: any) => ({
  ...deal,
  scopeType: getDealScopeType(deal),
  dealType:
    deal.triggerType === 'PRODUCT'
      ? 'PRODUCT'
      : deal.triggerType === 'CATEGORY'
        ? 'CATEGORY'
        : deal.triggerType === 'COMBO'
      ? 'COMBO'
      : deal.triggerType === 'MIN_ORDER'
        ? 'MIN_ORDER'
        : deal.discountType === 'FIXED_PRICE'
          ? 'FIXED_PRICE'
        : deal.discountType === 'FIXED'
          ? 'FIXED'
          : 'PERCENTAGE',
  discountValue:
    deal.discountType === 'FIXED' || deal.discountType === 'FIXED_PRICE'
      ? normalizeMoneyToOre(Number(deal.discountValue || 0)) / 100
      : deal.discountValue,
  minOrder: normalizeMoneyToOre(Number(deal.minOrder || 0)) / 100,
  comboProductIds: parseDealProductIds(deal.comboProductIds),
  targetIds: parseDealTargetIds(deal.comboProductIds),
  applicableRestaurantIds: parseJsonArray(deal.applicableRestaurantIds),
  brandId: deal.brandId ?? null,
  triggerCategoryId: deal.triggerCategoryId ?? null,
  triggerQuantity: deal.triggerQuantity ?? 2,
  rewardCategoryId: deal.rewardCategoryId ?? null,
  bogoExcludedProductIds: parseJsonArray(deal.bogoExcludedProductIds),
  bogoRewardProductIds: parseJsonArray(deal.bogoRewardProductIds),
  bogoExcludedExtraIds: parseJsonArray(deal.bogoExcludedExtraIds),
  bogoMaxRewardPrice: deal.bogoMaxRewardPriceOre != null ? deal.bogoMaxRewardPriceOre / 100 : null,
  bogoMinOrderAmount: deal.bogoMinOrderAmountOre != null ? deal.bogoMinOrderAmountOre / 100 : null,
  bogoTriggerProductIds: parseJsonArray(deal.bogoTriggerProductIds),
  // Skalning-fält (default 1/1 = nuvarande beteende, "1 gratis per order").
  bogoRewardsPerTrigger: (deal as any).bogoRewardsPerTrigger ?? 1,
  bogoMaxRewardsPerOrder: (deal as any).bogoMaxRewardsPerOrder ?? null,
  appEnabled: Boolean(deal.appEnabled),
  appPlacement: deal.appPlacement || 'HOME_TOP',
  appAudience: deal.appAudience || 'ALL',
  appTemplate: deal.appTemplate || 'DEAL_HERO',
  appSize: deal.appSize || 'LARGE',
  appRotating: deal.appRotating !== false,
  appWeight: deal.appWeight ?? 10,
  appClaimRequired: deal.appClaimRequired !== false,
  appClaimExpiresMinutes: deal.appClaimExpiresMinutes ?? null,
  appCooldownHours: deal.appCooldownHours ?? null,
  appCtaLabel: deal.appCtaLabel ?? null,
  appCtaAction: deal.appCtaAction ?? 'CLAIM',
  appCtaTarget: deal.appCtaTarget ?? null,
  appTheme: deal.appTheme ?? null,
});

// Deaktivera deals som krockar med scope för en NYAKTIVERAD deal eller en
// deal som bytt scope. Pollar inte vid varje PATCH (då skulle ändring av
// t.ex. discountValue ojämtt deaktivera konkurrent-deals — användaren
// rapporterade exakt det).
//
// Logik:
//   - Aktiverar PRODUCT/CATEGORY → stäng RESTAURANT-deals för samma rest.
//   - Aktiverar RESTAURANT → stäng PRODUCT/CATEGORY-deals för samma rest.
//   - Popup-deals (popupEnabled=true) ignoreras helt — de bor i sin egen
//     värld och delar inte scope-konkurrens med vanliga deals.
//   - Andra typer (COMBO, MIN_ORDER) lämnas i fred — egen scope.
const deactivateConflictingDeals = async (params: {
  restaurantId: string | null;
  isActive: boolean;
  scopeType: ReturnType<typeof getDealScopeType>;
  excludeDealId?: string;
  isPopup?: boolean;
}) => {
  const { restaurantId, isActive, scopeType, excludeDealId, isPopup } = params;
  if (!restaurantId || !isActive || isPopup) return { deactivated: [] as Array<{ id: string; title: string }> };
  if (scopeType !== 'RESTAURANT' && scopeType !== 'PRODUCT' && scopeType !== 'CATEGORY') {
    return { deactivated: [] };
  }

  const existingDeals = await prisma.deal.findMany({
    where: {
      restaurantId,
      isActive: true,
      // Popup-deals deaktiveras aldrig av vanliga deals.
      popupEnabled: false,
      ...(excludeDealId ? { id: { not: excludeDealId } } : {}),
    },
    select: { id: true, title: true, triggerType: true },
  });

  const toDeactivate = existingDeals.filter((deal) => {
    const dealScope = getDealScopeType(deal);
    if (scopeType === 'PRODUCT' || scopeType === 'CATEGORY') {
      return dealScope === 'RESTAURANT';
    }
    if (scopeType === 'RESTAURANT') {
      return dealScope === 'PRODUCT' || dealScope === 'CATEGORY';
    }
    return false;
  });

  if (toDeactivate.length > 0) {
    await prisma.deal.updateMany({
      where: { id: { in: toDeactivate.map((deal) => deal.id) } },
      data: { isActive: false },
    });
  }

  return {
    deactivated: toDeactivate.map((deal) => ({ id: deal.id, title: deal.title })),
  };
};

// Kedje-scopad deal → expandera till applicableRestaurantIds (alla nuvarande
// platser i kedjan). Brand-deals lämnar restaurantId=null + isGlobal=false;
// läsvägarna matchar via applicableRestaurantIds (contains) precis som en manuell
// lista. Muterar `data` in-place. Anropas före deal.create/update.
const applyBrandDealScope = async (data: Record<string, any>): Promise<void> => {
  if (!data.brandId) return;
  const members = await prisma.restaurant.findMany({
    where: { brandId: String(data.brandId) },
    select: { id: true },
  });
  data.applicableRestaurantIds = JSON.stringify(members.map((m) => m.id));
  data.restaurantId = null;
  data.isGlobal = false;
};

// Räkna om applicableRestaurantIds för ALLA brand-scopade deals i en kedja.
// Anropas när medlemslistan ändras → nya platser ärver, borttagna tappar dealen.
const resyncBrandDealScopes = async (brandId: string): Promise<void> => {
  const members = await prisma.restaurant.findMany({ where: { brandId }, select: { id: true } });
  const json = JSON.stringify(members.map((m) => m.id));
  await prisma.deal.updateMany({ where: { brandId }, data: { applicableRestaurantIds: json } });
};

// Zod-schema för deal-input. Catches > 100% rabatt, negativ värde,
// validFrom > validUntil mm. innan vi rör databasen.
const DealInputSchema = z.object({
  title: z.string().min(1, 'Titel krävs').optional(),
  discountType: z.enum(['NONE', 'PERCENTAGE', 'FIXED', 'FIXED_PRICE']).optional(),
  discountValue: z.number().or(z.string().transform((s) => Number(s))).optional(),
  validFrom: z.union([z.string(), z.date(), z.null()]).optional(),
  validUntil: z.union([z.string(), z.date(), z.null()]).optional(),
  bogoMaxRewardPrice: z.union([z.number(), z.string(), z.null()]).optional(),
  bogoMinOrderAmount: z.union([z.number(), z.string(), z.null()]).optional(),
  // BOGO-skalning: antal rewards per trigger-uppfyllelse + cap per order.
  bogoRewardsPerTrigger: z.number().int().min(1).optional(),
  bogoMaxRewardsPerOrder: z.number().int().min(1).nullable().optional(),
  triggerQuantity: z.number().int().min(1).optional(),
  maxUsages: z.number().int().min(1).nullable().optional(),
  minOrder: z.number().min(0).optional(),
  appWeight: z.number().int().min(1).max(100).optional(),
  appClaimExpiresMinutes: z.number().int().min(1).nullable().optional(),
  appCooldownHours: z.number().int().min(0).nullable().optional(),
}).passthrough();

const validateDealPayload = (body: any): string | null => {
  const parsed = DealInputSchema.safeParse(body);
  if (!parsed.success) {
    return parsed.error.issues[0]?.message || 'Ogiltig data';
  }
  const d = parsed.data;
  const requestedScope = String(body.scopeType || body.triggerType || '').toUpperCase();
  if (requestedScope === 'BOGO_CATEGORY') {
    return 'BOGO-deals är borttagna. Använd kategori-, restaurang-, produkt- eller minimiorder-deal.';
  }

  // discountValue-validering beroende på discountType
  if (d.discountValue !== undefined && d.discountValue !== null) {
    const val = Number(d.discountValue);
    if (!Number.isFinite(val) || val < 0) return 'Rabattvärde måste vara ≥ 0';
    if (d.discountType === 'PERCENTAGE' && val > 100) return 'Procent-rabatt får inte överstiga 100%';
    if ((d.discountType === 'FIXED' || d.discountType === 'FIXED_PRICE') && val > 1_000_000)
      return 'Fast belopp är orimligt högt';
  }

  // validFrom <= validUntil
  const vf = d.validFrom ? new Date(d.validFrom as any) : null;
  const vu = d.validUntil ? new Date(d.validUntil as any) : null;
  if (vf && vu && Number.isFinite(vf.getTime()) && Number.isFinite(vu.getTime()) && vf > vu) {
    return 'Startdatum måste vara före slutdatum';
  }

  // bogoMaxRewardPrice/bogoMinOrderAmount måste vara ≥ 0 om satt
  for (const key of ['bogoMaxRewardPrice', 'bogoMinOrderAmount'] as const) {
    const raw = (d as any)[key];
    if (raw !== undefined && raw !== null && raw !== '') {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return `${key} måste vara ≥ 0`;
    }
  }

  return null;
};

// Validera att produkt-/extra-IDs faktiskt existerar i DB.
// Returnerar en fel-sträng vid problem, annars null.
const validateDealReferences = async (body: any, restaurantId: string | null): Promise<string | null> => {
  // För CATEGORY-scope lagrar formuläret KATEGORI-id i targetIds → normaliseras
  // till comboProductIds. De ska valideras mot prisma.category, inte prisma.product.
  // Övriga scopes (PRODUCT/COMBO) håller riktiga produkt-id i samma fält.
  const scopeType = String(body.scopeType || body.triggerType || '').toUpperCase();
  const isCategoryScope = scopeType === 'CATEGORY';

  const productKeys = isCategoryScope
    ? ['bogoRewardProductIds', 'bogoTriggerProductIds', 'bogoExcludedProductIds']
    : ['bogoRewardProductIds', 'bogoTriggerProductIds', 'bogoExcludedProductIds', 'targetIds', 'comboProductIds'];
  const categoryKeys = isCategoryScope ? ['targetIds', 'comboProductIds'] : [];

  const collectIds = (keys: string[]) => {
    const set = new Set<string>();
    for (const key of keys) {
      const raw = body[key];
      const ids = Array.isArray(raw) ? raw : parseJsonArray(raw as string | null);
      ids.forEach((id) => typeof id === 'string' && id && set.add(id));
    }
    return set;
  };

  const productIdSet = collectIds(productKeys);
  if (productIdSet.size > 0) {
    const found = await prisma.product.findMany({
      where: { id: { in: [...productIdSet] } },
      select: { id: true, category: { select: { restaurantId: true } } },
    });
    if (found.length !== productIdSet.size) {
      return 'En eller flera produkter i listan finns inte';
    }
    if (restaurantId) {
      const wrong = found.find((p) => p.category?.restaurantId && p.category.restaurantId !== restaurantId);
      if (wrong) return 'Produkter måste tillhöra samma restaurang som dealen';
    }
  }

  const categoryIdSet = collectIds(categoryKeys);
  if (categoryIdSet.size > 0) {
    const found = await prisma.category.findMany({
      where: { id: { in: [...categoryIdSet] } },
      select: { id: true, restaurantId: true },
    });
    if (found.length !== categoryIdSet.size) {
      return 'En eller flera kategorier i listan finns inte';
    }
    if (restaurantId) {
      // Globala kategorier (restaurantId=null) delas och får refereras av alla restauranger.
      const wrong = found.find((c) => c.restaurantId && c.restaurantId !== restaurantId);
      if (wrong) return 'Kategorier måste tillhöra samma restaurang som dealen';
    }
  }

  const extraIdSet = new Set<string>();
  const excludedExtraIds = Array.isArray(body.bogoExcludedExtraIds)
    ? body.bogoExcludedExtraIds
    : parseJsonArray(body.bogoExcludedExtraIds as string | null);
  excludedExtraIds.forEach((id) => typeof id === 'string' && id && extraIdSet.add(id));
  if (extraIdSet.size > 0) {
    const found = await prisma.extra.findMany({
      where: { id: { in: [...extraIdSet] } },
      select: { id: true },
    });
    if (found.length !== extraIdSet.size) {
      return 'En eller flera tillval i excluded-listan finns inte';
    }
  }

  return null;
};

const normalizeDealInputForDb = (body: any) => {
  const next: Record<string, unknown> = { ...body };

  delete next.id;
  delete next.createdAt;
  delete next.updatedAt;
  delete next.dealType;
  delete next.scopeType;
  delete next.targetIds;
  delete next.restaurant;
  // kr-varianter används bara för konvertering till *-Ore-fälten nedan,
  // de finns inte som kolumner i Prisma-schemat
  delete next.bogoMaxRewardPrice;
  delete next.bogoMinOrderAmount;

  if (body.scopeType !== undefined) {
    const scopeType = String(body.scopeType || 'RESTAURANT').toUpperCase();
    next.triggerType =
      scopeType === 'PRODUCT' ||
      scopeType === 'CATEGORY' ||
      scopeType === 'COMBO' ||
      scopeType === 'MIN_ORDER'
        ? scopeType
        : 'NONE';
  }

  if (body.discountValue !== undefined) {
    const discountType = body.discountType;
    const discountValueRaw = Number(body.discountValue || 0);
    next.discountValue =
      discountType === 'FIXED' || discountType === 'FIXED_PRICE'
        ? normalizeMoneyToOre(discountValueRaw)
        : Math.round(discountValueRaw);
  }

  if (body.appEnabled !== undefined) next.appEnabled = Boolean(body.appEnabled);
  if (body.appRotating !== undefined) next.appRotating = Boolean(body.appRotating);
  if (body.appClaimRequired !== undefined) next.appClaimRequired = Boolean(body.appClaimRequired);
  if (body.appPlacement !== undefined) next.appPlacement = String(body.appPlacement || 'HOME_TOP').toUpperCase();
  if (body.appAudience !== undefined) next.appAudience = String(body.appAudience || 'ALL').toUpperCase();
  if (body.appTemplate !== undefined) next.appTemplate = String(body.appTemplate || 'DEAL_HERO').toUpperCase();
  if (body.appSize !== undefined) next.appSize = String(body.appSize || 'LARGE').toUpperCase();
  if (body.appTheme !== undefined) next.appTheme = body.appTheme ? String(body.appTheme) : null;
  if (body.appCtaLabel !== undefined) next.appCtaLabel = body.appCtaLabel ? String(body.appCtaLabel) : null;
  if (body.appCtaAction !== undefined) {
    const action = String(body.appCtaAction || 'CLAIM').toUpperCase();
    next.appCtaAction = ['CLAIM', 'CART', 'RESTAURANT', 'URL'].includes(action) ? action : 'CLAIM';
  }
  if (body.appCtaTarget !== undefined) next.appCtaTarget = body.appCtaTarget ? String(body.appCtaTarget) : null;
  if (body.appWeight !== undefined) next.appWeight = Math.max(1, Math.min(100, Math.round(Number(body.appWeight) || 10)));
  if (body.freeDelivery !== undefined) next.freeDelivery = Boolean(body.freeDelivery);
  if (body.maxUsesPerCustomer !== undefined) {
    const n = Number(body.maxUsesPerCustomer);
    next.maxUsesPerCustomer = Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }
  if (body.appClaimExpiresMinutes !== undefined) {
    const n = Number(body.appClaimExpiresMinutes);
    next.appClaimExpiresMinutes = Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  }
  if (body.appCooldownHours !== undefined) {
    const n = Number(body.appCooldownHours);
    next.appCooldownHours = Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  }

  if (body.minOrder !== undefined) {
    const minOrderRaw = Number(body.minOrder || 0);
    next.minOrder = normalizeMoneyToOre(minOrderRaw);
  }

  if (body.targetIds !== undefined) {
    next.comboProductIds =
      typeof body.targetIds === 'string'
        ? body.targetIds
        : JSON.stringify(body.targetIds || []);
  } else if (body.comboProductIds !== undefined) {
    next.comboProductIds =
      typeof body.comboProductIds === 'string'
        ? body.comboProductIds
        : JSON.stringify(body.comboProductIds || []);
  }

  if (body.applicableRestaurantIds !== undefined) {
    const applicableRestaurantIds =
      typeof body.applicableRestaurantIds === 'string'
        ? parseJsonArray(body.applicableRestaurantIds)
        : Array.isArray(body.applicableRestaurantIds)
          ? body.applicableRestaurantIds.filter((value: unknown): value is string => typeof value === 'string')
          : [];

    next.applicableRestaurantIds =
      typeof body.applicableRestaurantIds === 'string'
        ? body.applicableRestaurantIds
        : JSON.stringify(applicableRestaurantIds);

    // If global, we don't want a specific restaurantId
    if (body.isGlobal === true) {
      next.restaurantId = null;
    } else if (body.restaurantId === undefined) {
      // If NOT global and no ID provided, try to resolve from the list
      next.restaurantId = applicableRestaurantIds.length === 1 ? applicableRestaurantIds[0] : null;
    }
  }

  if (body.restaurantId !== undefined) {
    next.restaurantId = body.restaurantId && body.isGlobal !== true ? String(body.restaurantId) : null;
  }

  if (body.isGlobal !== undefined) {
    next.isGlobal = Boolean(body.isGlobal);
    if (body.isGlobal) {
      next.restaurantId = null;
      next.applicableRestaurantIds = JSON.stringify([]);
      next.brandId = null;
    }
  }

  // Kedje-scope: tom sträng → null. Själva expansionen till applicableRestaurantIds
  // görs i route-handlern (applyBrandDealScope) eftersom den kräver DB-läsning.
  if (body.brandId !== undefined) {
    next.brandId = body.brandId ? String(body.brandId) : null;
  }

  if (body.triggerCategoryId !== undefined) {
    next.triggerCategoryId = body.triggerCategoryId || null;
  }
  if (body.triggerQuantity !== undefined) {
    next.triggerQuantity = Math.max(1, Number(body.triggerQuantity) || 2);
  }
  if (body.rewardCategoryId !== undefined) {
    next.rewardCategoryId = body.rewardCategoryId || null;
  }

  if (body.bogoExcludedProductIds !== undefined) {
    const ids = Array.isArray(body.bogoExcludedProductIds)
      ? body.bogoExcludedProductIds.filter((v: unknown): v is string => typeof v === 'string')
      : parseJsonArray(body.bogoExcludedProductIds);
    next.bogoExcludedProductIds = JSON.stringify(ids);
  }

  if (body.bogoMaxRewardPrice !== undefined) {
    const kr = Number(body.bogoMaxRewardPrice);
    next.bogoMaxRewardPriceOre = (body.bogoMaxRewardPrice === null || body.bogoMaxRewardPrice === '' || isNaN(kr) || kr <= 0)
      ? null
      : Math.round(kr * 100);
  }

  if (body.bogoMinOrderAmount !== undefined) {
    const kr = Number(body.bogoMinOrderAmount);
    next.bogoMinOrderAmountOre = (body.bogoMinOrderAmount === null || body.bogoMinOrderAmount === '' || isNaN(kr) || kr <= 0)
      ? null
      : Math.round(kr * 100);
  }

  // BOGO-skalning. Default på schema-nivå är 1/1 (= "1 gratis per order"),
  // så här persisterar vi bara om admin uttryckligen satt något annat.
  if (body.bogoRewardsPerTrigger !== undefined) {
    const n = Number(body.bogoRewardsPerTrigger);
    next.bogoRewardsPerTrigger = Number.isFinite(n) && n >= 1 ? Math.round(n) : 1;
  }
  if (body.bogoMaxRewardsPerOrder !== undefined) {
    // null/tom = obegränsat (skalär fritt med antal triggers).
    if (body.bogoMaxRewardsPerOrder === null || body.bogoMaxRewardsPerOrder === '') {
      next.bogoMaxRewardsPerOrder = null;
    } else {
      const n = Number(body.bogoMaxRewardsPerOrder);
      next.bogoMaxRewardsPerOrder = Number.isFinite(n) && n >= 1 ? Math.round(n) : 1;
    }
  }

  if (body.bogoTriggerProductIds !== undefined) {
    const ids = Array.isArray(body.bogoTriggerProductIds)
      ? body.bogoTriggerProductIds.filter((v: unknown): v is string => typeof v === 'string')
      : parseJsonArray(body.bogoTriggerProductIds);
    next.bogoTriggerProductIds = JSON.stringify(ids);
  }

  if (body.bogoRewardProductIds !== undefined) {
    const ids = Array.isArray(body.bogoRewardProductIds)
      ? body.bogoRewardProductIds.filter((v: unknown): v is string => typeof v === 'string')
      : parseJsonArray(body.bogoRewardProductIds);
    next.bogoRewardProductIds = JSON.stringify(ids);
  }

  if (body.bogoExcludedExtraIds !== undefined) {
    const ids = Array.isArray(body.bogoExcludedExtraIds)
      ? body.bogoExcludedExtraIds.filter((v: unknown): v is string => typeof v === 'string')
      : parseJsonArray(body.bogoExcludedExtraIds);
    next.bogoExcludedExtraIds = JSON.stringify(ids);
  }

  if (body.validFrom !== undefined) {
    const validFrom =
      body.validFrom && typeof body.validFrom === 'string' ? new Date(body.validFrom) : body.validFrom;
    next.validFrom = validFrom instanceof Date && Number.isFinite(validFrom.getTime()) ? validFrom : null;
  }

  if (body.validUntil !== undefined) {
    const validUntil =
      body.validUntil && typeof body.validUntil === 'string' ? new Date(body.validUntil) : body.validUntil;
    next.validUntil = validUntil instanceof Date && Number.isFinite(validUntil.getTime()) ? validUntil : null;
  }

  return next;
};

const createTemporaryPassword = () => {
  const raw = randomBytes(9).toString('base64url');
  return raw.length >= 12 ? raw.slice(0, 12) : `${raw}A1!`;
};

const staffRoleOptions = ['SUPER_ADMIN', 'STAFF', 'VIEWER', 'ADMIN'] as const;

const resolveRestaurantByAdminLogin = async () => {
  const restaurants = await prisma.restaurant.findMany({
    select: { id: true, name: true, slug: true },
  });

  const restaurantByLogin = new Map<string, { id: string; name: string }>();
  restaurants.forEach((restaurant) => {
    restaurantByLogin.set(restaurant.slug.toLowerCase(), { id: restaurant.id, name: restaurant.name });
  });

  return restaurantByLogin;
};

const formatStaffMember = async (admin: {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
}, restaurantByLogin?: Map<string, { id: string; name: string }>) => {
  const restaurantLookup = restaurantByLogin || await resolveRestaurantByAdminLogin();
  const restaurant = restaurantLookup.get(admin.email.toLowerCase()) || null;

  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: restaurant && admin.role !== 'SUPER_ADMIN' ? 'RESTAURANT_ADMIN' : admin.role,
    restaurantName: restaurant?.name || null,
    restaurantId: restaurant?.id || null,
    lastLogin: null,
    active: admin.isActive,
    createdAt: admin.createdAt,
  };
};

const formatDiscountCodeForAdmin = (discount: any) => ({
  id: discount.id,
  code: discount.code,
  description: discount.description || null,
  discountType: discount.type === 'FIXED' ? 'fixed' : discount.type === 'FREE_DELIVERY' ? 'free_delivery' : 'percentage',
  discountValue: discount.type === 'FIXED' ? discount.value / 100 : discount.type === 'FREE_DELIVERY' ? 0 : discount.value,
  minOrderAmount: (discount.minOrder || 0) / 100,
  maxUses: discount.maxUsages,
  usedCount: discount.usageCount,
  startsAt: discount.validFrom,
  expiresAt: discount.validUntil,
  isActive: discount.isActive,
  restaurantId: discount.restaurantId || null,
  applicableRestaurantIds: parseJsonArray(discount.applicableRestaurantIds),
  // Stackbar fri leverans-flagga (default false). Returneras alltid så
  // admin-formuläret kan hydrera checkboxen korrekt vid redigering.
  freeDelivery: Boolean(discount.freeDelivery),
  // Var koden gäller: ALL | APP (bara mobilappen) | WEB (bara webben).
  platform: (discount.platform || 'ALL').toUpperCase(),
  createdAt: discount.createdAt,
  updatedAt: discount.updatedAt,
});

// Normaliserar admin-input för kupongens plattform till ett giltigt värde.
const normalizeDiscountPlatform = (value: unknown): 'ALL' | 'APP' | 'WEB' => {
  const p = String(value || 'ALL').toUpperCase();
  return p === 'APP' || p === 'WEB' ? p : 'ALL';
};

// =====================
// DEALS & CUSTOMER DEALS
// =====================

router.get('/customer-deals', async (req, res) => {
  try {
    if (!isSuperAdmin(req as AuthRequest)) {
      return res.status(403).json({ error: 'Kräver super admin-behörighet' });
    }

    const deals = await prisma.customerDeal.findMany({
      include: {
        user: { select: { name: true, phone: true } },
        campaign: { select: { title: true, discountType: true, discountValue: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(deals);
  } catch (error) {
    console.error('Error fetching customer deals:', error);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// PATCH /api/admin/customer-deals/:id — mark as used/unused or update
router.patch('/customer-deals/:id', authenticate, async (req, res) => {
  try {
    if (!isSuperAdmin(req as AuthRequest)) {
      return res.status(403).json({ error: 'Kräver super admin-behörighet' });
    }

    const { isUsed, maxUsages } = req.body;
    const updated = await prisma.customerDeal.update({
      where: { id: req.params.id },
      data: {
        ...(isUsed !== undefined ? { isUsed: Boolean(isUsed) } : {}),
        ...(maxUsages !== undefined ? { maxUsages: Number(maxUsages) } : {}),
      },
      include: {
        user: { select: { name: true, phone: true } },
        campaign: { select: { title: true, discountType: true, discountValue: true } },
      },
    });
    await audit(req as AuthRequest, 'CUSTOMER_DEAL_UPDATE', {
      resourceType: 'CustomerDeal',
      resourceId: updated.id,
      changes: { isUsed, maxUsages },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Kunde inte uppdatera deal' });
  }
});

// DELETE /api/admin/customer-deals/:id — delete a single personal deal
router.delete('/customer-deals/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    await prisma.customerDeal.delete({ where: { id: req.params.id } });
    await audit(req as AuthRequest, 'CUSTOMER_DEAL_DELETE', {
      resourceType: 'CustomerDeal',
      resourceId: req.params.id,
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: 'Kunde inte radera deal' });
  }
});

router.get('/deals', async (req, res) => {
  try {
    const { restaurantId } = req.query;
    const scopedRestaurantId = isSuperAdmin(req as AuthRequest)
      ? (restaurantId ? (restaurantId as string) : null)
      : requireRestaurantScope(req as AuthRequest, res);
    if (!isSuperAdmin(req as AuthRequest) && !scopedRestaurantId) return;

    const deals = await prisma.deal.findMany({
      where: {
        ...(scopedRestaurantId ? { restaurantId: scopedRestaurantId } : {}),
        triggerType: { not: 'BOGO_CATEGORY' },
      } as any,
      include: {
        restaurant: {
          select: { id: true, name: true, slug: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
    // Utfall per deal: hämtade (UserDeal-claims) och inlösta (status USED).
    const dealIds = deals.map((d) => d.id);
    const [claimGroups, usedGroups] = dealIds.length
      ? await Promise.all([
          (prisma as any).userDeal.groupBy({ by: ['dealId'], where: { dealId: { in: dealIds } }, _count: { _all: true } }),
          (prisma as any).userDeal.groupBy({ by: ['dealId'], where: { dealId: { in: dealIds }, status: 'USED' }, _count: { _all: true } }),
        ])
      : [[], []];
    const claimsByDeal = new Map<string, number>(claimGroups.map((g: any) => [g.dealId, g._count._all]));
    const usedByDeal = new Map<string, number>(usedGroups.map((g: any) => [g.dealId, g._count._all]));
    res.json(deals.map((d) => ({
      ...formatDealForAdmin(d),
      stats: { claims: claimsByDeal.get(d.id) ?? 0, redeemed: usedByDeal.get(d.id) ?? 0 },
    })));
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

router.get('/deals/:id', async (req, res) => {
  try {
    const deal = await prisma.deal.findUnique({
      where: { id: req.params.id },
      include: { restaurant: { select: { id: true, name: true, slug: true } } },
    });
    if (!deal) return res.status(404).json({ error: 'Deal hittades inte' });
    res.json(formatDealForAdmin(deal));
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

router.post('/deals', async (req, res) => {
  try {
    const { restaurantId, ...rest } = req.body;

    // Permission check: Merchant must have a restaurant, Super Admin can be global (null)
    const scopedRestaurantId = isSuperAdmin(req as AuthRequest)
      ? (restaurantId ? String(restaurantId) : null)
      : requireRestaurantScope(req as AuthRequest, res);

    if (!isSuperAdmin(req as AuthRequest) && !scopedRestaurantId) return;

    const validationError = validateDealPayload(rest);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const refError = await validateDealReferences(rest, scopedRestaurantId || null);
    if (refError) {
      return res.status(400).json({ error: refError });
    }

    const normalized = normalizeDealInputForDb(rest);

    // Flutter partner deals change the public menu price. Older Flutter
    // clients omitted showOnSite, which made badges and menu prices disagree.
    if (rest.appCtaTarget === PARTNER_DEAL_MARKER) normalized.showOnSite = true;

    // Bara super-admin kan kedje-scopa en deal. Merchant-deals är alltid
    // bundna till sin egen restaurang.
    if (!isSuperAdmin(req as AuthRequest)) delete (normalized as any).brandId;

    // Ensure the deal is actually linked to the scoped restaurant if not global
    if (scopedRestaurantId) {
      normalized.restaurantId = scopedRestaurantId;
    }

    // Kedje-scope expanderas sist så restaurantId=null + applicable=alla platser.
    await applyBrandDealScope(normalized as any);

    // GROWTH_AGENT-backstop: deals föds ALLTID inaktiva. Bara Jalle aktiverar.
    if (isGrowthAgent(req as AuthRequest)) (normalized as any).isActive = false;

    await deactivateConflictingDeals({
      restaurantId: (normalized.restaurantId as string | null | undefined) || null,
      isActive: normalized.isActive !== false,
      scopeType: getDealScopeType({ triggerType: String(normalized.triggerType || 'NONE') }),
      isPopup: normalized.popupEnabled === true,
    });

    const deal = await prisma.deal.create({
      data: normalized as any,
    });

    await audit(req as AuthRequest, 'DEAL_CREATE', {
      resourceType: 'Deal',
      resourceId: deal.id,
      changes: { title: deal.title, restaurantId: scopedRestaurantId, triggerType: normalized.triggerType },
    });
    // Busta deals-cachen + notifiera öppna restaurangsidor så en ny deal syns direkt.
    broadcastMenuChange((deal as any).restaurantId ?? null, { kind: 'deal', dealId: deal.id });

    // Hermes/WhatsApp: notifiera när en RESTAURANG skapar en deal (inte när
    // super-admin gör det i admin-panelen). Best-effort, aldrig blockerande.
    if (!isSuperAdmin(req as AuthRequest) && scopedRestaurantId) {
      void (async () => {
        try {
          const restaurant = await prisma.restaurant.findUnique({
            where: { id: scopedRestaurantId },
            select: { name: true },
          });
          const { alertDealCreated } = await import('../lib/restaurantWatch');
          const targetIds = Array.isArray((rest as any).targetIds) ? (rest as any).targetIds : [];
          await alertDealCreated({
            restaurantId: scopedRestaurantId,
            restaurantName: restaurant?.name ?? 'En restaurang',
            title: String((rest as any).title ?? deal.title ?? 'Erbjudande'),
            discountType: String((rest as any).discountType ?? 'PERCENTAGE'),
            discountValue: Number((rest as any).discountValue ?? 0),
            scopeType: String((rest as any).scopeType ?? 'RESTAURANT').toUpperCase(),
            targetCount: targetIds.length,
            validFrom: (rest as any).validFrom ?? null,
            validUntil: (rest as any).validUntil ?? null,
          });
        } catch (err: any) {
          console.warn('[admin/deals] deal-created alert failed:', err?.message ?? err);
        }
      })();
    }

    res.status(201).json(formatDealForAdmin(deal));
  } catch (error) {
    console.error('Create deal error:', error);
    res.status(500).json({ error: sanitizeError(error, 'Kunde inte skapa deal') });
  }
});

router.patch('/deals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { restaurantId, ...data } = req.body;
    const existing = await prisma.deal.findUnique({
      where: { id },
      select: { id: true, restaurantId: true, isActive: true, triggerType: true, popupEnabled: true },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Dealen hittades inte' });
    }

    if (!isSuperAdmin(req as AuthRequest)) {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      if (existing.restaurantId !== rid) {
        return res.status(403).json({ error: 'Ej behörig' });
      }
    }

    // GROWTH_AGENT får aldrig aktivera en deal (isActive=true). Bara Jalle.
    if (isGrowthAgent(req as AuthRequest) && data.isActive === true) {
      return res.status(403).json({ error: 'Tillväxtagenten kan inte aktivera deals. Jalle aktiverar i admin.' });
    }

    const prevScopeType = getDealScopeType({ triggerType: existing.triggerType });
    const nextScopeType = getDealScopeType({ triggerType: String((data.triggerType ?? data.scopeType ?? existing.triggerType)).toUpperCase() });
    const effectiveRestaurantId =
      data.restaurantId !== undefined
        ? (data.restaurantId ? String(data.restaurantId) : null)
        : (existing?.restaurantId ?? null);
    const wasActive = existing.isActive !== false;
    const nextIsActive = data.isActive !== undefined ? Boolean(data.isActive) : wasActive;
    const nextIsPopup = data.popupEnabled !== undefined ? Boolean(data.popupEnabled) : Boolean(existing.popupEnabled);

    // Bara trigga scope-konflikt-rensning när nödvändigt:
    //   - Dealen aktiveras nu (false → true), eller
    //   - Dealen byter scope (RESTAURANT ↔ PRODUCT/CATEGORY)
    // Inte vid små ändringar som discountValue, validUntil, badgeText, osv.
    // Annars deaktiveras existerande deals oavsiktligt vid rutinredigering.
    const justActivated = nextIsActive && !wasActive;
    const scopeChanged = prevScopeType !== nextScopeType;
    if (justActivated || scopeChanged) {
      await deactivateConflictingDeals({
        restaurantId: effectiveRestaurantId,
        isActive: nextIsActive,
        scopeType: nextScopeType,
        excludeDealId: id,
        isPopup: nextIsPopup,
      });
    }

    const validationError = validateDealPayload(data);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const refError = await validateDealReferences(data, effectiveRestaurantId);
    if (refError) {
      return res.status(400).json({ error: refError });
    }

    const normalizedData = normalizeDealInputForDb(data);

    // Bara super-admin kan kedje-scopa. Expandera brand → applicableRestaurantIds.
    if (!isSuperAdmin(req as AuthRequest)) delete (normalizedData as any).brandId;
    await applyBrandDealScope(normalizedData as any);

    const deal = await prisma.deal.update({
      where: { id },
      data: normalizedData,
    });

    await audit(req as AuthRequest, 'DEAL_UPDATE', {
      resourceType: 'Deal',
      resourceId: deal.id,
      changes: { isActive: nextIsActive, scopeChanged, scopeType: nextScopeType },
    });
    broadcastMenuChange((deal as any).restaurantId ?? null, { kind: 'deal', dealId: deal.id });
    res.json(formatDealForAdmin(deal));
  } catch (error) {
    console.error('Update deal error:', error);
    res.status(500).json({ error: sanitizeError(error, 'Serverfel') });
  }
});

router.delete('/deals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isSuperAdmin(req as AuthRequest)) {
      const rid = requireRestaurantScope(req as AuthRequest, res);
      if (!rid) return;
      const existing = await prisma.deal.findUnique({ where: { id } });
      if (!existing || existing.restaurantId !== rid) {
        return res.status(403).json({ error: 'Ej behörig' });
      }
    }

    const existing = await prisma.deal.findUnique({ where: { id }, select: { id: true, restaurantId: true } });
    if (!existing) {
      return res.status(404).json({ error: 'Dealen hittades inte' });
    }

    await prisma.deal.delete({ where: { id } });
    await audit(req as AuthRequest, 'DEAL_DELETE', {
      resourceType: 'Deal',
      resourceId: id,
    });
    broadcastMenuChange(existing.restaurantId ?? null, { kind: 'deal', dealId: id, deleted: true });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete deal error:', error);
    res.status(500).json({ error: 'Serverfel' });
  }
});


// =====================
// SYSTEM HEALTH / MONITORING
// =====================
router.get('/staff', authenticate, requireSuperAdmin, async (_req, res) => {
  try {
    const [admins, restaurantByLogin] = await Promise.all([
      prisma.adminUser.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
        orderBy: [{ role: 'asc' }, { createdAt: 'desc' }],
      }),
      resolveRestaurantByAdminLogin(),
    ]);

    const staff = await Promise.all(admins.map((admin) => formatStaffMember(admin, restaurantByLogin)));
    res.json(staff);
  } catch (error) {
    console.error('Staff list error:', error);
    res.status(500).json({ error: 'Kunde inte hämta teamkonton' });
  }
});

router.post('/staff/invite', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { name, email, role } = req.body as { name?: string; email?: string; role?: string };
    const trimmedName = String(name || '').trim();
    const trimmedEmail = String(email || '').trim().toLowerCase();
    const normalizedRole = String(role || 'STAFF').trim().toUpperCase();

    if (!trimmedName || !trimmedEmail) {
      return res.status(400).json({ error: 'Namn och email krävs' });
    }

    if (!staffRoleOptions.includes(normalizedRole as typeof staffRoleOptions[number])) {
      return res.status(400).json({ error: 'Ogiltig roll' });
    }

    const existing = await prisma.adminUser.findUnique({ where: { email: trimmedEmail } });
    if (existing) {
      return res.status(400).json({ error: 'Kontot finns redan' });
    }

    const temporaryPassword = createTemporaryPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 12);

    const created = await prisma.adminUser.create({
      data: {
        name: trimmedName,
        email: trimmedEmail,
        role: normalizedRole,
        password: hashedPassword,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    const formatted = await formatStaffMember(created);
    await audit(req as AuthRequest, 'STAFF_INVITE', {
      resourceType: 'AdminUser',
      resourceId: created.id,
      changes: { email: created.email, role: created.role },
    });
    res.status(201).json({ ...formatted, temporaryPassword });
  } catch (error) {
    console.error('Staff invite error:', error);
    res.status(500).json({ error: 'Kunde inte skapa teamkonto' });
  }
});

router.patch('/staff/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { active, role, name } = req.body as { active?: boolean; role?: string; name?: string };
    const existing = await prisma.adminUser.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Kontot hittades inte' });
    }

    const normalizedRole = role ? String(role).trim().toUpperCase() : undefined;
    if (normalizedRole && !staffRoleOptions.includes(normalizedRole as typeof staffRoleOptions[number])) {
      return res.status(400).json({ error: 'Ogiltig roll' });
    }

    const updated = await prisma.adminUser.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined ? { name: String(name).trim() } : {}),
        ...(active !== undefined ? { isActive: Boolean(active) } : {}),
        ...(normalizedRole ? { role: normalizedRole } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    const formatted = await formatStaffMember(updated);
    await audit(req as AuthRequest, 'STAFF_UPDATE', {
      resourceType: 'AdminUser',
      resourceId: updated.id,
      changes: { active, role: normalizedRole, name },
    });
    res.json(formatted);
  } catch (error) {
    console.error('Staff update error:', error);
    res.status(500).json({ error: 'Kunde inte uppdatera teamkontot' });
  }
});

router.delete('/staff/:id', authenticate, requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    if (req.admin?.id === req.params.id) {
      return res.status(400).json({ error: 'Du kan inte radera ditt eget konto' });
    }

    await prisma.adminUser.delete({ where: { id: req.params.id } });
    await audit(req, 'STAFF_DELETE', {
      resourceType: 'AdminUser',
      resourceId: req.params.id,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Staff delete error:', error);
    res.status(500).json({ error: 'Kunde inte radera teamkontot' });
  }
});

// 1 restaurang = 1 AdminUser-konto. Restaurant.adminUserId är direkt FK
// till det kontot. Vid första hämtningen (eller om FK är null), kör vi
// auto-link/cleanup: hittar alla AdminUser som matchar restaurangen
// (via slug/namn/adminEmail, exact eller fuzzy substring), behåller den
// med passwordPlain om någon har det (annars senast uppdaterade), och
// raderar dubletterna. Sen sparas FK:n så framtida anrop läser direkt.
const normalizeForMatch = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const findCandidateAdminUsers = async (restaurant: {
  id: string;
  slug: string;
  name: string;
  adminEmail?: string | null;
}) => {
  // Optimering: använd Prisma `contains` med slug-prefixet för en
  // grov förfiltrering i SQL innan vi gör fuzzy-match i node. Det undviker
  // att läsa hela AdminUser-tabellen vid varje GET vid 10000+ konton.
  const slugCore = restaurant.slug.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const nameFirst = restaurant.name.toLowerCase().split(/\s+/)[0]?.replace(/[^a-z0-9]+/g, '') || '';

  const filters: any[] = [];
  if (restaurant.adminEmail) {
    filters.push({ email: { equals: restaurant.adminEmail.toLowerCase() } });
  }
  if (slugCore.length >= 3) {
    filters.push({ email: { contains: slugCore } });
    filters.push({ name: { contains: restaurant.name, mode: 'insensitive' } });
  }
  if (nameFirst.length >= 3 && nameFirst !== slugCore) {
    filters.push({ email: { contains: nameFirst } });
  }

  const candidates = filters.length === 0
    ? []
    : await prisma.adminUser.findMany({
        where: {
          role: { not: 'SUPER_ADMIN' },
          OR: filters,
        },
        orderBy: [{ updatedAt: 'desc' }],
        select: { id: true, email: true, name: true, role: true, isActive: true, updatedAt: true },
      });

  // Slutligt fuzzy-filter i node för att fånga edge cases
  // (substring i bägge riktningar, svenska tecken, etc.).
  const slugNorm = normalizeForMatch(restaurant.slug);
  const nameNorm = normalizeForMatch(restaurant.name);
  const adminEmailNorm = restaurant.adminEmail ? normalizeForMatch(restaurant.adminEmail) : '';

  return candidates.filter((admin) => {
    const emailNorm = normalizeForMatch(admin.email);
    const adminNameNorm = normalizeForMatch(admin.name);
    if (adminEmailNorm && emailNorm === adminEmailNorm) return true;
    if (slugNorm && emailNorm === slugNorm) return true;
    if (slugNorm && slugNorm.length >= 3 && (emailNorm.includes(slugNorm) || slugNorm.includes(emailNorm))) return true;
    if (nameNorm && nameNorm.length >= 3 && (emailNorm.includes(nameNorm) || nameNorm.includes(emailNorm))) return true;
    if (nameNorm && adminNameNorm.includes(nameNorm)) return true;
    return false;
  });
};

// Auto-link cooldown: om FK precis blev null pga borttaget konto vill vi
// inte trigga full fuzzy-match igen direkt vid varje refetch. 30 sek räcker
// för att Vercel/RN-klienter ska sluta hammra. Memory-only Map räcker.
const autoLinkCooldown = new Map<string, number>();
const AUTO_LINK_COOLDOWN_MS = 30_000;
const shouldRunAutoLink = (restaurantId: string): boolean => {
  const last = autoLinkCooldown.get(restaurantId);
  if (last && Date.now() - last < AUTO_LINK_COOLDOWN_MS) return false;
  autoLinkCooldown.set(restaurantId, Date.now());
  return true;
};

// Välj "rätt" konto bland kandidaterna när vi auto-länkar:
//   1. Den med passwordPlain (vi har klartext = troligen det aktiva som
//      satts via admin-panelen)
//   2. Annars den senast uppdaterade
type CandidateAccount = {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  updatedAt: Date;
};

const pickPrimaryAccount = (candidates: CandidateAccount[]): CandidateAccount | null => {
  if (candidates.length === 0) return null;
  return candidates[0]; // already sorted by updatedAt desc
};

// Hämtar (och skapar om inget finns) det enda inloggningskontot för
// restaurangen. Om vi har en lös FK gör vi auto-link/cleanup:
//   - Hitta alla matchande AdminUser
//   - Välj primary (passwordPlain > nyaste)
//   - Radera resten
//   - Sätt Restaurant.adminUserId = primary.id
const resolveLoginAccount = async (restaurantId: string) => {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, slug: true, name: true, adminEmail: true, adminUserId: true },
  });
  if (!restaurant) return { restaurant: null, account: null };

  // Steg 1: om vi redan har en FK, läs det kontot direkt.
  if (restaurant.adminUserId) {
    const linked = await prisma.adminUser.findUnique({
      where: { id: restaurant.adminUserId },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });
    if (linked) return { restaurant, account: linked };
    // FK pekar på borttagen rad — nolla och fortsätt till auto-link.
    await prisma.restaurant.update({ where: { id: restaurant.id }, data: { adminUserId: null } });
    restaurant.adminUserId = null;
  }

  // Steg 2: hitta kandidater och länk/cleanup. Rate-limita per restaurang
  // så massöppning inte triggar O(N) fuzzy-skannings på 30 sek.
  if (!shouldRunAutoLink(restaurant.id)) {
    return { restaurant, account: null };
  }

  const candidates = await findCandidateAdminUsers(restaurant);
  if (candidates.length === 0) {
    return { restaurant, account: null };
  }

  const primary = pickPrimaryAccount(candidates);
  if (!primary) return { restaurant, account: null };

  // Radera alla andra dubletter — användaren har explicit godkänt detta.
  const duplicateIds = candidates.filter((c) => c.id !== primary.id).map((c) => c.id);
  if (duplicateIds.length > 0) {
    await prisma.adminUser.deleteMany({ where: { id: { in: duplicateIds } } });
  }

  // Länka och synca adminEmail till primary.email så fuzzy-fallback inte
  // behöver triggas igen.
  await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: {
      adminUserId: primary.id,
      adminEmail: primary.email,
    },
  });

  const fresh = await prisma.adminUser.findUnique({
    where: { id: primary.id },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
  return { restaurant, account: fresh };
};

const formatLoginAccount = (admin: {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
}) => ({
  id: admin.id,
  username: admin.email,
  name: admin.name,
  role: admin.role,
  isActive: admin.isActive,
  // Klartext-lösen lagras inte längre. Ett konto har alltid ett bcrypt-lösen
  // satt, så hasPassword är sant så länge kontot finns.
  password: null,
  hasPassword: true,
});

// GET: returnerar ENA inloggningskontot. Om inget finns returneras
// account=null så UI:t kan visa "skapa nytt"-form.
router.get('/restaurants/:id/login', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { restaurant, account } = await resolveLoginAccount(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurang hittades inte' });
    }
    res.json({
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      slug: restaurant.slug,
      adminEmail: restaurant.adminEmail || null,
      account: account ? formatLoginAccount(account) : null,
    });
  } catch (error) {
    console.error('Restaurant login fetch error:', error);
    res.status(500).json({ error: 'Kunde inte hämta inloggningsuppgifter' });
  }
});

// PUT: uppdaterar det länkade kontot (eller skapar nytt om inget finns).
// Body: { username?: string; password?: string }
router.put('/restaurants/:id/login', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { username, password } = req.body as { username?: string; password?: string };
    const trimmedUsername = (username ?? '').trim().toLowerCase() || null;
    const trimmedPassword = (password ?? '').trim() || null;

    const { restaurant, account } = await resolveLoginAccount(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurang hittades inte' });
    }

    if (account) {
      // Uppdatera det länkade kontot.
      const data: any = {};
      if (trimmedUsername && trimmedUsername !== account.email.toLowerCase()) {
        // Kontroll: ny username får inte krocka med ett annat konto.
        const collision = await prisma.adminUser.findUnique({ where: { email: trimmedUsername } });
        if (collision && collision.id !== account.id) {
          return res.status(400).json({ error: 'Användarnamnet är upptaget av ett annat konto' });
        }
        data.email = trimmedUsername;
      }
      if (trimmedPassword) {
        data.password = await bcrypt.hash(trimmedPassword, 10);
        data.isActive = true;
      }
      if (Object.keys(data).length > 0) {
        await prisma.adminUser.update({ where: { id: account.id }, data });
      }
      // Synca Restaurant.adminEmail om username ändrats.
      if (data.email) {
        await prisma.restaurant.update({ where: { id: restaurant.id }, data: { adminEmail: data.email } });
      }
    } else {
      // Skapa nytt + länka.
      if (!trimmedUsername) return res.status(400).json({ error: 'Användarnamn krävs' });
      if (!trimmedPassword) return res.status(400).json({ error: 'Lösenord krävs' });
      const collision = await prisma.adminUser.findUnique({ where: { email: trimmedUsername } });
      if (collision) {
        return res.status(400).json({ error: 'Användarnamnet finns redan i systemet' });
      }
      const hashed = await bcrypt.hash(trimmedPassword, 10);
      const created = await prisma.adminUser.create({
        data: {
          email: trimmedUsername,
          password: hashed,
          name: `${restaurant.name} Admin`,
          role: 'ADMIN',
          isActive: true,
        },
      });
      await prisma.restaurant.update({
        where: { id: restaurant.id },
        data: { adminUserId: created.id, adminEmail: trimmedUsername },
      });
    }

    // Returnera färska data.
    const refreshed = await resolveLoginAccount(restaurant.id);
    await audit(req as AuthRequest, 'RESTAURANT_LOGIN_UPSERT', {
      resourceType: 'Restaurant',
      resourceId: restaurant.id,
      changes: { username: trimmedUsername, restaurantName: restaurant.name },
    });
    res.json({
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      slug: restaurant.slug,
      adminEmail: refreshed.restaurant?.adminEmail || null,
      account: refreshed.account ? formatLoginAccount(refreshed.account) : null,
    });
  } catch (error) {
    console.error('Restaurant login save error:', error);
    res.status(500).json({ error: 'Kunde inte uppdatera inloggningsuppgifter' });
  }
});

// DELETE: rensa länken (och ev. själva kontot) så admin kan börja om.
router.delete('/restaurants/:id/login', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: req.params.id },
      select: { id: true, adminUserId: true, name: true },
    });
    if (!restaurant) return res.status(404).json({ error: 'Restaurang hittades inte' });
    if (restaurant.adminUserId) {
      await prisma.adminUser.delete({ where: { id: restaurant.adminUserId } }).catch(() => null);
      await prisma.restaurant.update({ where: { id: restaurant.id }, data: { adminUserId: null, adminEmail: null } });
    }
    await audit(req as AuthRequest, 'RESTAURANT_LOGIN_DELETE', {
      resourceType: 'Restaurant',
      resourceId: restaurant.id,
      changes: { restaurantName: restaurant.name },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete restaurant login error:', error);
    res.status(500).json({ error: 'Kunde inte radera kontot' });
  }
});

// FARLIG: rensar alla deals ur databasen. Användaren explicit godkänd —
// används när admin vill börja om med en ren deal-tabell. Skyddad med
// SUPER_ADMIN + confirm-string så ingen råkar trycka.
router.post('/deals/wipe', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { confirm } = req.body as { confirm?: string };
    if (confirm !== 'WIPE_ALL_DEALS') {
      return res.status(400).json({ error: 'Bekräftelse saknas (skicka { confirm: "WIPE_ALL_DEALS" })' });
    }
    const before = await prisma.deal.count();
    await prisma.deal.deleteMany({});
    // Rensa även User.claimedDealIds så Profile-listan inte pekar på
    // borttagna deals.
    await (prisma as any).user.updateMany({ data: { claimedDealIds: '[]' } }).catch(() => null);
    await audit(req as AuthRequest, 'DEAL_WIPE_ALL', {
      resourceType: 'Deal',
      changes: { deleted: before },
    });
    res.json({ success: true, deleted: before });
  } catch (error: any) {
    console.error('Wipe deals error:', error);
    res.status(500).json({ error: sanitizeError(error, 'Kunde inte rensa deals') });
  }
});

router.post('/orders/wipe', authenticate, requireSuperAdmin, (_req, res) => {
  res.status(410).json({
    error: 'Order-rensning är permanent avstängd för att bevara order- och bokföringsspåret.',
    code: 'ORDER_WIPE_DISABLED',
  });
});

router.post('/staff/:id/reset-password', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const temporaryPassword = createTemporaryPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 12);

    await prisma.adminUser.update({
      where: { id: req.params.id },
      data: { password: hashedPassword, isActive: true },
    });

    await audit(req as AuthRequest, 'STAFF_PASSWORD_RESET', {
      resourceType: 'AdminUser',
      resourceId: req.params.id,
    });
    res.json({ success: true, temporaryPassword });
  } catch (error) {
    console.error('Staff password reset error:', error);
    res.status(500).json({ error: 'Kunde inte återställa lösenordet' });
  }
});

router.get('/system/health', async (req, res) => {
  try {
    if (!isSuperAdmin(req as AuthRequest)) {
      return res.status(403).json({ error: 'Behörighet saknas' });
    }

    const startDb = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbPing = Date.now() - startDb;
    const memory = process.memoryUsage();
    const uptime = process.uptime();

    const [restaurantRows, platformSettings, userCount, pendingOrders, liveOrders, payoutInReview] = await Promise.all([
      prisma.restaurant.findMany({
        select: {
          openingHours: true,
          scheduledOpenNow: true,
          acceptingOrdersMode: true,
          acceptingOrdersOverrideUntil: true,
          acceptingOrdersOverrideReason: true,
          pausedUntil: true,
          draft: true,
          comingSoon: true,
          isOpen: true,
          city_relation: true,
        },
      }),
      prisma.restaurantSettings.findUnique({ where: { id: 'settings' } }),
      (prisma as any).user.count({ where: { deletedAt: null } }),
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.order.count({ where: { status: { in: ['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'DELIVERING'] } } }),
      prisma.restaurantPayout.count({ where: { status: { in: ['DRAFT', 'APPROVED', 'HOLD'] } } }),
    ]);
    const restaurantCount = restaurantRows.length;
    const openRestaurantCount = restaurantRows.filter((restaurant) =>
      resolveRestaurantAvailability(restaurant, {
        city: restaurant.city_relation,
        platform: platformSettings,
      }).isOpen,
    ).length;

    const r2Configured = Boolean(
      process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET && process.env.R2_PUBLIC_BASE_URL
    );

    const alerts: Array<{ level: 'info' | 'warning'; message: string }> = [];
    if (dbPing > 350) alerts.push({ level: 'warning', message: `Databasen svarar långsamt (${dbPing} ms).` });
    if (pendingOrders > 10) alerts.push({ level: 'warning', message: `${pendingOrders} ordrar väntar fortfarande på svar.` });
    if (!r2Configured) alerts.push({ level: 'warning', message: 'Bilduppladdning saknar komplett R2-konfiguration.' });
    if (alerts.length === 0) alerts.push({ level: 'info', message: 'Inga driftvarningar just nu.' });

    res.json({
      status: "ONLINE",
      uptime,
      dbPingMs: dbPing,
      memory: {
        rss: memory.rss,
        heapTotal: memory.heapTotal,
        heapUsed: memory.heapUsed,
      },
      operations: {
        restaurantCount,
        openRestaurantCount,
        userCount,
        pendingOrders,
        liveOrders,
        payoutInReview,
      },
      services: {
        auth: true,
        realtime: true,
        uploads: r2Configured,
      },
      timestamp: new Date(),
      alerts,
    });
  } catch (error) {
    res.status(500).json({ error: 'System Health Error', details: String(error) });
  }
});

// =====================
// MENYIMPORT
// =====================

router.post('/menu/import-eatsmart', async (req, res) => {
  try {
    if (!isSuperAdmin(req as AuthRequest)) {
      res.status(403).json({ error: 'Kräver super admin-behörighet' });
      return;
    }

    const restaurantId = req.body?.restaurantId as string | undefined;
    if (!restaurantId) {
      res.status(400).json({ error: 'restaurantId krävs' });
      return;
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, slug: true },
    });
    if (!restaurant) {
      res.status(404).json({ error: 'Restaurang hittades inte' });
      return;
    }

    console.log(`Starting EatSmart import for restaurant: ${restaurant.slug}`);

    const groups = await ensureCoreExtraGroups();
    
    // Fetch all existing categories for this restaurant to avoid duplicate slugs within restaurant
    const existingCategories = await prisma.category.findMany({
      where: { restaurantId: restaurant.id },
      select: { id: true, slug: true },
    });
    const categoryIdMap = new Map(existingCategories.map(c => [c.slug, c.id]));

    let createdCategories = 0;
    let updatedCategories = 0;
    let createdProducts = 0;
    let updatedProducts = 0;

    const importedCategorySlugs = new Set<string>();
    const importedProductSlugs = new Set<string>();

    for (const [categoryIndex, category] of eatsmartCatalog.entries()) {
      const categorySlug = `${slugify(category.name)}-${restaurant.slug}`;
      importedCategorySlugs.add(categorySlug);

      const savedCategory = await prisma.category.upsert({
        where: { slug: categorySlug },
        update: {
          name: category.name,
          description: category.description,
          imageUrl: category.imageUrl,
          position: categoryIndex,
          isActive: true,
          restaurantId: restaurant.id,
        },
        create: {
          name: category.name,
          slug: categorySlug,
          description: category.description,
          imageUrl: category.imageUrl,
          position: categoryIndex,
          isActive: true,
          restaurantId: restaurant.id,
        },
      });

      if (categoryIdMap.has(categorySlug)) {
        updatedCategories += 1;
      } else {
        createdCategories += 1;
      }

      for (const [productIndex, product] of category.products.entries()) {
        const productSlug = `${categorySlug}-${slugify(product.name)}`;
        importedProductSlugs.add(productSlug);

        const savedProduct = await prisma.product.upsert({
          where: { slug: productSlug },
          update: {
            name: product.name,
            description: product.description,
            price: product.price,
            categoryId: savedCategory.id,
            isActive: true,
            isVegan: product.isVegan ?? false,
            isVegetarian: product.isVegetarian ?? false,
            isGlutenFree: product.isGlutenFree ?? false,
            position: productIndex,
          },
          create: {
            name: product.name,
            slug: productSlug,
            description: product.description,
            price: product.price,
            categoryId: savedCategory.id,
            isActive: true,
            isVegan: product.isVegan ?? false,
            isVegetarian: product.isVegetarian ?? false,
            isGlutenFree: product.isGlutenFree ?? false,
            position: productIndex,
          },
        });

        if (productSlug.includes('pizza') || productSlug.includes('pizzor')) {
           // We might want to track updated products more accurately, but for now:
           updatedProducts++; // Rough estimate as we are upserting
        } else {
           createdProducts++; // Rough estimate
        }

        const groupIds = getGroupIdsForProduct(category.name, product, groups);
        
        // Link groups
        if (groupIds.length > 0) {
          await prisma.productExtraGroup.deleteMany({
            where: { productId: savedProduct.id },
          });
          await prisma.productExtraGroup.createMany({
            data: groupIds.map((groupId, index) => ({
              productId: savedProduct.id,
              extraGroupId: groupId,
              position: index,
            })),
          });
        }
      }
    }

    // summary from the catalog stats for the client
    const stats = getCatalogStats();

    await audit(req as AuthRequest, 'MENU_IMPORT_EATSMART', {
      resourceType: 'Restaurant',
      resourceId: restaurantId,
      changes: { categoriesCreated: createdCategories, productsImported: stats.productCount },
    });
    res.json({
      success: true,
      summary: {
        categoryCount: stats.categoryCount,
        productCount: stats.productCount,
        createdCategories,
        updatedCategories,
        createdProducts: stats.productCount, // Simpler reporting
        updatedProducts: 0,
      },
    });
  } catch (error: any) {
    console.error('Menu import error:', error);
    res.status(500).json({ error: sanitizeError(error, 'Kunde inte importera Eatsmart-menyn') });
  }
});

// =====================
// RABATTKODER
// =====================

router.get('/discounts', async (_req, res) => {
  try {
    if (!isSuperAdmin(_req as AuthRequest)) {
      return res.status(403).json({ error: 'Kräver super admin-behörighet' });
    }

    const codes = await prisma.discountCode.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(codes.map(formatDiscountCodeForAdmin));
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

router.post('/discounts', async (req, res) => {
  try {
    if (!isSuperAdmin(req as AuthRequest)) {
      return res.status(403).json({ error: 'Kräver super admin-behörighet' });
    }

    const { code, description, type, value, minOrder, maxUsages, validFrom, validUntil, restaurantId, applicableRestaurantIds, freeDelivery, platform } = req.body;

    const parsedRestaurantIds = Array.isArray(applicableRestaurantIds)
      ? applicableRestaurantIds.filter((v: unknown): v is string => typeof v === 'string')
      : parseJsonArray(applicableRestaurantIds);

    const discountData: any = {
      code: code.toUpperCase(),
      description,
      type: type || 'PERCENTAGE',
      value: type === 'FIXED' ? Math.round(value * 100) : value,
      minOrder: minOrder ? Math.round(minOrder * 100) : 0,
      maxUsages: maxUsages || null,
      validFrom: validFrom ? new Date(validFrom) : null,
      validUntil: validUntil ? new Date(validUntil) : null,
      applicableRestaurantIds: JSON.stringify(parsedRestaurantIds),
      // Stackbar fri leverans-flagga (gör t.ex. "20% + fri leverans"). Ignoreras
      // för type=FREE_DELIVERY eftersom fri leverans då redan är huvudfunktionen.
      freeDelivery: type === 'FREE_DELIVERY' ? false : Boolean(freeDelivery),
      // Plattform: ALL (default) | APP (bara mobilappen) | WEB (bara webben).
      platform: normalizeDiscountPlatform(platform),
    };
    if (restaurantId && parsedRestaurantIds.length === 0) discountData.restaurantId = restaurantId;
    else if (parsedRestaurantIds.length === 1) discountData.restaurantId = parsedRestaurantIds[0];
    else discountData.restaurantId = null;

    // GROWTH_AGENT-backstop: kupongen föds inaktiv, och MÅSTE ha tak +
    // utgångsdatum (ingen oändlig/obegränsad rabatt). Bara Jalle aktiverar.
    if (isGrowthAgent(req as AuthRequest)) {
      if (!discountData.maxUsages || !discountData.validUntil) {
        return res.status(400).json({ error: 'Tillväxtagenten måste sätta maxUsages (tak) och validUntil (utgång) på varje kupong' });
      }
      discountData.isActive = false;
    }

    const discount = await prisma.discountCode.create({
      data: discountData,
    });
    await audit(req as AuthRequest, 'DISCOUNT_CREATE', {
      resourceType: 'DiscountCode',
      resourceId: discount.id,
      changes: { code: discount.code, type: discount.type, value: discount.value },
    });
    res.status(201).json(formatDiscountCodeForAdmin(discount));
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2002') {
      res.status(400).json({ error: 'Rabattkod finns redan' });
      return;
    }
    res.status(500).json({ error: 'Serverfel' });
  }
});

router.patch('/discounts/:id', async (req, res) => {
  try {
    if (!isSuperAdmin(req as AuthRequest)) {
      return res.status(403).json({ error: 'Kräver super admin-behörighet' });
    }

    const { isActive, code, description, type, value, minOrder, maxUsages, validFrom, validUntil, restaurantId, applicableRestaurantIds, freeDelivery, platform } = req.body;
    // GROWTH_AGENT får aldrig aktivera en kupong (isActive=true). Bara Jalle.
    if (isGrowthAgent(req as AuthRequest) && isActive === true) {
      return res.status(403).json({ error: 'Tillväxtagenten kan inte aktivera kuponger. Jalle aktiverar i admin.' });
    }
    const updateData: any = {};
    if (isActive !== undefined) updateData.isActive = isActive;
    if (code) updateData.code = code.toUpperCase();
    if (description !== undefined) updateData.description = description;
    if (type) updateData.type = type;
    if (value !== undefined) updateData.value = type === 'FIXED' ? Math.round(value * 100) : value;
    if (minOrder !== undefined) updateData.minOrder = minOrder ? Math.round(minOrder * 100) : 0;
    if (maxUsages !== undefined) updateData.maxUsages = maxUsages || null;
    if (validFrom !== undefined) updateData.validFrom = validFrom ? new Date(validFrom) : null;
    if (validUntil !== undefined) updateData.validUntil = validUntil ? new Date(validUntil) : null;
    if (freeDelivery !== undefined) {
      // FREE_DELIVERY-typen lagrar inte flaggan (redundant).
      updateData.freeDelivery = type === 'FREE_DELIVERY' ? false : Boolean(freeDelivery);
    }
    if (platform !== undefined) updateData.platform = normalizeDiscountPlatform(platform);
    if (applicableRestaurantIds !== undefined) {
      const parsed = Array.isArray(applicableRestaurantIds)
        ? applicableRestaurantIds.filter((v: unknown): v is string => typeof v === 'string')
        : parseJsonArray(applicableRestaurantIds);
      updateData.applicableRestaurantIds = JSON.stringify(parsed);
      updateData.restaurantId = parsed.length === 1 ? parsed[0] : parsed.length === 0 ? (restaurantId || null) : null;
    } else if (restaurantId !== undefined) {
      updateData.restaurantId = restaurantId || null;
    }

    const updated = await prisma.discountCode.update({
      where: { id: req.params.id },
      data: updateData,
    });
    await audit(req as AuthRequest, 'DISCOUNT_UPDATE', {
      resourceType: 'DiscountCode',
      resourceId: updated.id,
      changes: updateData,
    });
    res.json(formatDiscountCodeForAdmin(updated));
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

router.delete('/discounts/:id', async (req, res) => {
  try {
    if (!isSuperAdmin(req as AuthRequest)) {
      return res.status(403).json({ error: 'Kräver super admin-behörighet' });
    }

    await prisma.discountCode.delete({
      where: { id: req.params.id },
    });
    await audit(req as AuthRequest, 'DISCOUNT_DELETE', {
      resourceType: 'DiscountCode',
      resourceId: req.params.id,
    });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// ─── Refunds (global or restaurant-scoped admin) ───────────────────────────

router.post('/orders/:id/refund', async (req: any, res: any) => {
  try {
    const authReq = req as AuthRequest;
    const refundScope = refundRestaurantScope(authReq.admin);
    if (!refundScope.allowed) {
      return res.status(403).json({ error: 'Du saknar behörighet att återbetala ordern' });
    }

    const { amount, reason } = req.body; // amount in kr
    const requestedAmountOre =
      amount === undefined || amount === null || amount === ''
        ? null
        : Math.round(Number(amount) * 100);
    if (requestedAmountOre !== null && (!Number.isFinite(requestedAmountOre) || requestedAmountOre <= 0)) {
      return res.status(400).json({ error: 'Ogiltigt återbetalningsbelopp' });
    }

    const outcome = await refundOrderForAdmin(
      req.params.id,
      reason || 'Återbetalning via admin',
      {
        requestedAmountOre,
        restaurantIdScope: refundScope.restaurantId,
        actorAdminId: (authReq as any).admin?.id ?? (authReq as any).user?.id ?? null,
      },
    );
    if (outcome.status === 'already_refunded') {
      return res.status(400).json({ error: 'Denna order är redan fullt återbetald' });
    }
    const completedOutcome = outcome.status === 'refunded' ? outcome : null;

    await audit(authReq, 'ORDER_REFUND', {
      resourceType: 'Order',
      resourceId: req.params.id,
      changes: {
        amount: outcome.refundedAmountOre / 100,
        cumulativeRefundAmount: outcome.cumulativeRefundOre / 100,
        fullRefund: completedOutcome?.fullRefund ?? false,
        reason: reason || 'Återbetalning via admin',
        provider: outcome.provider,
        refundId: outcome.refundRef,
        ledgerId: outcome.ledgerId,
        refundStatus: outcome.refundStatus,
        lifecycle: outcome.status,
        revertedReferrals: completedOutcome?.revertedReferrals ?? 0,
        expiredInviterRewards: completedOutcome?.expiredInviterRewards ?? 0,
        alreadyUsedInviterRewards: completedOutcome?.alreadyUsedInviterRewards ?? 0,
      },
    });
    res.status(outcome.status === 'refund_pending' ? 202 : 200).json({
      success: true,
      processing: outcome.status === 'refund_pending',
      refundedAmount: outcome.refundedAmountOre / 100,
      cumulativeRefundedAmount: outcome.cumulativeRefundOre / 100,
      fullRefund: completedOutcome?.fullRefund ?? false,
      refundId: outcome.refundRef,
      ledgerId: outcome.ledgerId,
      refundStatus: outcome.refundStatus,
    });
  } catch (error: any) {
    console.error('Refund error:', error);
    if (error instanceof RefundPersistenceConflict) {
      return res.status(409).json({
        error: 'Återbetalningen skickades till betalningsleverantören men den lokala orderstatusen kunde inte slutföras. Försök inte igen med ett annat belopp; stäm av ordern mot Mollie.',
        requiresReconciliation: true,
      });
    }
    if (error instanceof RefundWorkflowError) {
      const status = error.code === 'not_found'
        ? 404
        : error.code === 'refund_in_progress'
          ? 409
          : error.code === 'refund_ledger_unavailable'
            ? 503
          : 400;
      return res.status(status).json({ error: error.message, code: error.code });
    }
    res.status(500).json({ error: sanitizeError(error, 'Kunde inte genomföra återbetalning') });
  }
});


// (Duplicate delete handler removed — primary handler is at line ~622)


// ─── Receipt Data (JSON for Flutter/Printers) ───────────────────────────────

// Färdig, serverrenderad ESC/POS-utskrift för resurssvaga partnerplattor.
// Svaret är binärt (inte base64/JSON) för att undvika en extra minneskopia i
// Flutter. Samma restaurangscope som receipt-data gäller.
router.get('/orders/:id/print-artifact', async (req: any, res: any) => {
  try {
    const authReq = req as AuthRequest;
    const artifact = await getServerPrintArtifact(req.params.id, req.query.paperWidth);
    if (!artifact) return res.status(404).json({ error: 'Order hittades inte' });

    if (!isSuperAdmin(authReq)) {
      const scopedRestaurantId = authReq.admin?.restaurantId;
      if (!scopedRestaurantId || artifact.restaurantId !== scopedRestaurantId) {
        return res.status(403).json({ error: 'Du kan bara skriva ut orders för din egen restaurang' });
      }
    }

    res.setHeader('Content-Type', 'application/vnd.viaeats.escpos');
    res.setHeader('Content-Length', String(artifact.bytes.length));
    res.setHeader('ETag', `"${artifact.fingerprint}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-ViaEats-Print-Source', 'server');
    res.send(artifact.bytes);
  } catch (error) {
    console.error('Server print artifact error:', error);
    res.status(500).json({ error: 'Kunde inte skapa utskriften' });
  }
});

router.get('/orders/:id/receipt-data', async (req: any, res: any) => {
  try {
    const authReq = req as AuthRequest;
    const [order, templateRow] = await Promise.all([
      prisma.order.findUnique({
        where: { id: req.params.id },
        include: { items: true, restaurant: true }
      }),
      prisma.receiptTemplate.findUnique({ where: { id: 'global' } }),
    ]);
    if (!order) return res.status(404).json({ error: 'Order hittades inte' });

    if (!isSuperAdmin(authReq)) {
      const scopedRestaurantId = authReq.admin?.restaurantId;
      if (!scopedRestaurantId || order.restaurantId !== scopedRestaurantId) {
        return res.status(403).json({ error: 'Du kan bara hämta kvittodata för din egen restaurang' });
      }
    }

    let templateElements: any[] = [];
    try {
      templateElements = templateRow?.elements ? JSON.parse(templateRow.elements) : [];
    } catch {
      templateElements = [];
    }

    const previewData = buildAdminReceiptData(order);
    res.json({
      ...previewData,
      footer: 'Tack för din beställning! — ViaEats',
      template: {
        paperWidth: templateRow?.paperWidth || '80mm',
        platformName: templateRow?.platformName || 'ViaEats',
        elements: templateElements,
      },
    });
  } catch (error) {
    console.error('Receipt data error:', error);
    res.status(500).json({ error: 'Kunde inte hämta kvittodata' });
  }
});

// ─── Analytics Dashboard ────────────────────────────────────────────────────

router.get('/analytics', async (req: any, res: any) => {
  try {
    const authReq = req as AuthRequest;
    const restaurantId = isSuperAdmin(authReq) 
      ? (req.query.restaurantId as string || undefined)
      : authReq.admin?.restaurantId || undefined;

    const where: any = {};
    if (restaurantId) where.restaurantId = restaurantId;
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(todayStart);
    monthStart.setDate(monthStart.getDate() - 30);

    // Revenue & order counts
    const [todayStats, weekStats, monthStats, allTimeStats] = await Promise.all([
      prisma.order.aggregate({
        where: { ...where, createdAt: { gte: todayStart }, paymentStatus: 'PAID' },
        _sum: { total: true }, _count: { id: true }, _avg: { total: true }
      }),
      prisma.order.aggregate({
        where: { ...where, createdAt: { gte: weekStart }, paymentStatus: 'PAID' },
        _sum: { total: true }, _count: { id: true }, _avg: { total: true }
      }),
      prisma.order.aggregate({
        where: { ...where, createdAt: { gte: monthStart }, paymentStatus: 'PAID' },
        _sum: { total: true }, _count: { id: true }, _avg: { total: true }
      }),
      prisma.order.aggregate({
        where: { ...where, paymentStatus: 'PAID' },
        _sum: { total: true }, _count: { id: true }, _avg: { total: true }
      }),
    ]);

    // Top selling products (last 30 days)
    const topItems = await prisma.orderItem.groupBy({
      by: ['productName'],
      where: { order: { ...where, createdAt: { gte: monthStart }, paymentStatus: 'PAID' } },
      _sum: { quantity: true, subtotal: true },
      _count: { id: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10,
    });

    // Orders by hour (for heatmap) — last 7 days
    const recentOrders = await prisma.order.findMany({
      where: { ...where, createdAt: { gte: weekStart }, paymentStatus: 'PAID' },
      select: { createdAt: true },
    });
    const hourlyDistribution = Array(24).fill(0);
    recentOrders.forEach(o => { hourlyDistribution[new Date(o.createdAt).getHours()]++; });

    // Revenue per day (last 7 days)
    const dailyOrders = await prisma.order.findMany({
      where: { ...where, createdAt: { gte: weekStart }, paymentStatus: 'PAID' },
      select: { createdAt: true, total: true },
    });
    const dailyRevenue: Record<string, number> = {};
    dailyOrders.forEach(o => {
      const day = new Date(o.createdAt).toLocaleDateString('sv-SE');
      dailyRevenue[day] = (dailyRevenue[day] || 0) + o.total;
    });

    // Order type breakdown
    const typeBreakdown = await prisma.order.groupBy({
      by: ['type'],
      where: { ...where, createdAt: { gte: monthStart }, paymentStatus: 'PAID' },
      _count: { id: true },
    });

    // Recent reviews
    const recentReviews = await prisma.order.findMany({
      where: { ...where, rating: { not: null } },
      select: { id: true, orderNumber: true, customerName: true, rating: true, review: true, reviewedAt: true },
      orderBy: { reviewedAt: 'desc' },
      take: 10,
    });

    const fmt = (v: number | null) => ((v || 0) / 100);

    res.json({
      today: { revenue: fmt(todayStats._sum.total), orders: todayStats._count.id, avgOrder: fmt(todayStats._avg.total) },
      week: { revenue: fmt(weekStats._sum.total), orders: weekStats._count.id, avgOrder: fmt(weekStats._avg.total) },
      month: { revenue: fmt(monthStats._sum.total), orders: monthStats._count.id, avgOrder: fmt(monthStats._avg.total) },
      allTime: { revenue: fmt(allTimeStats._sum.total), orders: allTimeStats._count.id, avgOrder: fmt(allTimeStats._avg.total) },
      topProducts: topItems.map(p => ({
        name: p.productName,
        totalSold: p._sum.quantity || 0,
        revenue: ((p._sum.subtotal || 0) / 100),
        orders: p._count.id,
      })),
      hourlyDistribution,
      dailyRevenue: Object.entries(dailyRevenue).map(([date, total]) => ({ date, revenue: total / 100 })).sort((a, b) => a.date.localeCompare(b.date)),
      orderTypes: typeBreakdown.map(t => ({ type: t.type, count: t._count.id })),
      recentReviews,
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Kunde inte hämta statistik' });
  }
});

// ============================================================
// PLATFORM OPS — endpoints för SUPER_ADMIN crisis/support-flöden
// ============================================================

// GET /api/admin/search?q= — globalt sök för Cmd+K: kunder, ordrar och
// restauranger i ett svar (5 per typ). Super-admin-only.
router.get('/search', authenticate, requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ customers: [], orders: [], restaurants: [] });
    const contains = { contains: q, mode: 'insensitive' as const };
    const [customers, orders, restaurants] = await Promise.all([
      (prisma as any).user.findMany({
        where: { deletedAt: null, OR: [{ name: contains }, { email: contains }, { phone: { contains: q } }] },
        select: { id: true, name: true, email: true, phone: true },
        take: 5,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.order.findMany({
        where: { OR: [{ orderNumber: contains }, { customerName: contains }, { customerPhone: { contains: q } }] },
        select: {
          id: true, orderNumber: true, customerName: true, status: true, createdAt: true,
          restaurant: { select: { name: true } },
        },
        take: 5,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.restaurant.findMany({
        where: { OR: [{ name: contains }, { city: contains }] },
        select: { id: true, name: true, slug: true, city: true },
        take: 5,
        orderBy: { name: 'asc' },
      }),
    ]);
    res.json({ customers, orders, restaurants });
  } catch (err) {
    console.error('[admin-search] error:', err);
    res.status(500).json({ error: 'Sökningen misslyckades' });
  }
});

// GET /api/admin/customers/search?q=...
// Server-side söker namn/email/telefon. Returnerar de 50 första träffarna.
// Kund-överblick för Kundvakten (read-only): antal, inloggade vs gäster, nya
// registreringar, senaste. PII maskerad för GLOBAL_VIEWER. SUPER_ADMIN + GLOBAL_VIEWER.
router.get('/customers/overview', authenticate, async (req: AuthRequest, res) => {
  if (!canReadCustomers(req)) {
    return res.status(403).json({ error: 'Kräver läsbehörighet för kunder' });
  }
  try {
    const now = new Date();
    const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
    const week = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const month = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const u = (prisma as any).user;
    const [total, guests, registered, newToday, newWeek, activeMonth, recent, convertedFromGuest, allCustomers, orderGroups] = await Promise.all([
      u.count({ where: { deletedAt: null } }),
      u.count({ where: { deletedAt: null, isGuest: true } }),
      u.count({ where: { deletedAt: null, isGuest: false } }),
      u.count({ where: { deletedAt: null, isGuest: false, createdAt: { gte: startToday } } }),
      u.count({ where: { deletedAt: null, isGuest: false, createdAt: { gte: week } } }),
      prisma.order.findMany({ where: { createdAt: { gte: month }, userId: { not: null } }, select: { userId: true }, distinct: ['userId'] }),
      u.findMany({
        where: { deletedAt: null, isGuest: false },
        select: { id: true, name: true, email: true, phone: true, createdAt: true },
        take: 10, orderBy: { createdAt: 'desc' },
      }),
      u.count({ where: { deletedAt: null, isGuest: false, convertedFromGuestAt: { not: null } } }),
      u.findMany({ where: { deletedAt: null }, select: { id: true, isGuest: true } }),
      prisma.order.groupBy({
        by: ['userId'],
        where: { userId: { not: null }, status: { notIn: ['CANCELLED', 'REJECTED'] } },
        _count: { _all: true },
      }),
    ]);
    const guestIds = new Set(allCustomers.filter((customer: any) => customer.isGuest).map((customer: any) => customer.id));
    const registeredIds = new Set(allCustomers.filter((customer: any) => !customer.isGuest).map((customer: any) => customer.id));
    const repeatGuests = orderGroups.filter((row: any) => guestIds.has(row.userId) && row._count._all >= 2).length;
    const repeatRegistered = orderGroups.filter((row: any) => registeredIds.has(row.userId) && row._count._all >= 2).length;
    const showPII = canSeeCustomerPII(req);
    res.json({
      totalCustomers: total,
      registered,            // inloggade (konto)
      guests,                // gäst-checkout
      convertedFromGuest,
      guestConversionRate: guests + convertedFromGuest > 0 ? Number((convertedFromGuest / (guests + convertedFromGuest)).toFixed(4)) : 0,
      repeatGuests,
      repeatRegistered,
      newToday,
      newThisWeek: newWeek,
      activeLast30Days: activeMonth.length,
      recentRegistrations: recent.map((r: any) => ({
        id: r.id,
        name: r.name,
        email: showPII ? r.email : maskEmail(r.email),
        phone: showPII ? r.phone : maskPhone(r.phone),
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    console.error('[customer-overview] error:', err);
    res.status(500).json({ error: 'Kunde inte hämta kundöverblick' });
  }
});

type LaunchLeadCursor = {
  createdAt: Date;
  id: string;
};

const encodeLaunchLeadCursor = (lead: { createdAt: Date | string; id: string }) => Buffer.from(JSON.stringify({
  createdAt: new Date(lead.createdAt).toISOString(),
  id: lead.id,
}), 'utf8').toString('base64url');

const decodeLaunchLeadCursor = (rawCursor: unknown): LaunchLeadCursor | null => {
  if (typeof rawCursor !== 'string' || rawCursor.length === 0 || rawCursor.length > 512) return null;
  try {
    const parsed = JSON.parse(Buffer.from(rawCursor, 'base64url').toString('utf8')) as {
      createdAt?: unknown;
      id?: unknown;
    };
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') return null;
    if (!parsed.id.trim() || parsed.id.length > 200) return null;
    const createdAt = new Date(parsed.createdAt);
    if (!Number.isFinite(createdAt.getTime())) return null;
    return { createdAt, id: parsed.id };
  } catch {
    return null;
  }
};

// GET /api/admin/launch-campaign
// Launchöversikt baserad enbart på personer som uttryckligen skickat in namn,
// e-post och marknadsföringssamtycke. Ingen besöks- eller klickmätning används.
router.get('/launch-campaign', authenticate, requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const requestedDays = Number(req.query.days || 30);
    const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 30;
    const requestedLimit = Number(req.query.limit ?? 50);
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
      return res.status(400).json({ error: 'limit måste vara ett heltal mellan 1 och 100' });
    }
    const rawCursor = req.query.cursor;
    const cursor = rawCursor === undefined ? null : decodeLaunchLeadCursor(rawCursor);
    if (rawCursor !== undefined && !cursor) {
      return res.status(400).json({ error: 'Ogiltig cursor' });
    }
    const now = new Date();
    const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const launchLead = (prisma as any).launchLead;
    const leadPageWhere = cursor
      ? {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        }
      : {};
    const [leadPage, leadDates, totalLeads, periodLeads, sentCoupons] = await Promise.all([
      launchLead.findMany({
        where: leadPageWhere,
        select: { id: true, name: true, email: true, couponCode: true, status: true, createdAt: true, couponSentAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: requestedLimit + 1,
      }),
      launchLead.findMany({
        where: { createdAt: { gte: from } },
        select: { createdAt: true },
      }),
      launchLead.count(),
      launchLead.count({ where: { createdAt: { gte: from } } }),
      launchLead.count({ where: { couponSentAt: { not: null } } }),
    ]);
    const hasNextPage = leadPage.length > requestedLimit;
    const leads = hasNextPage ? leadPage.slice(0, requestedLimit) : leadPage;
    const lastLead = leads[leads.length - 1];

    const dayKey = (date: Date) => new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date);
    const daily = new Map<string, any>();
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const date = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
      const key = dayKey(date);
      daily.set(key, { date: key, leads: 0 });
    }
    for (const lead of leadDates) {
      const row = daily.get(dayKey(new Date(lead.createdAt)));
      if (row) row.leads += 1;
    }

    res.json({
      days,
      from,
      to: now,
      totals: {
        leads: totalLeads,
        leadsInPeriod: periodLeads,
        couponsSent: sentCoupons,
        couponsPending: Math.max(0, totalLeads - sentCoupons),
        averageDailyLeads: Number((periodLeads / days).toFixed(2)),
      },
      daily: Array.from(daily.values()).map((row: any) => ({
        date: row.date,
        leads: row.leads,
      })),
      pageInfo: {
        limit: requestedLimit,
        hasNextPage,
        nextCursor: hasNextPage && lastLead ? encodeLaunchLeadCursor(lastLead) : null,
      },
      leads: leads.map((lead: any) => ({
        id: lead.id,
        name: lead.name,
        email: lead.email,
        couponCode: lead.couponCode,
        status: lead.status,
        createdAt: lead.createdAt,
        couponSentAt: lead.couponSentAt,
      })),
    });
  } catch (error) {
    console.error('[admin/launch-campaign] error:', error);
    res.status(500).json({ error: 'Kunde inte hämta launch-kampanjens statistik' });
  }
});

// Manual status only: the platform never sends the email. This records that a
// superadmin has completed (or undone) the follow-up outside ViaEats.
router.patch('/launch-campaign/:id/coupon-status', authenticate, requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    if (typeof req.body?.sent !== 'boolean') {
      return res.status(400).json({ error: 'sent måste vara true eller false' });
    }
    const launchLead = (prisma as any).launchLead;
    const existing = await launchLead.findUnique({
      where: { id: req.params.id },
      select: { id: true, couponSentAt: true },
    });
    if (!existing) return res.status(404).json({ error: 'Launch-lead hittades inte' });

    const updated = await launchLead.update({
      where: { id: existing.id },
      data: {
        couponSentAt: req.body.sent ? (existing.couponSentAt || new Date()) : null,
        status: req.body.sent ? 'COUPON_SENT' : 'INTERESTED',
      },
      select: { id: true, status: true, couponSentAt: true },
    });
    await audit(req, 'LAUNCH_COUPON_MANUAL_STATUS', {
      resourceType: 'LaunchLead',
      resourceId: existing.id,
      changes: { sent: req.body.sent, automaticEmail: false },
    });
    return res.json(updated);
  } catch (error) {
    console.error('[admin/launch-campaign/coupon-status] error:', error);
    return res.status(500).json({ error: 'Kunde inte uppdatera den manuella statusen' });
  }
});

router.get('/customers/search', authenticate, async (req: AuthRequest, res) => {
  if (!canReadCustomers(req)) {
    return res.status(403).json({ error: 'Kräver läsbehörighet för kunder' });
  }
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return res.json({ users: [] });
    }
    const users = await (prisma as any).user.findMany({
      where: {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
        ],
        deletedAt: null,
      },
      select: { id: true, name: true, email: true, phone: true, createdAt: true, isActive: true },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });
    const showPII = canSeeCustomerPII(req);
    res.json({
      users: users.map((usr: any) => ({
        ...usr,
        email: showPII ? usr.email : maskEmail(usr.email),
        phone: showPII ? usr.phone : maskPhone(usr.phone),
      })),
    });
  } catch (err) {
    console.error('[customer-search] error:', err);
    res.status(500).json({ error: 'Sökning misslyckades' });
  }
});

// GET /api/admin/customers/:id/orders — orders för en specifik kund
router.get('/customers/:id/orders', authenticate, async (req: AuthRequest, res) => {
  if (!canReadCustomers(req)) {
    return res.status(403).json({ error: 'Kräver läsbehörighet för kunder' });
  }
  try {
    const orders = await prisma.order.findMany({
      where: { userId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { restaurant: { select: { name: true, slug: true } } },
    });
    const showPII = canSeeCustomerPII(req as AuthRequest);
    res.json({
      orders: orders.map((o) => ({
        ...o,
        totalOre: o.total,
        totalMoney: moneyDto(o.total),
        total: o.total / 100,
        deliveryFeeOre: o.deliveryFee,
        deliveryFeeMoney: moneyDto(o.deliveryFee),
        deliveryFee: o.deliveryFee / 100,
        discountAmountOre: o.discountAmount,
        discountAmountMoney: moneyDto(o.discountAmount),
        discountAmount: o.discountAmount / 100,
        tipAmountOre: o.tipAmount ?? 0,
        tipAmountMoney: moneyDto(o.tipAmount ?? 0),
        tipAmount: (o.tipAmount ?? 0) / 100,
        refundAmountOre: o.refundAmount ?? null,
        refundAmountMoney: nullableMoneyDto(o.refundAmount),
        refundAmount: o.refundAmount != null ? o.refundAmount / 100 : null,
        customerPhone: showPII ? o.customerPhone : maskPhone(o.customerPhone),
        restaurantName: o.restaurant?.name || null,
      })),
    });
  } catch (err) {
    console.error('[customer-orders] error:', err);
    res.status(500).json({ error: 'Kunde inte hämta orders' });
  }
});

// GET /api/admin/customers/:id/gdpr-export — full dump av kundens data
router.get('/customers/:id/gdpr-export', authenticate, requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const userId = req.params.id;
    const [user, orders, deals, addresses] = await Promise.all([
      (prisma as any).user.findUnique({ where: { id: userId } }),
      prisma.order.findMany({ where: { userId }, include: { items: true } }),
      (prisma as any).customerDeal.findMany({ where: { userId } }),
      (prisma as any).savedAddress.findMany({ where: { userId } }),
    ]);

    if (!user) return res.status(404).json({ error: 'Kund hittades inte' });

    await audit(req, 'GDPR_EXPORT', { resourceType: 'User', resourceId: userId });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="gdpr-${userId}.json"`);
    res.json({
      exportedAt: new Date().toISOString(),
      user,
      orders,
      customerDeals: deals,
      savedAddresses: addresses,
    });
  } catch (err) {
    console.error('[gdpr-export] error:', err);
    res.status(500).json({ error: 'Export misslyckades' });
  }
});

router.post('/restaurants/:id/bulk-refund', authenticate, requireSuperAdmin, (_req, res) => {
  res.status(410).json({
    error: 'Kris-/massåterbetalning är permanent avstängd. Återbetala en order i taget efter manuell kontroll.',
    code: 'BULK_REFUND_DISABLED',
  });
});

// POST /api/admin/restaurants/:id/deactivate
// Akut deactivation — sätter isActive=false + isOpen=false, blockerar nya orders.
// Returnerar datadump för avstämning.
router.post('/restaurants/:id/deactivate', authenticate, requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const { reason } = req.body as { reason?: string };
    if (!reason) return res.status(400).json({ error: 'Reason krävs' });

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: req.params.id },
      include: {
        orders: { take: 100, orderBy: { createdAt: 'desc' } },
        deals: true,
      },
    });
    if (!restaurant) return res.status(404).json({ error: 'Restaurang hittades inte' });

    await prisma.restaurant.update({
      where: { id: req.params.id },
      data: {
        acceptingOrdersMode: 'FORCE_CLOSED',
        acceptingOrdersOverrideUntil: null,
        acceptingOrdersOverrideReason: reason,
        isOpen: false,
      } as any,
    });
    // Sätt alla aktiva deals inactive
    await prisma.deal.updateMany({
      where: { restaurantId: req.params.id, isActive: true },
      data: { isActive: false },
    });

    await audit(req, 'RESTAURANT_DEACTIVATE', {
      resourceType: 'Restaurant',
      resourceId: req.params.id,
      changes: { reason, name: restaurant.name },
    });

    res.json({
      success: true,
      datadump: {
        restaurant,
        deactivatedAt: new Date().toISOString(),
        reason,
      },
    });
  } catch (err) {
    console.error('[deactivate] error:', err);
    res.status(500).json({ error: 'Deactivation misslyckades' });
  }
});

// POST /api/admin/emergency-close-all
// Kris-knapp: lägger en global overlay utan att skriva om restaurangerna.
router.post('/emergency-close-all', authenticate, requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const { reason } = req.body as { reason?: string };
    const affected = await prisma.restaurant.count({ where: { draft: false } });
    await prisma.restaurantSettings.upsert({
      where: { id: 'settings' },
      update: { platformOrdersPaused: true, platformPauseReason: reason || null } as any,
      create: { id: 'settings', platformOrdersPaused: true, platformPauseReason: reason || null } as any,
    });
    await audit(req, 'EMERGENCY_CLOSE_ALL', {
      resourceType: 'Platform',
      changes: { reason: reason || 'no reason given', restaurantsClosed: affected, overlay: true },
    });
    bustCache('settings:public');
    bustCache('rest:list');
    bustCache('rest:detail');
    bustCache('cities:list');
    bustCache('zone:validate');
    try { getIO().emit('platform:paused', { until: null, reason: reason || null, indefinite: true }); } catch {}
    res.json({ success: true, closedCount: affected });
  } catch (err) {
    console.error('[emergency-close-all] error:', err);
    res.status(500).json({ error: 'Crisis-close misslyckades' });
  }
});

// POST /api/admin/emergency-open-all — ta bort global overlay
router.post('/emergency-open-all', authenticate, requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const affected = await prisma.restaurant.count({ where: { draft: false } });
    await prisma.restaurantSettings.updateMany({
      where: { id: 'settings' },
      data: {
        platformOrdersPaused: false,
        platformPausedUntil: null,
        platformPauseReason: null,
      } as any,
    });
    await audit(req, 'EMERGENCY_OPEN_ALL', {
      resourceType: 'Platform',
      changes: { restaurantsOpened: affected, overlayRemoved: true },
    });
    bustCache('settings:public');
    bustCache('rest:list');
    bustCache('rest:detail');
    bustCache('cities:list');
    bustCache('zone:validate');
    try { getIO().emit('platform:unpaused', {}); } catch {}
    res.json({ success: true, openedCount: affected });
  } catch (err) {
    res.status(500).json({ error: 'Re-open misslyckades' });
  }
});

// POST /api/admin/crisis/pause-platform — granular alternative to
// emergency-close-all. Sets a platformPausedUntil deadline on settings;
// order creation refuses while active. Auto-resumes when the deadline
// passes — no manual unpause needed for the typical "Stripe down 15 min" case.
// Body: { minutes: number (1-360), reason?: string }
router.post('/crisis/pause-platform', authenticate, requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const { minutes, reason } = req.body as { minutes?: number; reason?: string };
    const m = Number(minutes);
    if (!Number.isFinite(m) || m < 1 || m > 360) {
      res.status(400).json({ error: 'minutes måste vara 1-360' });
      return;
    }
    const until = new Date(Date.now() + m * 60_000);
    const updated = await prisma.restaurantSettings.upsert({
      where: { id: 'settings' },
      update: { platformPausedUntil: until, platformPauseReason: reason || null } as any,
      create: { id: 'settings', platformPausedUntil: until, platformPauseReason: reason || null } as any,
    });
    await audit(req, 'PLATFORM_PAUSE', {
      resourceType: 'Platform',
      changes: { until: until.toISOString(), minutes: m, reason: reason || null },
    });
    bustCache('settings:public');
    bustCache('rest:list');
    bustCache('rest:detail');
    bustCache('cities:list');
    bustCache('zone:validate');
    try {
      getIO().emit('platform:paused', { until: until.toISOString(), reason: reason || null });
    } catch {}
    res.json({ success: true, until: until.toISOString(), reason: reason || null });
  } catch (err) {
    console.error('[crisis/pause-platform] error:', err);
    res.status(500).json({ error: 'Pause misslyckades' });
  }
});

// POST /api/admin/crisis/unpause-platform — lift the platform-wide pause
router.post('/crisis/unpause-platform', authenticate, requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    await prisma.restaurantSettings.update({
      where: { id: 'settings' },
      data: { platformOrdersPaused: false, platformPausedUntil: null, platformPauseReason: null } as any,
    });
    await audit(req, 'PLATFORM_UNPAUSE', { resourceType: 'Platform', changes: {} });
    bustCache('settings:public');
    bustCache('rest:list');
    bustCache('rest:detail');
    bustCache('cities:list');
    bustCache('zone:validate');
    try {
      getIO().emit('platform:unpaused', {});
    } catch {}
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Unpause misslyckades' });
  }
});

// POST /api/admin/crisis/pause-city — overlay a city without mutating any
// restaurant's schedule/manual mode.
// Body: { cityId?: string, city?: string, reason?: string }
// Returns the affected restaurant count. Use the existing emergency-open-all
// or per-restaurant toggle to bring them back.
router.post('/crisis/pause-city', authenticate, requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const { cityId, city, reason } = req.body as { cityId?: string; city?: string; reason?: string };
    if (!cityId && !city) {
      res.status(400).json({ error: 'cityId eller city krävs' });
      return;
    }
    const cityWhere: any = cityId ? { id: cityId } : { name: city };
    const target = await prisma.city.findFirst({ where: cityWhere, select: { id: true, name: true } });
    if (!target) return res.status(404).json({ error: 'Stad hittades inte' });
    const [result] = await prisma.$transaction([
      prisma.restaurant.count({ where: { cityId: target.id, draft: false } }),
      prisma.city.update({
        where: { id: target.id },
        data: { ordersPaused: true, ordersPausedUntil: null, ordersPauseReason: reason || null } as any,
      }),
    ]);
    await audit(req, 'CITY_PAUSE', {
      resourceType: 'City',
      resourceId: target.id,
      changes: { reason: reason || null, restaurantsClosed: result, overlay: true },
    });
    bustCache('rest:list');
    bustCache('rest:detail');
    bustCache('cities:list');
    bustCache('zone:validate');
    try { getIO().emit('city:paused', { cityId: target.id, city: target.name, reason: reason || null }); } catch {}
    res.json({ success: true, closedCount: result, cityId: target.id, city: target.name });
  } catch (err) {
    console.error('[crisis/pause-city] error:', err);
    res.status(500).json({ error: 'Stadspaus misslyckades' });
  }
});

// POST /api/admin/crisis/unpause-city — re-open all restaurants in a city
router.post('/crisis/unpause-city', authenticate, requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const { cityId, city } = req.body as { cityId?: string; city?: string };
    if (!cityId && !city) {
      res.status(400).json({ error: 'cityId eller city krävs' });
      return;
    }
    const cityWhere: any = cityId ? { id: cityId } : { name: city };
    const target = await prisma.city.findFirst({ where: cityWhere, select: { id: true, name: true } });
    if (!target) return res.status(404).json({ error: 'Stad hittades inte' });
    const [result] = await prisma.$transaction([
      prisma.restaurant.count({ where: { cityId: target.id, draft: false } }),
      prisma.city.update({
        where: { id: target.id },
        data: { ordersPaused: false, ordersPausedUntil: null, ordersPauseReason: null } as any,
      }),
    ]);
    await audit(req, 'CITY_UNPAUSE', {
      resourceType: 'City',
      resourceId: target.id,
      changes: { restaurantsOpened: result, overlayRemoved: true },
    });
    bustCache('rest:list');
    bustCache('rest:detail');
    bustCache('cities:list');
    bustCache('zone:validate');
    try { getIO().emit('city:unpaused', { cityId: target.id, city: target.name }); } catch {}
    res.json({ success: true, openedCount: result });
  } catch (err) {
    res.status(500).json({ error: 'Stadsåteröppning misslyckades' });
  }
});

// GET /api/admin/crisis/state — what's currently paused
router.get('/crisis/state', authenticate, requireSuperAdmin, async (_req: AuthRequest, res) => {
  try {
    const [settings, cities] = await Promise.all([
      prisma.restaurantSettings.findUnique({ where: { id: 'settings' } }),
      prisma.city.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
          ordersPaused: true,
          ordersPausedUntil: true,
          ordersPauseReason: true,
        },
        orderBy: { name: 'asc' },
      }),
    ]);
    const s = settings as any;
    const pausedUntil = s?.platformPausedUntil ? new Date(s.platformPausedUntil) : null;
    const platformPaused = pausedUntil && pausedUntil.getTime() > Date.now() ? { until: pausedUntil.toISOString(), reason: s.platformPauseReason || null } : null;
    res.json({
      platformPaused,
      platformStopped: s?.platformOrdersPaused === true
        ? { reason: s.platformPauseReason || null, indefinite: true }
        : null,
      cities,
    });
  } catch (err) {
    res.status(500).json({ error: 'Kunde inte hämta krisstatus' });
  }
});

// GET /api/admin/audit-log?limit=100&offset=0&action=ORDER_REFUND&actor=alice@viaeats.se&from=2026-05-01&to=2026-05-27&q=searchText
// Filter:
//   - action: matchar AuditLog.action exakt (eller prefix via *)
//   - actor:  matchar AuditLog.adminEmail (substring, case-insensitive)
//   - from/to: ISO-datum eller YYYY-MM-DD, inkluderar hela to-dagen
//   - q:      söker i resourceType, resourceId och adminEmail
// Saknas filter — backwards-compatibel beteende (alla loggar paginerade).
router.get('/audit-log', authenticate, requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '100'), 10) || 100, 1), 500);
    const offset = Math.max(parseInt(String(req.query.offset || '0'), 10) || 0, 0);

    const where: any = {};
    const action = String(req.query.action || '').trim();
    if (action) {
      // Stöd `ORDER_*` för wildcard-prefix (vanligaste case: filtrera alla
      // order-relaterade events utan att lista varje action-typ för sig).
      if (action.endsWith('*')) {
        where.action = { startsWith: action.slice(0, -1) };
      } else {
        where.action = action;
      }
    }
    const actor = String(req.query.actor || '').trim();
    if (actor) {
      where.adminEmail = { contains: actor, mode: 'insensitive' };
    }
    const q = String(req.query.q || '').trim();
    if (q) {
      where.OR = [
        { resourceType: { contains: q, mode: 'insensitive' } },
        { resourceId: { contains: q, mode: 'insensitive' } },
        { adminEmail: { contains: q, mode: 'insensitive' } },
        { action: { contains: q, mode: 'insensitive' } },
      ];
    }
    const fromRaw = String(req.query.from || '').trim();
    const toRaw = String(req.query.to || '').trim();
    if (fromRaw || toRaw) {
      where.createdAt = {};
      if (fromRaw) {
        const fromDate = new Date(fromRaw);
        if (!Number.isNaN(fromDate.getTime())) where.createdAt.gte = fromDate;
      }
      if (toRaw) {
        // Inkludera hela to-dagen: lägg på 23:59:59 om bara YYYY-MM-DD.
        const toDate = new Date(toRaw);
        if (!Number.isNaN(toDate.getTime())) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(toRaw)) {
            toDate.setHours(23, 59, 59, 999);
          }
          where.createdAt.lte = toDate;
        }
      }
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.auditLog.count({ where }),
    ]);
    res.json({
      logs: logs.map((l) => ({
        ...l,
        changes: l.changes ? safeJsonParse(l.changes) : null,
      })),
      total,
    });
  } catch (err) {
    console.error('[audit-log] error:', err);
    res.status(500).json({ error: 'Kunde inte hämta audit-log' });
  }
});

const safeJsonParse = (raw: string): unknown => {
  try { return JSON.parse(raw); } catch { return raw; }
};

// GET /api/admin/health/services — kollar Stripe/APNs/Redis/Supabase/R2/DB
router.get('/health/services', authenticate, requireSuperAdmin, async (_req, res) => {
  const services: Record<string, { status: 'up' | 'down' | 'unconfigured'; latencyMs?: number; error?: string }> = {};

  // DB
  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    services.database = { status: 'up', latencyMs: Date.now() - start };
  } catch (err: any) {
    services.database = { status: 'down', error: err?.message };
  }

  // Stripe
  if (process.env.STRIPE_SECRET_KEY) {
    try {
      const Stripe = require('stripe');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const start = Date.now();
      await stripe.balance.retrieve();
      services.stripe = { status: 'up', latencyMs: Date.now() - start };
    } catch (err: any) {
      services.stripe = { status: 'down', error: err?.message };
    }
  } else {
    services.stripe = { status: 'unconfigured' };
  }

  // Stripe webhook secret
  services.stripeWebhook = process.env.STRIPE_WEBHOOK_SECRET && process.env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_')
    ? { status: 'up' }
    : { status: 'unconfigured', error: 'STRIPE_WEBHOOK_SECRET saknas eller är placeholder' };

  // APNs
  services.apns = (process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_BUNDLE_ID && process.env.APNS_KEY_P8)
    ? { status: 'up' }
    : { status: 'unconfigured' };

  // Redis
  services.redis = process.env.REDIS_URL ? { status: 'up' } : { status: 'unconfigured' };

  // Supabase
  services.supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? { status: 'up' }
    : { status: 'unconfigured' };

  // Cloudflare R2 (enda bilduppladdaren)
  services.r2 = (process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET && process.env.R2_PUBLIC_BASE_URL)
    ? { status: 'up' }
    : { status: 'unconfigured' };

  res.json({ services, checkedAt: new Date().toISOString() });
});

// ── Restaurang-terminaler (pairing-kod → device) ────────────────────────────
// Super-admin styr vilka plattor som är länkade till en restaurang. En platta
// paras EN gång med en kod och förblir länkad för alltid (överlever app-
// ominstallation, se routes/terminal.ts). Endast super-admin kan logga ut
// (revoke) eller åter-aktivera (restore) en enhet.
const PAIR_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const generatePairCode = (len = 6): string => {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += PAIR_CODE_ALPHABET[bytes[i] % PAIR_CODE_ALPHABET.length];
  return out;
};

// En remote-leverantör kan befinna sig flera tidszoner bort och behöver hinna
// installera APK:n innan parning. Koden är fortfarande single-use, men gäller
// ett dygn och återanvänds vid upprepade klick så en redan skickad kod inte
// råkar ogiltigförklaras av dubbelklick/refetch.
const DEVICE_PAIRING_CODE_TTL_MS = 24 * 60 * 60 * 1000;
// Minst en timme kvar krävs för återanvändning. Därmed ersätts även gamla
// 15-minuterskoder direkt efter deploy, medan en ny 24-timmarskod är stabil
// vid upprepade klick.
const DEVICE_PAIRING_CODE_MIN_REMAINING_MS = 60 * 60 * 1000;

// POST /restaurants/:id/devices/pairing-code — skapa/hämta engångskod (24 h).
router.post('/restaurants/:id/devices/pairing-code', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true },
    });
    if (!restaurant) return res.status(404).json({ error: 'Restaurang hittades inte' });

    const now = new Date();
    const reusable = await (prisma as any).devicePairingCode.findFirst({
      where: {
        restaurantId: restaurant.id,
        usedAt: null,
        expiresAt: { gt: new Date(now.getTime() + DEVICE_PAIRING_CODE_MIN_REMAINING_MS) },
      },
      orderBy: { createdAt: 'desc' },
      select: { code: true, expiresAt: true },
    });
    if (reusable) {
      return res.json({
        ...reusable,
        reused: true,
        serverTime: now,
        validForSeconds: Math.max(0, Math.floor((reusable.expiresAt.getTime() - now.getTime()) / 1000)),
      });
    }

    // Rensa bara gamla/nästan utgångna koder. En aktiv kod returnerades ovan.
    await (prisma as any).devicePairingCode.deleteMany({
      where: { restaurantId: restaurant.id, usedAt: null },
    });

    let code = generatePairCode();
    for (let i = 0; i < 5; i++) {
      const exists = await (prisma as any).devicePairingCode.findUnique({ where: { code } });
      if (!exists) break;
      code = generatePairCode();
    }
    const expiresAt = new Date(now.getTime() + DEVICE_PAIRING_CODE_TTL_MS);
    await (prisma as any).devicePairingCode.create({
      data: { code, restaurantId: restaurant.id, expiresAt },
    });
    await audit(req as AuthRequest, 'DEVICE_PAIRING_CODE', {
      resourceType: 'Restaurant',
      resourceId: restaurant.id,
    });
    res.json({
      code,
      expiresAt,
      reused: false,
      serverTime: now,
      validForSeconds: Math.floor(DEVICE_PAIRING_CODE_TTL_MS / 1000),
    });
  } catch (error) {
    console.error('[devices/pairing-code] error:', error);
    res.status(500).json({ error: 'Kunde inte generera pairing-kod' });
  }
});

// GET /restaurants/:id/devices — länkade enheter + ev. väntande kod.
router.get('/restaurants/:id/devices', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const devices = await (prisma as any).restaurantDevice.findMany({
      where: { restaurantId: req.params.id },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, deviceId: true, label: true, revoked: true, lastSeenAt: true, createdAt: true },
    });
    const pendingCode = await (prisma as any).devicePairingCode.findFirst({
      where: { restaurantId: req.params.id, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { code: true, expiresAt: true },
    });
    res.json({
      devices: devices.map((d: any) => ({
        id: d.id,
        deviceId: d.deviceId,
        label: d.label,
        status: d.revoked ? 'revoked' : 'linked',
        lastSeenAt: d.lastSeenAt,
        createdAt: d.createdAt,
      })),
      pendingCode: pendingCode || null,
    });
  } catch (error) {
    console.error('[devices list] error:', error);
    res.status(500).json({ error: 'Kunde inte hämta enheter' });
  }
});

// POST /devices/:id/revoke — logga ut en enhet.
router.post('/devices/:id/revoke', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const device = await (prisma as any).restaurantDevice.update({
      where: { id: req.params.id },
      // Behåll refresh-hashen medan enheten är låst. Då kan samma fysiska
      // terminal återaktiveras säkert; appen behåller refresh-token men får
      // varken REST- eller socketaccess så länge revoked=true.
      data: { revoked: true },
      select: { restaurantId: true, deviceId: true },
    });
    // Gör utloggningen omedelbar: bumpa restaurangkontots tokenVersion så att
    // en redan utfärdad (24h) access-token avvisas vid nästa API-anrop → appen
    // kör /session → 403 → "utloggad av admin".
    const rest = await prisma.restaurant.findUnique({
      where: { id: device.restaurantId },
      select: { adminUserId: true },
    });
    if (rest?.adminUserId) {
      await (prisma as any).adminUser.update({
        where: { id: rest.adminUserId },
        data: { tokenVersion: { increment: 1 } },
      });
    }
    // Realtids-signal till plattan så den låser DIREKT (utan att vänta på nästa
    // API-anrop). Appen lyssnar på 'device:session-changed' i sitt admin-room.
    try {
      getIO()
          .to(`admin-room:${device.restaurantId}`)
          .emit('device:session-changed', { deviceId: device.deviceId, action: 'revoked' });
      // Koppla även ned den exakta socketen efter att revoke-eventet hunnit
      // levereras. Ett modifierat klientbygge kan då inte ignorera UI-eventet
      // och fortsätta läsa orderrummet med en gammal 24h-token.
      setTimeout(() => {
        void getIO().in(`admin-room:${device.restaurantId}`).fetchSockets()
          .then((sockets) => {
            for (const socket of sockets) {
              if (socket.data?.admin?.deviceId === device.deviceId) {
                socket.disconnect(true);
              }
            }
          })
          .catch(() => null);
      }, 250);
    } catch (_) {}
    await audit(req as AuthRequest, 'DEVICE_REVOKE', { resourceType: 'RestaurantDevice', resourceId: req.params.id });
    res.json({ success: true });
  } catch (error) {
    console.error('[devices revoke] error:', error);
    res.status(500).json({ error: 'Kunde inte logga ut enheten' });
  }
});

// POST /devices/:id/restore — åter-aktivera (logga in igen).
router.post('/devices/:id/restore', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    await (prisma as any).restaurantDevice.update({
      where: { id: req.params.id },
      data: { revoked: false },
    });
    await audit(req as AuthRequest, 'DEVICE_RESTORE', { resourceType: 'RestaurantDevice', resourceId: req.params.id });
    res.json({ success: true });
  } catch (error) {
    console.error('[devices restore] error:', error);
    res.status(500).json({ error: 'Kunde inte åter-aktivera enheten' });
  }
});

// DELETE /devices/:id — ta bort länken helt (enheten måste paras om).
router.delete('/devices/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const device = await (prisma as any).restaurantDevice.findUnique({
      where: { id: req.params.id },
      select: { restaurantId: true, deviceId: true, revoked: true },
    });
    // Måste vara utloggad (revoked) först — annars loggas plattan inte ut
    // ordentligt innan raden försvinner.
    if (device && !device.revoked) {
      return res.status(400).json({ error: 'Logga ut enheten först innan du tar bort den.' });
    }
    await (prisma as any).restaurantDevice.delete({ where: { id: req.params.id } });
    // Bumpa tokenVersion + signalera plattan så den faller tillbaka till
    // pairing-skärmen direkt (enheten måste paras om).
    if (device) {
      // Städa upp helt vid avparning: ta även bort ev. väntande pairing-kod.
      await (prisma as any).devicePairingCode.deleteMany({
        where: { restaurantId: device.restaurantId },
      });
      const rest = await prisma.restaurant.findUnique({
        where: { id: device.restaurantId },
        select: { adminUserId: true },
      });
      if (rest?.adminUserId) {
        await (prisma as any).adminUser.update({
          where: { id: rest.adminUserId },
          data: { tokenVersion: { increment: 1 } },
        });
      }
      try {
        getIO()
            .to(`admin-room:${device.restaurantId}`)
            .emit('device:session-changed', { deviceId: device.deviceId, action: 'deleted' });
        setTimeout(() => {
          void getIO().in(`admin-room:${device.restaurantId}`).fetchSockets()
            .then((sockets) => {
              for (const socket of sockets) {
                if (socket.data?.admin?.deviceId === device.deviceId) {
                  socket.disconnect(true);
                }
              }
            })
            .catch(() => null);
        }, 250);
      } catch (_) {}
    }
    await audit(req as AuthRequest, 'DEVICE_DELETE', { resourceType: 'RestaurantDevice', resourceId: req.params.id });
    res.json({ success: true });
  } catch (error) {
    console.error('[devices delete] error:', error);
    res.status(500).json({ error: 'Kunde inte ta bort enheten' });
  }
});

export default router;
