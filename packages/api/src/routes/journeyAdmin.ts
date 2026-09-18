/**
 * Adminvyn över kundresan: tratten totalt, och varje besökares flöde.
 *
 * Aggregeringen sker i Postgres, inte i Node — antalet steg växer med
 * trafiken, och att hämta hem dem för att räkna i minnet slutar fungera
 * ungefär när mätningen börjar bli intressant.
 */

import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { orderAttributionReport } from '../lib/orderAttributionReport';
import { authenticate, requireSuperAdmin, AuthRequest } from '../middleware/auth';
import {
  FUNNEL_STEPS,
  PROBLEM_STEPS,
  STEP_LABELS,
  deepestStep,
  explainDropOff,
} from '../lib/journey';
import { claimPaidOrders, isJourneyPaidOrder } from '../lib/journeyConversions';

const router = Router();

/** Dagar bakåt. Spärrad uppåt så en slarvig parameter inte läser hela tabellen. */
const parseDays = (raw: unknown): number => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 30;
  return Math.min(365, Math.round(n));
};

// Rapporten utgår från ordertabellen, inte besökarnas påstådda order-id.
router.get('/orders', authenticate, requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const page = Math.max(1, Math.min(10000, Math.floor(Number(req.query.page) || 1)));
    res.json(await orderAttributionReport(parseDays(req.query.days), page));
  } catch { res.status(500).json({ error: 'Kunde inte läsa orderkällorna' }); }
});

// GET /api/admin/journey?days=30
router.get('/', authenticate, requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const days = parseDays(req.query.days);
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const sessions: Array<{
      sessionId: string;
      steps: string[];
      phone: string | null;
      email: string | null;
      utmSource: string | null;
      utmCampaign: string | null;
      channel: string | null;
      referrer: string | null;
      firstSeen: Date;
      lastSeen: Date;
      restaurantIds: string[];
      orderId: string | null;
      orderIds: string[];
      registrationIds: string[];
      metas: unknown[];
    }> = await prisma.$queryRawUnsafe(
      `SELECT
         "sessionId",
         ARRAY_AGG(DISTINCT step)                                  AS steps,
         MAX(phone)                                                AS phone,
         MAX(email)                                                AS email,
         (ARRAY_AGG("utmSource" ORDER BY "createdAt" DESC) FILTER (WHERE "utmSource" IS NOT NULL))[1] AS "utmSource",
         (ARRAY_AGG("utmCampaign" ORDER BY "createdAt" DESC) FILTER (WHERE "utmCampaign" IS NOT NULL))[1] AS "utmCampaign",
         (ARRAY_AGG(channel ORDER BY "createdAt" DESC) FILTER (WHERE channel IS NOT NULL))[1] AS channel,
         MAX(referrer)                                             AS referrer,
         MIN("createdAt")                                          AS "firstSeen",
         MAX("createdAt")                                          AS "lastSeen",
         ARRAY_REMOVE(ARRAY_AGG(DISTINCT "restaurantId"), NULL)    AS "restaurantIds",
         MAX("orderId")                                            AS "orderId",
         ARRAY_REMOVE(ARRAY_AGG(DISTINCT "orderId"), NULL)         AS "orderIds",
         ARRAY_REMOVE(ARRAY_AGG(DISTINCT "userId") FILTER (WHERE step = 'REGISTERED'), NULL) AS "registrationIds",
         ARRAY_REMOVE(ARRAY_AGG(meta), NULL)                       AS metas
       FROM "JourneyEvent"
       WHERE "createdAt" >= $1
       GROUP BY "sessionId"
       ORDER BY MAX("createdAt") DESC
       LIMIT 500`,
      from,
    );

    // Restaurangnamn i en fråga; sessionerna refererar bara id.
    const restaurantIds = [...new Set(sessions.flatMap((s) => s.restaurantIds || []))];
    const restaurants = restaurantIds.length
      ? await prisma.restaurant.findMany({
          where: { id: { in: restaurantIds } },
          select: { id: true, name: true },
        })
      : [];
    const restaurantName = new Map(restaurants.map((r) => [r.id, r.name]));

    const orderIds = [...new Set(sessions.flatMap(s => s.orderIds || []))];
    const orders = orderIds.length ? await prisma.order.findMany({
      where: { id: { in: orderIds } },
      select: { id: true, paymentStatus: true, status: true, accountingExcluded: true },
    }) : [];
    const paidIds = new Set(orders.filter(isJourneyPaidOrder).map(order => order.id));
    const claimedOrders = new Set<string>();
    const claimedRegistrations = new Set<string>();

    const people = sessions.map((s) => {
      const steps = s.steps || [];
      const deepest = deepestStep(steps);
      const paidOrderIds = claimPaidOrders(s.orderIds || [], paidIds, claimedOrders);
      const registrationIds = (s.registrationIds || []).filter(id => {
        if (claimedRegistrations.has(id)) return false;
        claimedRegistrations.add(id);
        return true;
      });
      const ordered = paidOrderIds.length > 0;
      // Avvisad adress är det enda meta-fältet som säger något i en lista:
      // "vi kör inte dit" är en annan sak än "hon ändrade sig".
      const rejected = (s.metas || [])
        .map((m: any) => m?.rejectedAddress)
        .find((v: unknown) => typeof v === 'string' && v.length > 0) as string | undefined;
      return {
        sessionId: s.sessionId,
        phone: s.phone,
        email: s.email,
        utmSource: s.utmSource,
        utmCampaign: s.utmCampaign,
        channel: s.channel,
        referrer: s.referrer,
        firstSeen: s.firstSeen,
        lastSeen: s.lastSeen,
        orderId: s.orderId,
        steps,
        deepestStep: deepest.step,
        deepestStepLabel: STEP_LABELS[deepest.step] || deepest.step,
        deepestIndex: deepest.index,
        outcome: ordered ? 'Betalade' : steps.includes('ORDER_PLACED')
          ? 'Skapade order, inget kvarvarande betalt köp' : registrationIds.length > 0
            ? 'Registrerade sig, inget betalt köp' : explainDropOff(steps),
        ordered,
        paidOrders: paidOrderIds.length,
        registered: registrationIds.length > 0,
        registrations: registrationIds.length,
        restaurants: (s.restaurantIds || []).map((id) => restaurantName.get(id) || id),
        rejectedAddress: rejected || null,
      };
    });

    // Tratten: hur många sessioner NÅDDE minst det här steget. Räknas på
    // djup, inte på förekomst — annars kan ett senare steg visa fler än ett
    // tidigare och kurvan blir obegriplig.
    const funnel = FUNNEL_STEPS.map((step, index) => {
      const reached = people.filter((p) => p.deepestIndex >= index).length;
      return { step, label: STEP_LABELS[step] || step, reached };
    });
    const funnelWithDropOff = funnel.map((row, i) => {
      const previous = i === 0 ? row.reached : funnel[i - 1].reached;
      return {
        ...row,
        lost: Math.max(0, previous - row.reached),
        shareOfPrevious: previous > 0 ? row.reached / previous : 0,
        shareOfStart: funnel[0].reached > 0 ? row.reached / funnel[0].reached : 0,
      };
    });

    const problems = PROBLEM_STEPS.map((step) => ({
      step,
      label: STEP_LABELS[step] || step,
      sessions: people.filter((p) => p.steps.includes(step)).length,
    }));

    // Var slutar folk? Grupperat på förklaring, inte på steg — det är den
    // formuleringen någon faktiskt kan agera på.
    const outcomes = new Map<string, number>();
    for (const p of people) outcomes.set(p.outcome, (outcomes.get(p.outcome) || 0) + 1);

    // Grupperas på kanal, inte på rå utm_source: frågan är vilken plattform
    // som driver trafik, och de flesta besök bär ingen utm alls.
    const bySource = new Map<string, { sessions: number; orders: number; registrations: number }>();
    const byCampaign = new Map<string, { sessions: number; orders: number; registrations: number }>();
    for (const p of people) {
      const key = p.channel || p.utmSource || 'Direkt';
      const row = bySource.get(key) || { sessions: 0, orders: 0, registrations: 0 };
      row.sessions += 1;
      row.orders += p.paidOrders;
      row.registrations += p.registrations;
      bySource.set(key, row);
      const campaign = p.utmCampaign || 'Utan kampanj';
      const campaignRow = byCampaign.get(campaign) || { sessions: 0, orders: 0, registrations: 0 };
      campaignRow.sessions += 1;
      campaignRow.orders += p.paidOrders;
      campaignRow.registrations += p.registrations;
      byCampaign.set(campaign, campaignRow);
    }

    res.json({
      days,
      from,
      limited: sessions.length === 500,
      totals: {
        sessions: people.length,
        identified: people.filter((p) => p.phone || p.email).length,
        ordered: people.filter((p) => p.ordered).length,
        paidOrders: claimedOrders.size,
        registered: claimedRegistrations.size,
        conversion: people.length > 0 ? people.filter((p) => p.ordered).length / people.length : 0,
      },
      funnel: funnelWithDropOff,
      problems,
      outcomes: [...outcomes.entries()]
        .map(([outcome, sessions]) => ({ outcome, sessions }))
        .sort((a, b) => b.sessions - a.sessions),
      sources: [...bySource.entries()]
        .map(([source, v]) => ({ source, ...v }))
        .sort((a, b) => b.sessions - a.sessions),
      campaigns: [...byCampaign.entries()]
        .map(([campaign, value]) => ({ campaign, ...value }))
        .sort((a, b) => b.sessions - a.sessions),
      people,
    });
  } catch (error) {
    console.error('[admin/journey] error:', error);
    res.status(500).json({ error: 'Kunde inte läsa kundresan' });
  }
});

export default router;
