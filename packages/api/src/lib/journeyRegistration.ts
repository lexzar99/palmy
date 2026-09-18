import { z } from 'zod';
import prisma from './prisma';

const Attribution = z.object({
  consent: z.literal(true),
  sessionId: z.string().regex(/^[a-zA-Z0-9-]{8,64}$/),
  utmSource: z.string().max(64).optional(),
  utmCampaign: z.string().max(64).optional(),
  channel: z.string().max(64).optional(),
}).strip();

/** Anropas bara efter att telefon-OTP skapat ett nytt lokalt konto. */
export async function recordJourneyRegistration(
  raw: unknown,
  userId: string,
  store: { journeyEvent: { create: (input: any) => Promise<unknown> } } = prisma as any,
): Promise<void> {
  const parsed = Attribution.safeParse(raw);
  if (!parsed.success) return;
  const { consent: _, ...attribution } = parsed.data;
  try {
    await store.journeyEvent.create({
      data: { ...attribution, step: 'REGISTERED', userId },
    });
  } catch {
    // Ett analysfel får aldrig avbryta registreringen. Ingen identitet i loggen.
    console.error('[journey] kunde inte mäta registreringen');
  }
}
