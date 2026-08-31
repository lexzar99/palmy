/**
 * Adminvyn över kundresan: tratten totalt, och varje besökares flöde.
 *
 * Aggregeringen sker i Postgres, inte i Node — antalet steg växer med
 * trafiken, och att hämta hem dem för att räkna i minnet slutar fungera
 * ungefär när mätningen börjar bli intressant.
 */

import { Router } from 'express';
import prisma from '../lib/prisma';
import { authenticate, requireSuperAdmin, AuthRequest } from '../middleware/auth';
import {
  FUNNEL_STEPS,
  PROBLEM_STEPS,
  STEP_LABELS,
  deepestStep,
  explainDropOff,
} from '../lib/journey';

const router = Router();

/** Dagar bakåt. Spärrad uppåt så en slarvig parameter inte läser hela tabellen. */
const parseDays = (raw: unknown): number => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 30;
  return Math.min(365, Math.round(n));
};

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
      metas: unknown[];
    }> = await prisma.$queryRawUnsafe(
      `SELECT
         "sessionId",
         ARRAY_AGG(DISTINCT step)                                  AS steps,
         MAX(phone)                                                AS phone,
         MAX(email)                                                AS email,
         MAX("utmSource")                                          AS "utmSource",
         MAX("utmCampaign")                                        AS "utmCampaign",
         MAX(channel)                                              AS channel,
         MAX(referrer)                                             AS referrer,
         MIN("createdAt")                                          AS "firstSeen",
         MAX("createdAt")                                          AS "lastSeen",
         ARRAY_REMOVE(ARRAY_AGG(DISTINCT "restaurantId"), NULL)    AS "restaurantIds",
         MAX("orderId")                                            AS "orderId",
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

    const people = sessions.map((s) => {
      const steps = s.steps || [];
      const deepest = deepestStep(steps);
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
        outcome: explainDropOff(steps),
        ordered: steps.includes('ORDER_PLACED'),
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
    const bySource = new Map<string, { sessions: number; orders: number }>();
    for (const p of people) {
      const key = p.channel || p.utmSource || 'Direkt';
      const row = bySource.get(key) || { sessions: 0, orders: 0 };
      row.sessions += 1;
      if (p.ordered) row.orders += 1;
      bySource.set(key, row);
    }

    res.json({
      days,
      from,
      totals: {
        sessions: people.length,
        identified: people.filter((p) => p.phone || p.email).length,
        ordered: people.filter((p) => p.ordered).length,
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
      people,
    });
  } catch (error) {
    console.error('[admin/journey] error:', error);
    res.status(500).json({ error: 'Kunde inte läsa kundresan' });
  }
});

export default router;
