// Referral- & Welcome-deal-systemet.
//
// Tre customer-endpoints (under /api/account):
//   GET  /referral            — min code + delning-stats
//   POST /redeem-code         — använd någons kod (vid eller efter registrering)
//   GET  /deals               — lista mina aktiva UserDeals
//
// Plus en public preview-endpoint för referral-landingsidor:
//   GET  /api/public/referral-preview?code=
//
// Admin-endpoints (under /api/admin) ligger i admin.ts via en wire-helper
// här nedan (mountReferralsAdmin). Det skiljer sig från övriga moduler bara
// pga befintlig admin.ts redan har all-admin-paths centraliserade.
//
// Reward-trigger:
//   - Anropas FRÅN orders.ts när en order flippas till PAID/COMPLETED.
//   - Maybe-funktionen kollar att det är invitee:s första betalda order.
//   - Om referral.status === REGISTERED → skapa UserDeals för båda + flip till ORDERED.
//
// Welcome-deal-trigger:
//   - Anropas FRÅN auth.ts när nytt user-konto skapas (register-user + oauth-token).

import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma';
import { authenticateUser } from './auth';
import { authenticate, requireSuperAdmin, AuthRequest } from '../middleware/auth';
import { audit } from '../lib/auditLog';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // utan 0/O/1/I/L för läsbarhet
const CODE_LENGTH = 8;

function generateCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  }
  return out;
}

async function ensureReferralCode(userId: string): Promise<string> {
  const u = await (prisma as any).user.findUnique({
    where: { id: userId },
    select: { referralCode: true },
  });
  if (u?.referralCode) return u.referralCode;
  // Generera tills unik (collision är osannolikt men möjligt)
  for (let i = 0; i < 5; i++) {
    const candidate = generateCode();
    const exists = await (prisma as any).user.findUnique({
      where: { referralCode: candidate },
      select: { id: true },
    });
    if (!exists) {
      await (prisma as any).user.update({
        where: { id: userId },
        data: { referralCode: candidate },
      });
      return candidate;
    }
  }
  throw new Error('Kunde inte generera unik referral-kod');
}

async function getSettings() {
  const row =
    (await (prisma as any).restaurantSettings.findUnique({
      where: { id: 'settings' },
    })) || {};
  // Sensible defaults — nya plattformar ska få referral + welcome-deal
  // PÅ utan att admin behöver gå in och toggla. Admin kan fortfarande
  // stänga av explicit (false vinner över default via ?? semantik).
  return {
    ...row,
    referralEnabled: row.referralEnabled ?? true,
    referralDealId: row.referralDealId ?? null,
    referralCouponsPerSide: row.referralCouponsPerSide ?? 1,
    referralRewardKr: row.referralRewardKr ?? 50, // legacy
    referralRewardPercent: row.referralRewardPercent ?? 20, // legacy
    referralMinOrderKr: row.referralMinOrderKr ?? 150, // legacy
    referralMaxRewardsPerInviter: row.referralMaxRewardsPerInviter ?? 20,
    welcomeDealActive: row.welcomeDealActive ?? true,
    welcomeDealId: row.welcomeDealId ?? null,
    welcomeDealAmountKr: row.welcomeDealAmountKr ?? 50, // legacy
    welcomeDealPercent: row.welcomeDealPercent ?? 20, // legacy
    welcomeDealMinOrderKr: row.welcomeDealMinOrderKr ?? 150, // legacy
    welcomeDealExpiresDays: row.welcomeDealExpiresDays ?? 30, // legacy
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Deal-snapshot — läser en konfigurerad Personal Template-Deal och returnerar
// dess värden frusna för UserDeal-creation. Returnerar null om ingen Deal
// vald, eller om Dealen inte längre finns/är inaktiv/inte är Personal
// Template → caller ska skipa reward-skapandet.
//
// Används av båda flöden:
//  - Referral (snapshotDealById(settings.referralDealId))
//  - Welcome  (snapshotDealById(settings.welcomeDealId))
// ─────────────────────────────────────────────────────────────────────────────
type DealSnapshot = {
  dealId: string;
  title: string; // Deal-titel för UI-display
  discountType: string; // NONE | PERCENTAGE | FIXED
  discountPercent: number | null;
  amountKr: number | null;
  freeDelivery: boolean; // Stackbar med discountType
  minOrderKr: number;
  // expiresAt = computed/snapshotad expiry för UserDeal-creation (30 dagars
  // default om admin inte satt datum — coupons ska inte ligga aktiva för evigt).
  expiresAt: Date;
  // validUntil = raw värde från Deal (null om admin inte satt datum). Skickas
  // till frontend för DISPLAY → "Gäller tillsvidare" om null, "Gäller till X"
  // om satt. Separerar admin-intention från intern teknisk default.
  validUntil: Date | null;
};

async function snapshotDealById(dealId: string | null | undefined): Promise<DealSnapshot | null> {
  if (!dealId) return null;
  const deal = await (prisma as any).deal.findUnique({
    where: { id: dealId },
    select: {
      id: true,
      title: true,
      isActive: true,
      isPersonalTemplate: true,
      discountType: true,
      discountValue: true,
      freeDelivery: true,
      minOrder: true,
      validUntil: true,
    },
  });
  // Kräv Personal Template för att förhindra att en publik kupong-deal av
  // misstag används som mall.
  if (!deal || !deal.isActive || !deal.isPersonalTemplate) return null;

  // Backward compat: gamla deals med discountType='FREE_DELIVERY' tolkas
  // som freeDelivery=true + ingen subtotal-rabatt.
  const isLegacyFreeDelivery = deal.discountType === 'FREE_DELIVERY';
  const freeDelivery = !!deal.freeDelivery || isLegacyFreeDelivery;
  const isPercent = deal.discountType === 'PERCENTAGE';
  const isFixed = deal.discountType === 'FIXED' || deal.discountType === 'FIXED_PRICE';
  const minOrderKr = Math.round((deal.minOrder ?? 0) / 100) || 0;
  const expiresAt = deal.validUntil
    ? new Date(deal.validUntil)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  return {
    dealId: deal.id,
    title: deal.title || 'Referral-rabatt',
    discountType: isPercent ? 'PERCENTAGE' : isFixed ? 'FIXED' : 'NONE',
    discountPercent: isPercent ? deal.discountValue : null,
    amountKr: isFixed ? deal.discountValue : null,
    freeDelivery,
    minOrderKr,
    expiresAt,
    validUntil: deal.validUntil ? new Date(deal.validUntil) : null,
  };
}

async function snapshotReferralDeal(): Promise<DealSnapshot | null> {
  const settings = await getSettings();
  if (!settings.referralEnabled) return null;
  return snapshotDealById(settings.referralDealId);
}

async function snapshotWelcomeDeal(): Promise<DealSnapshot | null> {
  const settings = await getSettings();
  if (!settings.welcomeDealActive) return null;
  return snapshotDealById(settings.welcomeDealId);
}

// Format-helper för customer-facing UI. Bygger en grammatiskt komplett
// string som frontend kan splice in i texter utan extra logik:
//   "20% rabatt" / "50 kr rabatt" / "Fri leverans" /
//   "20% rabatt + Fri leverans" / "rabatt" (fallback).
function formatRewardLabel(snapshot: DealSnapshot | null): string {
  if (!snapshot) return 'rabatt';
  const parts: string[] = [];
  if (snapshot.discountPercent && snapshot.discountPercent > 0) {
    parts.push(`${snapshot.discountPercent}% rabatt`);
  } else if (snapshot.amountKr && snapshot.amountKr > 0) {
    parts.push(`${snapshot.amountKr} kr rabatt`);
  }
  if (snapshot.freeDelivery) {
    parts.push('Fri leverans');
  }
  if (parts.length === 0) return 'rabatt';
  return parts.join(' + ');
}

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  '10minutemail.com',
  'mailinator.com',
  'tempmail.com',
  'guerrillamail.com',
  'throwawaymail.com',
  'trashmail.com',
  'maildrop.cc',
  'getnada.com',
  'sharklasers.com',
  'yopmail.com',
]);

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  if (al === bl) return 1;
  let same = 0;
  const max = Math.max(al.length, bl.length);
  for (let i = 0; i < Math.min(al.length, bl.length); i++) {
    if (al[i] === bl[i]) same++;
  }
  return same / max;
}

function computeFraudFlags(input: {
  inviter: any;
  inviteeEmail: string | null;
  inviteeIP: string | null;
  inviteeDeviceId: string | null;
}): string[] {
  const flags: string[] = [];
  const { inviter, inviteeEmail, inviteeIP, inviteeDeviceId } = input;
  if (inviteeEmail && inviter?.email) {
    if (inviter.email.toLowerCase() === inviteeEmail.toLowerCase()) {
      flags.push('SAME_EMAIL');
    } else {
      const inviterDomain = inviter.email.split('@')[1]?.toLowerCase();
      const inviteeDomain = inviteeEmail.split('@')[1]?.toLowerCase();
      const inviterLocal = inviter.email.split('@')[0]?.toLowerCase();
      const inviteeLocal = inviteeEmail.split('@')[0]?.toLowerCase();
      if (inviterDomain === inviteeDomain) flags.push('SAME_EMAIL_DOMAIN');
      if (inviterLocal && inviteeLocal && similarity(inviterLocal, inviteeLocal) > 0.85) {
        flags.push('SIMILAR_EMAIL_LOCAL');
      }
      if (inviteeDomain && DISPOSABLE_EMAIL_DOMAINS.has(inviteeDomain)) {
        flags.push('DISPOSABLE_EMAIL');
      }
    }
  }
  if (inviteeDeviceId && inviter?.deviceFingerprint && inviteeDeviceId === inviter.deviceFingerprint) {
    flags.push('SAME_DEVICE');
  }
  if (inviteeIP && inviter?.lastSeenIp && inviteeIP === inviter.lastSeenIp) {
    flags.push('SAME_IP');
  }
  return flags;
}

function publicShareBase(): string {
  // Default: Vercel-deployen som är live just nu. matgo.se (custom domain)
  // är inte DNS-kopplad ännu — länkar dit dör. Bytt default tills custom
  // domain pekas till Vercel. Override via WEB_BASE_URL i Railway när det
  // är klart.
  return (
    process.env.WEB_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://matgo-web-pi.vercel.app'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer endpoints (mountas under /api/account/)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/account/referral
router.get('/referral', authenticateUser, async (req: any, res: any) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const settings = await getSettings();
    const snapshot = await snapshotReferralDeal();

    // Lock-state: kräver att user har minst 1 betald order innan de kan
    // bjuda in andra. Förhindrar att fake-konton sprider länkar utan att
    // själva ha betalat något. Genererar referralCode lazy först när
    // detta villkor är uppfyllt.
    const paidOrderCount = await (prisma as any).order.count({
      where: { userId, paymentStatus: 'PAID' },
    });
    const locked = paidOrderCount < 1;

    const dealPayload = snapshot
      ? {
          title: snapshot.title,
          discountType: snapshot.discountType,
          discountPercent: snapshot.discountPercent,
          amountKr: snapshot.amountKr,
          freeDelivery: snapshot.freeDelivery,
          minOrderKr: snapshot.minOrderKr,
          validUntil: snapshot.validUntil ? snapshot.validUntil.toISOString() : null,
        }
      : null;

    if (locked) {
      // Skicka deal-info som teaser så lock-screen kan visa vad som väntar.
      // Inga stats eller code — användaren har inte unlockat än.
      return res.json({
        locked: true,
        code: null,
        shareUrl: null,
        enabled: !!settings.referralEnabled && !!snapshot,
        deal: dealPayload,
        rewardLabel: formatRewardLabel(snapshot),
        couponsPerSide: settings.referralCouponsPerSide ?? 1,
        stats: { invited: 0, registered: 0, ordered: 0, totalEarnedKr: 0 },
      });
    }

    const code = await ensureReferralCode(userId);

    // Stats: hämta inviter:s referrals (endast om unlocked)
    const referrals = await (prisma as any).referral.findMany({
      where: { inviterUserId: userId },
      select: { status: true, rewardedAt: true },
    });
    const stats = {
      invited: referrals.length,
      registered: referrals.filter((r: any) => ['REGISTERED', 'ORDERED'].includes(r.status)).length,
      ordered: referrals.filter((r: any) => r.status === 'ORDERED').length,
      totalEarnedKr:
        referrals.filter((r: any) => r.status === 'ORDERED').length *
        (settings.referralRewardKr ?? 50),
    };

    const rewardPercent = snapshot?.discountPercent ?? null;
    const rewardKr = snapshot?.amountKr ?? null;
    const discountType = snapshot?.discountType ?? null;
    const couponsPerSide = settings.referralCouponsPerSide ?? 1;
    const rewardLabel = formatRewardLabel(snapshot);

    res.json({
      locked: false,
      code,
      shareUrl: `${publicShareBase()}/r/${code}`,
      enabled: !!settings.referralEnabled && !!snapshot,
      // Full deal-info för visuell display i frontend. null om ingen Deal vald.
      deal: snapshot
        ? {
            title: snapshot.title,
            discountType: snapshot.discountType,
            discountPercent: snapshot.discountPercent,
            amountKr: snapshot.amountKr,
            freeDelivery: snapshot.freeDelivery,
            minOrderKr: snapshot.minOrderKr,
            // validUntil = null betyder "tills vidare" på frontend.
            // expiresAt (intern UserDeal-expiry) skickas inte hit eftersom
            // den alltid har ett värde och skulle förvirra display-logiken.
            validUntil: snapshot.validUntil ? snapshot.validUntil.toISOString() : null,
          }
        : null,
      // Legacy/convenience-fält — backend-formaterad text för splice-display.
      discountType,
      rewardPercent,
      rewardKr,
      rewardLabel,
      couponsPerSide,
      stats,
    });
  } catch (err: any) {
    console.error('[referral GET] error:', err?.message);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/account/redeem-code
// Body: { code, email?, deviceFingerprint?, ip? }
// - Kan kallas under registrering (utan auth) ELLER efter (auth).
// - Hittar inviter via code, skapar Referral i PENDING/REGISTERED.
// - INGEN hard-block — soft-fraud-flags loggas bara.
const redeemSchema = z.object({
  code: z.string().min(4).max(16),
  email: z.string().email().optional(),
  deviceFingerprint: z.string().optional(),
});

// Dedikerad rate-limit ovanpå global — 8-tecken referral-koder är guess:bara,
// så vi tar ner försök till 20/h per IP. In-memory map (per process) räcker
// för denna soft-protection; ip-pool-angripare fångas ändå av brute-counter.
const redeemLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1h
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'För många försök. Försök igen om en timme.' },
});

// Brute-force-räknare per IP — rensar sig själv via expiry-stamp. Vid 5+
// failed redeem (kod hittas inte) inom 10 min → console.warn.
const REDEEM_BRUTE_WINDOW_MS = 10 * 60 * 1000;
const REDEEM_BRUTE_THRESHOLD = 5;
const redeemFailedAttempts = new Map<string, { count: number; firstAt: number }>();
function noteFailedRedeem(ip: string): void {
  if (!ip) return;
  const now = Date.now();
  const existing = redeemFailedAttempts.get(ip);
  if (!existing || now - existing.firstAt > REDEEM_BRUTE_WINDOW_MS) {
    redeemFailedAttempts.set(ip, { count: 1, firstAt: now });
    return;
  }
  existing.count += 1;
  if (existing.count >= REDEEM_BRUTE_THRESHOLD) {
    console.warn(`[referral-bruteforce] IP=${ip} har ${existing.count} failed redeem-försök`);
  }
}

router.post('/redeem-code', redeemLimiter, async (req: any, res: any) => {
  try {
    const parsed = redeemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Ogiltig kod' });
    }
    const { code, email, deviceFingerprint } = parsed.data;
    const normalizedCode = code.trim().toUpperCase();

    // findFirst (inte findUnique) så vi kan filtrera på deletedAt — vi vill
    // INTE hitta inviter:s vars konto admin har raderat. Annars: en gammal
    // kod från en raderad user kan fortfarande redeemas och skapa Referral-
    // rader mot inviteeUserId=null inviter.
    const inviter = await (prisma as any).user.findFirst({
      where: { referralCode: normalizedCode, deletedAt: null },
      select: {
        id: true,
        name: true,
        firstName: true,
        email: true,
        deviceFingerprint: true,
        lastSeenIp: true,
      },
    });
    const ip = (req.ip || req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim();
    if (!inviter) {
      noteFailedRedeem(ip);
      return res.status(404).json({ error: 'Kod hittades inte' });
    }
    const flags = computeFraudFlags({
      inviter,
      inviteeEmail: email ?? null,
      inviteeIP: ip || null,
      inviteeDeviceId: deviceFingerprint ?? null,
    });

    // HARD-BLOCK: samma device som inviter får ALDRIG redeem:a koden.
    // Detta förhindrar att en användare registrerar ett fake-konto i
    // samma browser/app och använder sin egen kod för rabatt. Tidigare
    // var detta endast en SAME_DEVICE-flagga (loggades) — nu hård-blockad.
    // Båda fingerprints måste finnas för att match ska räknas (null != null).
    if (
      deviceFingerprint &&
      inviter.deviceFingerprint &&
      deviceFingerprint === inviter.deviceFingerprint
    ) {
      noteFailedRedeem(ip);
      return res.status(400).json({
        error: 'Koden kan inte användas från samma enhet som ägaren av koden',
        sameDevice: true,
      });
    }

    // Är det en inloggad user? Då länkar vi inviteeUserId direkt.
    let inviteeUserId: string | null = null;
    let inviterName = inviter.firstName || inviter.name || 'En vän';
    if (req.headers.authorization?.startsWith('Bearer ')) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const { JWT_SECRET } = require('../lib/config');
        const payload: any = jwt.verify(token, JWT_SECRET);
        if (payload?.id && payload.id !== inviter.id) {
          inviteeUserId = payload.id;
        }
      } catch {
        // ignore
      }
    }

    // Förhindra dubbel-redeem av samma user
    if (inviteeUserId) {
      const existing = await (prisma as any).referral.findUnique({
        where: { inviteeUserId },
      });
      if (existing) {
        return res.status(409).json({
          error: 'Du har redan använt en referral-kod',
          alreadyRedeemed: true,
        });
      }
    }

    // Inviter får inte använda sin egen kod
    if (inviteeUserId && inviteeUserId === inviter.id) {
      return res.status(400).json({ error: 'Du kan inte använda din egen kod' });
    }

    const newReferral = await (prisma as any).referral.create({
      data: {
        code: normalizedCode,
        inviterUserId: inviter.id,
        inviteeUserId: inviteeUserId ?? undefined,
        inviteeEmail: email ?? null,
        inviteeIP: ip || null,
        inviteeDeviceId: deviceFingerprint ?? null,
        fraudFlags: flags,
        status: inviteeUserId ? 'REGISTERED' : 'PENDING',
        registeredAt: inviteeUserId ? new Date() : null,
      },
    });

    // ── Dela ut UserDeals direkt vid redemption ──────────────────────────
    // Vi pekar på den Deal admin har valt i /admin/marketing-referrals och
    // snapshotar dess värden in i UserDeal-raderna. Om ingen Deal är vald
    // (eller den är inaktiv) → skipa silent, referral-raden finns ändå för
    // stats men ingen reward delas ut.
    //
    // Båda parter får N kuponger (N = referralCouponsPerSide, default 1).
    // Inviter-rewarden ges DIREKT — anti-abuse hanteras av cap-checken som
    // räknar status='ORDERED' rewards per inviter senaste 30 dagar.
    let dealsCreatedFor = { invitee: 0, inviter: 0 };
    if (inviteeUserId) {
      try {
        const snapshot = await snapshotReferralDeal();
        const settings = await getSettings();
        const couponsPerSide = Math.max(1, settings.referralCouponsPerSide ?? 1);
        if (snapshot) {
          // Invitee får sina kuponger
          for (let i = 0; i < couponsPerSide; i++) {
            await (prisma as any).userDeal.create({
              data: {
                userId: inviteeUserId,
                dealId: snapshot.dealId,
                type: 'REFERRAL_INVITEE',
                amountKr: snapshot.amountKr,
                discountPercent: snapshot.discountPercent,
                discountType: snapshot.discountType,
                freeDelivery: snapshot.freeDelivery,
                expiresAt: snapshot.expiresAt,
                metadata: {
                  referralId: newReferral.id,
                  inviterUserId: inviter.id,
                  minOrderKr: snapshot.minOrderKr,
                },
              },
            });
            dealsCreatedFor.invitee++;
          }
          // Inviter-rewarden hanteras i maybeTriggerReferralReward (vid
          // invitee:s första betalda order) — anti-abuse, så inte vem
          // som helst kan göra fake-redeems för att dränera inviter:s
          // kupong-flöde.
        }
      } catch (rewardErr: any) {
        console.error('[redeem-code] reward-creation error (referral-rad skapad ändå):', rewardErr?.message);
      }
    }

    res.json({ ok: true, inviterName, dealsCreated: dealsCreatedFor.invitee });
  } catch (err: any) {
    console.error('[redeem-code] error:', err?.message);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// GET /api/account/deals — lista mina aktiva UserDeals
router.get('/deals', authenticateUser, async (req: any, res: any) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const now = new Date();
    const deals = await (prisma as any).userDeal.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ deals });
  } catch (err: any) {
    console.error('[user-deals GET] error:', err?.message);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Public preview endpoint (mountas under /api/public/)
// ─────────────────────────────────────────────────────────────────────────────

export const publicRouter = Router();

publicRouter.get('/referral-preview', async (req: any, res: any) => {
  try {
    const code = String(req.query?.code || '').trim().toUpperCase();
    if (!code) return res.json({ exists: false });

    // findFirst + deletedAt:null så raderade users inte syns som giltiga
    // inviters på landing-pages /r/{code}.
    const inviter = await (prisma as any).user.findFirst({
      where: { referralCode: code, deletedAt: null },
      select: { firstName: true, name: true },
    });
    if (!inviter) return res.json({ exists: false });

    const settings = await getSettings();
    const snapshot = await snapshotReferralDeal();
    res.json({
      exists: true,
      inviterName: inviter.firstName || inviter.name || 'En vän',
      deal: snapshot
        ? {
            title: snapshot.title,
            discountType: snapshot.discountType,
            discountPercent: snapshot.discountPercent,
            amountKr: snapshot.amountKr,
            freeDelivery: snapshot.freeDelivery,
            minOrderKr: snapshot.minOrderKr,
            // validUntil = null betyder "tills vidare" på frontend.
            // expiresAt (intern UserDeal-expiry) skickas inte hit eftersom
            // den alltid har ett värde och skulle förvirra display-logiken.
            validUntil: snapshot.validUntil ? snapshot.validUntil.toISOString() : null,
          }
        : null,
      discountType: snapshot?.discountType ?? null,
      rewardPercent: snapshot?.discountPercent ?? null,
      rewardKr: snapshot?.amountKr ?? null,
      rewardLabel: formatRewardLabel(snapshot),
      couponsPerSide: settings.referralCouponsPerSide ?? 1,
      enabled: !!settings.referralEnabled && !!snapshot,
    });
  } catch (err: any) {
    console.error('[referral-preview] error:', err?.message);
    res.json({ exists: false });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin endpoints (mountas under /api/admin/)
// ─────────────────────────────────────────────────────────────────────────────

export const adminRouter = Router();

// GET /api/admin/welcome-deal — hämta config
adminRouter.get('/welcome-deal', authenticate, requireSuperAdmin, async (_req, res) => {
  try {
    const settings = await getSettings();
    // Lista tillgängliga Deals för referral-dropdown. Endast Personal Templates
    // — globala kupong-deals (som visas på sajten med public code) ska INTE
    // kunna kopplas som referral-reward, eftersom referral kräver en mall
    // som inte är publik. Admin skapar dessa i /admin/deals → fliken
    // "Personliga deals".
    const availableDeals = await (prisma as any).deal.findMany({
      where: { isActive: true, isPersonalTemplate: true },
      select: {
        id: true,
        title: true,
        discountType: true,
        discountValue: true,
        freeDelivery: true,
        minOrder: true,
        validUntil: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      welcomeDealActive: !!settings.welcomeDealActive,
      welcomeDealId: settings.welcomeDealId ?? null,
      referralEnabled: !!settings.referralEnabled,
      referralDealId: settings.referralDealId ?? null,
      referralCouponsPerSide: settings.referralCouponsPerSide ?? 1,
      referralMaxRewardsPerInviter: settings.referralMaxRewardsPerInviter ?? 20,
      availableDeals,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Serverfel', detail: err?.message });
  }
});

const welcomeDealUpdateSchema = z.object({
  welcomeDealActive: z.boolean().optional(),
  welcomeDealId: z.string().nullable().optional(),
  referralEnabled: z.boolean().optional(),
  referralDealId: z.string().nullable().optional(),
  referralCouponsPerSide: z.number().int().min(1).max(10).optional(),
  referralMaxRewardsPerInviter: z.number().int().min(0).max(1000).optional(),
});

// Hjälpfunktion: validera att en deal-id pekar på en aktiv Personal Template.
async function validatePersonalTemplate(dealId: string): Promise<string | null> {
  const deal = await (prisma as any).deal.findUnique({
    where: { id: dealId },
    select: { id: true, isActive: true, isPersonalTemplate: true },
  });
  if (!deal) return 'Vald deal hittades inte';
  if (!deal.isActive) return 'Vald deal är inaktiv';
  if (!deal.isPersonalTemplate) {
    return 'Bara Personliga Deals kan användas. Skapa en mall i /marketing-referrals.';
  }
  return null;
}

adminRouter.patch('/welcome-deal', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const parsed = welcomeDealUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Ogiltiga värden', detail: parsed.error.errors });
    }
    // Validera dropdown-vals (welcomeDealId + referralDealId) — båda måste
    // peka på aktiva Personal Templates.
    if (parsed.data.referralDealId) {
      const err = await validatePersonalTemplate(parsed.data.referralDealId);
      if (err) return res.status(400).json({ error: err });
    }
    if (parsed.data.welcomeDealId) {
      const err = await validatePersonalTemplate(parsed.data.welcomeDealId);
      if (err) return res.status(400).json({ error: err });
    }
    const updated = await (prisma as any).restaurantSettings.update({
      where: { id: 'settings' },
      data: parsed.data,
    });
    await audit(req as AuthRequest, 'WELCOME_DEAL_CONFIG_UPDATE', {
      resourceType: 'RestaurantSettings',
      resourceId: 'settings',
      changes: parsed.data,
    });
    res.json({
      welcomeDealActive: !!updated.welcomeDealActive,
      welcomeDealId: updated.welcomeDealId,
      referralEnabled: !!updated.referralEnabled,
      referralDealId: updated.referralDealId,
      referralCouponsPerSide: updated.referralCouponsPerSide,
      referralMaxRewardsPerInviter: updated.referralMaxRewardsPerInviter,
    });
  } catch (err: any) {
    console.error('[welcome-deal PATCH] error:', err?.message);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// GET /api/admin/referrals?status=&search=&page=
adminRouter.get('/referrals', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const status = (req.query?.status as string) || undefined;
    const search = (req.query?.search as string) || undefined;
    const page = parseInt((req.query?.page as string) || '1', 10);
    const pageSize = 25;

    const where: any = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { inviter: { name: { contains: search, mode: 'insensitive' } } },
        { inviter: { email: { contains: search, mode: 'insensitive' } } },
        { invitee: { name: { contains: search, mode: 'insensitive' } } },
        { invitee: { email: { contains: search, mode: 'insensitive' } } },
        { inviteeEmail: { contains: search, mode: 'insensitive' } },
        { code: { contains: search.toUpperCase() } },
      ];
    }

    const [total, rows] = await Promise.all([
      (prisma as any).referral.count({ where }),
      (prisma as any).referral.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          inviter: { select: { id: true, name: true, email: true } },
          invitee: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    res.json({
      data: rows.map((r: any) => ({
        id: r.id,
        code: r.code,
        inviterUserId: r.inviterUserId,
        inviterName: r.inviter?.name || null,
        inviterEmail: r.inviter?.email || null,
        inviteeUserId: r.inviteeUserId,
        inviteeName: r.invitee?.name || null,
        inviteeEmail: r.invitee?.email || r.inviteeEmail || null,
        status: r.status,
        fraudFlags: r.fraudFlags || [],
        inviteeOrderId: r.inviteeOrderId,
        createdAt: r.createdAt,
        registeredAt: r.registeredAt,
        rewardedAt: r.rewardedAt,
        revertedAt: r.revertedAt,
        revertReason: r.revertReason,
      })),
      total,
      page,
      pageSize,
    });
  } catch (err: any) {
    console.error('[admin referrals] error:', err?.message);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// GET /api/admin/referrals/:id
adminRouter.get('/referrals/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const row = await (prisma as any).referral.findUnique({
      where: { id: req.params.id },
      include: {
        inviter: { select: { id: true, name: true, email: true, phone: true, createdAt: true } },
        invitee: { select: { id: true, name: true, email: true, phone: true, createdAt: true } },
      },
    });
    if (!row) return res.status(404).json({ error: 'Hittades inte' });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/admin/referrals/:id/revert
adminRouter.post('/referrals/:id/revert', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'Ange en anledning' });

    const referralId = req.params.id;
    const referral = await (prisma as any).referral.findUnique({ where: { id: referralId } });
    if (!referral) return res.status(404).json({ error: 'Hittades inte' });

    await (prisma as any).$transaction([
      (prisma as any).referral.update({
        where: { id: referralId },
        data: {
          status: 'REVERTED',
          revertedAt: new Date(),
          revertedBy: (req as any).user?.id ?? null,
          revertReason: reason,
        },
      }),
      // Revoka tilldelade rewards för båda parter
      (prisma as any).userDeal.updateMany({
        where: {
          type: { in: ['REFERRAL_INVITER', 'REFERRAL_INVITEE'] },
          status: 'ACTIVE',
          // metadata-filter funkar inte i alla DB, men vi har inviterUserId/inviteeUserId
          // som ledare. Använd userId-array istället.
          userId: { in: [referral.inviterUserId, referral.inviteeUserId].filter(Boolean) },
        },
        data: { status: 'EXPIRED' },
      }),
    ]);

    await audit(req as AuthRequest, 'REFERRAL_REVERTED', {
      resourceType: 'Referral',
      resourceId: referralId,
      changes: { reason },
    });

    res.json({ ok: true });
  } catch (err: any) {
    console.error('[referral revert] error:', err?.message);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// GET /api/admin/stats/referrals
adminRouter.get('/stats/referrals', authenticate, requireSuperAdmin, async (_req, res) => {
  try {
    const all = await (prisma as any).referral.findMany({
      select: {
        status: true,
        fraudFlags: true,
        inviterUserId: true,
        rewardedAt: true,
      },
    });
    const settings = await getSettings();
    const rewardKr = settings.referralRewardKr ?? 50;

    const funnel = {
      invited: all.length,
      registered: all.filter((r: any) => ['REGISTERED', 'ORDERED'].includes(r.status)).length,
      ordered: all.filter((r: any) => r.status === 'ORDERED').length,
      rewarded: all.filter((r: any) => r.rewardedAt).length,
    };

    // Top inviters
    const byInviter: Record<string, number> = {};
    for (const r of all) {
      if (r.status === 'ORDERED') {
        byInviter[r.inviterUserId] = (byInviter[r.inviterUserId] || 0) + 1;
      }
    }
    const topIds = Object.entries(byInviter)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => id);
    const topUsers =
      topIds.length > 0
        ? await (prisma as any).user.findMany({
            where: { id: { in: topIds } },
            select: { id: true, name: true, email: true },
          })
        : [];
    const topInviters = topIds.map((id) => {
      const u = topUsers.find((x: any) => x.id === id);
      const count = byInviter[id];
      return {
        userId: id,
        name: u?.name || u?.email || '—',
        count,
        earnedKr: count * rewardKr,
      };
    });

    // Suspicious patterns
    const flagCounts: Record<string, number> = {};
    for (const r of all) {
      for (const f of r.fraudFlags || []) {
        flagCounts[f] = (flagCounts[f] || 0) + 1;
      }
    }
    const suspiciousPatterns = Object.entries(flagCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([pattern, count]) => ({ pattern, count }));

    res.json({ funnel, topInviters, suspiciousPatterns });
  } catch (err: any) {
    console.error('[referral stats] error:', err?.message);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Reward-trigger (anropas från orders.ts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kallas när en order flippas till PAID/COMPLETED. Om det är invitee:s
 * FÖRSTA betalda order och referral är PENDING/REGISTERED, skapar UserDeals
 * till båda + flippar referralen till ORDERED.
 */
export async function maybeTriggerReferralReward(orderId: string): Promise<void> {
  try {
    const order = await (prisma as any).order.findUnique({
      where: { id: orderId },
      select: { id: true, userId: true, status: true },
    });
    if (!order?.userId) return;

    const settings = await getSettings();
    if (!settings.referralEnabled) return;

    // Är detta user's första betalda order?
    const previousPaid = await (prisma as any).order.count({
      where: {
        userId: order.userId,
        id: { not: orderId },
        status: { in: ['PAID', 'COMPLETED', 'DELIVERED', 'PREPARING', 'OUT_FOR_DELIVERY', 'READY'] },
      },
    });
    if (previousPaid > 0) return;

    const referral = await (prisma as any).referral.findFirst({
      where: { inviteeUserId: order.userId, status: 'REGISTERED' },
    });
    if (!referral) return;

    // Reward-cap per inviter — soft fraud prevention. Default 20 = max 20 referrals/månad.
    const maxRewards = settings.referralMaxRewardsPerInviter ?? 20;
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentRewards = await (prisma as any).referral.count({
      where: {
        inviterUserId: referral.inviterUserId,
        status: 'ORDERED',
        rewardedAt: { gte: last30Days },
      },
    });
    if (recentRewards >= maxRewards) {
      console.warn(
        `[referral] Inviter ${referral.inviterUserId} har nått cap (${maxRewards}/30d) — skippar reward för referral ${referral.id}`
      );
      return;
    }

    // Snapshot den admin-valda Dealen för INVITER-rewarden (invitee fick
    // sina kuponger redan vid redemption). Skipa om ingen Deal vald.
    const snapshot = await snapshotReferralDeal();
    if (!snapshot) {
      // Markera Referral som ORDERED ändå (för stats) men ingen reward.
      await (prisma as any).referral.updateMany({
        where: { id: referral.id, status: 'REGISTERED' },
        data: { status: 'ORDERED', rewardedAt: new Date(), inviteeOrderId: orderId },
      });
      console.log(`[referral] Order ${orderId}: ingen referralDealId konfigurerad, hoppar reward`);
      return;
    }

    const couponsPerSide = Math.max(1, settings.referralCouponsPerSide ?? 1);

    // Interaktiv transaktion + status-guard på updateMany — gör hela operationen
    // idempotent. Webhook + reconcile-poller kan båda trigga denna parallellt;
    // bara den som vinner UPDATE WHERE status='REGISTERED' skapar UserDeals.
    await (prisma as any).$transaction(async (tx: any) => {
      const updated = await tx.referral.updateMany({
        where: { id: referral.id, status: 'REGISTERED' },
        data: {
          status: 'ORDERED',
          rewardedAt: new Date(),
          inviteeOrderId: orderId,
        },
      });
      if (updated.count === 0) {
        // Någon annan hann före — idempotent skip.
        return;
      }
      // INVITER får sina N kuponger. Invitee fick sina vid redemption.
      for (let i = 0; i < couponsPerSide; i++) {
        await tx.userDeal.create({
          data: {
            userId: referral.inviterUserId,
            dealId: snapshot.dealId,
            type: 'REFERRAL_INVITER',
            amountKr: snapshot.amountKr,
            discountPercent: snapshot.discountPercent,
            discountType: snapshot.discountType,
            freeDelivery: snapshot.freeDelivery,
            expiresAt: snapshot.expiresAt,
            metadata: {
              referralId: referral.id,
              inviteeUserId: order.userId,
              minOrderKr: snapshot.minOrderKr,
            },
          },
        });
      }
    });

    console.log(`[referral] Inviter=${referral.inviterUserId} fick ${couponsPerSide} kupong(er) från Deal=${snapshot.dealId} efter invitee=${order.userId}:s första betalda order`);

    // TODO: push-notis till inviter när APNs-helper är tillgänglig härifrån
  } catch (err: any) {
    // Aldrig kasta — referral-flödet får inte krascha order-flödet.
    console.error('[maybeTriggerReferralReward] error:', err?.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Welcome-deal-trigger (anropas från auth.ts vid ny user-creation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Skapar en WELCOME UserDeal till en nyregistrerad user om welcome-dealen
 * är aktiv i settings. Tyst no-op om inte aktiv.
 */
export async function maybeCreateWelcomeDeal(userId: string): Promise<void> {
  try {
    const snapshot = await snapshotWelcomeDeal();
    if (!snapshot) {
      // welcomeDealActive=false ELLER ingen Deal vald ELLER Dealen är inte
      // en Personal Template → ingen welcome-deal skapas. Helt OK — admin
      // har inte konfigurerat funktionen än.
      return;
    }

    await (prisma as any).userDeal.create({
      data: {
        userId,
        dealId: snapshot.dealId,
        type: 'WELCOME',
        amountKr: snapshot.amountKr,
        discountPercent: snapshot.discountPercent,
        discountType: snapshot.discountType,
        freeDelivery: snapshot.freeDelivery,
        expiresAt: snapshot.expiresAt,
        metadata: { minOrderKr: snapshot.minOrderKr },
      },
    });
  } catch (err: any) {
    console.error('[maybeCreateWelcomeDeal] error:', err?.message);
  }
}

export default router;
