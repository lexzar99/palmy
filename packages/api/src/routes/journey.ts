/**
 * Mottagare för kundresans steg. Publik endpoint — besökaren är anonym när de
 * första stegen sker, så någon auth finns inte att kräva.
 *
 * Allt här är fail-open: spårning får aldrig stoppa ett kundflöde. En rad som
 * inte kan skrivas ger en sämre rapport, inte en trasig beställning.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { attachIdentityToSession, isJourneyStep } from '../lib/journey';

const router = Router();

// En besökare genererar i storleksordningen tio steg per beställning. 120 per
// kvart per IP rymmer ett helt hushåll bakom samma router utan att en
// skriptad flod kan fylla tabellen.
const journeyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  // Tyst avvisning: klienten bryr sig inte, och ett felmeddelande vore bara
  // en instruktion till den som testar gränsen.
  handler: (_req, res) => res.status(202).json({ ok: true }),
});

const EventSchema = z.object({
  sessionId: z.string().trim().min(8).max(64),
  step: z.string().trim().max(40),
  restaurantId: z.string().trim().max(64).nullish(),
  productId: z.string().trim().max(64).nullish(),
  orderId: z.string().trim().max(64).nullish(),
  phone: z.string().trim().max(32).nullish(),
  email: z.string().trim().max(254).nullish(),
  utmSource: z.string().trim().max(64).nullish(),
  utmCampaign: z.string().trim().max(64).nullish(),
  channel: z.string().trim().max(64).nullish(),
  referrer: z.string().trim().max(255).nullish(),
  meta: z.record(z.unknown()).nullish(),
}).strict();

// POST /api/journey
router.post('/', journeyLimiter, async (req, res) => {
  // Svara först. Klienten ska aldrig vänta på att vi skrivit en rad, och ett
  // fel här får inte visa sig som en långsam sajt.
  res.status(202).json({ ok: true });

  try {
    const input = EventSchema.parse(req.body);
    if (!isJourneyStep(input.step)) return;

    const phone = input.phone?.trim() || null;
    const email = input.email?.trim().toLowerCase() || null;

    await (prisma as any).journeyEvent.create({
      data: {
        sessionId: input.sessionId,
        step: input.step,
        restaurantId: input.restaurantId || null,
        productId: input.productId || null,
        orderId: input.orderId || null,
        phone,
        email,
        utmSource: input.utmSource || null,
        utmCampaign: input.utmCampaign || null,
        channel: input.channel || null,
        referrer: input.referrer || null,
        meta: (input.meta as any) ?? undefined,
      },
    });

    // Blev identiteten känd nu? Skriv den bakåt över hela sessionen, annars
    // står stegen före kassan kvar som anonyma för alltid.
    if (phone || email) {
      await attachIdentityToSession(input.sessionId, { phone, email });
    }
  } catch (error) {
    if (error instanceof z.ZodError) return;
    console.error('[journey] kunde inte spara steget:', error);
  }
});

export default router;
