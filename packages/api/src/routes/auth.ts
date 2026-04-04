import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

// Middleware for user authentication
export const authenticateUser = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Logga in först' });
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Session utgången' });
  }
};

// GET /api/auth/me - Hämta profil
router.get('/me', authenticateUser, async (req: any, res: any) => {
  try {
    const user = await (prisma as any).user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, phone: true, email: true, address: true, city: true, zip: true }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { identifier, email, password } = req.body as {
      identifier?: string;
      email?: string;
      password?: string;
    };

    const loginId = (identifier || email || '').trim().toLowerCase();
    if (!loginId || !password) {
      res.status(400).json({ error: 'Användarnamn och lösenord krävs' });
      return;
    }

    const admin = await prisma.adminUser.findFirst({
      where: { email: loginId, isActive: true },
    });

    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      res.status(401).json({ error: 'Felaktigt användarnamn eller lösenord' });
      return;
    }

    let restaurantId: string | null = null;
    let restaurantSlug: string | null = null;
    let restaurantName: string | null = null;
    if (admin.role !== 'SUPER_ADMIN') {
      const restaurant = await prisma.restaurant.findFirst({
        where: { slug: admin.email.toLowerCase() },
        select: { id: true, slug: true, name: true },
      });
      if (!restaurant) {
        res.status(403).json({ error: 'Kontot är inte kopplat till en restaurang' });
        return;
      }
      restaurantId = restaurant.id;
      restaurantSlug = restaurant.slug;
      restaurantName = restaurant.name;
    }

    const token = jwt.sign(
      { id: admin.id, email: admin.email, role: admin.role, restaurantId, restaurantSlug },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role, restaurantId, restaurantSlug, restaurantName },
    });
  } catch (error) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/auth/verify - Kontrollera token
router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body;
    const payload = jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: string };
    
    const admin = await prisma.adminUser.findFirst({
      where: { id: payload.id, isActive: true },
      select: { id: true, email: true, name: true, role: true },
    });

    if (!admin) {
      res.status(401).json({ valid: false });
      return;
    }

    let restaurantId: string | null = null;
    let restaurantSlug: string | null = null;
    let restaurantName: string | null = null;
    if (admin.role !== 'SUPER_ADMIN') {
      const restaurant = await prisma.restaurant.findFirst({
        where: { slug: admin.email.toLowerCase() },
        select: { id: true, slug: true, name: true },
      });
      restaurantId = restaurant?.id ?? null;
      restaurantSlug = restaurant?.slug ?? null;
      restaurantName = restaurant?.name ?? null;
    }

    res.json({ valid: true, admin: { ...admin, restaurantId, restaurantSlug, restaurantName } });
  } catch {
    res.json({ valid: false });
  }
});

// POST /api/auth/register-user
router.post('/register-user', async (req, res) => {
  try {
    const { name, phone, password, email } = req.body;
    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'Namn, telefon och lösenord krävs' });
    }
    const existing = await (prisma as any).user.findFirst({
      where: { OR: [{ phone }, { email: email || undefined }] }
    });
    if (existing) {
      return res.status(400).json({ error: 'Telefonnumret eller e-posten används redan' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await (prisma as any).user.create({
      data: { name, phone, email, password: hashedPassword }
    });
    const token = jwt.sign({ id: user.id, phone: user.phone, role: 'USER' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name: user.name, phone: user.phone } });
  } catch (error) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/auth/login-user
router.post('/login-user', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const user = await (prisma as any).user.findFirst({
      where: { OR: [{ phone: identifier }, { email: identifier }], isActive: true }
    });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Felaktigt lösenord eller användare' });
    }
    const token = jwt.sign({ id: user.id, phone: user.phone, role: 'USER' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name: user.name, phone: user.phone } });
  } catch (error) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/auth/oauth-token
router.post('/oauth-token', async (req, res) => {
  try {
    const { email, name, provider, providerId, image } = req.body;
    if (!email) return res.status(400).json({ error: 'E-post krävs' });

    let user = await (prisma as any).user.findFirst({
      where: { OR: [{ email: email.toLowerCase() }, { oauthProvider: provider, oauthId: String(providerId) }] }
    });

    if (!user) {
      user = await (prisma as any).user.create({
        data: {
          email: email.toLowerCase(),
          name: name || email.split('@')[0],
          oauthProvider: provider,
          oauthId: String(providerId),
          image: image || null,
          phone: null,
          password: null,
        }
      });
    } else if (!user.oauthProvider) {
      user = await (prisma as any).user.update({
        where: { id: user.id },
        data: { oauthProvider: provider, oauthId: String(providerId), image: image || user.image }
      });
    }

    const token = jwt.sign({ id: user.id, phone: user.phone, role: 'USER' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name: user.name, phone: user.phone, email: user.email, needsPhone: !user.phone } });
  } catch (error) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// PATCH /api/auth/add-phone
router.patch('/add-phone', authenticateUser, async (req: any, res: any) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Telefonnummer krävs' });
    const existing = await (prisma as any).user.findFirst({ where: { phone } });
    if (existing && existing.id !== req.user.id) {
      return res.status(400).json({ error: 'Det numret används redan' });
    }
    await (prisma as any).user.update({ where: { id: req.user.id }, data: { phone } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

export default router;
