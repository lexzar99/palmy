import { createHash } from 'node:crypto';
import { z } from 'zod';

export const PARTNER_INBOX = 'viaeats:partner-inbox:v1';
export const PARTNER_TERMS_VERSION = '2026-09-19-v3';
const token = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).optional();
export const PartnerApplicationSchema = z.object({
  kind: z.enum(['partner', 'installation']),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform(value => value.toLowerCase()),
  consent: z.literal(true),
  website: z.string().max(200).optional(),
  restaurant: z.string().trim().max(150).optional(),
  preferredTime: z.string().trim().max(250).optional(),
  source: z.enum(['meta', 'tiktok', 'organic', 'direct']).default('direct'),
  campaign: token,
  creative: token,
}).strict().superRefine((value, ctx) => {
  if (value.kind === 'installation' && (!value.restaurant || !value.preferredTime)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Ange restaurang och önskad tid.' });
  }
});
export type PartnerApplication = z.infer<typeof PartnerApplicationSchema>;
export function partnerApplicationId(input: Pick<PartnerApplication, 'kind' | 'email'>) {
  return `partner-${createHash('sha256').update(`${input.kind}:${input.email.toLowerCase().trim()}`).digest('hex')}`;
}
export function partnerApplicationBody(input: PartnerApplication, now = new Date()) {
  const { website: _trap, consent: _consent, ...details } = input;
  return JSON.stringify({ ...details, status: 'new', termsVersion: PARTNER_TERMS_VERSION, consentAt: now.toISOString() });
}
export function partnerRetentionCutoff(now = new Date()) {
  return new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
}
