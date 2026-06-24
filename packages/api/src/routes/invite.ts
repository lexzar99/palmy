// Invite tracking — customer + public endpoints.
//
//   Share token  = User.referralCode (stable, opaque, 8-char). NOT shown as a
//                  "code" in the UI; it lives in the share LINK /i/<token>.
//   Attribution  = one Referral row per inviter<->invitee pair (Referral.code
//                  is a unique per-row id, NOT the share token).
//   Reward       = handled in lib/invite.ts (maybeRewardInvite) on first paid order.
//
// Supports both web (cookie handoff at register) and app (deep-link + a
// deferred fingerprint "probe" for new installs). No paid third-party SDK.
import { Router } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma';
import { authenticateUser } from './auth';
import { ensureReferralCode, computeFraudFlags, publicShareBase } from './referrals';

const router = Router();
export const publicInviteRouter = Router();

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // InviteClick retention (GDPR — swept by cron)
const writeLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });

function clientIp(req: any): string | null {
  const xff = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim();
  return xff || req.ip || null;
}

// Bind the logged-in user as invitee of `token`'s owner. Idempotent + fraud-aware.
async function bindInvitee(opts: {
  token: string; uid: string; fingerprint: string | null; ip: string | null; channel: string;
}): Promise<{ code: number; body: any }> {
  const inviter = await (prisma as any).user.findFirst({
    where: { referralCode: opts.token.trim().toUpperCase(), deletedAt: null },
    select: { id: true, email: true, deviceFingerprint: true, lastSeenIp: true },
  });
  if (!inviter) return { code: 404, body: { error: 'Ogiltig inbjudan' } };
  if (inviter.id === opts.uid) return { code: 400, body: { error: 'Du kan inte bjuda in dig själv' } };

  // inviteeUserId is @unique — a user can only be attributed once.
  const existing = await (prisma as any).referral.findFirst({ where: { inviteeUserId: opts.uid } });
  if (existing) return { code: 200, body: { ok: true, alreadyAttributed: true, status: existing.status } };

  // Same-device hard block (carried over from the old redeem-code rule).
  if (opts.fingerprint && inviter.deviceFingerprint && opts.fingerprint === inviter.deviceFingerprint) {
    return { code: 400, body: { error: 'Inbjudan kan inte användas från samma enhet som ägaren' } };
  }

  const invitee = await (prisma as any).user.findUnique({ where: { id: opts.uid }, select: { email: true } });
  const flags = computeFraudFlags({
    inviter,
    inviteeEmail: invitee?.email ?? null,
    inviteeIP: opts.ip,
    inviteeDeviceId: opts.fingerprint,
  });

  try {
    await (prisma as any).referral.create({
      data: {
        code: `inv_${crypto.randomUUID()}`, // unique per-row id; share token is User.referralCode
        inviterUserId: inviter.id,
        inviteeUserId: opts.uid,
        inviteeEmail: invitee?.email ?? null,
        inviteeIP: opts.ip,
        inviteeDeviceId: opts.fingerprint,
        inviteeFingerprint: opts.fingerprint,
        channel: opts.channel,
        fraudFlags: flags,
        status: 'REGISTERED',
        registeredAt: new Date(),
      },
    });
  } catch {
    // unique race on inviteeUserId → treat as already attributed
    return { code: 200, body: { ok: true, alreadyAttributed: true } };
  }
  return { code: 200, body: { ok: true, status: 'REGISTERED' } };
}

// GET /api/account/invite/link — issue/return the share link (token hidden in URL).
router.get('/invite/link', authenticateUser, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    const token = await ensureReferralCode(userId);
    return res.json({ token, url: `${publicShareBase()}/i/${token}` });
  } catch {
    return res.status(500).json({ error: 'Kunde inte skapa inbjudningslänk' });
  }
});

// POST /api/account/invite/attribute  { token, deviceFingerprint, channel? }
router.post('/invite/attribute', writeLimiter, authenticateUser, async (req: any, res) => {
  const uid = req.user?.id;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });
  const token = (req.body?.token || '').toString().trim();
  if (!token) return res.status(400).json({ error: 'Token saknas' });
  const fingerprint = req.body?.deviceFingerprint ? String(req.body.deviceFingerprint) : null;
  const channel = (req.body?.channel || 'web').toString();
  const r = await bindInvitee({ token, uid, fingerprint, ip: clientIp(req), channel });
  return res.status(r.code).json(r.body);
});

// POST /api/account/invite/probe  { fingerprint }  — deferred (new-install) attribution.
router.post('/invite/probe', writeLimiter, authenticateUser, async (req: any, res) => {
  const uid = req.user?.id;
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });
  const fingerprint = req.body?.fingerprint ? String(req.body.fingerprint) : null;
  if (!fingerprint) return res.json({ ok: false, matched: false });
  const existing = await (prisma as any).referral.findFirst({ where: { inviteeUserId: uid } });
  if (existing) return res.json({ ok: true, matched: false, alreadyAttributed: true });
  const click = await (prisma as any).inviteClick.findFirst({
    where: { fingerprint, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  if (!click) return res.json({ ok: true, matched: false });
  const r = await bindInvitee({ token: click.token, uid, fingerprint, ip: clientIp(req), channel: 'app_deferred' });
  return res.json({ ok: r.body.ok === true, matched: r.body.status === 'REGISTERED' });
});

// POST /api/public/invite/click  { token, fingerprint } — store a click so a
// later app install on the same device can be attributed (deferred). No auth.
publicInviteRouter.post('/invite/click', writeLimiter, async (req: any, res) => {
  try {
    const token = (req.body?.token || '').toString().trim().toUpperCase();
    const fingerprint = req.body?.fingerprint ? String(req.body.fingerprint) : null;
    if (!token || !fingerprint) return res.status(400).json({ error: 'token + fingerprint krävs' });
    const inviter = await (prisma as any).user.findFirst({ where: { referralCode: token, deletedAt: null }, select: { id: true } });
    if (!inviter) return res.status(404).json({ error: 'Ogiltig inbjudan' });
    await (prisma as any).inviteClick.create({
      data: {
        token,
        fingerprint,
        ip: clientIp(req),
        userAgent: (req.headers['user-agent'] || '').toString().slice(0, 300) || null,
        expiresAt: new Date(Date.now() + TTL_MS),
      },
    });
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: 'Serverfel' });
  }
});

export default router;
