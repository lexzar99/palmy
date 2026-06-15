import { Router, type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { JWT_SECRET } from '../lib/config';
import { getIO } from '../lib/socket';
import { haversineKm } from '../utils/geo';
import { authenticate, requireSuperAdmin, type AuthRequest } from '../middleware/auth';
import { saveSubscription, removeSubscription, getVapidPublicKey } from '../lib/courierPush';
import { sendOrderStatusPush } from '../lib/customerPush';
import { registerCourierFcmToken, clearCourierFcmToken, sendCourierFcm, sendTestFcm, isFcmConfigured } from '../lib/courierFcm';
import { uploadToR2, deleteFromR2, r2Enabled } from '../lib/r2';

// Leveransbild sparas i 2 dygn och raderas sedan permanent (cleanup-jobbet).
const PROOF_PHOTO_TTL_MS = 2 * 24 * 60 * 60 * 1000;

const ACTIVE_STATUSES = ['EN_ROUTE_PICKUP', 'PICKED_UP'];
const AVAILABLE_ORDER_STATUSES = ['ACCEPTED', 'PREPARING', 'READY'];
const MAX_ACTIVE = 6;

interface CourierRequest extends Request {
  courier?: any;
}

// ---------------------------------------------------------------- helpers
function signCourierToken(courier: { id: string; tokenVersion: number }) {
  return jwt.sign({ courierId: courier.id, role: 'COURIER', tv: courier.tokenVersion }, JWT_SECRET, { expiresIn: '60d' });
}

const safeCourier = (c: any) => ({
  id: c.id,
  name: c.name,
  email: c.email,
  city: c.city,
  vehicle: c.vehicle,
  phone: c.phone ?? null,
});

const dropoffAddress = (o: any) =>
  [o.deliveryStreet, o.deliveryZip, o.deliveryCity].filter(Boolean).join(', ') || 'Adress saknas';

const distanceKmOf = (restaurant: any, o: any): number => {
  if (restaurant?.latitude == null || restaurant?.longitude == null || o.deliveryLatitude == null || o.deliveryLongitude == null) {
    return 0;
  }
  return Math.round(haversineKm(restaurant.latitude, restaurant.longitude, o.deliveryLatitude, o.deliveryLongitude) * 10) / 10;
};

/** Order → Job (kurir-PWA-form). Belopp i KR. */
function jobFromOrder(order: any, ratePerKm: number) {
  const r = order.restaurant;
  const distanceKm = distanceKmOf(r, order);
  const payOre = Math.round(distanceKm * ratePerKm);
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    city: r?.city ?? '',
    restaurantName: r?.name ?? 'Restaurang',
    pickupAddress: r?.address ?? r?.name ?? '',
    pickup: { lat: r?.latitude ?? 0, lng: r?.longitude ?? 0 },
    dropoffName: order.customerName,
    dropoffAddress: dropoffAddress(order),
    dropoff: { lat: order.deliveryLatitude ?? 0, lng: order.deliveryLongitude ?? 0 },
    distanceKm,
    etaMin: Math.max(4, Math.round(distanceKm * 3 + 4)),
    vehicle: distanceKm > 2 ? 'CAR' : 'BIKE',
    payout: payOre / 100,
    tip: (order.tipAmount ?? 0) / 100,
    expiresAt: Date.now() + 3_600_000,
    items: (order.items ?? []).map((i: any) => ({ qty: i.quantity, name: i.productName })),
  };
}

function activeFromDelivery(d: any) {
  const acceptedMs = d.acceptedAt?.getTime?.() ?? null;
  const pickedUpMs = d.pickedUpAt?.getTime?.() ?? null;
  const deliveredMs = d.deliveredAt?.getTime?.() ?? null;
  // Förfluten tid: tagen→levererad om klar, annars tagen→nu (live).
  const elapsedMs = acceptedMs ? (deliveredMs ?? Date.now()) - acceptedMs : null;
  return {
    ...jobFromOrder(d.order, d.ratePerKmOre || 0),
    id: d.id, // VIKTIGT: leverans-id (inte order-id) — detalj/picked-up/complete använder detta
    orderId: d.orderId,
    payout: d.payOre / 100,
    distanceKm: d.distanceKm,
    status: d.status,
    // Orderns egen status (PREPARING/READY/…) → kurir-appen visar "Maten är
    // klar för hämtning" när restaurangen markerat READY.
    orderStatus: d.order?.status ?? null,
    readyForPickup: d.order?.status == 'READY',
    customerPhone: d.order?.customerPhone ?? null,
    deliveryNote: d.order?.deliveryNote ?? null,
    deliveryInstructions: d.order?.deliveryInstructions ?? null,
    proofMethod: d.proofMethod ?? null,
    proofMessage: d.proofMessage ?? null,
    proofPhotoUrl: d.proofPhotoUrl ?? null,
    acceptedAt: acceptedMs ?? Date.now(),
    pickedUpAt: pickedUpMs,
    deliveredAt: deliveredMs,
    // minuter (avrundat) — appen visar "hur lång tid du tog på dig".
    pickupMin: acceptedMs && pickedUpMs ? Math.round((pickedUpMs - acceptedMs) / 60000) : null,
    deliverMin: pickedUpMs && deliveredMs ? Math.round((deliveredMs - pickedUpMs) / 60000) : null,
    totalMin: elapsedMs != null ? Math.round(elapsedMs / 60000) : null,
  };
}

function emitOrderStatus(order: any) {
  try {
    const io = getIO();
    io.to(`order:${order.id}`).emit('order:status', {
      orderId: order.id,
      status: order.status,
      deliveringAt: order.deliveringAt ?? null,
    });
    void sendOrderStatusPush(order.id, order.status);
    io.to('admin-room').emit('order:updated', { orderId: order.id });
    if (order.restaurantId) io.to(`admin-room:${order.restaurantId}`).emit('order:updated', { orderId: order.id });
  } catch {
    /* socket inte initierad — ignorera */
  }
}

// ====================================================================
//  KURIR-API  (/api/courier)
// ====================================================================
const router = Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Fyll i e-post och lösenord' });
    const courier = await prisma.courier.findUnique({ where: { email: String(email).trim().toLowerCase() } });
    if (!courier || !courier.isActive) return res.status(401).json({ error: 'Fel e-post eller lösenord' });
    const ok = await bcrypt.compare(String(password), courier.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Fel e-post eller lösenord' });
    res.json({ token: signCourierToken(courier), courier: safeCourier(courier) });
  } catch (e) {
    console.error('Courier login error:', e);
    res.status(500).json({ error: 'Serverfel' });
  }
});

const requireCourier = async (req: CourierRequest, res: Response, next: NextFunction) => {
  try {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Ingen autentiseringstoken' });
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload.role !== 'COURIER' || !payload.courierId) return res.status(401).json({ error: 'Ogiltig token' });
    const courier = await prisma.courier.findUnique({ where: { id: payload.courierId } });
    if (!courier || !courier.isActive || courier.tokenVersion !== (payload.tv ?? 0)) {
      return res.status(401).json({ error: 'Sessionen är inte längre giltig' });
    }
    req.courier = courier;
    next();
  } catch {
    return res.status(401).json({ error: 'Ogiltig token' });
  }
};

router.get('/me', requireCourier, async (req: CourierRequest, res) => {
  res.json(safeCourier(req.courier));
});

router.get('/session', requireCourier, async (req: CourierRequest, res) => {
  res.json({ online: req.courier.online });
});

router.post('/session/start', requireCourier, async (req: CourierRequest, res) => {
  await prisma.courier.update({ where: { id: req.courier.id }, data: { online: true, sessionStartedAt: new Date() } });
  res.json({ ok: true });
});

router.post('/session/stop', requireCourier, async (req: CourierRequest, res) => {
  await prisma.courier.update({ where: { id: req.courier.id }, data: { online: false } });
  res.json({ ok: true });
});

router.get('/jobs', requireCourier, async (req: CourierRequest, res) => {
  try {
    const courier = req.courier;
    if (!courier.online) return res.json([]);
    const orders = await prisma.order.findMany({
      where: {
        type: 'DELIVERY',
        status: { in: AVAILABLE_ORDER_STATUSES as any },
        delivery: { is: null },
        restaurant: { selfDelivery: false, city: courier.city },
      },
      include: { restaurant: true, items: true },
      orderBy: { createdAt: 'asc' },
      take: 40,
    });

    // Sortera uppdragen på BÅDE pris och närhet: bäst betalda + närmaste
    // hämtning först. Poäng = (ersättning + dricks) − straff·(avstånd från
    // kurirens nuvarande position till restaurangen). Saknas kurir-position
    // faller vi tillbaka på högsta ersättning. Närhet bryter jämna pris-lägen.
    const DISTANCE_PENALTY_PER_KM = 6; // kr/km — balanserar ~typiska ersättningar
    const here = (typeof courier.currentLat === 'number' && typeof courier.currentLng === 'number')
      ? { lat: courier.currentLat as number, lng: courier.currentLng as number }
      : null;
    const scored = orders.map((o) => {
      const job = jobFromOrder(o, courier.ratePerKm);
      const r = o.restaurant as any;
      const pickupDistKm = (here && r?.latitude != null && r?.longitude != null)
        ? Math.round(haversineKm(here.lat, here.lng, r.latitude, r.longitude) * 10) / 10
        : null;
      const value = (job.payout ?? 0) + (job.tip ?? 0);
      const score = pickupDistKm != null ? value - DISTANCE_PENALTY_PER_KM * pickupDistKm : value;
      return { job: { ...job, pickupDistanceKm: pickupDistKm }, score, value, dist: pickupDistKm ?? Infinity };
    });
    scored.sort((a, b) =>
      b.score - a.score || // bäst poäng (pris vägt mot avstånd) först
      a.dist - b.dist || // sen närmast
      b.value - a.value, // sen dyrast
    );
    res.json(scored.map((s) => s.job).slice(0, 20));
  } catch (e) {
    console.error('Courier jobs error:', e);
    res.status(500).json({ error: 'Kunde inte hämta uppdrag' });
  }
});

// Förhandsvy av en enskild (ej tagen) order — för "klicka på uppdrag → se på karta".
router.get('/jobs/:orderId', requireCourier, async (req: CourierRequest, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.orderId },
    include: { restaurant: true, items: true, delivery: true },
  });
  if (!order || order.delivery || !AVAILABLE_ORDER_STATUSES.includes(order.status) || order.restaurant?.selfDelivery) {
    return res.status(404).json({ error: 'Ordern är inte längre tillgänglig' });
  }
  res.json(jobFromOrder(order, req.courier.ratePerKm));
});

router.get('/active', requireCourier, async (req: CourierRequest, res) => {
  const deliveries = await prisma.delivery.findMany({
    where: { courierId: req.courier.id, status: { in: ACTIVE_STATUSES } },
    include: { order: { include: { restaurant: true, items: true } } },
    orderBy: { acceptedAt: 'asc' },
  });
  res.json(deliveries.map(activeFromDelivery));
});

router.get('/deliveries/:id', requireCourier, async (req: CourierRequest, res) => {
  const d = await prisma.delivery.findFirst({
    where: { id: req.params.id, courierId: req.courier.id },
    include: { order: { include: { restaurant: true, items: true } } },
  });
  if (!d) return res.status(404).json({ error: 'Leveransen hittades inte' });
  res.json(activeFromDelivery(d));
});

router.post('/jobs/:orderId/accept', requireCourier, async (req: CourierRequest, res) => {
  try {
    const courier = req.courier;
    const activeCount = await prisma.delivery.count({ where: { courierId: courier.id, status: { in: ACTIVE_STATUSES } } });
    if (activeCount >= MAX_ACTIVE) return res.status(400).json({ error: `Du kan ha max ${MAX_ACTIVE} ordrar samtidigt` });

    const order = await prisma.order.findUnique({
      where: { id: req.params.orderId },
      include: { restaurant: true, items: true, delivery: true },
    });
    if (!order || order.delivery || !AVAILABLE_ORDER_STATUSES.includes(order.status) || order.restaurant?.selfDelivery) {
      // En annan kurir hann acceptera (eller ordern drogs tillbaka).
      return res.status(409).json({ error: 'En annan kurir tog ordern', code: 'TAKEN' });
    }
    const distanceKm = distanceKmOf(order.restaurant, order);
    const payOre = Math.round(distanceKm * courier.ratePerKm);

    const delivery = await prisma.delivery.create({
      data: {
        orderId: order.id,
        courierId: courier.id,
        status: 'EN_ROUTE_PICKUP',
        distanceKm,
        ratePerKmOre: courier.ratePerKm,
        payOre,
        tipOre: order.tipAmount ?? 0,
      },
      include: { order: { include: { restaurant: true, items: true } } },
    });
    res.json(activeFromDelivery(delivery));
  } catch (e: any) {
    // DB-race: Delivery.orderId är unik → bara EN kurir kan skapa leveransen.
    // Den som hann först (bäst connection) vinner; resten får TAKEN.
    if (e?.code === 'P2002') return res.status(409).json({ error: 'En annan kurir tog ordern', code: 'TAKEN' });
    console.error('Courier accept error:', e);
    res.status(500).json({ error: 'Kunde inte acceptera ordern' });
  }
});

router.post('/deliveries/:id/picked-up', requireCourier, async (req: CourierRequest, res) => {
  const d = await prisma.delivery.findFirst({ where: { id: req.params.id, courierId: req.courier.id }, include: { order: true } });
  if (!d) return res.status(404).json({ error: 'Leveransen hittades inte' });
  await prisma.delivery.update({ where: { id: d.id }, data: { status: 'PICKED_UP', pickedUpAt: new Date() } });
  const order = await prisma.order.update({ where: { id: d.orderId }, data: { status: 'DELIVERING', deliveringAt: new Date() } });
  emitOrderStatus(order);
  const full = await prisma.delivery.findUnique({ where: { id: d.id }, include: { order: { include: { restaurant: true, items: true } } } });
  res.json(activeFromDelivery(full));
});

router.post('/deliveries/:id/complete', requireCourier, async (req: CourierRequest, res) => {
  const { method, photoDataUrl, message } = req.body || {};
  const proofMethod = method === 'LEFT_AT_DOOR' ? 'LEFT_AT_DOOR' : 'HANDED';
  const note = typeof message === 'string' ? message.trim().slice(0, 1000) : '';

  const d = await prisma.delivery.findFirst({
    where: { id: req.params.id, courierId: req.courier.id },
    include: { order: { select: { id: true, orderNumber: true, customerName: true } } },
  });
  if (!d) return res.status(404).json({ error: 'Leveransen hittades inte' });

  // Foto är OBLIGATORISKT när maten lämnas vid dörren (bevis), valfritt i hand.
  const hasPhoto = typeof photoDataUrl === 'string' && photoDataUrl.startsWith('data:image');
  if (proofMethod === 'LEFT_AT_DOOR' && !hasPhoto) {
    return res.status(400).json({ error: 'Ta ett foto när maten lämnas vid dörren' });
  }

  // Ladda upp ev. bild till R2 (kanonisk path under leverans-id). Sätt
  // proofExpiresAt = +2 dygn → cleanup-jobbet raderar bilden permanent sen.
  let proofPhotoUrl: string | null = null;
  let proofPhotoKey: string | null = null;
  let proofExpiresAt: Date | null = null;
  if (hasPhoto && r2Enabled()) {
    try {
      const b64 = photoDataUrl.split(',')[1] || '';
      const buf = Buffer.from(b64, 'base64');
      if (buf.length > 0 && buf.length <= 6_000_000) {
        const key = `delivery-proof/${d.id}.jpg`;
        const up = await uploadToR2(key, buf, 'image/jpeg');
        proofPhotoUrl = up.url;
        proofPhotoKey = key;
        proofExpiresAt = new Date(Date.now() + PROOF_PHOTO_TTL_MS);
      }
    } catch (e) {
      console.warn('[courier] kunde inte ladda upp leveransbild:', (e as Error)?.message);
      // Lämna-vid-dörren utan lyckad bilduppladdning → blockera inte leveransen,
      // men kräv minst en notering så admin har något att gå på.
    }
  }

  await prisma.delivery.update({
    where: { id: d.id },
    data: {
      status: 'DELIVERED',
      deliveredAt: new Date(),
      proofMethod,
      proofMessage: note || null,
      proofPhotoUrl,
      proofPhotoKey,
      proofExpiresAt,
    },
  });
  const order = await prisma.order.update({ where: { id: d.orderId }, data: { status: 'DELIVERED' } });
  emitOrderStatus(order);

  // Kurirens notering + leveranssätt landar som order-Note → syns i admin så att
  // support direkt ser hur maten lämnats och vad kuriren skrivit.
  try {
    const where = proofMethod === 'LEFT_AT_DOOR' ? 'vid dörren' : 'i handen';
    const parts = [`Levererad ${where} av kurir ${req.courier.name}.`];
    if (note) parts.push(`Notering: ${note}`);
    if (proofPhotoUrl) parts.push('Leveransfoto bifogat.');
    await prisma.note.create({
      data: {
        body: parts.join(' '),
        authorId: null,
        authorName: `Kurir · ${req.courier.name}`,
        orderId: d.orderId,
      },
    });
  } catch (e) {
    console.warn('[courier] kunde inte spara leverans-Note:', (e as Error)?.message);
  }

  // Notifiera kundens order-rum + admin om att bevis/foto finns (live-uppdatering
  // av order-tracking-sidan och admin-modalen).
  try {
    const io = getIO();
    const proof = {
      orderId: d.orderId,
      proofMethod,
      proofMessage: note || null,
      proofPhotoUrl,
      proofExpiresAt: proofExpiresAt?.toISOString() ?? null,
    };
    io.to(`order:${d.orderId}`).emit('delivery:proof', proof);
    io.to('admin-room').emit('order:updated', { orderId: d.orderId });
    if (order.restaurantId) io.to(`admin-room:${order.restaurantId}`).emit('order:updated', { orderId: d.orderId });
  } catch {
    /* socket ej init — ignorera */
  }

  res.json({ ok: true, proofPhotoUrl });
});

router.post('/location', requireCourier, async (req: CourierRequest, res) => {
  const { lat, lng } = req.body || {};
  if (typeof lat !== 'number' || typeof lng !== 'number') return res.status(400).json({ error: 'Ogiltig position' });
  await prisma.courier.update({ where: { id: req.courier.id }, data: { currentLat: lat, currentLng: lng, lastSeenAt: new Date() } });
  // Broadcast till kundens order-rum för live-tracking (visas vid PICKED_UP).
  try {
    const io = getIO();
    const active = await prisma.delivery.findMany({ where: { courierId: req.courier.id, status: 'PICKED_UP' }, select: { orderId: true } });
    for (const a of active) io.to(`order:${a.orderId}`).emit('courier:location', { orderId: a.orderId, lat, lng });
    io.to('admin-room').emit('courier:location', { courierId: req.courier.id, lat, lng });
  } catch {
    /* ignorera */
  }
  res.json({ ok: true });
});

// ---- Web Push: notiser även när appen är helt stängd --------------------
// Publika VAPID-nyckeln behövs av service workern för att prenumerera. Null =
// push ej konfigurerad på servern (appen hoppar då tyst över push).
router.get('/push/public-key', requireCourier, async (_req: CourierRequest, res) => {
  res.json({ key: getVapidPublicKey() });
});

router.post('/push/subscribe', requireCourier, async (req: CourierRequest, res) => {
  try {
    const { subscription } = req.body || {};
    await saveSubscription(req.courier.id, subscription, req.headers['user-agent'] || null);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: (e as Error)?.message || 'Ogiltig subscription' });
  }
});

router.post('/push/unsubscribe', requireCourier, async (req: CourierRequest, res) => {
  const { endpoint } = req.body || {};
  await removeSubscription(String(endpoint || ''));
  res.json({ ok: true });
});

// ---- Native push (FCM) för Flutter-appen --------------------------------
// Registreras vid login/online och vid token-refresh. Notiser når kuriren
// även när appen är HELT stängd (Android direkt, iOS via APNs).
router.post('/push/register', requireCourier, async (req: CourierRequest, res) => {
  try {
    const { token, platform } = req.body || {};
    if (!token || typeof token !== 'string') return res.status(400).json({ error: 'Token saknas' });
    await registerCourierFcmToken(req.courier.id, token, platform);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: (e as Error)?.message || 'Kunde inte registrera token' });
  }
});

router.post('/push/unregister', requireCourier, async (req: CourierRequest, res) => {
  await clearCourierFcmToken(req.courier.id);
  res.json({ ok: true });
});

// Diagnostik: är en FCM-token registrerad för budet + är FCM konfigurerat på
// servern? Driver push-status-kortet i appen.
router.get('/push/status', requireCourier, async (req: CourierRequest, res) => {
  const c = await prisma.courier.findUnique({
    where: { id: req.courier.id },
    select: { fcmToken: true, fcmPlatform: true },
  });
  res.json({
    hasToken: !!c?.fcmToken,
    platform: c?.fcmPlatform ?? null,
    fcmConfigured: isFcmConfigured(),
  });
});

// Skicka en testnotis till BUDET SJÄLV (isolerar token+leverans från order-
// flödet). Returnerar om token finns + om FCM-sändningen lyckades.
router.post('/push/test', requireCourier, async (req: CourierRequest, res) => {
  const r = await sendTestFcm(req.courier.id);
  res.json({
    hasToken: r.stage !== 'token',
    sent: r.ok ? 1 : 0,
    fcmConfigured: isFcmConfigured(),
    stage: r.stage, // config | token | oauth | fcm | sent
    status: r.status ?? null,
    detail: r.detail ?? null,
  });
});

router.get('/history', requireCourier, async (req: CourierRequest, res) => {
  const deliveries = await prisma.delivery.findMany({
    where: { courierId: req.courier.id, status: 'DELIVERED' },
    include: { order: { include: { restaurant: true } } },
    orderBy: { deliveredAt: 'desc' },
    take: 60,
  });
  res.json(
    deliveries.map((d) => {
      const a = d.acceptedAt?.getTime?.() ?? null;
      const del = d.deliveredAt?.getTime?.() ?? null;
      return {
        id: d.id,
        orderNumber: d.order.orderNumber,
        restaurantName: d.order.restaurant?.name ?? 'Restaurang',
        deliveredAt: (d.deliveredAt ?? d.updatedAt).toISOString(),
        distanceKm: d.distanceKm,
        payout: d.payOre / 100,
        // "hur lång tid du tog på dig" (accept → levererad), i minuter.
        totalMin: a && del ? Math.round((del - a) / 60000) : null,
      };
    }),
  );
});

export default router;

// ====================================================================
//  ADMIN KURIR-HANTERING  (/api/admin/couriers, super-admin)
// ====================================================================
export const adminCourierRouter = Router();
adminCourierRouter.use(authenticate, requireSuperAdmin);

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

adminCourierRouter.get('/', async (_req: AuthRequest, res) => {
  const today = startOfToday();
  const since30 = new Date(Date.now() - 30 * 864e5);
  // Optimerat: 1 findMany + 2 groupBy istället för 3 queries per kurir (N+1).
  const [couriers, todayGroups, groups30] = await Promise.all([
    prisma.courier.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.delivery.groupBy({ by: ['courierId'], where: { status: 'DELIVERED', deliveredAt: { gte: today } }, _sum: { payOre: true }, _count: { _all: true } }),
    prisma.delivery.groupBy({ by: ['courierId'], where: { status: 'DELIVERED', deliveredAt: { gte: since30 } }, _sum: { payOre: true }, _count: { _all: true } }),
  ]);
  const todayMap = new Map(todayGroups.map((g) => [g.courierId, g]));
  const map30 = new Map(groups30.map((g) => [g.courierId, g]));
  res.json(
    couriers.map((c) => {
      const t = todayMap.get(c.id);
      const m = map30.get(c.id);
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        city: c.city,
        vehicle: c.vehicle,
        online: c.online,
        isActive: c.isActive,
        ratePerKm: c.ratePerKm / 100,
        todayEarnings: (t?._sum.payOre ?? 0) / 100,
        todayDeliveries: t?._count._all ?? 0,
        last30Earnings: (m?._sum.payOre ?? 0) / 100,
        last30Deliveries: m?._count._all ?? 0,
      };
    }),
  );
});

// Kurir-detalj: profil + session/inloggning + prestanda (övergångstider) +
// leveranshistorik. Driver admin-detaljsidans flikar. Super-admin-only (router).
adminCourierRouter.get('/:id', async (req: AuthRequest, res) => {
  try {
    const courier = await prisma.courier.findUnique({ where: { id: req.params.id } });
    if (!courier) return res.status(404).json({ error: 'Kurir hittades inte' });

    const deliveries = await prisma.delivery.findMany({
      where: { courierId: courier.id },
      orderBy: { acceptedAt: 'desc' },
      take: 50,
      include: { order: { select: { orderNumber: true, type: true, restaurant: { select: { name: true } } } } },
    });

    // Prestanda: medel-tider för slutförda leveranser (minuter).
    const mins = (a: Date | null, b: Date | null) => (a && b ? (b.getTime() - a.getTime()) / 60000 : null);
    const completed = deliveries.filter((d) => d.status === 'DELIVERED' && d.deliveredAt);
    const pickupTimes = completed.map((d) => mins(d.acceptedAt, d.pickedUpAt)).filter((x): x is number => x != null && x >= 0);
    const deliverTimes = completed.map((d) => mins(d.pickedUpAt, d.deliveredAt)).filter((x): x is number => x != null && x >= 0);
    const totalTimes = completed.map((d) => mins(d.acceptedAt, d.deliveredAt)).filter((x): x is number => x != null && x >= 0);
    const avg = (arr: number[]) => (arr.length ? Math.round((arr.reduce((s, x) => s + x, 0) / arr.length) * 10) / 10 : null);

    const today = startOfToday();
    const since30 = new Date(Date.now() - 30 * 864e5);
    const [todayAgg, agg30, totalAgg] = await Promise.all([
      prisma.delivery.aggregate({ where: { courierId: courier.id, status: 'DELIVERED', deliveredAt: { gte: today } }, _sum: { payOre: true }, _count: { _all: true } }),
      prisma.delivery.aggregate({ where: { courierId: courier.id, status: 'DELIVERED', deliveredAt: { gte: since30 } }, _sum: { payOre: true }, _count: { _all: true } }),
      prisma.delivery.aggregate({ where: { courierId: courier.id, status: 'DELIVERED' }, _sum: { payOre: true }, _count: { _all: true } }),
    ]);

    res.json({
      profile: {
        id: courier.id,
        name: courier.name,
        email: courier.email,
        phone: courier.phone,
        city: courier.city,
        vehicle: courier.vehicle,
        ratePerKm: courier.ratePerKm / 100,
        isActive: courier.isActive,
        profileImageUrl: courier.profileImageUrl,
        personalNumber: courier.personalNumber, // PII — routern är super-admin-only
        address: courier.address,
        payoutAccount: courier.payoutAccount,
        createdAt: courier.createdAt,
      },
      session: {
        online: courier.online,
        sessionStartedAt: courier.sessionStartedAt,
        lastSeenAt: courier.lastSeenAt,
        currentLat: courier.currentLat,
        currentLng: courier.currentLng,
      },
      stats: {
        totalDeliveries: totalAgg._count._all,
        totalEarnings: (totalAgg._sum.payOre ?? 0) / 100,
        todayDeliveries: todayAgg._count._all,
        todayEarnings: (todayAgg._sum.payOre ?? 0) / 100,
        last30Deliveries: agg30._count._all,
        last30Earnings: (agg30._sum.payOre ?? 0) / 100,
        avgPickupMin: avg(pickupTimes), // accept → hämtad
        avgDeliverMin: avg(deliverTimes), // hämtad → levererad
        avgTotalMin: avg(totalTimes), // accept → levererad
      },
      deliveries: deliveries.map((d) => ({
        id: d.id,
        orderId: d.orderId,
        orderNumber: d.order?.orderNumber ?? null,
        restaurantName: d.order?.restaurant?.name ?? null,
        type: d.order?.type ?? null,
        status: d.status,
        distanceKm: d.distanceKm,
        payout: d.payOre / 100,
        acceptedAt: d.acceptedAt,
        pickedUpAt: d.pickedUpAt,
        deliveredAt: d.deliveredAt,
        pickupMin: mins(d.acceptedAt, d.pickedUpAt),
        deliverMin: mins(d.pickedUpAt, d.deliveredAt),
      })),
    });
  } catch (e) {
    console.error('Courier detail error:', e);
    res.status(500).json({ error: 'Kunde inte hämta kurir' });
  }
});

adminCourierRouter.post('/', async (req: AuthRequest, res) => {
  try {
    const { name, email, password, phone, city, vehicle, personalNumber, address, payoutAccount, ratePerKm } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'Namn, e-post och lösenord krävs' });
    const exists = await prisma.courier.findUnique({ where: { email: String(email).trim().toLowerCase() } });
    if (exists) return res.status(409).json({ error: 'E-post används redan' });
    const courier = await prisma.courier.create({
      data: {
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        passwordHash: await bcrypt.hash(String(password), 12),
        phone: phone || null,
        city: city || 'Lund',
        vehicle: vehicle === 'CAR' ? 'CAR' : 'BIKE',
        personalNumber: personalNumber || null,
        address: address || null,
        payoutAccount: payoutAccount || null,
        ratePerKm: ratePerKm != null ? Math.round(Number(ratePerKm) * 100) : 1500,
      },
    });
    res.json({ id: courier.id });
  } catch (e) {
    console.error('Create courier error:', e);
    res.status(500).json({ error: 'Kunde inte skapa kurir' });
  }
});

adminCourierRouter.post('/:id/revoke', async (req: AuthRequest, res) => {
  await prisma.courier.update({ where: { id: req.params.id }, data: { tokenVersion: { increment: 1 }, online: false } });
  res.json({ ok: true });
});

adminCourierRouter.patch('/:id', async (req: AuthRequest, res) => {
  const { isActive, ratePerKm, city, vehicle, phone } = req.body || {};
  const data: any = {};
  if (isActive !== undefined) data.isActive = Boolean(isActive);
  if (ratePerKm !== undefined) data.ratePerKm = Math.round(Number(ratePerKm) * 100);
  if (city !== undefined) data.city = String(city);
  if (vehicle !== undefined) data.vehicle = vehicle === 'CAR' ? 'CAR' : 'BIKE';
  if (phone !== undefined) data.phone = phone || null;
  await prisma.courier.update({ where: { id: req.params.id }, data });
  res.json({ ok: true });
});

// ====================================================================
//  KURIR-ANSÖKNINGAR
// ====================================================================
// Publik "Bli kurir"-ansökan (från kund-webben). Bara lätt info — känslig KYC
// fylls av admin vid godkännande.
export const courierApplicationPublicRouter = Router();
courierApplicationPublicRouter.post('/', async (req, res) => {
  try {
    const { name, email, phone, city, vehicle, message } = req.body || {};
    if (!name || !email) return res.status(400).json({ error: 'Namn och e-post krävs' });
    await prisma.courierApplication.create({
      data: {
        name: String(name).trim().slice(0, 120),
        email: String(email).trim().toLowerCase().slice(0, 200),
        phone: phone ? String(phone).slice(0, 40) : null,
        city: city ? String(city).slice(0, 80) : 'Lund',
        vehicle: vehicle === 'CAR' ? 'CAR' : 'BIKE',
        message: message ? String(message).slice(0, 1000) : null,
      },
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('Courier application error:', e);
    res.status(500).json({ error: 'Kunde inte skicka ansökan' });
  }
});

// Admin: hantera ansökningar (godkänn → skapa konto, eller avslå).
export const adminCourierApplicationRouter = Router();
adminCourierApplicationRouter.use(authenticate, requireSuperAdmin);

adminCourierApplicationRouter.get('/', async (_req: AuthRequest, res) => {
  const apps = await prisma.courierApplication.findMany({ orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 200 });
  res.json(apps);
});

adminCourierApplicationRouter.post('/:id/approve', async (req: AuthRequest, res) => {
  try {
    const { password } = req.body || {};
    if (!password || String(password).length < 6) return res.status(400).json({ error: 'Lösenord (minst 6 tecken) krävs' });
    const app = await prisma.courierApplication.findUnique({ where: { id: req.params.id } });
    if (!app) return res.status(404).json({ error: 'Ansökan hittades inte' });
    const email = app.email.trim().toLowerCase();
    if (await prisma.courier.findUnique({ where: { email } })) {
      return res.status(409).json({ error: 'E-post används redan av en kurir' });
    }
    const courier = await prisma.courier.create({
      data: {
        name: app.name,
        email,
        passwordHash: await bcrypt.hash(String(password), 12),
        phone: app.phone,
        city: app.city,
        vehicle: app.vehicle,
      },
    });
    await prisma.courierApplication.update({ where: { id: app.id }, data: { status: 'APPROVED', reviewedAt: new Date() } });
    res.json({ courierId: courier.id });
  } catch (e) {
    console.error('Approve application error:', e);
    res.status(500).json({ error: 'Kunde inte godkänna ansökan' });
  }
});

adminCourierApplicationRouter.post('/:id/reject', async (req: AuthRequest, res) => {
  await prisma.courierApplication.update({ where: { id: req.params.id }, data: { status: 'REJECTED', reviewedAt: new Date() } });
  res.json({ ok: true });
});
