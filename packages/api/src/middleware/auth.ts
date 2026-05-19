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
    restaurant = await prisma.restaurant.findUnique({
      where: { id: payload.restaurantId },
      select: { id: true, slug: true, name: true, logoutCode: true },
    });
  }

  if (!restaurant && payload.restaurantSlug) {
    restaurant = await prisma.restaurant.findFirst({
      where: { slug: payload.restaurantSlug },
      select: { id: true, slug: true, name: true, logoutCode: true },
    });
  }

  if (!restaurant) {
    const loginKey = (admin.email || '').toLowerCase();
    const restaurants = await prisma.restaurant.findMany({
      select: { id: true, slug: true, name: true, adminEmail: true, logoutCode: true },
    });
    const lookup = buildRestaurantAdminLoginLookup(restaurants);
    const matched = lookup.get(loginKey) || null;

    restaurant = matched
      ? { id: matched.id, slug: matched.slug, name: matched.name, logoutCode: matched.logoutCode ?? null }
      : null;
  }

  return {
    restaurantId: restaurant?.id ?? null,
    restaurantSlug: restaurant?.slug ?? null,
    restaurantName: restaurant?.name ?? null,
    logoutCode: restaurant?.logoutCode ?? null,
  };
};

export const resolveAdminSessionFromToken = async (token: string) => {
  const payload = jwt.verify(token, JWT_SECRET) as AdminJwtPayload & { tokenVersion?: number };

  const admin = await prisma.adminUser.findFirst({
    where: { id: payload.id, isActive: true },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });

  if (!admin) {
    return null;
  }

  // A5 — reject tokens issued before the admin's tokenVersion was bumped.
  // Tokens missing the field (issued before this migration) are treated as
  // version 0. We do a second tiny lookup to keep TS happy without casting
  // the parameterized findFirst result.
  if (typeof payload.tokenVersion === 'number') {
    const versionRow = await prisma.adminUser.findUnique({
      where: { id: admin.id },
      select: { tokenVersion: true } as any,
    });
    const adminVersion = (versionRow as any)?.tokenVersion ?? 0;
    if (payload.tokenVersion !== adminVersion) {
      return null;
    }
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
    logoutCode: scope.logoutCode ?? null,
  };
};

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Prioritet: HttpOnly cookie först (säker mot XSS), sedan Authorization
  // header som fallback för bakåt-kompatibilitet med klienter som ännu inte
  // migrerats till cookie-baserad auth.
  const cookieToken = (req as any).cookies?.admin_token as string | undefined;
  const authHeader = req.headers.authorization;
  const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
  const token = cookieToken || headerToken;

  if (!token) {
    res.status(401).json({ error: 'Ingen autentiseringstoken' });
    return;
  }

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

// RBAC-rolle-matrix (gäller efter `authenticate`):
//   - SUPER_ADMIN: allt
//   - ADMIN / RESTAURANT_ADMIN: allt inom egen restaurang (read + write + delete)
//   - STAFF: read + write inom egen restaurang, INTE delete eller resurs-skapande
//   - VIEWER: bara read inom egen restaurang
//
// Routes ska blockera baserat på roll:
//   - GET (read): alla roller passerar genom requireAnyAdmin
//   - POST/PATCH (write): kräver requireWriteAccess (block VIEWER)
//   - DELETE: kräver requireDeleteAccess (block STAFF + VIEWER)
const WRITE_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'RESTAURANT_ADMIN', 'STAFF']);
const DELETE_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'RESTAURANT_ADMIN']);

export const requireWriteAccess = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void => {
  const role = req.admin?.role;
  if (!role || !WRITE_ROLES.has(role)) {
    res.status(403).json({ error: 'Du har inte rättigheter att utföra denna ändring' });
    return;
  }
  next();
};

export const requireDeleteAccess = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void => {
  const role = req.admin?.role;
  if (!role || !DELETE_ROLES.has(role)) {
    res.status(403).json({ error: 'Bara administratörer kan radera resurser' });
    return;
  }
  next();
};

// Auto-RBAC baserat på HTTP-method. Applicera på router för en hel modul
// (ex. router.use(autoRoleGate)) så att alla routes får default-skydd.
export const autoRoleGate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void => {
  const method = req.method.toUpperCase();
  const role = req.admin?.role;

  // Auth-middleware körs separat och sätter req.admin — saknas det = inte
  // autentiserad och vi släpper genom så att caller kan returnera 401.
  // (Detta middleware körs ALLTID efter authenticate.)
  if (!role) {
    res.status(401).json({ error: 'Inte autentiserad' });
    return;
  }

  if (method === 'DELETE' && !DELETE_ROLES.has(role)) {
    res.status(403).json({ error: 'Bara administratörer kan radera resurser' });
    return;
  }
  if ((method === 'POST' || method === 'PATCH' || method === 'PUT') && !WRITE_ROLES.has(role)) {
    res.status(403).json({ error: 'Du har inte rättigheter att utföra denna ändring' });
    return;
  }
  next();
};
