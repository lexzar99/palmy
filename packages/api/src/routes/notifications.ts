import { Router } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { sendToAllUsers } from '../lib/notifications';
import { authenticate, isSuperAdmin } from '../middleware/auth';

const router = Router();

/**
 * POST /api/notifications/register
 * Registrerar en push-token för den inloggade användaren
 */
router.post('/register', authenticate, async (req: any, res) => {
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

export default router;
