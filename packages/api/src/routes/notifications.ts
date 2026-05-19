import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { sendToAllUsers, sendToUser, sendToCity } from '../lib/notifications';
import { authenticate, isSuperAdmin } from '../middleware/auth';
import { authenticateUser } from './auth';

const router = Router();

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
    const { token } = z.object({ token: z.string() }).parse(req.body);

    if (!token.startsWith('ExponentPushToken[')) {
      return res.status(400).json({ error: 'Ogiltig Expo push token' });
    }

    // Steg 1: rensa token från alla andra users så vi inte dubbelräknar
    // samma fysiska enhet. updateMany är säker — träffar inga rader om
    // ingen annan har samma token.
    await prisma.user.updateMany({
      where: { pushToken: token, id: { not: req.user.id } },
      data: { pushToken: null },
    }).catch(() => null);

    // Steg 2: sätt token på inloggade kontot.
    await prisma.user.update({
      where: { id: req.user.id },
      data: { pushToken: token }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: 'Kunde inte registrera token' });
  }
});

/**
 * POST /api/notifications/register-device
 *
 * Samma deduplicering som /register men för iOS APNs device tokens.
 */
router.post('/register-device', authenticateUser, async (req: any, res) => {
  try {
    const { token } = z.object({ token: z.string() }).parse(req.body);
    if (!/^[a-f0-9]{32,256}$/i.test(token)) {
      return res.status(400).json({ error: 'Ogiltig APNs-token' });
    }
    const normalized = token.toLowerCase();

    // Rensa samma APNs-token från alla andra users (logout-glitch fix).
    await (prisma as any).user.updateMany({
      where: { apnsDeviceToken: normalized, id: { not: req.user.id } },
      data: { apnsDeviceToken: null },
    }).catch(() => null);

    await (prisma as any).user.update({
      where: { id: req.user.id },
      data: { apnsDeviceToken: normalized }
    });
    res.json({ success: true });
  } catch {
    res.status(400).json({ error: 'Kunde inte registrera APNs-token' });
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
    await (prisma as any).user.update({
      where: { id: req.user.id },
      data: { pushToken: null, apnsDeviceToken: null },
    });
    res.json({ success: true });
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

    const result = await sendToAllUsers(title, body, data);

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

    const result = await sendToUser(identifier, title, body, data);

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

    const result = await sendToCity(city, title, body, data);

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
    const logs = await (prisma as any).pushLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ logs });
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
      where: { deletedAt: null, createdAt: { lte: since7 }, OR: [{ pushToken: { not: null } }, { apnsDeviceToken: { not: null } }] },
      select: { id: true },
    });
    return (users as any[]).map((u) => u.id).filter((id) => !recentSet.has(id));
  }
  if (cohort === 'new_users_7d') {
    const since7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const users = await (prisma as any).user.findMany({
      where: { deletedAt: null, createdAt: { gte: since7 }, OR: [{ pushToken: { not: null } }, { apnsDeviceToken: { not: null } }] },
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
    let totalCount = 0;
    let errorsAccumulated = 0;
    let firstError: string | null = null;
    for (const userId of userIds) {
      try {
        const r = await sendToUser(userId, title, body, data);
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
