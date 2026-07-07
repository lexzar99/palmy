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

const localDateParts = (date: Date | string, timeZone = STOCKHOLM_TZ) => {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(date));
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    key: `${get('year')}-${get('month')}-${get('day')}`,
  };
};

const dayDiff = (date: Date | string, now = new Date()) => {
  const a = localDateParts(date);
  const b = localDateParts(now);
  const utcA = Date.UTC(a.year, a.month - 1, a.day);
  const utcB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((utcB - utcA) / 86_400_000);
};

const orderDayLabel = (date: Date | string | null | undefined, now = new Date()) => {
  if (!date) return null;
  const diff = dayDiff(date, now);
  if (diff === 0) return `idag kl ${clock(date)}`;
  if (diff === 1) return `igår kl ${clock(date)}`;
  if (diff >= 2 && diff <= 6) {
    const weekday = new Intl.DateTimeFormat('sv-SE', { weekday: 'long', timeZone: STOCKHOLM_TZ }).format(new Date(date));
    return `${weekday} kl ${clock(date)}`;
  }
  return dateTimeLabel(date);
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

const terminalTimingText = (order: any, now = new Date()) => {
  const status = String(order.status || '').toUpperCase();
  const at = status === 'DELIVERED' || status === 'COMPLETED'
    ? order.delivery?.deliveredAt || order.updatedAt
    : status === 'CANCELLED' || status === 'REJECTED' || status === 'DELIVERY_FAILED'
      ? order.updatedAt
      : null;
  if (!at) return null;
  const when = orderDayLabel(at, now);
  if (!when) return null;
  if (status === 'DELIVERED' || status === 'COMPLETED') return `Levererades ${when}.`;
  if (status === 'CANCELLED') return `Avbröts ${when}.`;
  if (status === 'REJECTED') return `Avvisades ${when}.`;
  if (status === 'DELIVERY_FAILED') return `Leveransen misslyckades ${when}.`;
  return null;
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

const parseExtras = (value: unknown): string[] => {
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((extra: any) => {
        if (typeof extra === 'string') return extra;
        return extra?.name || extra?.title || extra?.label || extra?.productName || null;
      })
      .filter((name: any): name is string => Boolean(name));
  } catch {
    return [];
  }
};

const compactItemText = (item: any) => {
  const name = item.product?.name || item.productName || item.name || 'Vara';
  const extras = parseExtras(item.selectedExtras);
  const note = item.note ? `notering: ${item.note}` : null;
  const details = [extras.length ? `tillval: ${extras.join(', ')}` : null, note].filter(Boolean).join(', ');
  return `${item.quantity || 1} x ${name}${details ? ` (${details})` : ''}`;
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

const supportPlaybook = {
  tone: {
    calm: 'Lugn kund: svara tydligt, kort och guida nästa steg.',
    worried: 'Fundersam/orolig kund: bekräfta, förklara vad du kollar och fråga en sak i taget.',
    angry: 'Arg kund: visa empati, ta ansvar i språket, erbjud callback och skapa rapport.',
    veryAngry: 'Ganska arg kund: be om ursäkt för upplevelsen, sammanfatta vad du gör, erbjud callback och restaurangnummer om relevant.',
  },
  allowedOffers: [
    'Skicka problemrapport till support.',
    'Be support ringa upp kunden och läsa tillbaka namn och nummer.',
    'Ge restaurangens direktnummer när det finns.',
    'Förklara orderstatus, betalstatus, ETA och varför något verkar försenat utifrån tool-data.',
    'Be kunden välja annat callbacknummer än numret på beställningen.',
  ],
  limits: [
    'Lova inte återbetalning direkt.',
    'Säg att support behöver kontrollera order och betalning först.',
    'Hitta inte på väder, budposition eller intern info som inte finns i tool-svaret.',
    'Läs inte upp full intern payload eller hemligheter.',
  ],
  problemTypes: {
    foodQuality: {
      examples: ['kall pizza', 'kall mat', 'spilld dricka', 'läckt påse', 'fel beställning', 'saknad pommes', 'saknad dricka', 'saknad vara', 'fel rätt', 'oätlig mat', 'allergi'],
      response: 'Visa tydlig empati. Säg att du skickar till support. Erbjud callback. Fråga om support ska ringa numret på beställningen eller ett annat nummer. Erbjud restaurangnummer om det finns.',
      reportType: 'FOOD_QUALITY',
    },
    appIssue: {
      examples: ['ordern försvann', 'appen visar fel', 'kan inte se ordern', 'login strular', 'checkout fastnade'],
      response: 'Säg att du skickar appfelet vidare och kollar ordern. Skapa rapport. Erbjud callback om kunden är frustrerad eller inte kan följa sin order.',
      reportType: 'APP_ISSUE',
    },
    payment: {
      examples: ['pengar drogs', 'betalning misslyckades', 'vill ha pengar tillbaka', 'ingen order efter betalning'],
      response: 'Kontrollera order och betalstatus. Lova inte refund. Erbjud callback från support.',
      reportType: 'PAYMENT',
    },
    deliveryDelay: {
      examples: ['väntat länge', 'ETA passerad', 'bud saknas', 'order står still'],
      response: 'Förklara statusålder och passerad ETA. Skapa rapport vid grov försening. Erbjud callback och restaurangnummer.',
      reportType: 'DELIVERY',
    },
  },
};

const summarizeOrder = async (order: any) => {
  const now = new Date();
  const isTerminal = terminalStatuses.has(String(order.status || '').toUpperCase());
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
    ? order.items.slice(0, 10).map((item: any) => ({
        name: item.product?.name || item.productName || item.name || 'Vara',
        quantity: item.quantity,
        note: item.note || null,
        extras: parseExtras(item.selectedExtras),
        text: compactItemText(item),
      }))
    : [];
  const itemsText = items.length
    ? items.map((item: any) => item.text || `${item.quantity || 1} x ${item.name}`).join(', ')
    : null;
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
    deliveryInstructions: order.deliveryInstructions || null,
    orderNote: order.note || null,
    createdAt: order.createdAt.toISOString(),
    createdAtText: dateTimeLabel(order.createdAt),
    createdAtShortText: orderDayLabel(order.createdAt, now),
    createdAgoMinutes: minutesSince(order.createdAt, now),
    updatedAt: order.updatedAt.toISOString(),
    statusStartedAt: statusStarted ? new Date(statusStarted).toISOString() : null,
    statusStartedAtText: dateTimeLabel(statusStarted),
    statusStartedShortText: statusStarted ? orderDayLabel(statusStarted, now) : null,
    statusAgeMinutes: isTerminal ? null : statusAgeMinutes,
    statusAgeText: isTerminal ? null : minuteLabel(statusAgeMinutes),
    terminalTimingText: terminalTimingText(order, now),
    etaAt: eta?.at || null,
    etaClock: eta?.clock || null,
    etaMinutesFromNow: eta?.minutesFromNow ?? null,
    etaOverdueMinutes: eta?.overdueMinutes ?? null,
    etaText: eta?.text || null,
    etaMinutes: order.etaCustomerMin ?? order.estimatedTime ?? null,
    items,
    itemsText,
    orderDetailsText: [
      itemsText ? `Artiklar: ${itemsText}.` : null,
      order.note ? `Ordernotering: ${order.note}.` : null,
      order.deliveryNote ? `Leveransnotering: ${order.deliveryNote}.` : null,
      order.deliveryInstructions ? `Leveransval: ${order.deliveryInstructions}.` : null,
    ].filter(Boolean).join(' ') || null,
    delivery,
    deliveryPositionKnown,
    deliveryNote,
    isActive: !isTerminal,
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
    supportActions: {
      canCreateReport: true,
      canRequestCallback: true,
      canShareRestaurantPhone: Boolean(restaurantPhone),
      canExplainPaymentStatus: true,
      canExplainEta: Boolean(eta),
      canConfirmOrderItems: Boolean(itemsText),
      canReadOrderNotes: Boolean(order.note || order.deliveryNote || order.deliveryInstructions || items.some((item: any) => item.note || item.extras?.length)),
      reportTool: 'viaeats_issue_report',
    },
    callbackGuidance: 'Vid frustration, matproblem, appfel, betalproblem eller grov försening: erbjud callback. Fråga vilket nummer support ska ringa. Läs tillbaka namn och nummer. Skicka report med callbackRequested=true.',
    refundGuidance: 'Lova inte återbetalning direkt. Säg att support kan titta på ersättning eller återbetalning när ordern och betalningen är kontrollerad.',
    restaurantContactText: restaurantPhone
      ? `Restaurangens direktnummer är ${restaurantPhone}.`
      : 'Restaurangens direktnummer saknas i systemet.',
    foodIssueGuidance: restaurantPhone
      ? `Vid kall mat, spilld mat eller saknad vara: be om ursäkt, fråga om kunden vill ha direktnummer till restaurangen och ge ${restaurantPhone}. Skicka även en problemrapport.`
      : 'Vid kall mat, spilld mat eller saknad vara: be om ursäkt och skicka en problemrapport. Restaurangnummer saknas.',
    appIssueGuidance: 'Om kunden säger att ordern försvann, appen visar fel eller betalningen ser konstig ut: skicka problemrapport direkt med viaeats_issue_report.',
    now: now.toISOString(),
    itemIssueGuidance: itemsText
      ? 'Om kunden rapporterar saknad eller fel vara, jämför med itemsText/orderDetailsText. Bekräfta bara vad som står på ordern. Om varan finns på ordern men saknas i påsen, skapa FOOD_QUALITY-rapport.'
      : 'Orderrader saknas i tool-svaret. Gissa inte artiklar.',
    nowText: dateTimeLabel(now),
    platformContact: {
      site: 'https://viaeats.se',
      brand: 'ViaEats',
      neverSay: ['viaeats.com'],
    },
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
    const candidates = (active.length ? active : orders).slice(0, 4);
    const latest = candidates[0];
    const alternatives = candidates.slice(1).map((o) => `${o.restaurantName} ${o.createdAtShortText || o.createdAtText}, ${o.statusText}`).join('; ');
    return [
      `Jag hittade flera ordrar.`,
      latest ? `Fråga om det gäller den senaste hos ${latest.restaurantName} ${latest.createdAtShortText || latest.createdAtText}.` : null,
      alternatives ? `Andra träffar: ${alternatives}.` : null,
      'Nämn restaurang och dag/klockslag, inte stora minutvärden. Upprepa inte ordernummer om kunden inte behöver det.',
    ].filter(Boolean).join(' ');
  }
  const o = orders[0];
  const customer = o.customerName ? ` för ${o.customerName}` : '';
  const address = o.address ? `, leverans till ${o.address}` : '';
  const age = o.statusAgeText ? ` Den har varit ${o.statusText} i ${o.statusAgeText}.` : '';
  const terminal = o.terminalTimingText ? ` ${o.terminalTimingText}` : '';
  const eta = o.etaText ? ` ${o.etaText}` : '';
  const delivery = o.deliveryNote ? ` ${o.deliveryNote}` : '';
  const details = o.itemsText ? ` Artiklar: ${o.itemsText}.` : '';
  return `Ordern är ${o.statusText} hos ${o.restaurantName}${customer}${address}.${terminal}${age}${eta}${delivery}${details} ${o.nextStep}`;
};

const supportReportTypeLabels: Record<string, string> = {
  APP_ISSUE: 'Appproblem',
  FOOD_QUALITY: 'Matproblem',
  PAYMENT: 'Betalning',
  DELIVERY: 'Leverans',
  CALLBACK: 'Ring upp kund',
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
        ? 'Svara på naturlig svenska utifrån answer, nextStep, supportPlaybook och orderns guidance-fält. Erbjud hjälp själv när kunden är frustrerad. Gissa inte mer än tool-resultatet.'
        : 'Fråga efter ordernummer eller telefonnummer. Säg inte att du har dubbelkollat om tool-resultatet saknas.',
      supportPlaybook,
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
    const callbackRequested =
      req.body?.callbackRequested === true ||
      ['true', '1', 'yes', 'ja'].includes(String(req.body?.callbackRequested || '').toLowerCase());
    const preferredCallbackTime = String(req.body?.preferredCallbackTime || '').trim();
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
    const callbackPhone = customerPhone || (callbackRequested ? order?.customerPhone || '' : '');
    const recordingLine = recordingUrl || (callId ? `Dograh call ${callId}` : 'Kolla Dograh recordings');
    const text = [
      `Elina support: ${label}`,
      `Kund: ${customerLine}`,
      callbackRequested ? 'Ring upp: Ja' : null,
      callbackPhone ? `Telefon: ${callbackPhone}` : null,
      preferredCallbackTime ? `Önskad tid: ${preferredCallbackTime}` : null,
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
      callbackRequested,
      callbackPhone: callbackPhone || null,
      preferredCallbackTime: preferredCallbackTime || null,
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
