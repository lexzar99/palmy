import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { buildRestaurantAdminLoginLookup } from '../lib/adminLogin';
import { JWT_SECRET } from '../lib/config';

export interface AuthRequest extends Request {
  admin?: {
    id: string;
    email: string;
    name?: string;
    role: string;
    restaurantId?: string | null;
    restaurantSlug?: string | null;
    restaurantName?: string | null;
  };
}

interface AdminJwtPayload {
  id: string;
  email: string;
  role: string;
  restaurantId?: string | null;
  restaurantSlug?: string | null;
}

type AdminRecord = {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
};

const getRestaurantScope = async (admin: AdminRecord, payload: AdminJwtPayload) => {
  if (admin.role === 'SUPER_ADMIN') {
    return {
      restaurantId: null,
      restaurantSlug: null,
      restaurantName: null,
    };
  }

  let restaurant = null;

  if (payload.restaurantId) {
    restaurant = await (prisma.restaurant as any).findUnique({
      where: { id: payload.restaurantId },
      select: { id: true, slug: true, name: true, logoutCode: true },
    });
  }

  if (!restaurant && payload.restaurantSlug) {
    restaurant = await (prisma.restaurant as any).findFirst({
      where: { slug: payload.restaurantSlug },
      select: { id: true, slug: true, name: true, logoutCode: true },
    });
  }

  if (!restaurant) {
    const loginKey = (admin.email || '').toLowerCase();
    const restaurants = await (prisma.restaurant as any).findMany({
      select: { id: true, slug: true, name: true, adminEmail: true, logoutCode: true },
    });
    const lookup = buildRestaurantAdminLoginLookup(restaurants);
    const matched = lookup.get(loginKey) || null;

    restaurant = matched
      ? { id: matched.id, slug: matched.slug, name: matched.name, logoutCode: matched.logoutCode ?? null }
      : null;
  }

  return {
    restaurantId: (restaurant as any)?.id ?? null,
    restaurantSlug: (restaurant as any)?.slug ?? null,
    restaurantName: (restaurant as any)?.name ?? null,
    logoutCode: (restaurant as any)?.logoutCode ?? null,
  };
};

export const resolveAdminSessionFromToken = async (token: string) => {
  const payload = jwt.verify(token, JWT_SECRET) as AdminJwtPayload;

  const admin = await prisma.adminUser.findFirst({
    where: { id: payload.id, isActive: true },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  if (!admin) {
    return null;
  }

  const scope = await getRestaurantScope(admin, payload);

  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    restaurantId: scope.restaurantId,
    restaurantSlug: scope.restaurantSlug,
    restaurantName: scope.restaurantName,
    logoutCode: (scope as any).logoutCode ?? null,
  };
};

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
    const admin = await resolveAdminSessionFromToken(token);

    if (!admin) {
      res.status(401).json({ error: 'Ogiltig token' });
      return;
    }

    req.admin = admin;
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
