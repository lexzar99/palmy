import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { sendToAllUsers, sendToUser, sendToCity, sendToInstallations } from '../lib/notifications';
import { authenticate, isSuperAdmin } from '../middleware/auth';
import { authenticateUser, authenticateUserOptional } from './auth';
import { resolveCustomerNotificationTarget } from '../lib/customerNotificationAccess';
import {
  ORDER_NATIVE_SESSION_HEADER,
  verifyOrderNativeSession,
} from '../lib/orderAccess';
import {
  CUSTOMER_PUSH_PROVIDERS,
  type CustomerPushProvider,
  opaqueInstallationId,
  registerDeviceInstallation,
  registerOrderDeviceInstallation,
  revokeDeviceInstallation,
} from '../lib/deviceInstallations';
import { getCustomerNotificationMetrics } from '../lib/notificationOutbox';

const router = Router();

function adminPushQueueOptions(req: any, target: string) {
  const supplied = String(req.get?.('Idempotency-Key') || '').trim();
  const requestId = supplied && /^[A-Za-z0-9._:-]{8,128}$/.test(supplied)
    ? supplied
    : crypto.randomUUID();
  const digest = crypto.createHash('sha256').update(`${req.user?.id || 'admin'}\0${target}\0${requestId}`).digest('hex');
  return { dedupeKeyPrefix: `admin:${digest}`, kind: 'ADMIN_PUSH' };
}

/**
 * POST /api/notifications/register
 *
 * Deduplicering: en device-token kan aldrig tillhöra mer än en aktiv
 * user. Innan vi sätter token på inloggade kontot nollar vi samma token
 * på alla andra users — annars skickas dubblerade notiser till samma
 * fysiska enhet när användaren loggar ut/in mellan konton.
 */
router.post('/register', authenticateUser, async (req: any, res) => {
  try {
    const { token, installationId } = z.object({
      token: z.string(),
      installationId: z.string().trim().min(8).max(256).refine((value) => !/\s/.test(value)).optional(),
    }).parse(req.body);

    if (!token.startsWith('ExponentPushToken[')) {
      return res.status(400).json({ error: 'Ogiltig Expo push token' });
    }

    const device = await registerDeviceInstallation({
      userId: req.user.id,
      provider: 'EXPO',
      rawToken: token,
      installationId,
    });
    res.json({ success: true, installationId: device.installationId });
  } catch (error) {
    res.status(400).json({ error: 'Kunde inte registrera token' });
  }
});

/**
 * POST /api/notifications/register-fcm
 *
 * Android customers can register either account-wide with their account JWT,
 * or orderspecifically with the raw secret from a newly-created order. The
 * raw proof expires here after 30 minutes. It creates a nullable-user device
 * subscription, so one order secret can never unlock another order/account.
 */
router.post('/register-fcm', authenticateUserOptional, async (req: any, res) => {
  try {
    const { installationId, token: legacyToken, deviceId, platform, orderId, accessToken } = z.object({
      installationId: z.string().trim().min(10).max(256).refine((value) => !/\s/.test(value)).optional(),
      token: z.string().trim().min(10).max(4096).refine((value) => !/\s/.test(value)).optional(),
      deviceId: z.string().trim().min(8).max(256).refine((value) => !/\s/.test(value)).optional(),
      platform: z.enum(['android', 'ios']).optional(),
      orderId: z.string().trim().min(1).optional(),
      accessToken: z.string().trim().min(20).max(512).optional(),
    }).refine((value) => Boolean(value.installationId || value.token)).parse(req.body);
    const providerToken = installationId || legacyToken!;

    const authenticatedUserId = req.user?.id ? String(req.user.id) : null;
    let target: { scope: 'account' | 'order' | 'installation'; userId: string | null } | null =
      resolveCustomerNotificationTarget({ authenticatedUserId });
    if (orderId) {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { userId: true, accessToken: true, createdAt: true },
      });
      target = resolveCustomerNotificationTarget({ authenticatedUserId, order, accessToken });
      const clientType = String(req.headers['x-client-type'] || '').toLowerCase();
      if (
        !target &&
        (clientType === 'ios' || clientType === 'android') &&
        verifyOrderNativeSession(req.headers[ORDER_NATIVE_SESSION_HEADER], orderId)
      ) {
        target = { scope: 'order', userId: null };
      }
      if (!target) return res.status(404).json({ error: 'Ordern hittades inte' });
    }

    if (!target) target = { scope: 'installation', userId: null };

    if (target.userId) {
      const activeTarget = await prisma.user.count({
        where: { id: target.userId, deletedAt: null, isActive: true },
      });
      if (activeTarget !== 1) throw new Error('target_user_unavailable');
    }
    const registration = {
      // Kundappen äger installationen. Konto/telefon används aldrig som
      // mottagare; orderbehörighet läggs separat i DeviceOrderSubscription.
      userId: null,
      provider: 'FCM_FID' as const,
      rawToken: providerToken,
      installationId: deviceId || opaqueInstallationId('FCM_FID', providerToken),
      platform: platform || 'android',
    };
    const device = target.scope === 'order' && orderId
      ? await registerOrderDeviceInstallation({ ...registration, orderId })
      : await registerDeviceInstallation(registration);

    res.json({ success: true, installationId: device.installationId, scope: target.scope });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Ogiltig FCM-token eller orderdata' });
    }
    if (error?.message === 'target_user_unavailable') {
      return res.status(404).json({ error: 'Kundkontot är inte tillgängligt' });
    }
    console.error('[notifications/register-fcm] failed:', error);
    res.status(500).json({ error: 'Kunde inte registrera Android-notiser' });
  }
});

/**
 * POST /api/notifications/register-device
 *
 * Samma account-vs-order-scope och deduplicering som FCM, men för APNs.
 */
router.post('/register-device', authenticateUserOptional, async (req: any, res) => {
  try {
    const { token, installationId, orderId, accessToken } = z.object({
      token: z.string(),
      installationId: z.string().trim().min(8).max(256).refine((value) => !/\s/.test(value)).optional(),
      orderId: z.string().trim().min(1).optional(),
      accessToken: z.string().trim().min(20).max(512).optional(),
    }).parse(req.body);
    if (!/^[a-f0-9]{32,256}$/i.test(token)) {
      return res.status(400).json({ error: 'Ogiltig APNs-token' });
    }
    const normalized = token.toLowerCase();

    const authenticatedUserId = req.user?.id ? String(req.user.id) : null;
    let target: { scope: 'account' | 'order' | 'installation'; userId: string | null } | null =
      resolveCustomerNotificationTarget({ authenticatedUserId });
    if (orderId) {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { userId: true, accessToken: true, createdAt: true },
      });
      target = resolveCustomerNotificationTarget({ authenticatedUserId, order, accessToken });
      const clientType = String(req.headers['x-client-type'] || '').toLowerCase();
      if (
        !target &&
        (clientType === 'ios' || clientType === 'android') &&
        verifyOrderNativeSession(req.headers[ORDER_NATIVE_SESSION_HEADER], orderId)
      ) {
        target = { scope: 'order', userId: null };
      }
      if (!target) return res.status(404).json({ error: 'Ordern hittades inte' });
    }
    if (!target) target = { scope: 'installation', userId: null };

    if (target.userId) {
      const activeTarget = await prisma.user.count({
        where: { id: target.userId, deletedAt: null, isActive: true },
      });
      if (activeTarget !== 1) return res.status(404).json({ error: 'Kundkontot är inte tillgängligt' });
    }
    const registration = {
      // APNs-tokenen tillhör appinstallationen, inte ett kundkonto.
      userId: null,
      provider: 'APNS' as const,
      rawToken: normalized,
      installationId: installationId || opaqueInstallationId('APNS', normalized),
      platform: 'ios',
    };
    const device = target.scope === 'order' && orderId
      ? await registerOrderDeviceInstallation({ ...registration, orderId })
      : await registerDeviceInstallation(registration);
    res.json({ success: true, installationId: device.installationId, scope: target.scope });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Ogiltig APNs-token eller orderdata' });
    }
    res.status(400).json({ error: 'Kunde inte registrera APNs-token' });
  }
});

type InstallationAudienceFilter = {
  ordered: 'all' | 'yes' | 'no';
  minOrders?: number;
  maxOrders?: number;
};

async function resolveInstallationAudience(filter: InstallationAudienceFilter) {
  const installations = await prisma.deviceInstallation.findMany({
    where: {
      active: true,
      tokenCiphertext: { not: null },
      provider: { in: ['APNS', 'FCM_FID', 'EXPO'] },
    },
    select: {
      id: true,
      userId: true,
      provider: true,
      platform: true,
      lastSeenAt: true,
    },
  });
  if (installations.length === 0) return [];

  const installationIds = installations.map((row) => row.id);
  const userIds = [...new Set(installations.map((row) => row.userId).filter((id): id is string => Boolean(id)))];
  const [subscriptionCounts, userOrderCounts] = await Promise.all([
    prisma.deviceOrderSubscription.groupBy({
      by: ['deviceInstallationId'],
      where: { deviceInstallationId: { in: installationIds } },
      _count: { _all: true },
    }),
    userIds.length
      ? prisma.order.groupBy({
          by: ['userId'],
          where: { userId: { in: userIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);
  const byInstallation = new Map(subscriptionCounts.map((row) => [row.deviceInstallationId, row._count._all]));
  const byUser = new Map(userOrderCounts.map((row) => [row.userId, row._count._all]));

  return installations
    .map((row) => ({
      ...row,
      orderCount: Math.max(
        byInstallation.get(row.id) || 0,
        row.userId ? byUser.get(row.userId) || 0 : 0,
      ),
    }))
    .filter((row) => {
      if (filter.ordered === 'yes' && row.orderCount === 0) return false;
      if (filter.ordered === 'no' && row.orderCount > 0) return false;
      if (filter.minOrders != null && row.orderCount < filter.minOrders) return false;
      if (filter.maxOrders != null && row.orderCount > filter.maxOrders) return false;
      return true;
    });
}

const installationAudienceSchema = z.object({
  ordered: z.enum(['all', 'yes', 'no']).default('all'),
  minOrders: z.coerce.number().int().min(0).max(100_000).optional(),
  maxOrders: z.coerce.number().int().min(0).max(100_000).optional(),
});

router.get('/admin/installations', authenticate, isSuperAdmin, async (req, res) => {
  try {
    const filter = installationAudienceSchema.parse(req.query);
    const [all, selected] = await Promise.all([
      resolveInstallationAudience({ ordered: 'all' }),
      resolveInstallationAudience({ ...filter, ordered: filter.ordered ?? 'all' }),
    ]);
    res.json({
      totals: {
        installed: all.length,
        ordered: all.filter((row) => row.orderCount > 0).length,
        neverOrdered: all.filter((row) => row.orderCount === 0).length,
        ios: all.filter((row) => row.provider === 'APNS' || row.platform === 'ios').length,
        android: all.filter((row) => row.provider === 'FCM_FID' || row.platform === 'android').length,
      },
      selected: selected.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Ogiltigt filter' });
    console.error('Installation audience error:', error);
    res.status(500).json({ error: 'Kunde inte läsa appinstallationer' });
  }
});

router.post('/admin/send-installations', authenticate, isSuperAdmin, async (req: any, res) => {
  try {
    const input = installationAudienceSchema.extend({
      title: z.string().trim().min(1).max(120),
      body: z.string().trim().min(1).max(500),
      data: z.record(z.any()).optional(),
    }).parse(req.body);
    if (input.minOrders != null && input.maxOrders != null && input.minOrders > input.maxOrders) {
      return res.status(400).json({ error: 'Minsta antal ordrar kan inte vara större än högsta' });
    }
    const normalizedFilter = { ...input, ordered: input.ordered ?? 'all' };
    const audience = await resolveInstallationAudience(normalizedFilter);
    const result = await sendToInstallations(
      audience.map((row) => row.id),
      input.title,
      input.body,
      input.data,
      adminPushQueueOptions(req, `installations:${normalizedFilter.ordered}:${input.minOrders ?? ''}:${input.maxOrders ?? ''}`),
    );
    await prisma.pushLog.create({
      data: {
        target: 'installation',
        cohort: `ordered=${normalizedFilter.ordered};min=${input.minOrders ?? ''};max=${input.maxOrders ?? ''}`,
        title: input.title,
        body: input.body,
        deeplink: input.data?.deeplink as string | undefined ?? null,
        count: result.count,
        success: result.success,
        error: result.errors > 0 ? `${result.errors} köfel` : null,
        sentBy: req.user?.id ?? null,
      },
    });
    res.json({ ...result, selected: audience.length });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Felaktig input', details: error.errors });
    console.error('Admin installation push error:', error);
    res.status(500).json({ error: 'Kunde inte skicka till appinstallationer' });
  }
});

/**
 * POST /api/notifications/unregister
 *
 * RN/web kallar detta vid logout för att rensa sina tokens från
 * databasen. Annars skickas notiser till en utloggad enhet tills
 * någon annan loggar in på samma device.
 */
router.post('/unregister', authenticateUser, async (req: any, res) => {
  try {
    const { installationId, provider, allDevices } = z.object({
      installationId: z.string().trim().min(8).max(256).optional(),
      provider: z.enum(CUSTOMER_PUSH_PROVIDERS).optional(),
      allDevices: z.boolean().optional().default(false),
    }).parse(req.body || {});

    if (installationId) {
      const revoked = await revokeDeviceInstallation({
        userId: req.user.id,
        installationId,
        provider: provider as CustomerPushProvider | undefined,
        reason: 'logout',
      });
      return res.json({ success: true, mode: 'installation', revoked });
    }

    if (allDevices) {
      const [revoked] = await Promise.all([
        revokeDeviceInstallation({ userId: req.user.id, allDevices: true, reason: 'logout_all_devices' }),
        prisma.user.update({
          where: { id: req.user.id },
          data: { pushToken: null, apnsDeviceToken: null },
        }),
      ]);
      return res.json({ success: true, mode: 'all_devices', revoked });
    }

    // Äldre appar skickar ingen installation. Rensa bara legacy-kolumnerna;
    // nya multi-device-rader får aldrig oavsiktligt loggas ut allihop.
    await prisma.user.update({
      where: { id: req.user.id },
      data: { pushToken: null, apnsDeviceToken: null },
    });
    res.json({ success: true, mode: 'legacy_only', revoked: 0 });
  } catch {
    res.status(400).json({ error: 'Kunde inte avregistrera token' });
  }
});

/**
 * POST /api/notifications/admin/send-all
 */
router.post('/admin/send-all', authenticate, isSuperAdmin, async (req: any, res) => {
  try {
    const { title, body, data } = z.object({
      title: z.string().min(1),
      body: z.string().min(1),
      data: z.record(z.any()).optional()
    }).parse(req.body);

    const result = await sendToAllUsers(title, body, data, adminPushQueueOptions(req, 'all'));

    await (prisma as any).pushLog.create({
      data: {
        target: 'all',
        title,
        body,
        deeplink: data?.deeplink as string | undefined ?? null,
        count: result.count,
        success: result.success,
        error: result.errors > 0 ? `${result.errors} ticket errors` : null,
        sentBy: req.user?.id ?? null,
      },
    });

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Felaktig input', details: error.errors });
    }
    console.error('Admin push error:', error);
    res.status(500).json({ error: 'Kunde inte skicka push-notiser' });
  }
});

/**
 * POST /api/notifications/admin/send-user
 */
router.post('/admin/send-user', authenticate, isSuperAdmin, async (req: any, res) => {
  try {
    const { identifier, title, body, data } = z.object({
      identifier: z.string().min(1),
      title: z.string().min(1),
      body: z.string().min(1),
      data: z.record(z.any()).optional(),
    }).parse(req.body);

    const result = await sendToUser(identifier, title, body, data, adminPushQueueOptions(req, `user:${identifier}`));

    await (prisma as any).pushLog.create({
      data: {
        target: 'user',
        identifier,
        title,
        body,
        deeplink: data?.deeplink as string | undefined ?? null,
        count: result.count,
        success: result.success,
        error: result.error ?? (result.errors > 0 ? `${result.errors} ticket errors` : null),
        sentBy: req.user?.id ?? null,
      },
    });

    if (!result.success && result.error) {
      return res.status(404).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Felaktig input', details: error.errors });
    }
    console.error('Admin push (user) error:', error);
    res.status(500).json({ error: 'Kunde inte skicka push-notis' });
  }
});

/**
 * POST /api/notifications/admin/send-city
 */
router.post('/admin/send-city', authenticate, isSuperAdmin, async (req: any, res) => {
  try {
    const { city, title, body, data } = z.object({
      city: z.string().min(1),
      title: z.string().min(1),
      body: z.string().min(1),
      data: z.record(z.any()).optional(),
    }).parse(req.body);

    const result = await sendToCity(city, title, body, data, adminPushQueueOptions(req, `city:${city}`));

    await (prisma as any).pushLog.create({
      data: {
        target: 'city',
        city,
        title,
        body,
        deeplink: data?.deeplink as string | undefined ?? null,
        count: result.count,
        success: result.success,
        error: result.errors > 0 ? `${result.errors} ticket errors` : null,
        sentBy: req.user?.id ?? null,
      },
    });

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Felaktig input', details: error.errors });
    }
    console.error('Admin push (city) error:', error);
    res.status(500).json({ error: 'Kunde inte skicka push-notiser' });
  }
});

/**
 * GET /api/notifications/admin/history
 */
router.get('/admin/history', authenticate, isSuperAdmin, async (_req, res) => {
  try {
    const [logs, deliveryMetrics, recentOutbox] = await Promise.all([
      (prisma as any).pushLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
      getCustomerNotificationMetrics(),
      prisma.notificationOutbox.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          kind: true,
          status: true,
          attemptCount: true,
          acceptedCount: true,
          invalidCount: true,
          failureCount: true,
          lastError: true,
          createdAt: true,
          completedAt: true,
        },
      }),
    ]);
    res.json({ logs, deliveryMetrics, recentOutbox });
  } catch (error) {
    console.error('Push history error:', error);
    res.status(500).json({ error: 'Kunde inte hämta historik' });
  }
});

/**
 * A13 — cohort send. Resolves users matching a cohort key and dispatches
 * synchronously. Cohort keys:
 *   - inactive_30d: users with no order in the last 30 days, account >= 7d old
 *   - new_users_7d: users created in the last 7 days, 0 orders
 *   - active_repeaters: users with >= 3 orders, last order in the last 30d
 */
async function resolveCohortUserIds(cohort: string): Promise<string[]> {
  const now = Date.now();
  if (cohort === 'inactive_30d') {
    // Users whose latest order is >= 30 days ago
    const since30 = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const since7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const recentByUser = await prisma.order.groupBy({
      by: ['userId'],
      where: { userId: { not: null }, createdAt: { gte: since30 } },
      _count: { _all: true },
    });
    const recentSet = new Set(recentByUser.map((r) => r.userId!));
    const users = await (prisma as any).user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        createdAt: { lte: since7 },
        OR: [
          { deviceInstallations: { some: { active: true, provider: { not: 'WEB_PUSH' } } } },
          { pushToken: { not: null } },
          { apnsDeviceToken: { not: null } },
        ],
      },
      select: { id: true },
    });
    return (users as any[]).map((u) => u.id).filter((id) => !recentSet.has(id));
  }
  if (cohort === 'new_users_7d') {
    const since7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const users = await (prisma as any).user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        createdAt: { gte: since7 },
        OR: [
          { deviceInstallations: { some: { active: true, provider: { not: 'WEB_PUSH' } } } },
          { pushToken: { not: null } },
          { apnsDeviceToken: { not: null } },
        ],
      },
      select: { id: true, _count: { select: { orders: true } } },
    });
    return (users as any[]).filter((u) => (u._count?.orders ?? 0) === 0).map((u) => u.id);
  }
  if (cohort === 'active_repeaters') {
    const since30 = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const recentByUser = await prisma.order.groupBy({
      by: ['userId'],
      where: { userId: { not: null }, createdAt: { gte: since30 } },
      _count: { _all: true },
    });
    const candidates = recentByUser.filter((r) => r._count._all >= 3).map((r) => r.userId!);
    return candidates;
  }
  return [];
}

/**
 * POST /api/notifications/admin/send-cohort
 * Body: { cohort, title, body, data? }
 */
router.post('/admin/send-cohort', authenticate, isSuperAdmin, async (req: any, res) => {
  try {
    const { cohort, title, body, data } = z.object({
      cohort: z.enum(['inactive_30d', 'new_users_7d', 'active_repeaters']),
      title: z.string().min(1),
      body: z.string().min(1),
      data: z.record(z.any()).optional(),
    }).parse(req.body);

    const userIds = await resolveCohortUserIds(cohort);
    const queueOptions = adminPushQueueOptions(req, `cohort:${cohort}`);
    let totalCount = 0;
    let errorsAccumulated = 0;
    let firstError: string | null = null;
    for (const userId of userIds) {
      try {
        const r = await sendToUser(userId, title, body, data, queueOptions);
        totalCount += r.count || 0;
        if (!r.success && !firstError) firstError = r.error || null;
        if (r.errors) errorsAccumulated += r.errors;
      } catch (e: any) {
        if (!firstError) firstError = e?.message || 'unknown';
      }
    }

    await (prisma as any).pushLog.create({
      data: {
        target: 'cohort',
        cohort,
        title,
        body,
        deeplink: data?.deeplink as string | undefined ?? null,
        count: totalCount,
        success: !firstError && errorsAccumulated === 0,
        error: firstError || (errorsAccumulated > 0 ? `${errorsAccumulated} ticket errors` : null),
        sentBy: req.user?.id ?? null,
      },
    });

    res.json({ cohort, recipients: userIds.length, count: totalCount, errors: errorsAccumulated, firstError });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Felaktig input', details: error.errors });
    }
    console.error('Admin push (cohort) error:', error);
    res.status(500).json({ error: 'Kunde inte skicka cohort-push' });
  }
});

/**
 * POST /api/notifications/admin/schedule
 * Body: { scheduledFor: ISO, target, identifier?, city?, cohort?, title, body, data? }
 * Stores the push for dispatch by the background loop in index.ts.
 */
router.post('/admin/schedule', authenticate, isSuperAdmin, async (req: any, res) => {
  try {
    const { scheduledFor, target, identifier, city, cohort, title, body, data } = z.object({
      scheduledFor: z.string().min(1),
      target: z.enum(['all', 'user', 'city', 'cohort']),
      identifier: z.string().optional(),
      city: z.string().optional(),
      cohort: z.enum(['inactive_30d', 'new_users_7d', 'active_repeaters']).optional(),
      title: z.string().min(1),
      body: z.string().min(1),
      data: z.record(z.any()).optional(),
    }).parse(req.body);

    const when = new Date(scheduledFor);
    if (Number.isNaN(when.getTime())) {
      return res.status(400).json({ error: 'Ogiltigt scheduledFor-datum' });
    }
    if (when.getTime() < Date.now() - 60_000) {
      return res.status(400).json({ error: 'scheduledFor måste vara i framtiden' });
    }

    const row = await (prisma as any).scheduledPush.create({
      data: {
        scheduledFor: when,
        target,
        identifier: target === 'user' ? identifier ?? null : null,
        city: target === 'city' ? city ?? null : null,
        cohort: target === 'cohort' ? cohort ?? null : null,
        title,
        body,
        deeplink: (data?.deeplink as string | undefined) ?? null,
        createdBy: req.user?.id ?? null,
      },
    });
    res.status(201).json(row);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Felaktig input', details: error.errors });
    }
    console.error('Schedule push error:', error);
    res.status(500).json({ error: 'Kunde inte schemalägga push' });
  }
});

/**
 * GET /api/notifications/admin/scheduled
 * List of upcoming + recently-sent scheduled pushes
 */
router.get('/admin/scheduled', authenticate, isSuperAdmin, async (_req, res) => {
  try {
    const rows = await (prisma as any).scheduledPush.findMany({
      orderBy: { scheduledFor: 'desc' },
      take: 100,
    });
    res.json({ rows });
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte hämta schemalagda pushar' });
  }
});

/**
 * POST /api/notifications/admin/scheduled/:id/cancel
 */
router.post('/admin/scheduled/:id/cancel', authenticate, isSuperAdmin, async (req, res) => {
  try {
    await (prisma as any).scheduledPush.update({
      where: { id: req.params.id },
      data: { cancelledAt: new Date() },
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Kunde inte avboka push' });
  }
});

export default router;
