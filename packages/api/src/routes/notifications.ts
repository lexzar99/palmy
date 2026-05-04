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

export default router;
