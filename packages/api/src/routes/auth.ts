import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

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
      // Restaurant admins log in with their restaurant slug (stored in AdminUser.email).
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
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        restaurantId,
        restaurantSlug,
        restaurantName,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
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

export default router;
