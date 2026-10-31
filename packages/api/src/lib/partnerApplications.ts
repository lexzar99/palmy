import { createHash } from 'node:crypto';
import { z } from 'zod';

export const PARTNER_INBOX = 'viaeats:partner-inbox:v1';
export const PARTNER_TERMS_VERSION = '2026-09-19-v3';
const token = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).optional();
export const PartnerApplicationSchema = z.object({
  // 'restaurant' = lead från /erbjudande: restaurang, namn, telefon och stad.
  kind: z.enum(['partner', 'installation', 'restaurant']),
  name: z.string().trim().min(2).max(100).optional(),
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()).optional(),
  consent: z.literal(true),
  website: z.string().max(200).optional(),
  restaurant: z.string().trim().max(150).optional(),
  preferredTime: z.string().trim().max(250).optional(),
  city: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/).optional(),
  plan: z.enum(['start', 'fixed']).optional(),
  source: z.enum(['meta', 'tiktok', 'organic', 'direct']).default('direct'),
  campaign: token,
  creative: token,
}).strict().superRefine((value, ctx) => {
  if (value.kind === 'installation' && (!value.restaurant || !value.preferredTime)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Ange restaurang och önskad tid.' });
  }
  if (value.kind === 'restaurant' && (!value.restaurant || !value.name || !value.phone || !value.city)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Ange restaurang, namn, telefon och stad.' });
  }
  if (value.kind !== 'restaurant' && (!value.name || !value.email)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Ange namn och e-post.' });
  }
});
export type PartnerApplication = z.infer<typeof PartnerApplicationSchema>;
export function partnerApplicationId(input: Pick<PartnerApplication, 'kind' | 'email' | 'phone'>) {
  // Leads från /erbjudande har ofta bara telefon; samma nummer ska inte ge två anmälningar.
  const key = input.email ? input.email.toLowerCase().trim() : `tel:${(input.phone ?? '').replace(/[^0-9+]/g, '')}`;
  return `partner-${createHash('sha256').update(`${input.kind}:${key}`).digest('hex')}`;
}
export function partnerApplicationBody(input: PartnerApplication, now = new Date()) {
  const { website: _trap, consent: _consent, ...details } = input;
  return JSON.stringify({ ...details, status: 'new', termsVersion: PARTNER_TERMS_VERSION, consentAt: now.toISOString() });
}
export function partnerRetentionCutoff(now = new Date()) {
  return new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
}

const PLAN_LABEL = { start: '5 % per order', fixed: 'Fast pris (950 kr/mån)' } as const;
/** WhatsApp-texten när en restaurang registrerar sig. Första raden är det som syns i notisen. */
export function restaurantSignupAlertText(input: PartnerApplication) {
  return [
    `NY RESTAURANG ${input.restaurant}${input.city ? ` (${input.city})` : ''}`,
    input.name && `Kontakt: ${input.name}`,
    `Telefon: ${input.phone}`,
    input.email && `E-post: ${input.email}`,
    `Plan: ${PLAN_LABEL[input.plan ?? 'start']}`,
    `Källa: ${[input.source, input.campaign, input.creative].filter(Boolean).join(' · ')}`,
  ].filter(Boolean).join('\n');
}
