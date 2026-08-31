import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { LAUNCH_SHARED_COUPON_CODE, sendLaunchWelcomeEmail } from '../lib/launchWelcomeEmail';

const router = Router();

const interestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'För många registreringar. Försök igen senare.' },
});

const InterestSchema = z.object({
  name: z.string().trim().min(2, 'Namn krävs').max(100, 'Namnet är för långt'),
  email: z.string().trim().email('Ange en giltig e-postadress').max(254),
  marketingConsent: z.literal(true),
}).strict();

/**
 * Intern referens per lead. Alla leads får numera samma delade kupong
 * (LAUNCH_SHARED_COUPON_CODE), men kolumnen `LaunchLead.couponCode` är unik
 * och NOT NULL — den bär därför en referens, inte en kod kunden kan lösa in.
 * `leadCouponCode()` i admin.ts översätter referensen till den kod kunden
 * faktiskt fick i mejlet.
 */
function launchLeadRef() {
  return `LEAD-${randomBytes(6).toString('hex').toUpperCase()}`;
}

/**
 * POST /api/launch/interest
 *
 * The first CTA click only opens this form. PII is collected only after the
 * visitor explicitly submits their name, email and marketing consent.
 */
router.post('/interest', interestLimiter, async (req, res) => {
  try {
    const input = InterestSchema.parse(req.body);
    const email = input.email.toLowerCase();
    const launchLead = (prisma as any).launchLead;
    const now = new Date();
    const existing = await launchLead.findUnique({ where: { email } });

    if (existing) {
      // Redan registrerad. Vi mejlar bara om koden aldrig kom fram — annars
      // skulle varje omregistrering bli ett nytt utskick till samma person.
      const resend = !existing.couponSentAt
        ? await sendLaunchWelcomeEmail({ to: email, name: input.name })
        : false;
      await launchLead.update({
        where: { id: existing.id },
        data: {
          name: input.name,
          marketingConsentAt: now,
          ...(resend ? { couponSentAt: now, status: 'COUPON_SENT' } : {}),
        },
      });
      res.cookie('viaeats_launch_interest', '1', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 180 * 24 * 60 * 60 * 1000,
      });
      return res.json({
        ok: true,
        alreadyRegistered: true,
        couponCode: LAUNCH_SHARED_COUPON_CODE,
      });
    }

    // Leadet sparas först. Mejlet är ett sidoeffektsteg som aldrig får fälla
    // registreringen — en kund som anmält sig ska ligga i listan även om
    // mejltransporten är nere.
    const lead = await launchLead.create({
      data: {
        name: input.name,
        email,
        couponCode: launchLeadRef(),
        status: 'INTERESTED',
        marketingConsentAt: now,
      },
    });

    const emailed = await sendLaunchWelcomeEmail({ to: email, name: input.name });
    if (emailed) {
      await launchLead
        .update({
          where: { id: lead.id },
          data: { couponSentAt: new Date(), status: 'COUPON_SENT' },
        })
        .catch((error: unknown) => {
          // Mejlet ÄR skickat. Att statusen inte hann sparas är en admin-vy-bugg,
          // inte ett kundproblem — logga och gå vidare.
          console.error('[launch/interest] kunde inte markera kupongen som skickad:', error);
        });
    }

    res.cookie('viaeats_launch_interest', '1', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 180 * 24 * 60 * 60 * 1000,
    });
    return res.status(201).json({
      ok: true,
      alreadyRegistered: false,
      couponCode: LAUNCH_SHARED_COUPON_CODE,
      // false = mejlet gick inte fram; admin ser leadet som INTERESTED och
      // kan följa upp manuellt från Launch-kampanjvyn.
      couponEmailed: emailed,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues[0]?.message || 'Kontrollera uppgifterna' });
    if ((error as any)?.code === 'P2002') return res.status(409).json({ error: 'E-postadressen är redan registrerad' });
    console.error('[launch/interest] error:', error);
    return res.status(500).json({ error: 'Kunde inte registrera ditt intresse' });
  }
});

// Launch-eventmätning är avvecklad. Endpointen finns bara för att gamla
// klienter ska faila tydligt utan att någon identifierare eller metadata sparas.
router.all('/events', (_req, res) => res.status(410).json({
  error: 'Launch-eventmätning används inte',
}));

export default router;
