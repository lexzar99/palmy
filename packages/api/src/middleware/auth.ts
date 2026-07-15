import jwt from 'jsonwebtoken';
import { adminTokenVersionMatches } from '../lib/adminSessionVersion';
import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { buildRestaurantAdminLoginLookup } from '../lib/adminLogin';
import { JWT_SECRET } from '../lib/config';
import { adminSessionTokenFromRequest } from '../lib/adminSessionVerification';

export interface AuthRequest extends Request {
  admin?: {
    id: string;
    email: string;
    name?: string;
    role: string;
    restaurantId?: string | null;
    restaurantSlug?: string | null;
    restaurantName?: string | null;
    deviceId?: string | null;
  };
}

interface AdminJwtPayload {
  id: string;
  email: string;
  role: string;
  restaurantId?: string | null;
  restaurantSlug?: string | null;
  deviceId?: string | null;
}

type AdminRecord = {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
};

const getRestaurantScope = async (admin: AdminRecord, payload: AdminJwtPayload) => {
  // GLOBAL_VIEWER/MENU_AGENT: systemkonton utan restaurang-koppling, samma
  // (tomma) scope som SUPER_ADMIN. Writes gates av autoRoleGate nedan.
  if (admin.role === 'SUPER_ADMIN' || admin.role === 'GLOBAL_VIEWER' || admin.role === 'MENU_AGENT' || admin.role === 'GROWTH_AGENT') {
    return {
      restaurantId: null,
      restaurantSlug: null,
      restaurantName: null,
    };
  }

  let restaurant = null;

  if (payload.restaurantId) {
    restaurant = await prisma.restaurant.findFirst({
      where: { id: payload.restaurantId, archivedAt: null },
      select: { id: true, slug: true, name: true, logoutCode: true },
    });
  }

  if (!restaurant && payload.restaurantSlug) {
    restaurant = await prisma.restaurant.findFirst({
      where: { slug: payload.restaurantSlug, archivedAt: null },
      select: { id: true, slug: true, name: true, logoutCode: true },
    });
  }

  if (!restaurant) {
    const loginKey = (admin.email || '').toLowerCase();
    const restaurants = await prisma.restaurant.findMany({
      where: { archivedAt: null },
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

  // Terminal-JWT:er bär deviceId. Kontrollera enhetsbindningen vid varje ny
  // HTTP-/Socket-session så en revokad eller flyttad restaurangplatta inte kan
  // fortsätta använda en ännu giltig 24h-token.
  if (payload.deviceId) {
    const device = await prisma.restaurantDevice.findUnique({
      where: { deviceId: payload.deviceId },
      select: { restaurantId: true, revoked: true },
    });
    if (
      !device ||
      device.revoked ||
      !payload.restaurantId ||
      device.restaurantId !== payload.restaurantId
    ) {
      return null;
    }
  }

  // A5 — reject tokens issued before the admin's tokenVersion was bumped.
  // Tokens missing the field (issued before this migration) are treated as
  // version 0. We do a second tiny lookup to keep TS happy without casting
  // the parameterized findFirst result.
  const versionRow = await prisma.adminUser.findUnique({
    where: { id: admin.id },
    select: { tokenVersion: true } as any,
  });
  const adminVersion = (versionRow as any)?.tokenVersion ?? 0;
  if (!adminTokenVersionMatches(payload.tokenVersion, adminVersion)) {
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
    logoutCode: scope.logoutCode ?? null,
    deviceId: payload.deviceId ?? null,
  };
};

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Prioritet: HttpOnly cookie först (säker mot XSS), sedan Authorization
  // header som fallback för bakåt-kompatibilitet med klienter som ännu inte
  // migrerats till cookie-baserad auth. Samma väljare används av /verify så
  // dashboardens auktoritativa sessionskontroll inte skiljer sig från resten.
  const token = adminSessionTokenFromRequest(req);

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

// Drift-/hälsodata: läsbar för SUPER_ADMIN och GLOBAL_VIEWER (Falken).
// Svaren innehåller aldrig nyckelvärden — bara status, mätvärden och counters.
export const requireOpsViewer = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const role = req.admin?.role;
  if (role !== 'SUPER_ADMIN' && role !== 'GLOBAL_VIEWER') {
    res.status(403).json({ error: 'Kräver super admin- eller viewer-behörighet' });
    return;
  }
  next();
};

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

// MENU_AGENT ("Kocken"/"Studion", Hermes-menyagenterna): får ENDAST skapa/ändra
// meny-resurser + ladda upp produktbilder, aldrig radera. Det inre låset (bara
// utkast-restauranger, draft=true) enforceas av menuAgentDraftGate i
// routes/admin.ts (meny-resurser) och i upload-routen (bilder). Det här är
// yttre skalet som stänger resten av admin-modulen.
// upload-r2 släpps igenom hit men draft-scopeas i upload-routen (multipart-
// body parsas inte förrän där), inte i menuAgentDraftGate.
const MENU_AGENT_WRITE_PATHS = /^\/(categories|products|extra-groups|extras|upload-r2)(\/|$)/;

// GROWTH_AGENT ("Torget", Hermes-tillväxtagenten): får skapa/ändra deals,
// kupongkoder, per-kund-deals + meny-resurser (även på LIVE-restauranger),
// aldrig radera. Pengar-backstop: deals/kuponger/nya produkter FÖDS inaktiva
// (isActive=false) och bara SUPER_ADMIN kan aktivera (enforceas i handlers).
// GROWTH_AGENT får ALDRIG köra kampanjmotorn (massutskick) eller röra
// settings/personal/återbetalningar.
const GROWTH_AGENT_WRITE_PATHS = /^\/(deals|discounts|customer-deals|products|categories|extra-groups|extras|upload-r2)(\/|$)/;

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

  if (role === 'GROWTH_AGENT' && method !== 'GET') {
    if (method === 'DELETE' || !GROWTH_AGENT_WRITE_PATHS.test(req.path)) {
      res.status(403).json({ error: 'Tillväxtagenten får bara skapa/ändra deals, kuponger och meny-resurser' });
      return;
    }
    next();
    return;
  }

  if (role === 'MENU_AGENT' && method !== 'GET') {
    const canDeleteApprovedResource = method === 'DELETE' && /^\/extra-groups\/[^/]+$/.test(req.path);
    if ((!canDeleteApprovedResource && method === 'DELETE') || !MENU_AGENT_WRITE_PATHS.test(req.path)) {
      res.status(403).json({ error: 'Menyagenten får bara skapa och ändra meny-resurser' });
      return;
    }
    next();
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
