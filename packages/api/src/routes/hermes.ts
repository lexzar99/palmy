import { Router, Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import prisma from '../lib/prisma';

const router = Router();

const terminalStatuses = new Set(['DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED', 'DELIVERY_FAILED']);

const normalizePhone = (value: unknown) => String(value || '').replace(/\D/g, '');

const safeCompare = (a: string, b: string) => {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  return timingSafeEqual(aa, bb);
};

const requireHermesToken = (req: Request, res: Response, next: NextFunction) => {
  const expected = process.env.HERMES_API_TOKEN || '';
  if (!expected) {
    res.status(503).json({ error: 'Hermes API-token saknas' });
    return;
  }

  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice('Bearer '.length).trim()
    : '';
  const headerToken = typeof req.headers['x-hermes-token'] === 'string' ? req.headers['x-hermes-token'].trim() : '';
  const token = bearer || headerToken;

  if (!token || !safeCompare(token, expected)) {
    res.status(401).json({ error: 'Ogiltig Hermes-token' });
    return;
  }

  next();
};

const kr = (ore: number | null | undefined) => `${((ore || 0) / 100).toLocaleString('sv-SE', { maximumFractionDigits: 2 })} kr`;

const maskPhone = (phone: string | null | undefined) => {
  const digits = normalizePhone(phone);
  if (!digits) return null;
  return `${digits.slice(0, 3)}...${digits.slice(-2)}`;
};

const compactAddress = (order: any) => {
  if (!order.deliveryStreet && !order.deliveryCity) return null;
  const street = order.deliveryStreet ? order.deliveryStreet.replace(/\d+[A-Za-z]?/g, '##') : null;
  return [street, order.deliveryCity].filter(Boolean).join(', ');
};

const statusLabel = (status: string, paymentStatus?: string | null) => {
  const s = String(status || '').toUpperCase();
  const p = String(paymentStatus || '').toUpperCase();
  if (s === 'AWAITING_PAYMENT') return 'väntar på betalning';
  if (p === 'FAILED') return 'betalningen misslyckades';
  if (p === 'REFUNDED') return 'återbetald';
  if (s === 'PENDING') return 'väntar på restaurangen';
  if (s === 'ACCEPTED') return 'accepterad';
  if (s === 'PREPARING') return 'tillagas';
  if (s === 'READY') return 'klar för upphämtning';
  if (s === 'DELIVERING') return 'på väg';
  if (s === 'DELIVERED' || s === 'COMPLETED') return 'levererad';
  if (s === 'REJECTED') return 'avvisad';
  if (s === 'CANCELLED') return 'avbruten';
  if (s === 'DELIVERY_FAILED') return 'leverans misslyckades';
  return s.toLowerCase() || 'okänd status';
};

const nextStep = (order: any) => {
  const status = String(order.status || '').toUpperCase();
  const paymentStatus = String(order.paymentStatus || '').toUpperCase();
  if (status === 'AWAITING_PAYMENT' || paymentStatus === 'PENDING') return 'Be kunden slutföra betalningen eller testa igen om betalflödet avbröts.';
  if (paymentStatus === 'FAILED') return 'Be kunden lägga ordern igen. Ta betalt först innan restaurangen hanterar ordern.';
  if (status === 'PENDING') return 'Restaurangen har inte accepterat än. Be kunden vänta kort eller kontakta restaurangen.';
  if (status === 'ACCEPTED' || status === 'PREPARING') return 'Säg att restaurangen lagar maten nu.';
  if (status === 'READY' && order.type === 'PICKUP') return 'Säg att maten är klar att hämta.';
  if (status === 'READY') return order.delivery?.courierId ? 'Säg att maten är klar och väntar på upphämtning.' : 'Kolla om bud saknas om ordern står kvar länge.';
  if (status === 'DELIVERING') return 'Säg att ordern är på väg.';
  if (status === 'DELIVERED' || status === 'COMPLETED') return 'Säg att ordern är levererad.';
  if (status === 'REJECTED' || status === 'CANCELLED' || status === 'DELIVERY_FAILED') return 'Bekräfta problemet och erbjud att eskalera till support.';
  return 'Svara försiktigt och eskalera om kunden behöver mer hjälp.';
};

const summarizeOrder = (order: any) => {
  const eta =
    order.etaCustomerAt ||
    order.etaPickupAt ||
    order.etaReadyAt ||
    null;
  const items = Array.isArray(order.items)
    ? order.items.slice(0, 4).map((item: any) => ({
        name: item.product?.name || item.name || 'Vara',
        quantity: item.quantity,
      }))
    : [];
  const delivery = order.delivery
    ? {
        status: order.delivery.status,
        courierAssigned: Boolean(order.delivery.courierId),
        courierName: order.delivery.courier?.name || null,
        courierVehicle: order.delivery.courier?.vehicle || null,
        acceptedAt: order.delivery.acceptedAt?.toISOString?.() || null,
        pickedUpAt: order.delivery.pickedUpAt?.toISOString?.() || null,
        deliveredAt: order.delivery.deliveredAt?.toISOString?.() || null,
      }
    : null;

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    statusText: statusLabel(order.status, order.paymentStatus),
    paymentStatus: order.paymentStatus,
    paymentProvider: order.paymentProvider,
    type: order.type,
    total: kr(order.total),
    restaurantName: order.restaurant?.name || 'Okänd restaurang',
    customerName: order.customerName || null,
    customerPhoneMasked: maskPhone(order.customerPhone),
    address: compactAddress(order),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    etaAt: eta ? new Date(eta).toISOString() : null,
    etaMinutes: order.etaCustomerMin ?? order.estimatedTime ?? null,
    items,
    delivery,
    isActive: !terminalStatuses.has(String(order.status || '').toUpperCase()),
    nextStep: nextStep(order),
  };
};

const answerFor = (orders: any[]) => {
  if (orders.length === 0) {
    return 'Jag hittar ingen order på det. Be om ordernummer eller telefonnummer och försök igen.';
  }
  if (orders.length > 1) {
    const active = orders.filter((o) => o.isActive);
    const list = (active.length ? active : orders).slice(0, 3).map((o) => `${o.orderNumber}: ${o.statusText} hos ${o.restaurantName}`).join('; ');
    return `Jag hittade flera ordrar. ${list}. Fråga vilken order kunden menar.`;
  }
  const o = orders[0];
  const eta = o.etaAt ? ` ETA ${new Date(o.etaAt).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}.` : '';
  return `Order ${o.orderNumber} är ${o.statusText} hos ${o.restaurantName}.${eta} ${o.nextStep}`;
};

router.get('/orders/lookup', requireHermesToken, async (req, res) => {
  try {
    const rawQuery = String(req.query.query || '').trim();
    const rawOrderNumber = String(req.query.orderNumber || '').trim();
    const phoneDigits = normalizePhone(req.query.phone || req.query.customerPhone || rawQuery);
    const orderNumber = rawOrderNumber || (/[A-Za-z]{1,8}-?\d{2,}/.test(rawQuery) ? rawQuery : '');

    if (!orderNumber && phoneDigits.length < 6 && rawQuery.length < 3) {
      res.status(400).json({
        ok: false,
        error: 'Ange orderNumber, phone eller query',
        answer: 'Jag behöver ordernummer eller telefonnummer för att kolla ordern.',
      });
      return;
    }

    const where: any = {};
    if (orderNumber) {
      const normalized = orderNumber.replace(/\s+/g, '').toUpperCase();
      where.orderNumber = { contains: normalized, mode: 'insensitive' };
    } else if (phoneDigits.length >= 6) {
      where.customerPhone = { contains: phoneDigits.slice(-7) };
    } else {
      where.OR = [
        { orderNumber: { contains: rawQuery, mode: 'insensitive' } },
        { customerName: { contains: rawQuery, mode: 'insensitive' } },
      ];
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      take: 8,
      include: {
        restaurant: { select: { name: true, selfDelivery: true } },
        items: { include: { product: { select: { name: true } } } },
        delivery: { include: { courier: { select: { name: true, vehicle: true } } } },
      },
    });

    const summaries = orders.map(summarizeOrder);
    res.json({
      ok: true,
      found: summaries.length > 0,
      count: summaries.length,
      orders: summaries,
      answer: answerFor(summaries),
      instruction: summaries.length
        ? 'Svara kort på svenska utifrån answer och nextStep. Gissa inte mer än tool-resultatet.'
        : 'Fråga efter ordernummer eller telefonnummer. Säg inte att du har dubbelkollat om tool-resultatet saknas.',
    });
  } catch (error) {
    console.error('[hermes/orders/lookup] error:', error);
    res.status(500).json({ ok: false, error: 'Kunde inte hämta orderstatus' });
  }
});

export default router;
