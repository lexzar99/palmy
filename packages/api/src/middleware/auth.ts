import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { JWT_SECRET } from '../lib/config';

export interface AuthRequest extends Request {
  admin?: {
    id: string;
    email: string;
    role: string;
    restaurantId?: string | null;
    restaurantSlug?: string | null;
  };
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Ingen autentiseringstoken' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: string };

    const admin = await prisma.adminUser.findFirst({
      where: { id: payload.id, isActive: true },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!admin) {
      res.status(401).json({ error: 'Ogiltig token' });
      return;
    }

    let restaurantId: string | null = null;
    let restaurantSlug: string | null = null;
    if (admin.role !== 'SUPER_ADMIN') {
      // We keep the schema simple: restaurant admins are linked by using the restaurant slug
      // as their "email"/username (e.g. "palmyra", "sushi-nori").
      const slug = (admin.email || '').toLowerCase();
      const restaurant = await prisma.restaurant.findFirst({
        where: { slug },
        select: { id: true, slug: true },
      });
      if (restaurant) {
        restaurantId = restaurant.id;
        restaurantSlug = restaurant.slug;
      }
    }

    req.admin = { id: admin.id, email: admin.email, role: admin.role, restaurantId, restaurantSlug };
    next();
  } catch {
    res.status(401).json({ error: 'Ogiltig eller utgången token' });
  }
};

export const requireSuperAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  if (req.admin?.role !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Kräver super admin-behörighet' });
    return;
  }
  next();
};

export const isSuperAdmin = requireSuperAdmin;
