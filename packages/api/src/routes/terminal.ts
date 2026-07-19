import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { JWT_SECRET } from '../lib/config';
import { authenticate, AuthRequest } from '../middleware/auth';
import { getIO } from '../lib/socket';
import { notifyPartnerDevicesOfNewOrder } from '../lib/partnerFcm';
import { deleteServerTerminalTestOrder } from '../lib/terminalTestOrder';
import { getStandaloneTestPrintArtifact } from '../lib/serverPrintArtifact';

// ── Terminal-sessioner för restaurang-appen (Flutter) ───────────────────────
//
// Modell: en platta paras med en pairing-kod (genererad av super-admin i
// admin-panelen) och binds till restaurangen via sitt stabila device-id
// (ANDROID_ID). Sessionen kräver dessutom en refresh-token i Androids säkra
// lagring. På Android kan en känd, ej återkallad terminal återställa sessionen
// efter ominstallation via samma ANDROID_ID; admin kan fortfarande spärra den
// omedelbart genom revoke/delete.
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

const refreshTokenMatches = (plain: string | undefined, expectedHash: string | null | undefined) => {
  if (!plain || !expectedHash) return false;
  const actual = Buffer.from(sha256(plain), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};

// Säkerställ att restaurangen har ett AdminUser-konto som terminalen agerar
// som (för att återanvända befintlig RBAC + restaurang-scoping). Skapar ett
// minimalt konto med slumpat internt lösen om inget finns — lösenordet visas
// aldrig och behövs aldrig (parning sker med kod, inte lösen).
async function ensureRestaurantAdminUser(restaurantId: string) {
  const restaurant = await prisma.restaurant.findFirst({
    where: { id: restaurantId, archivedAt: null },
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

function issueAccessToken(admin: any, restaurant: { id: string; slug: string }, deviceId: string) {
  return jwt.sign(
    {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      restaurantId: restaurant.id,
      restaurantSlug: restaurant.slug,
      tokenVersion: admin.tokenVersion ?? 0,
      deviceId,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TTL },
  );
}

function terminalSessionPayload(
  ensured: Awaited<ReturnType<typeof ensureRestaurantAdminUser>>,
  deviceId: string,
  refreshToken: string,
) {
  if (!ensured) throw new Error('restaurant_admin_missing');
  return {
    accessToken: issueAccessToken(ensured.admin, ensured.restaurant, deviceId),
    refreshToken,
    restaurant: {
      id: ensured.restaurant.id,
      name: ensured.restaurant.name,
      slug: ensured.restaurant.slug,
    },
    admin: {
      id: ensured.admin.id,
      email: ensured.admin.email,
      role: ensured.admin.role,
      name: ensured.restaurant.name,
      restaurantId: ensured.restaurant.id,
      restaurantSlug: ensured.restaurant.slug,
    },
    serverTime: new Date(),
  };
}

async function rotateTerminalSession(input: {
  deviceId: string;
  restaurantId: string;
  pushToken?: string;
}) {
  const device = await (prisma as any).restaurantDevice.findUnique({
    where: { deviceId: input.deviceId },
  });
  if (!device || device.revoked || device.restaurantId !== input.restaurantId) {
    return null;
  }
  const ensured = await ensureRestaurantAdminUser(input.restaurantId);
  if (!ensured) return null;
  const refreshToken = crypto.randomBytes(48).toString('hex');
  await (prisma as any).restaurantDevice.update({
    where: { deviceId: input.deviceId },
    data: {
      refreshTokenHash: sha256(refreshToken),
      lastSeenAt: new Date(),
      pushToken: input.pushToken ?? undefined,
    },
  });
  return terminalSessionPayload(ensured, input.deviceId, refreshToken);
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
      // Idempotent recovery: om första /pair faktiskt hann binda SAMMA enhet
      // men svaret försvann på vägen, får just den enheten nya tokens genom att
      // skicka samma kod igen. En annan enhet får aldrig återanvända koden.
      const alreadyPaired = await (prisma as any).restaurantDevice.findUnique({
        where: { deviceId: String(deviceId) },
      });
      if (
        alreadyPaired &&
        !alreadyPaired.revoked &&
        alreadyPaired.restaurantId === pairing.restaurantId
      ) {
        const recovered = await rotateTerminalSession({
          deviceId: String(deviceId),
          restaurantId: pairing.restaurantId,
          pushToken,
        });
        if (!recovered) return res.status(404).json({ error: 'Restaurang hittades inte' });
        console.info('[terminal/pair] recovered same device after ambiguous response', {
          pairingId: pairing.id,
          device: String(deviceId).slice(0, 8),
        });
        return res.json(recovered);
      }
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
    const claimed = await prisma.$transaction(async (tx: any) => {
      // Atomisk single-use-claim: två samtidiga enheter kan inte båda vinna
      // samma kod mellan findUnique och update.
      const claim = await tx.devicePairingCode.updateMany({
        where: { id: pairing.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claim.count !== 1) return false;

      await tx.restaurantDevice.upsert({
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
      return true;
    });

    if (!claimed) {
      // Någon hann claima koden. Tillåt endast idempotent retry från samma
      // device; övriga får ett tydligt single-use-svar.
      const recovered = await rotateTerminalSession({
        deviceId: String(deviceId),
        restaurantId: pairing.restaurantId,
        pushToken,
      }).catch(() => null);
      if (recovered) return res.json(recovered);
      return res.status(409).json({
        error: 'Parningskoden har redan använts.',
        code: 'PAIRING_CODE_USED',
        serverTime: new Date(),
      });
    }

    res.json(terminalSessionPayload(ensured, String(deviceId), refreshToken));
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
    const { deviceId, refreshToken, pushToken } = (req.body || {}) as {
      deviceId?: string; refreshToken?: string; pushToken?: string;
    };
    if (!deviceId) return res.status(400).json({ error: 'deviceId krävs' });

    const device = await (prisma as any).restaurantDevice.findUnique({
      where: { deviceId: String(deviceId) },
    });
    if (!device) return res.status(404).json({ error: 'needs_pairing' });
    if (device.revoked) return res.status(403).json({ error: 'device_revoked' });

    const reinstallRecovery = !refreshToken;
    if (!reinstallRecovery && !refreshTokenMatches(refreshToken, device.refreshTokenHash)) {
      console.warn('[terminal/session] rejected invalid refresh token', {
        device: String(deviceId).slice(0, 8),
        hasToken: Boolean(refreshToken),
      });
      return res.status(401).json({
        error: 'needs_pairing',
        code: 'TERMINAL_SESSION_INVALID',
      });
    }

    // Normalfallet använder roterande refresh-token. Om appen har installerats
    // om saknas token helt, men Androids app-signaturskopade ANDROID_ID består.
    // Då får endast en redan känd och ej återkallad fysisk terminal en ny
    // session. Ett felaktigt BEFINTLIGT tokenvärde tillåts aldrig denna väg.
    const rotated = await rotateTerminalSession({
      deviceId: String(deviceId),
      restaurantId: device.restaurantId,
      pushToken: pushToken ?? device.pushToken ?? undefined,
    });
    if (!rotated) return res.status(404).json({ error: 'needs_pairing' });
    if (reinstallRecovery) {
      console.info('[terminal/session] restored known device after reinstall', {
        device: String(deviceId).slice(0, 8),
        restaurantId: device.restaurantId,
      });
    }
    res.json(rotated);
  } catch (error) {
    console.error('[terminal/session] error:', error);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// GET /api/terminal/print-test-artifact
// Fristående testutskrift från skrivarinställningarna. Skapar ingen Order och
// skickar inga sockets/pushar; den använder bara samma Admin-mall/renderare.
router.get('/print-test-artifact', authenticate, async (req: AuthRequest, res) => {
  try {
    const restaurantId = req.admin?.restaurantId;
    if (!restaurantId) return res.status(403).json({ error: 'Terminalen saknar restaurangkoppling' });
    const bytes = await getStandaloneTestPrintArtifact(restaurantId, req.query.paperWidth);
    if (!bytes) return res.status(404).json({ error: 'Restaurangen hittades inte' });
    res.setHeader('Content-Type', 'application/vnd.viaeats.escpos');
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-ViaEats-Print-Source', 'admin-template-test');
    return res.send(bytes);
  } catch (error) {
    console.error('[terminal/print-test-artifact] error:', error);
    return res.status(500).json({ error: 'Kunde inte skapa testutskriften' });
  }
});

// POST /api/terminal/test-order
// Skapar en riktig serverorder och skickar den genom samma Socket.IO-rum som
// produktion. Den markeras tydligt som test så rapporter/utbetalningar kan
// exkludera den, men kan accepteras och server-renderas till skrivaren precis
// som en vanlig beställning. Detta är separat från fristående testutskrift.
router.post('/test-order', authenticate, async (req: AuthRequest, res) => {
  try {
    const restaurantId = req.admin?.restaurantId;
    if (!restaurantId) return res.status(403).json({ error: 'Terminalen saknar restaurangkoppling' });

    const product = await prisma.product.findFirst({
      where: {
        isActive: true,
        category: { restaurantId },
      },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, name: true, price: true, vatPercent: true },
    });
    if (!product) return res.status(409).json({ error: 'Restaurangen saknar en aktiv produkt för testbeställningen' });

    const now = new Date();
    const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
    const orderNumber = `TEST-${now.getTime().toString(36).toUpperCase()}-${suffix}`;
    const order = await prisma.order.create({
      data: {
        orderNumber,
        status: 'PENDING',
        type: 'PICKUP',
        customerName: 'SERVERTEST',
        customerPhone: '0700000000',
        total: product.price,
        deliveryFee: 0,
        discountAmount: 0,
        foodVatPercent: product.vatPercent ?? 6,
        restaurantId,
        paymentProvider: 'stripe',
        paymentStatus: 'PAID',
        paymentMethod: 'TEST',
        stripePaymentIntentId: 'TEST_PAYMENT',
        discountCode: 'testa',
        estimatedTime: 10,
        note: 'SERVERGENERERAD TESTBESTÄLLNING',
        allergens: '[]',
        items: {
          create: [{
            productId: product.id,
            productName: product.name,
            basePrice: product.price,
            quantity: 1,
            subtotal: product.price,
            vatPercent: product.vatPercent ?? 6,
            selectedExtras: '[]',
          }],
        },
      },
      include: { items: true, restaurant: true },
    });

    const orderForTerminal = {
      ...order,
      total: order.total / 100,
      deliveryFee: order.deliveryFee / 100,
      discountAmount: order.discountAmount / 100,
      items: order.items.map((item) => ({
        ...item,
        basePrice: item.basePrice / 100,
        subtotal: item.subtotal / 100,
      })),
      restaurantName: order.restaurant?.name || 'Okänd restaurang',
    };
    // Tyst leverans: bara restaurangens eget rum (terminalen) + FCM till
    // enheten. Globala admin-rummet får ALDRIG testordrar — de ska inte synas
    // i admin-webben eller trigga ordernotiser.
    getIO().to(`admin-room:${restaurantId}`).emit('order:new', { ...orderForTerminal, isTestOrder: true });
    void notifyPartnerDevicesOfNewOrder({
      restaurantId,
      orderId: order.id,
      orderNumber: order.orderNumber,
    });
    res.status(201).json({ success: true, order: orderForTerminal, source: 'server' });
  } catch (error) {
    console.error('[terminal/test-order] error:', error);
    res.status(500).json({ error: 'Kunde inte skapa testbeställningen på servern' });
  }
});

// DELETE /api/terminal/test-order/:id
// Explicit cleanup for a server test order. The standalone print-settings test
// never creates an Order and therefore never calls this route.
router.delete('/test-order/:id', authenticate, async (req: AuthRequest, res) => {
  try {
    const restaurantId = req.admin?.restaurantId;
    if (!restaurantId) return res.status(403).json({ error: 'Terminalen saknar restaurangkoppling' });
    const order = await prisma.order.findFirst({
      where: {
        id: req.params.id,
        restaurantId,
        orderNumber: { startsWith: 'TEST-' },
        customerName: 'SERVERTEST',
        stripePaymentIntentId: 'TEST_PAYMENT',
        paymentMethod: 'TEST',
      },
      select: { id: true },
    });
    if (!order) return res.status(404).json({ error: 'Testbeställningen hittades inte' });
    const deleted = await deleteServerTerminalTestOrder(order.id);
    if (!deleted) return res.status(409).json({ error: 'Testbeställningen kunde inte raderas' });
    getIO().to(`admin-room:${restaurantId}`).emit('order:deleted', { orderId: order.id, testOrder: true });
    return res.json({ success: true, id: order.id });
  } catch (error) {
    console.error('[terminal/test-order/delete] error:', error);
    return res.status(500).json({ error: 'Kunde inte radera testbeställningen' });
  }
});

// POST /api/terminal/push-token
// Registrerar FCM-token på EXAKT den autentiserade terminalen. Access-token,
// device-id och roterande refresh-token måste alla stämma, så en annan terminal
// i samma restaurang kan inte skriva över dess pushadress.
router.post('/push-token', authenticate, async (req: AuthRequest, res) => {
  try {
    const { deviceId, refreshToken, pushToken } = (req.body || {}) as {
      deviceId?: string;
      refreshToken?: string;
      pushToken?: string;
    };
    if (!deviceId || !pushToken) {
      return res.status(400).json({ error: 'deviceId och pushToken krävs' });
    }
    const device = await (prisma as any).restaurantDevice.findUnique({
      where: { deviceId: String(deviceId) },
    });
    if (
      !device ||
      device.revoked ||
      device.restaurantId !== req.admin?.restaurantId ||
      !refreshTokenMatches(refreshToken, device.refreshTokenHash)
    ) {
      return res.status(403).json({ error: 'Ogiltig terminalsession' });
    }
    await (prisma as any).restaurantDevice.update({
      where: { id: device.id },
      data: { pushToken: String(pushToken), lastSeenAt: new Date() },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('[terminal/push-token] error:', error);
    res.status(500).json({ error: 'Kunde inte registrera push-token' });
  }
});

export default router;
