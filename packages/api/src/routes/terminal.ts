import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { JWT_SECRET } from '../lib/config';

// ── Terminal-sessioner för restaurang-appen (Flutter) ───────────────────────
//
// Modell: en platta paras EN gång med en pairing-kod (genererad av super-admin
// i admin-panelen) och binds till restaurangen via sitt stabila device-id
// (ANDROID_ID). Bindningen lever på servern (RestaurantDevice) — alltså
// överlever den app-ominstallation: vid ny installation skickar appen samma
// device-id och får tillbaka nya tokens UTAN att para om.
//
// Tokens: kort access-token (~1h, samma form som vanlig admin-JWT så alla
// /api/admin-endpoints fungerar oförändrat) + en roterande refresh-token vars
// hash lagras på enheten. Endast super-admin kan logga ut (revoked=true) en
// enhet — appen själv har ingen utloggning.
const router = Router();

// Längre access-token (24h) håller socket-handshaket levande utan täta
// re-auths. Revokering är ändå omedelbar: admin-revoke bumpar kontots
// tokenVersion → access-token avvisas direkt vid nästa API-anrop.
const ACCESS_TTL = '24h';
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

// Säkerställ att restaurangen har ett AdminUser-konto som terminalen agerar
// som (för att återanvända befintlig RBAC + restaurang-scoping). Skapar ett
// minimalt konto med slumpat internt lösen om inget finns — lösenordet visas
// aldrig och behövs aldrig (parning sker med kod, inte lösen).
async function ensureRestaurantAdminUser(restaurantId: string) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, slug: true, name: true, adminEmail: true, adminUserId: true },
  });
  if (!restaurant) return null;

  const sel = { id: true, email: true, role: true, isActive: true, tokenVersion: true } as any;

  if (restaurant.adminUserId) {
    const linked = await prisma.adminUser.findUnique({ where: { id: restaurant.adminUserId }, select: sel });
    if (linked && (linked as any).isActive) return { restaurant, admin: linked as any };
  }

  const candidateEmails = [restaurant.slug.toLowerCase(), (restaurant.adminEmail || '').toLowerCase()].filter(Boolean);
  let admin: any = await prisma.adminUser.findFirst({
    where: { email: { in: candidateEmails }, isActive: true },
    select: sel,
  });

  if (!admin) {
    const randomPw = crypto.randomBytes(24).toString('hex');
    const hash = await bcrypt.hash(randomPw, 10);
    admin = await prisma.adminUser.create({
      data: {
        email: restaurant.slug.toLowerCase(),
        password: hash,
        name: restaurant.name,
        role: 'RESTAURANT_ADMIN',
        isActive: true,
      },
      select: sel,
    });
  }

  // Skriv deterministisk FK så framtida uppslag går direkt.
  if (restaurant.adminUserId !== admin.id) {
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: { adminUserId: admin.id, adminEmail: admin.email },
    });
  }

  return { restaurant, admin };
}

function issueAccessToken(admin: any, restaurant: { id: string; slug: string }) {
  return jwt.sign(
    {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      restaurantId: restaurant.id,
      restaurantSlug: restaurant.slug,
      tokenVersion: admin.tokenVersion ?? 0,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TTL },
  );
}

// POST /api/terminal/pair  { code, deviceId, pushToken?, label? }
// Engångsparning. Binder device-id → restaurang och returnerar tokens.
router.post('/pair', async (req, res) => {
  try {
    const { code, deviceId, pushToken, label } = (req.body || {}) as {
      code?: string; deviceId?: string; pushToken?: string; label?: string;
    };
    if (!code || !deviceId) {
      return res.status(400).json({ error: 'code och deviceId krävs' });
    }

    const normalizedCode = String(code).replace(/\s+/g, '').toUpperCase();
    const now = new Date();
    const pairing = await (prisma as any).devicePairingCode.findUnique({
      where: { code: normalizedCode },
    });
    if (!pairing) {
      console.warn('[terminal/pair] rejected', {
        reason: 'not_found',
        device: String(deviceId).slice(0, 8),
      });
      return res.status(400).json({
        error: 'Parningskoden finns inte. Kontrollera koden i admin.',
        code: 'PAIRING_CODE_NOT_FOUND',
        serverTime: now,
      });
    }
    if (pairing.usedAt) {
      console.warn('[terminal/pair] rejected', {
        reason: 'already_used',
        pairingId: pairing.id,
        device: String(deviceId).slice(0, 8),
      });
      return res.status(409).json({
        error: 'Parningskoden har redan använts.',
        code: 'PAIRING_CODE_USED',
        serverTime: now,
      });
    }
    if (pairing.expiresAt <= now) {
      console.warn('[terminal/pair] rejected', {
        reason: 'expired',
        pairingId: pairing.id,
        expiredAt: pairing.expiresAt,
        serverTime: now,
        device: String(deviceId).slice(0, 8),
      });
      return res.status(410).json({
        error: 'Parningskoden har gått ut. Generera en ny kod i admin.',
        code: 'PAIRING_CODE_EXPIRED',
        expiresAt: pairing.expiresAt,
        serverTime: now,
      });
    }

    const ensured = await ensureRestaurantAdminUser(pairing.restaurantId);
    if (!ensured) return res.status(404).json({ error: 'Restaurang hittades inte' });

    const refreshToken = crypto.randomBytes(48).toString('hex');
    await (prisma as any).restaurantDevice.upsert({
      where: { deviceId: String(deviceId) },
      update: {
        restaurantId: pairing.restaurantId,
        revoked: false,
        refreshTokenHash: sha256(refreshToken),
        pushToken: pushToken ?? undefined,
        label: label ?? undefined,
        lastSeenAt: new Date(),
      },
      create: {
        deviceId: String(deviceId),
        restaurantId: pairing.restaurantId,
        revoked: false,
        refreshTokenHash: sha256(refreshToken),
        pushToken: pushToken ?? null,
        label: label ?? null,
        lastSeenAt: new Date(),
      },
    });
    await (prisma as any).devicePairingCode.update({
      where: { id: pairing.id },
      data: { usedAt: new Date() },
    });

    const accessToken = issueAccessToken(ensured.admin, ensured.restaurant);
    res.json({
      accessToken,
      refreshToken,
      restaurant: { id: ensured.restaurant.id, name: ensured.restaurant.name, slug: ensured.restaurant.slug },
      admin: {
        id: ensured.admin.id,
        email: ensured.admin.email,
        role: ensured.admin.role,
        name: ensured.restaurant.name,
        restaurantId: ensured.restaurant.id,
        restaurantSlug: ensured.restaurant.slug,
      },
      serverTime: new Date(),
    });
  } catch (error) {
    console.error('[terminal/pair] error:', error);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/terminal/session  { deviceId, refreshToken?, pushToken? }
// Anropas vid varje appstart (även efter ominstallation) + för token-refresh.
//  - okänd enhet  → 404 needs_pairing (appen visar pairing-skärm)
//  - revoked      → 403 device_revoked (appen visar "utloggad av admin")
//  - annars       → roterar refresh-token + returnerar ny access-token
router.post('/session', async (req, res) => {
  try {
    const { deviceId, pushToken } = (req.body || {}) as {
      deviceId?: string; refreshToken?: string; pushToken?: string;
    };
    if (!deviceId) return res.status(400).json({ error: 'deviceId krävs' });

    const device = await (prisma as any).restaurantDevice.findUnique({
      where: { deviceId: String(deviceId) },
    });
    if (!device) return res.status(404).json({ error: 'needs_pairing' });
    if (device.revoked) return res.status(403).json({ error: 'device_revoked' });

    // Den varaktiga identiteten är device-id-bindningen (överlever
    // ominstallation då Keystore/refresh-token rensats). Refresh-token roteras
    // som färskhets-mekanism men är inte en hård grind — annars skulle en
    // 401 härifrån trigga klientens refresh-interceptor som anropar /session
    // igen (loop).
    const ensured = await ensureRestaurantAdminUser(device.restaurantId);
    if (!ensured) return res.status(404).json({ error: 'needs_pairing' });

    const newRefresh = crypto.randomBytes(48).toString('hex');
    await (prisma as any).restaurantDevice.update({
      where: { id: device.id },
      data: {
        refreshTokenHash: sha256(newRefresh),
        lastSeenAt: new Date(),
        pushToken: pushToken ?? device.pushToken,
      },
    });

    const accessToken = issueAccessToken(ensured.admin, ensured.restaurant);
    res.json({
      accessToken,
      refreshToken: newRefresh,
      restaurant: { id: ensured.restaurant.id, name: ensured.restaurant.name, slug: ensured.restaurant.slug },
      admin: {
        id: ensured.admin.id,
        email: ensured.admin.email,
        role: ensured.admin.role,
        name: ensured.restaurant.name,
        restaurantId: ensured.restaurant.id,
        restaurantSlug: ensured.restaurant.slug,
      },
      serverTime: new Date(),
    });
  } catch (error) {
    console.error('[terminal/session] error:', error);
    res.status(500).json({ error: 'Serverfel' });
  }
});

export default router;
