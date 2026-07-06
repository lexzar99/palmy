import { Router, Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { createHmac, timingSafeEqual } from 'crypto';
import prisma from '../lib/prisma';

const router = Router();

const terminalStatuses = new Set(['DELIVERED', 'COMPLETED', 'CANCELLED', 'REJECTED', 'DELIVERY_FAILED']);
const STOCKHOLM_TZ = 'Europe/Stockholm';

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
  return [order.deliveryStreet, order.deliveryZip, order.deliveryCity].filter(Boolean).join(', ');
};

const clock = (date: Date | string | null | undefined) => {
  if (!date) return null;
  return new Date(date).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: STOCKHOLM_TZ });
};

const dateTimeLabel = (date: Date | string | null | undefined) => {
  if (!date) return null;
  return new Date(date).toLocaleString('sv-SE', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: STOCKHOLM_TZ,
  });
};

const minutesSince = (date: Date | string | null | undefined, now = new Date()) => {
  if (!date) return null;
  return Math.max(0, Math.floor((now.getTime() - new Date(date).getTime()) / 60_000));
};

const minutesUntil = (date: Date | string | null | undefined, now = new Date()) => {
  if (!date) return null;
  return Math.round((new Date(date).getTime() - now.getTime()) / 60_000);
};

const minuteLabel = (minutes: number | null | undefined) => {
  if (minutes == null) return null;
  if (minutes < 2) return 'nyss';
  return `${minutes} min`;
};

const statusStartedAt = (order: any) => {
  const status = String(order.status || '').toUpperCase();
  if (status === 'PREPARING') return order.preparingAt || order.updatedAt;
  if (status === 'DELIVERING') return order.deliveringAt || order.delivery?.pickedUpAt || order.updatedAt;
  if (status === 'READY') return order.etaReadyAt || order.updatedAt;
  if (status === 'DELIVERED' || status === 'COMPLETED') return order.delivery?.deliveredAt || order.updatedAt;
  if (status === 'ACCEPTED' || status === 'PENDING' || status === 'AWAITING_PAYMENT') return order.updatedAt || order.createdAt;
  return order.updatedAt || order.createdAt;
};

const etaInfo = (order: any, now = new Date()) => {
  const eta = order.etaCustomerAt || order.etaPickupAt || order.etaReadyAt || null;
  if (!eta) return null;
  const diff = minutesUntil(eta, now);
  return {
    at: new Date(eta).toISOString(),
    clock: clock(eta),
    minutesFromNow: diff,
    overdueMinutes: diff != null && diff < -2 ? Math.abs(diff) : null,
    isPast: diff != null && diff < -2,
    text: diff == null
      ? null
      : diff < -2
        ? `Beräknad tid var ${clock(eta)} och har passerat med ${Math.abs(diff)} min.`
        : diff <= 2
          ? 'Beräknad tid är nu.'
          : `Beräknas ${clock(eta)}, om cirka ${diff} min.`,
  };
};

const delayReason = (
  order: any,
  statusAgeMinutes: number | null,
  eta: ReturnType<typeof etaInfo>,
  restaurantRecentOrderCount = 0,
) => {
  const status = String(order.status || '').toUpperCase();
  if (status === 'PREPARING') {
    if ((statusAgeMinutes || 0) >= 45 || eta?.isPast) {
      if (restaurantRecentOrderCount >= 5) {
        return 'Den har varit under tillagning länge. Restaurangen har haft många beställningar samtidigt och verkar vara försenad.';
      }
      return 'Den har varit under tillagning länge. Restaurangen verkar vara försenad.';
    }
    if ((statusAgeMinutes || 0) >= 25) {
      if (restaurantRecentOrderCount >= 5) {
        return 'Den har varit under tillagning en stund. Restaurangen har haft många beställningar samtidigt.';
      }
      return 'Den har varit under tillagning en stund. Det kan bero på kö eller hög belastning hos restaurangen.';
    }
    return 'Restaurangen lagar maten nu.';
  }
  if (status === 'READY' && (statusAgeMinutes || 0) >= 20) {
    return order.type === 'PICKUP'
      ? 'Maten har varit klar ett tag och väntar på upphämtning.'
      : 'Maten är klar men verkar vänta på upphämtning.';
  }
  if (status === 'DELIVERING' && eta?.isPast) {
    return 'Ordern är på väg men beräknad tid har passerat.';
  }
  return nextStep(order);
};

const statusLabel = (status: string, paymentStatus?: string | null) => {
  const s = String(status || '').toUpperCase();
  const p = String(paymentStatus || '').toUpperCase();
  if (s === 'AWAITING_PAYMENT') return 'väntar på betalning';
  if (p === 'FAILED') return 'betalningen misslyckades';
  if (p === 'REFUNDED') return 'återbetald';
  if (s === 'PENDING') return 'väntar på restaurangen';
  if (s === 'ACCEPTED') return 'accepterad';
  if (s === 'PREPARING') return 'under tillagning';
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

const summarizeOrder = async (order: any) => {
  const now = new Date();
  const loadWindowStart = new Date(now.getTime() - 60 * 60_000);
  const restaurantRecentOrderCount = order.restaurantId
    ? await prisma.order.count({
        where: {
          restaurantId: order.restaurantId,
          createdAt: { gte: loadWindowStart },
          NOT: { status: { in: ['CANCELLED', 'REJECTED', 'DELIVERY_FAILED'] } },
        },
      })
    : 0;
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
  const statusStarted = statusStartedAt(order);
  const statusAgeMinutes = minutesSince(statusStarted, now);
  const eta = etaInfo(order, now);
  const restaurantPhone = order.restaurant?.phone || null;
  const selfDelivery = Boolean(order.restaurant?.selfDelivery);
  const deliveryPositionKnown = !selfDelivery && Boolean(order.delivery?.courierId);
  const deliveryNote = selfDelivery
    ? 'Restaurangen levererar själva. Vi kan inte se exakt position.'
    : order.delivery?.courierId
      ? `Bud är tilldelat${order.delivery?.courier?.name ? `: ${order.delivery.courier.name}` : ''}.`
      : order.type === 'DELIVERY'
        ? 'Inget bud syns ännu i leveransflödet.'
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
    restaurantPhone,
    restaurantSelfDelivery: selfDelivery,
    customerName: order.customerName || null,
    customerPhoneMasked: maskPhone(order.customerPhone),
    address: compactAddress(order),
    deliveryNoteText: order.deliveryNote || null,
    createdAt: order.createdAt.toISOString(),
    createdAtText: dateTimeLabel(order.createdAt),
    createdAgoMinutes: minutesSince(order.createdAt, now),
    updatedAt: order.updatedAt.toISOString(),
    statusStartedAt: statusStarted ? new Date(statusStarted).toISOString() : null,
    statusStartedAtText: dateTimeLabel(statusStarted),
    statusAgeMinutes,
    statusAgeText: minuteLabel(statusAgeMinutes),
    etaAt: eta?.at || null,
    etaClock: eta?.clock || null,
    etaMinutesFromNow: eta?.minutesFromNow ?? null,
    etaOverdueMinutes: eta?.overdueMinutes ?? null,
    etaText: eta?.text || null,
    etaMinutes: order.etaCustomerMin ?? order.estimatedTime ?? null,
    items,
    delivery,
    deliveryPositionKnown,
    deliveryNote,
    isActive: !terminalStatuses.has(String(order.status || '').toUpperCase()),
    nextStep: delayReason(order, statusAgeMinutes, eta, restaurantRecentOrderCount),
    restaurantRecentOrderCount,
    delayLikelyReason: (statusAgeMinutes || 0) >= 25 && restaurantRecentOrderCount >= 5
      ? 'Restaurangen har haft många beställningar samtidigt.'
      : eta?.isPast
        ? 'Beräknad tid har passerat och restaurangen verkar försenad.'
        : null,
    supportOffer: (statusAgeMinutes || 0) >= 45 || eta?.isPast
      ? 'Erbjud att skicka problemrapport till support. Erbjud också restaurangens nummer om kunden vill prata direkt med restaurangen.'
      : 'Erbjud att fortsätta hålla koll och ge restaurangens nummer om kunden vill.',
    foodIssueGuidance: restaurantPhone
      ? `Vid kall mat, spilld mat eller saknad vara: be om ursäkt, fråga om kunden vill ha direktnummer till restaurangen och ge ${restaurantPhone}. Skicka även en problemrapport.`
      : 'Vid kall mat, spilld mat eller saknad vara: be om ursäkt och skicka en problemrapport. Restaurangnummer saknas.',
    appIssueGuidance: 'Om kunden säger att ordern försvann, appen visar fel eller betalningen ser konstig ut: skicka problemrapport direkt med viaeats_issue_report.',
    now: now.toISOString(),
    nowText: dateTimeLabel(now),
  };
};

const answerFor = (orders: any[]) => {
  if (orders.length === 0) {
    return 'Jag hittar ingen order på det. Be om ordernummer eller telefonnummer och försök igen.';
  }
  if (orders.length > 1) {
    const active = orders.filter((o) => o.isActive);
    if (active.length === 1) {
      return answerFor(active);
    }
    const list = (active.length ? active : orders).slice(0, 3).map((o) => `${o.orderNumber}: ${o.statusText} hos ${o.restaurantName}`).join('; ');
    return `Jag hittade flera ordrar. ${list}. Fråga kort vilken kunden menar och upprepa inte ordernumret efter det.`;
  }
  const o = orders[0];
  const customer = o.customerName ? ` för ${o.customerName}` : '';
  const address = o.address ? `, leverans till ${o.address}` : '';
  const age = o.statusAgeText ? ` Den har varit ${o.statusText} i ${o.statusAgeText}.` : '';
  const eta = o.etaText ? ` ${o.etaText}` : '';
  const delivery = o.deliveryNote ? ` ${o.deliveryNote}` : '';
  return `Den är ${o.statusText} hos ${o.restaurantName}${customer}${address}.${age}${eta}${delivery} ${o.nextStep}`;
};

const supportReportTypeLabels: Record<string, string> = {
  APP_ISSUE: 'Appproblem',
  FOOD_QUALITY: 'Matproblem',
  PAYMENT: 'Betalning',
  DELIVERY: 'Leverans',
  OTHER: 'Annat',
};

const sendSupportAlert = async (payload: Record<string, unknown>, dryRun = false) => {
  const webhookUrl = process.env.HERMES_ALERT_WEBHOOK_URL || process.env.FALKEN_WEBHOOK_URL || '';
  const webhookSecret = process.env.HERMES_ALERT_WEBHOOK_SECRET || process.env.FALKEN_WEBHOOK_SECRET || '';
  if (dryRun) return { delivered: false, channel: 'dry_run' };
  if (!webhookUrl) return { delivered: false, channel: null, reason: 'no_webhook' };

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (webhookSecret) {
    headers['x-hermes-signature'] = createHmac('sha256', webhookSecret).update(body).digest('hex');
  }
  await axios.post(webhookUrl, body, { headers, timeout: 10_000 });
  return { delivered: true, channel: 'webhook' };
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
        restaurant: { select: { name: true, phone: true, selfDelivery: true } },
        items: { include: { product: { select: { name: true } } } },
        delivery: { include: { courier: { select: { name: true, vehicle: true } } } },
      },
    });

    const summaries = await Promise.all(orders.map(summarizeOrder));
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

router.post('/support/report', requireHermesToken, async (req, res) => {
  try {
    const type = String(req.body?.type || 'OTHER').toUpperCase();
    const safeType = supportReportTypeLabels[type] ? type : 'OTHER';
    const summary = String(req.body?.summary || '').trim();
    const orderNumber = String(req.body?.orderNumber || '').trim();
    const customerName = String(req.body?.customerName || '').trim();
    const customerPhone = String(req.body?.customerPhone || '').trim();
    const recordingUrl = String(req.body?.recordingUrl || '').trim();
    const callId = String(req.body?.callId || '').trim();
    const severity = String(req.body?.severity || 'normal').trim();
    const dryRun = req.query.dryRun === '1' || req.body?.dryRun === true;

    if (!summary || summary.length < 4) {
      res.status(400).json({
        ok: false,
        error: 'summary saknas',
        answer: 'Jag behöver en kort beskrivning av problemet.',
      });
      return;
    }

    const order = orderNumber
      ? await prisma.order.findFirst({
          where: { orderNumber: { contains: orderNumber.replace(/\s+/g, '').toUpperCase(), mode: 'insensitive' } },
          include: {
            restaurant: { select: { name: true, phone: true, selfDelivery: true } },
          },
        })
      : null;

    const orderSummary = order ? await summarizeOrder(order) : null;
    const label = supportReportTypeLabels[safeType];
    const customerLine = customerName || orderSummary?.customerName || 'Okänd kund';
    const orderLine = orderSummary?.orderNumber || orderNumber || 'okänd order';
    const recordingLine = recordingUrl || (callId ? `Dograh call ${callId}` : 'Kolla Dograh recordings');
    const text = [
      `Elina support: ${label}`,
      `Kund: ${customerLine}`,
      `Order: ${orderLine}`,
      orderSummary?.restaurantName ? `Restaurang: ${orderSummary.restaurantName}` : null,
      orderSummary?.address ? `Adress: ${orderSummary.address}` : null,
      `Problem: ${summary}`,
      `Recording: ${recordingLine}`,
    ].filter(Boolean).join('\n');

    const alertPayload = {
      source: 'viaeats-elina',
      type: safeType,
      severity,
      summary,
      orderNumber: orderSummary?.orderNumber || orderNumber || null,
      customerName: customerName || orderSummary?.customerName || null,
      customerPhoneMasked: customerPhone ? maskPhone(customerPhone) : null,
      restaurantName: orderSummary?.restaurantName || null,
      restaurantPhone: orderSummary?.restaurantPhone || null,
      recordingUrl: recordingUrl || null,
      callId: callId || null,
      text,
      at: new Date().toISOString(),
      order: orderSummary,
    };

    const delivery = await sendSupportAlert(alertPayload, dryRun);
    res.json({
      ok: true,
      delivered: delivery.delivered,
      channel: delivery.channel,
      reason: delivery.reason || null,
      answer: delivery.delivered
        ? 'Jag har skickat en problemrapport vidare.'
        : 'Jag har skapat rapporten, men ingen WhatsApp/webhook är kopplad ännu.',
      report: alertPayload,
    });
  } catch (error: any) {
    console.error('[hermes/support/report] error:', error?.response?.status ?? error?.message ?? error);
    res.status(500).json({ ok: false, error: 'Kunde inte skicka problemrapport' });
  }
});

export default router;
