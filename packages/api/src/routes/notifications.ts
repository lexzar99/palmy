import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { sendToAllUsers, sendToUser, sendToCity } from '../lib/notifications';
import { authenticate, isSuperAdmin } from '../middleware/auth';
import { authenticateUser } from './auth';

const router = Router();

/**
 * POST /api/notifications/register
 * Registrerar en push-token för den inloggade *kund*-användaren.
 *
 * Tidigare användes admin-middleware `authenticate` här, vilket gjorde att
 * varje registrering från React Native-appen tystade tillbaka 401 — token
 * sparades aldrig och pushar gick förlorade. Använd `authenticateUser` som
 * accepterar Supabase-JWT (och legacy custom-JWT) för slutkunder.
 */
router.post('/register', authenticateUser, async (req: any, res) => {
  try {
    const { token } = z.object({ token: z.string() }).parse(req.body);

    if (!token.startsWith('ExponentPushToken[')) {
      return res.status(400).json({ error: 'Ogiltig Expo push token' });
    }

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
 * Stores the raw iOS APNs device token (hex) so the backend can hit APNs
 * directly with `apns-collapse-id` (Expo Push doesn't expose that header,
 * which is why every status change otherwise stacks a fresh notification
 * instead of replacing the previous one).
 */
router.post('/register-device', authenticateUser, async (req: any, res) => {
  try {
    const { token } = z.object({ token: z.string() }).parse(req.body);
    if (!/^[a-f0-9]{32,256}$/i.test(token)) {
      return res.status(400).json({ error: 'Ogiltig APNs-token' });
    }
    await (prisma as any).user.update({
      where: { id: req.user.id },
      data: { apnsDeviceToken: token.toLowerCase() }
    });
    res.json({ success: true });
  } catch {
    res.status(400).json({ error: 'Kunde inte registrera APNs-token' });
  }
});

/**
 * POST /api/notifications/admin/send-all
 * Skickar push till alla användare (Endast Super Admin)
 */
router.post('/admin/send-all', authenticate, isSuperAdmin, async (req, res) => {
  try {
    const { title, body, data } = z.object({
      title: z.string().min(1),
      body: z.string().min(1),
      data: z.record(z.any()).optional()
    }).parse(req.body);

    const result = await sendToAllUsers(title, body, data);
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
 * Skickar push till en specifik användare (id, email eller telefon)
 */
router.post('/admin/send-user', authenticate, isSuperAdmin, async (req, res) => {
  try {
    const { identifier, title, body, data } = z.object({
      identifier: z.string().min(1),
      title: z.string().min(1),
      body: z.string().min(1),
      data: z.record(z.any()).optional(),
    }).parse(req.body);

    const result = await sendToUser(identifier, title, body, data);

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
 * Skickar push till alla användare i en stad
 */
router.post('/admin/send-city', authenticate, isSuperAdmin, async (req, res) => {
  try {
    const { city, title, body, data } = z.object({
      city: z.string().min(1),
      title: z.string().min(1),
      body: z.string().min(1),
      data: z.record(z.any()).optional(),
    }).parse(req.body);

    const result = await sendToCity(city, title, body, data);
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Felaktig input', details: error.errors });
    }
    console.error('Admin push (city) error:', error);
    res.status(500).json({ error: 'Kunde inte skicka push-notiser' });
  }
});

export default router;
