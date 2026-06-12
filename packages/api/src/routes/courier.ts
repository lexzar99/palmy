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

const ACTIVE_STATUSES = ['EN_ROUTE_PICKUP', 'PICKED_UP'];
const AVAILABLE_ORDER_STATUSES = ['ACCEPTED', 'PREPARING', 'READY'];
const MAX_ACTIVE = 3;

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
  return {
    ...jobFromOrder(d.order, d.ratePerKmOre || 0),
    id: d.id, // VIKTIGT: leverans-id (inte order-id) — detalj/picked-up/complete använder detta
    payout: d.payOre / 100,
    distanceKm: d.distanceKm,
    status: d.status,
    acceptedAt: d.acceptedAt?.getTime?.() ?? Date.now(),
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
      take: 20,
    });
    res.json(orders.map((o) => jobFromOrder(o, courier.ratePerKm)));
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
      return res.status(409).json({ error: 'Ordern är inte längre tillgänglig' });
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
    if (e?.code === 'P2002') return res.status(409).json({ error: 'Ordern togs precis av någon annan' });
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
  const { method } = req.body || {};
  const d = await prisma.delivery.findFirst({ where: { id: req.params.id, courierId: req.courier.id } });
  if (!d) return res.status(404).json({ error: 'Leveransen hittades inte' });
  await prisma.delivery.update({
    where: { id: d.id },
    data: { status: 'DELIVERED', deliveredAt: new Date(), proofMethod: method === 'LEFT_AT_DOOR' ? 'LEFT_AT_DOOR' : 'HANDED' },
  });
  const order = await prisma.order.update({ where: { id: d.orderId }, data: { status: 'DELIVERED' } });
  emitOrderStatus(order);
  res.json({ ok: true });
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

router.get('/history', requireCourier, async (req: CourierRequest, res) => {
  const deliveries = await prisma.delivery.findMany({
    where: { courierId: req.courier.id, status: 'DELIVERED' },
    include: { order: { include: { restaurant: true } } },
    orderBy: { deliveredAt: 'desc' },
    take: 60,
  });
  res.json(
    deliveries.map((d) => ({
      id: d.id,
      orderNumber: d.order.orderNumber,
      restaurantName: d.order.restaurant?.name ?? 'Restaurang',
      deliveredAt: (d.deliveredAt ?? d.updatedAt).toISOString(),
      distanceKm: d.distanceKm,
      payout: d.payOre / 100,
    })),
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
