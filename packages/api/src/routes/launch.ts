import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import prisma from '../lib/prisma';

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

function launchCouponCode() {
  return `LUND30-${randomBytes(5).toString('hex').toUpperCase()}`;
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
      await launchLead.update({
        where: { id: existing.id },
        data: {
          name: input.name,
          marketingConsentAt: now,
        },
      });
      res.cookie('viaeats_launch_interest', '1', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 180 * 24 * 60 * 60 * 1000,
      });
      return res.json({ ok: true, alreadyRegistered: true, manualFollowUp: true });
    }

    const code = launchCouponCode();
    await prisma.$transaction(async (tx: any) => {
      const createdCode = await tx.discountCode.create({
        data: {
          code,
          description: 'Launch-intresse — 30 % rabatt första veckan',
          type: 'PERCENTAGE',
          value: 30,
          minOrder: 0,
          isActive: false,
          maxUsages: 1,
          platform: 'ALL',
        },
      });
      return tx.launchLead.create({
        data: {
          name: input.name,
          email,
          couponCode: createdCode.code,
          status: 'INTERESTED',
          marketingConsentAt: now,
        },
      });
    });

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
      manualFollowUp: true,
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
