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

// Enhetsmetadata som appen skickar med i pair/session. Sparas så admin ser
// vilken fysisk platta som hör till vilken rad — även när den är utloggad.
type TerminalClientInfo = {
  version?: string;
  model?: string;
  brand?: string;
  osVersion?: string;
};

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};

const cleanText = (value: unknown, max = 160): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;

const finiteNumber = (value: unknown): number | undefined => {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

const cleanScore = (value: unknown): number => {
  const n = Math.round(finiteNumber(value) ?? 0);
  return Math.max(0, Math.min(100, n));
};

function clientMetadataUpdate(client?: TerminalClientInfo) {
  if (!client || typeof client !== 'object') return {};
  return {
    appVersion: cleanText(client.version, 120),
    deviceModel: cleanText(client.model, 120),
    deviceBrand: cleanText(client.brand, 120),
    osVersion: cleanText(client.osVersion, 120),
  };
}

async function rotateTerminalSession(input: {
  deviceId: string;
  restaurantId: string;
  pushToken?: string;
  client?: TerminalClientInfo;
  // true när klienten autentiserade med FÖRRA tokenen (den missade förra
  // svaret). Då behåller vi prev-hashen så samma token funkar tills klienten
  // bevisligen tagit emot en rotation.
  keepPrevHash?: boolean;
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
      prevRefreshTokenHash: input.keepPrevHash
        ? undefined
        : device.refreshTokenHash ?? undefined,
      lastSeenAt: new Date(),
      pushToken: input.pushToken ?? undefined,
      ...clientMetadataUpdate(input.client),
    },
  });
  return terminalSessionPayload(ensured, input.deviceId, refreshToken);
}

// POST /api/terminal/pair  { code, deviceId, pushToken?, label? }
// Engångsparning. Binder device-id → restaurang och returnerar tokens.
router.post('/pair', async (req, res) => {
  try {
    const { code, deviceId, pushToken, label, client } = (req.body || {}) as {
      code?: string; deviceId?: string; pushToken?: string; label?: string;
      client?: TerminalClientInfo;
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
          client,
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
          // Ny parning = ny tokenkedja; en gammal token får aldrig hänga kvar.
          prevRefreshTokenHash: null,
          pushToken: pushToken ?? undefined,
          label: label ?? undefined,
          lastSeenAt: new Date(),
          ...clientMetadataUpdate(client),
        },
        create: {
          deviceId: String(deviceId),
          restaurantId: pairing.restaurantId,
          revoked: false,
          refreshTokenHash: sha256(refreshToken),
          pushToken: pushToken ?? null,
          label: label ?? null,
          lastSeenAt: new Date(),
          ...clientMetadataUpdate(client),
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
        client,
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
    const { deviceId, refreshToken, pushToken, client } = (req.body || {}) as {
      deviceId?: string; refreshToken?: string; pushToken?: string;
      client?: TerminalClientInfo;
    };
    if (!deviceId) return res.status(400).json({ error: 'deviceId krävs' });

    const device = await (prisma as any).restaurantDevice.findUnique({
      where: { deviceId: String(deviceId) },
    });
    if (!device) return res.status(404).json({ error: 'needs_pairing' });
    if (device.revoked) return res.status(403).json({ error: 'device_revoked' });

    const reinstallRecovery = !refreshToken;
    const matchesCurrent =
      !reinstallRecovery && refreshTokenMatches(refreshToken, device.refreshTokenHash);
    // Grace: rotationen är annars single-use. Tappas svaret på vägen (eller två
    // anrop hinner korsa varandra) sitter terminalen kvar med förra tokenen —
    // det ska INTE tvinga omparning. Exakt ett steg bakåt accepteras.
    const matchesPrev =
      !reinstallRecovery && !matchesCurrent &&
      refreshTokenMatches(refreshToken, device.prevRefreshTokenHash);
    if (!reinstallRecovery && !matchesCurrent && !matchesPrev) {
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
    // session. En OKÄND befintlig token tillåts aldrig denna väg.
    const rotated = await rotateTerminalSession({
      deviceId: String(deviceId),
      restaurantId: device.restaurantId,
      pushToken: pushToken ?? device.pushToken ?? undefined,
      client,
      keepPrevHash: matchesPrev,
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

// POST /api/terminal/device-benchmark
// Manuellt diagnos-/benchmarktest från partnerplattan. Kräver terminal-JWT
// med deviceId så rapporten alltid kopplas till exakt parad fysisk platta.
router.post('/device-benchmark', authenticate, async (req: AuthRequest, res) => {
  try {
    const restaurantId = req.admin?.restaurantId;
    const deviceId = req.admin?.deviceId;
    if (!restaurantId || !deviceId) {
      return res.status(403).json({ error: 'Terminalen saknar device-koppling' });
    }

    const device = await (prisma as any).restaurantDevice.findUnique({
      where: { deviceId },
      select: { id: true, restaurantId: true, revoked: true },
    });
    if (!device || device.revoked || device.restaurantId !== restaurantId) {
      return res.status(403).json({ error: 'Ogiltig terminalsession' });
    }

    const report = asRecord(req.body);
    const payloadBytes = Buffer.byteLength(JSON.stringify(report), 'utf8');
    if (payloadBytes > 128_000) {
      return res.status(413).json({ error: 'Benchmarkrapporten är för stor' });
    }

    const app = asRecord(report.app);
    const deviceInfo = asRecord(report.device);
    const cpu = asRecord(deviceInfo.cpu);
    const battery = asRecord(report.battery);
    const benchmark = asRecord(report.benchmark);
    const score = cleanScore(benchmark.score ?? report.score);
    const grade = cleanText(benchmark.grade ?? report.grade, 40);
    const appVersion = cleanText(app.versionName ?? app.version, 120);
    const deviceBrand = cleanText(deviceInfo.brand ?? deviceInfo.manufacturer, 120);
    const deviceModel = cleanText(deviceInfo.model, 120);
    const osVersion = cleanText(deviceInfo.androidRelease ?? deviceInfo.osVersion, 120);
    const socVendor = cleanText(cpu.socVendor ?? deviceInfo.socVendor, 80);
    const cpuHardware = cleanText(cpu.hardware ?? deviceInfo.hardware, 120);
    const durationMs = Math.round(finiteNumber(benchmark.durationMs) ?? 0) || undefined;
    const batteryLevel = finiteNumber(battery.levelPercent);
    const batteryTemperatureC = finiteNumber(battery.temperatureC);
    const batteryHealth = cleanText(battery.health, 80);

    await (prisma as any).restaurantDevice.update({
      where: { id: device.id },
      data: {
        lastSeenAt: new Date(),
        appVersion: appVersion ?? undefined,
        deviceBrand: deviceBrand ?? undefined,
        deviceModel: deviceModel ?? undefined,
        osVersion: osVersion ?? undefined,
      },
    });

    let saved = false;
    try {
      const model = (prisma as any).terminalDeviceBenchmark;
      if (model?.create) {
        await model.create({
          data: {
            restaurantId,
            restaurantDeviceId: device.id,
            deviceId,
            appVersion,
            deviceBrand,
            deviceModel,
            osVersion,
            socVendor,
            cpuHardware,
            score,
            grade,
            durationMs,
            batteryLevel: batteryLevel == null ? undefined : Math.round(batteryLevel),
            batteryHealth,
            batteryTemperatureC,
            payload: report,
          },
        });
        saved = true;
      }
    } catch (error) {
      // Backward-compatible deploy: om API:n når ny kod innan Prisma-migrationen
      // är körd ska appen fortfarande få ett OK och rapporten synas i logs.
      console.warn('[terminal/device-benchmark] db-save skipped:', error);
    }

    console.info('[terminal/device-benchmark]', {
      restaurantId,
      device: String(deviceId).slice(0, 8),
      score,
      grade,
      brand: deviceBrand,
      model: deviceModel,
      socVendor,
      saved,
      payloadBytes,
    });
    return res.status(201).json({ success: true, saved, score, grade });
  } catch (error) {
    console.error('[terminal/device-benchmark] error:', error);
    return res.status(500).json({ error: 'Kunde inte ta emot benchmarkrapporten' });
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
      (!refreshTokenMatches(refreshToken, device.refreshTokenHash) &&
        !refreshTokenMatches(refreshToken, device.prevRefreshTokenHash))
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
