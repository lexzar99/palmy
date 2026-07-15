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
//   - Anropas FRÅN auth.ts när nytt kundkonto skapas (phone-token + oauth-token).

import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import prisma from '../lib/prisma';
import { authenticateUser } from './auth';
import { authenticate, requireSuperAdmin, AuthRequest } from '../middleware/auth';
import { audit } from '../lib/auditLog';
import { isAppClient } from '../lib/clientPlatform';
import {
  isReferralRewardCompletion,
  normalizeReferralPhone,
  referralPhoneVariants,
} from '../lib/referralRules';
import {
  guestReferralProfileUserId,
  parseGuestReferralProfileProof,
  REFERRAL_PROFILE_DENIED,
} from '../lib/referralProfileAccess';
import {
  ORDER_HTTP_SESSION_HEADER,
  ownsOrderWithActiveRawSecret,
  verifyOrderHttpSession,
} from '../lib/orderAccess';

export { normalizeReferralPhone } from '../lib/referralRules';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const isRetiredFavoriteUserDeal = (deal: any) => {
  const metadata = (deal?.metadata || {}) as any;
  return deal?.type === 'FAVORITE_PRODUCT' || Boolean(metadata.favoriteProductId);
};

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // utan 0/O/1/I/L för läsbarhet
const CODE_LENGTH = 8;

function generateCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  }
  return out;
}

function generateRewardCode(): string {
  let suffix = '';
  for (let i = 0; i < 8; i++) {
    suffix += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  }
  return `TACK${suffix}`;
}

async function createUniqueRewardCode(db: any): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const candidate = generateRewardCode();
    const exists = await db.userDeal.findUnique({ where: { code: candidate }, select: { id: true } });
    if (!exists) return candidate;
  }
  throw new Error('Kunde inte skapa unik personlig rabattkod');
}

export async function ensureReferralCode(userId: string): Promise<string> {
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
    referralInviteeDealId: row.referralInviteeDealId ?? row.referralDealId ?? null,
    referralInviterDealId: row.referralInviterDealId ?? row.referralDealId ?? null,
    referralCouponsPerSide: row.referralCouponsPerSide ?? 1,
    referralRewardKr: row.referralRewardKr ?? 50, // legacy
    referralRewardPercent: row.referralRewardPercent ?? 20, // legacy
    referralMinOrderKr: row.referralMinOrderKr ?? 150, // legacy
    referralMaxRewardsPerInviter: row.referralMaxRewardsPerInviter ?? 20,
    welcomeDealActive: row.welcomeDealActive ?? true,
    welcomeDealId: row.welcomeDealId ?? null,
    welcomeAudience: row.welcomeAudience ?? 'FIRST_ORDER',
    welcomeMaxOrders: row.welcomeMaxOrders ?? 1,
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
    // FIXED-rabatt lagras i ÖRE (normalizeDealInputForDb + ensureWelcomeTemplate)
    // → /100 till kr. (Tidigare lästes den rakt av → 100× för stort belopp.)
    amountKr: isFixed ? Math.round((deal.discountValue ?? 0) / 100) : null,
    freeDelivery,
    minOrderKr,
    expiresAt,
    validUntil: deal.validUntil ? new Date(deal.validUntil) : null,
  };
}

async function snapshotReferralDeal(side: 'INVITEE' | 'INVITER'): Promise<DealSnapshot | null> {
  const settings = await getSettings();
  if (!settings.referralEnabled) return null;
  return snapshotDealById(
    side === 'INVITEE'
      ? settings.referralInviteeDealId
      : settings.referralInviterDealId,
  );
}

async function snapshotWelcomeDeal(): Promise<DealSnapshot | null> {
  const settings = await getSettings();
  if (!settings.welcomeDealActive) return null;
  return snapshotDealById(settings.welcomeDealId);
}

export type WelcomeOffer = {
  dealId: string;
  title: string;
  discountPercent: number | null;
  amountKr: number | null;
  freeDelivery: boolean;
  minOrderKr: number;
  audience: 'FIRST_ORDER' | 'ALL' | 'LOGGED_IN' | string;
  maxOrders: number;
};

// Det publika välkomsterbjudandet som driver kassans toggle. Returnerar null
// om inaktivt eller om ingen giltig mall är vald. `eligible` avgörs av
// anroparen utifrån audience/maxOrders (se isWelcomeEligible).
export async function getWelcomeOffer(): Promise<WelcomeOffer | null> {
  const settings = await getSettings();
  if (!settings.welcomeDealActive) return null;
  const snap = await snapshotDealById(settings.welcomeDealId);
  if (!snap) return null;
  return {
    dealId: snap.dealId,
    title: snap.title,
    discountPercent: snap.discountPercent,
    amountKr: snap.amountKr,
    freeDelivery: snap.freeDelivery,
    minOrderKr: snap.minOrderKr,
    audience: settings.welcomeAudience ?? 'FIRST_ORDER',
    maxOrders: settings.welcomeMaxOrders ?? 1,
  };
}

// Avgör om en kund är berättigad till välkomsterbjudandet givet kontext.
// priorOrderCount = null betyder "okänt" (gäst-preview utan telefon) →
// optimistiskt true (kassan visar; checkout validerar med riktig telefon).
export function isWelcomeEligible(
  offer: WelcomeOffer,
  opts: { priorOrderCount?: number | null; isLoggedIn?: boolean },
): boolean {
  if (offer.audience === 'ALL') return true;
  if (offer.audience === 'LOGGED_IN') {
    if (!opts.isLoggedIn) return false;
    return opts.priorOrderCount == null ? true : opts.priorOrderCount < offer.maxOrders;
  }
  // FIRST_ORDER
  return opts.priorOrderCount == null ? true : opts.priorOrderCount < offer.maxOrders;
}

// Rabattbelopp i öre för välkomsterbjudandet (exkl. fri leverans, som
// hanteras separat av anroparen mot deliveryFee).
export function welcomeOfferDiscountOre(offer: WelcomeOffer, subtotalOre: number): number {
  if (subtotalOre < offer.minOrderKr * 100) return 0;
  let d = 0;
  if (offer.discountPercent && offer.discountPercent > 0) {
    d = Math.round((subtotalOre * offer.discountPercent) / 100);
  } else if (offer.amountKr && offer.amountKr > 0) {
    d = offer.amountKr * 100;
  }
  return Math.min(d, subtotalOre);
}

// Format-helper för customer-facing UI. Bygger en grammatiskt komplett
// string som frontend kan splice in i texter utan extra logik:
//   "20% rabatt" / "50 kr rabatt" / "Fri leverans" /
//   "20% rabatt + Fri leverans" / "rabatt" (fallback).
export function formatRewardLabel(snapshot: DealSnapshot | null): string {
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

export function computeFraudFlags(input: {
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

export function publicShareBase(): string {
  // Default: den live custom-domänen viaeats.se. Override via WEB_BASE_URL i
  // Railway vid behov (t.ex. staging eller om domänen byts).
  return (
    process.env.WEB_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://viaeats.se'
  );
}

function referralDealPayload(snapshot: DealSnapshot | null) {
  if (!snapshot) return null;
  return {
    title: snapshot.title,
    discountType: snapshot.discountType,
    discountPercent: snapshot.discountPercent,
    amountKr: snapshot.amountKr,
    freeDelivery: snapshot.freeDelivery,
    minOrderKr: snapshot.minOrderKr,
    validUntil: snapshot.validUntil ? snapshot.validUntil.toISOString() : null,
  };
}

async function buildReferralProfile(userId: string) {
  const [settings, inviterSnapshot, inviteeSnapshot] = await Promise.all([
    getSettings(),
    snapshotReferralDeal('INVITER'),
    snapshotReferralDeal('INVITEE'),
  ]);
  if (REFERRALS_DISABLED) {
    return {
      locked: true,
      code: null,
      shareUrl: null,
      enabled: false,
      deal: null,
      inviterDeal: null,
      inviteeDeal: null,
      rewardLabel: null,
      inviterRewardLabel: null,
      inviteeRewardLabel: null,
      discountType: null,
      rewardPercent: null,
      rewardKr: null,
      couponsPerSide: settings.referralCouponsPerSide ?? 1,
      stats: { invited: 0, registered: 0, ordered: 0, totalEarnedKr: 0 },
      deals: [],
    };
  }
  const completedOrderCount = await (prisma as any).order.count({
    where: {
      userId,
      paymentStatus: 'PAID',
      status: { in: ['DELIVERED', 'COMPLETED'] },
    },
  });
  const locked = completedOrderCount < 1;
  const code = locked ? null : await ensureReferralCode(userId);
  const referrals = locked
    ? []
    : await (prisma as any).referral.findMany({
        where: { inviterUserId: userId },
        select: { status: true, rewardedAt: true },
      });
  const activeDeals = locked
    ? []
    : await (prisma as any).userDeal.findMany({
        where: {
          userId,
          status: 'ACTIVE',
          type: { in: ['REFERRAL_INVITER', 'REFERRAL_INVITEE'] },
          OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
        },
        orderBy: { createdAt: 'desc' },
      });
  const ordered = referrals.filter((row: any) => row.status === 'ORDERED').length;
  return {
    locked,
    code,
    shareUrl: code ? `${publicShareBase()}/r/${code}` : null,
    enabled: !REFERRALS_DISABLED && !!settings.referralEnabled && !!inviterSnapshot && !!inviteeSnapshot,
    rewardLabel: formatRewardLabel(inviterSnapshot),
    inviterRewardLabel: formatRewardLabel(inviterSnapshot),
    inviteeRewardLabel: formatRewardLabel(inviteeSnapshot),
    deal: referralDealPayload(inviterSnapshot),
    inviterDeal: referralDealPayload(inviterSnapshot),
    inviteeDeal: referralDealPayload(inviteeSnapshot),
    discountType: inviterSnapshot?.discountType ?? null,
    rewardPercent: inviterSnapshot?.discountPercent ?? null,
    rewardKr: inviterSnapshot?.amountKr ?? null,
    couponsPerSide: settings.referralCouponsPerSide ?? 1,
    stats: {
      invited: referrals.length,
      registered: referrals.filter((row: any) => ['REGISTERED', 'ORDERED'].includes(row.status)).length,
      ordered,
      totalEarnedKr: ordered * (settings.referralRewardKr ?? 50),
    },
    deals: activeDeals.map((deal: any) => ({
      id: deal.id,
      userDealId: deal.id,
      code: deal.code,
      type: deal.type,
      amountKr: deal.amountKr,
      discountPercent: deal.discountPercent,
      discountType: deal.discountType,
      freeDelivery: deal.freeDelivery,
      expiresAt: deal.expiresAt,
      minOrderKr: Number((deal.metadata as any)?.minOrderKr || 0),
      title: (deal.metadata as any)?.title || (deal.type === 'REFERRAL_INVITER' ? 'Tack för din värvning' : 'Din vänrabatt'),
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Customer endpoints (mountas under /api/account/)
// ─────────────────────────────────────────────────────────────────────────────

// Feature-flag: referralflöde referral (kod i kassan) är PÅ som default.
// Admin styr på/av via settings.referralEnabled; env-flaggan finns kvar som
// nödbroms (sätt REFERRALS_DISABLED=true för att hårdstänga utan deploy).
const REFERRALS_DISABLED = (process.env.REFERRALS_DISABLED ?? 'false').toLowerCase() === 'true';

// GET /api/account/referral
router.get('/referral', authenticateUser, async (req: any, res: any) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    return res.json(await buildReferralProfile(userId));
  } catch (err: any) {
    console.error('[referral GET] error:', err?.message);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// POST /api/account/redeem-code
// Body: { code, phone, name?, email?, deviceFingerprint? }
// Telefonen är identiteten. Inget konto krävs: en gäst-User skapas/återanvänds
// och konverteras senare på samma rad om kunden registrerar sig.
const redeemSchema = z.object({
  code: z.string().min(4).max(16),
  phone: z.string().min(6).max(32),
  name: z.string().max(120).optional(),
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
    const { code, phone, name, email, deviceFingerprint } = parsed.data;
    const normalizedCode = code.trim().toUpperCase();
    const normalizedPhone = normalizeReferralPhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Ange telefonnumret som beställningen ska göras med' });
    }

    // Samma kodfält hanterar även personliga engångskoder från "Mina deals".
    // De skapar ingen ny Referral; de pekar bara ut den redan tilldelade
    // UserDeal-raden och verifierar att checkout-numret är ägarens nummer.
    const personalDeal = await (prisma as any).userDeal.findFirst({
      where: {
        code: normalizedCode,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      },
      include: {
        user: { select: { phone: true } },
        deal: { select: { title: true } },
      },
    });
    if (personalDeal) {
      const metadata = (personalDeal.metadata || {}) as any;
      const ownerPhone = normalizeReferralPhone(metadata.ownerPhone || personalDeal.user?.phone);
      if (!ownerPhone || ownerPhone !== normalizedPhone) {
        return res.status(400).json({ error: 'Den personliga koden tillhör ett annat telefonnummer' });
      }
      const minOrderKr = Math.max(0, Number(metadata.minOrderKr || 0));
      return res.json({
        ok: true,
        personalCode: personalDeal.code,
        userDealId: personalDeal.id,
        dealsCreated: 0,
        inviterName: null,
        deal: {
          title: metadata.title || personalDeal.deal?.title || 'Personlig deal',
          discountType: personalDeal.discountType,
          discountPercent: personalDeal.discountPercent,
          amountKr: personalDeal.amountKr,
          freeDelivery: !!personalDeal.freeDelivery,
          minOrderKr,
        },
      });
    }

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
        phone: true,
        deviceFingerprint: true,
        lastSeenIp: true,
      },
    });
    const ip = (req.ip || req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim();
    if (!inviter) {
      noteFailedRedeem(ip);
      return res.status(404).json({ error: 'Kod hittades inte' });
    }

    const inviterPhone = normalizeReferralPhone(inviter.phone);
    if (inviterPhone && inviterPhone === normalizedPhone) {
      return res.status(400).json({
        error: 'Din egen referral-kod kan inte användas med samma telefonnummer',
        samePhone: true,
      });
    }

    // Referral-erbjudandet gäller kundens första betalda order. Vi matchar
    // både gästprofilens userId och historiska ordertelefoner för att äldre
    // format (+46/46) inte ska kunna ge samma nummer flera förstarabatter.
    const phoneCandidates = referralPhoneVariants(normalizedPhone);
    let invitee = await (prisma as any).user.findFirst({
      where: { phone: { in: phoneCandidates }, deletedAt: null },
      select: { id: true, name: true, email: true, deviceFingerprint: true },
    });
    const priorPaidOrders = await (prisma as any).order.count({
      where: {
        paymentStatus: 'PAID',
        status: { notIn: ['CANCELLED', 'REJECTED', 'DELIVERY_FAILED'] },
        OR: [
          ...(invitee?.id ? [{ userId: invitee.id }] : []),
          { customerPhone: { in: phoneCandidates } },
        ],
      },
    });
    if (priorPaidOrders > 0) {
      return res.status(409).json({
        error: 'Referral-koden gäller endast innan den första lyckade beställningen',
        alreadyCustomer: true,
      });
    }

    if (!invitee) {
      try {
        invitee = await (prisma as any).user.create({
          data: {
            name: name?.trim() || 'Gästkund',
            phone: normalizedPhone,
            email: email?.trim().toLowerCase() || null,
            isGuest: true,
            isVerified: false,
            deviceFingerprint: deviceFingerprint || null,
          },
          select: { id: true, name: true, email: true, deviceFingerprint: true },
        });
      } catch (error: any) {
        if (error?.code !== 'P2002') throw error;
        invitee = await (prisma as any).user.findFirst({
          where: { phone: { in: phoneCandidates }, deletedAt: null },
          select: { id: true, name: true, email: true, deviceFingerprint: true },
        });
      }
    }
    if (!invitee) return res.status(500).json({ error: 'Kunde inte skapa gästprofilen' });

    const existing = await (prisma as any).referral.findFirst({
      where: { OR: [{ inviteeUserId: invitee.id }, { inviteePhone: normalizedPhone }] },
      include: { inviter: { select: { firstName: true, name: true } } },
    });
    if (existing) {
      const existingDeal = await (prisma as any).userDeal.findFirst({
        where: {
          userId: invitee.id,
          type: 'REFERRAL_INVITEE',
          status: { in: ['ACTIVE', 'RESERVED'] },
          metadata: { path: ['referralId'], equals: existing.id },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (existing.shareCode === normalizedCode && existingDeal) {
        return res.json({
          ok: true,
          alreadyRedeemed: true,
          inviterName: existing.inviter?.firstName || existing.inviter?.name || 'En vän',
          dealsCreated: 0,
          userDealId: existingDeal.id,
        });
      }
      return res.status(409).json({
        error: 'Det här telefonnumret har redan använt en referral-kod',
        alreadyRedeemed: true,
      });
    }

    const flags = computeFraudFlags({
      inviter,
      inviteeEmail: email ?? invitee.email ?? null,
      inviteeIP: ip || null,
      inviteeDeviceId: deviceFingerprint ?? null,
    });
    const snapshot = await snapshotReferralDeal('INVITEE');
    if (!snapshot) return res.status(503).json({ error: 'Referral-erbjudandet är inte konfigurerat just nu' });

    const result = await (prisma as any).$transaction(async (tx: any) => {
      const newReferral = await tx.referral.create({
        data: {
          code: `ref_${crypto.randomUUID()}`,
          shareCode: normalizedCode,
          inviterUserId: inviter.id,
          inviteeUserId: invitee.id,
          inviterPhone,
          inviteePhone: normalizedPhone,
          inviteeEmail: email ?? invitee.email ?? null,
          inviteeIP: ip || null,
          inviteeDeviceId: deviceFingerprint ?? null,
          fraudFlags: flags,
          status: 'REGISTERED',
          registeredAt: new Date(),
          channel: isAppClient(req) ? 'app' : 'web',
        },
      });
      const personalCode = await createUniqueRewardCode(tx);
      const createdUserDeal = await tx.userDeal.create({
        data: {
          userId: invitee.id,
          code: personalCode,
          dealId: snapshot.dealId,
          type: 'REFERRAL_INVITEE',
          amountKr: snapshot.amountKr,
          discountPercent: snapshot.discountPercent,
          discountType: snapshot.discountType,
          freeDelivery: snapshot.freeDelivery,
          expiresAt: snapshot.expiresAt,
          metadata: {
            title: snapshot.title,
            referralId: newReferral.id,
            inviterUserId: inviter.id,
            ownerPhone: normalizedPhone,
            minOrderKr: snapshot.minOrderKr,
            validUntil: snapshot.validUntil ? snapshot.validUntil.toISOString() : null,
          },
        },
      });
      return { referralId: newReferral.id, userDealId: createdUserDeal.id, personalCode };
    });

    res.json({
      ok: true,
      inviterName: inviter.firstName || inviter.name || 'En vän',
      dealsCreated: 1,
      userDealId: result.userDealId,
      personalCode: result.personalCode,
      deal: {
        title: snapshot.title,
        discountType: snapshot.discountType,
        discountPercent: snapshot.discountPercent,
        amountKr: snapshot.amountKr,
        freeDelivery: snapshot.freeDelivery,
        minOrderKr: snapshot.minOrderKr,
      },
    });
  } catch (err: any) {
    console.error('[redeem-code] error:', err?.message);
    if (err?.code === 'P2002') {
      return res.status(409).json({ error: 'Det här telefonnumret har redan använt en referral-kod', alreadyRedeemed: true });
    }
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

    const retiredFavoriteIds: string[] = [];
    const visibleDeals = deals.filter((deal: any) => {
      if (!isRetiredFavoriteUserDeal(deal)) return true;
      retiredFavoriteIds.push(deal.id);
      return false;
    });

    if (retiredFavoriteIds.length) {
      (prisma as any).userDeal.updateMany({
        where: { id: { in: retiredFavoriteIds }, status: { in: ['ACTIVE', 'RESERVED'] } },
        data: { status: 'EXPIRED' },
      }).catch(() => null);
    }

    res.json({ deals: visibleDeals });
  } catch (err: any) {
    console.error('[user-deals GET] error:', err?.message);
    res.status(500).json({ error: 'Serverfel' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Public preview endpoint (mountas under /api/public/)
// ─────────────────────────────────────────────────────────────────────────────

export const publicRouter = Router();

function denyPublicReferralProfile(res: any) {
  res.set('Cache-Control', 'no-store');
  return res.status(404).json(REFERRAL_PROFILE_DENIED);
}

// Legacy GET (inklusive det gamla ?phone=-kontraktet) ger alltid exakt samma
// svar. Ett telefonnummer är kontaktdata, aldrig ett ägarbevis.
publicRouter.get('/referral-profile', (_req: any, res: any) => {
  return denyPublicReferralProfile(res);
});

// Konto-fri referralprofil efter den första slutförda ordern. Gästens
// högentropiska per-order-token skickas i body så den inte hamnar i URL/loggar.
publicRouter.post('/referral-profile', async (req: any, res: any) => {
  try {
    const proof = parseGuestReferralProfileProof(req.body);
    const orderId = proof?.orderId || (typeof req.body?.orderId === 'string' ? req.body.orderId : '');
    const ownsBySession = verifyOrderHttpSession(req.headers[ORDER_HTTP_SESSION_HEADER], orderId);
    if (!proof && !ownsBySession) return denyPublicReferralProfile(res);

    const order = await (prisma as any).order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        accessToken: true,
        createdAt: true,
        paymentStatus: true,
        status: true,
        type: true,
        user: { select: { deletedAt: true } },
      },
    });
    const ownsByFreshRawProof = proof && order
      ? ownsOrderWithActiveRawSecret(order, proof.accessToken)
      : false;
    const userId = ownsBySession && isReferralRewardCompletion(order)
      ? order?.userId
      : ownsByFreshRawProof
        ? guestReferralProfileUserId(proof, order)
        : null;
    if (!userId || order?.user?.deletedAt) return denyPublicReferralProfile(res);

    res.set('Cache-Control', 'private, no-store');
    return res.json(await buildReferralProfile(userId));
  } catch (err: any) {
    console.error('[public referral-profile] error:', err?.message);
    return res.status(500).json({ error: 'Serverfel' });
  }
});

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
    const snapshot = await snapshotReferralDeal('INVITEE');
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

type InlineReferralOffer = {
  discountKind: 'PERCENT' | 'FIXED' | 'NONE';
  discountValue: number;
  freeDelivery: boolean;
  minOrderKr: number;
};

const DEFAULT_REFERRAL_OFFER: InlineReferralOffer = {
  discountKind: 'PERCENT',
  discountValue: 20,
  freeDelivery: false,
  minOrderKr: 150,
};

async function readInlineOffer(dealId: string | null | undefined): Promise<InlineReferralOffer> {
  if (!dealId) return DEFAULT_REFERRAL_OFFER;
  const tpl = await (prisma as any).deal.findUnique({
    where: { id: dealId },
    select: { discountType: true, discountValue: true, freeDelivery: true, minOrder: true, isPersonalTemplate: true },
  });
  if (!tpl?.isPersonalTemplate) return DEFAULT_REFERRAL_OFFER;
  const isFixed = tpl.discountType === 'FIXED' || tpl.discountType === 'FIXED_PRICE';
  const isPercent = tpl.discountType === 'PERCENTAGE';
  return {
    discountKind: isPercent ? 'PERCENT' : isFixed ? 'FIXED' : 'NONE',
    discountValue: isFixed ? Math.round((tpl.discountValue ?? 0) / 100) : Math.round(tpl.discountValue ?? 0),
    freeDelivery: !!tpl.freeDelivery || tpl.discountType === 'FREE_DELIVERY',
    minOrderKr: Math.round((tpl.minOrder ?? 0) / 100),
  };
}

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
    // Inline-erbjudandets nuvarande värden (ur välkomst-mallen) → fyller formuläret.
    let welcomeOffer = { discountKind: 'PERCENT' as 'PERCENT' | 'FIXED' | 'NONE', discountValue: 20, freeDelivery: true, minOrderKr: 0 };
    if (settings.welcomeDealId) {
      const tpl = await (prisma as any).deal.findUnique({
        where: { id: settings.welcomeDealId },
        select: { discountType: true, discountValue: true, freeDelivery: true, minOrder: true, isPersonalTemplate: true },
      });
      if (tpl?.isPersonalTemplate) {
        const isFixed = tpl.discountType === 'FIXED' || tpl.discountType === 'FIXED_PRICE';
        const isPercent = tpl.discountType === 'PERCENTAGE';
        welcomeOffer = {
          discountKind: isPercent ? 'PERCENT' : isFixed ? 'FIXED' : 'NONE',
          discountValue: isFixed ? Math.round((tpl.discountValue ?? 0) / 100) : Math.round(tpl.discountValue ?? 0),
          freeDelivery: !!tpl.freeDelivery || tpl.discountType === 'FREE_DELIVERY',
          minOrderKr: Math.round((tpl.minOrder ?? 0) / 100),
        };
      }
    }
    res.json({
      welcomeDealActive: !!settings.welcomeDealActive,
      welcomeDealId: settings.welcomeDealId ?? null,
      welcomeOffer,
      welcomeAudience: settings.welcomeAudience ?? 'FIRST_ORDER',
      welcomeMaxOrders: settings.welcomeMaxOrders ?? 1,
      referralEnabled: !!settings.referralEnabled,
      referralDealId: settings.referralDealId ?? null,
      referralInviteeDealId: settings.referralInviteeDealId ?? null,
      referralInviterDealId: settings.referralInviterDealId ?? null,
      referralInviteeOffer: await readInlineOffer(settings.referralInviteeDealId),
      referralInviterOffer: await readInlineOffer(settings.referralInviterDealId),
      referralCouponsPerSide: settings.referralCouponsPerSide ?? 1,
      referralMaxRewardsPerInviter: settings.referralMaxRewardsPerInviter ?? 20,
      availableDeals,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Serverfel', detail: err?.message });
  }
});

const referralInlineOfferSchema = z.object({
  discountKind: z.enum(['PERCENT', 'FIXED', 'NONE']),
  discountValue: z.number().min(0).max(100000),
  freeDelivery: z.boolean(),
  minOrderKr: z.number().int().min(0).max(100000),
}).superRefine((offer, ctx) => {
  if (offer.discountKind === 'PERCENT' && offer.discountValue > 100) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountValue'], message: 'Procentrabatt får vara högst 100%' });
  }
  if ((offer.discountKind === 'NONE' || offer.discountValue <= 0) && !offer.freeDelivery) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['discountValue'], message: 'Välj rabatt eller fri leverans' });
  }
});

const welcomeDealUpdateSchema = z.object({
  welcomeDealActive: z.boolean().optional(),
  welcomeDealId: z.string().nullable().optional(),
  welcomeAudience: z.enum(['FIRST_ORDER', 'ALL', 'LOGGED_IN']).optional(),
  welcomeMaxOrders: z.number().int().min(1).max(3).optional(),
  // ── Inline välkomst-erbjudande (ersätter mall-dropdownen) ──────────────────
  // Admin definierar rabatten HÄR; backend skapar/uppdaterar den personliga
  // mallen automatiskt och sätter welcomeDealId. Ingen återvändsgränd.
  welcomeOffer: z.object({
    discountKind: z.enum(['PERCENT', 'FIXED', 'NONE']),
    discountValue: z.number().min(0).max(100000),   // PERCENT: % · FIXED: kr
    freeDelivery: z.boolean(),                        // stackbar med rabatten
    minOrderKr: z.number().int().min(0).max(100000),
  }).optional(),
  referralEnabled: z.boolean().optional(),
  referralDealId: z.string().nullable().optional(),
  referralInviteeDealId: z.string().nullable().optional(),
  referralInviterDealId: z.string().nullable().optional(),
  referralInviteeOffer: referralInlineOfferSchema.optional(),
  referralInviterOffer: referralInlineOfferSchema.optional(),
  referralCouponsPerSide: z.number().int().min(1).max(10).optional(),
  referralMaxRewardsPerInviter: z.number().int().min(0).max(1000).optional(),
});

// Skapar/uppdaterar EN dedikerad personlig mall för välkomst-erbjudandet ur
// inline-värdena och returnerar dess id. Återanvänder befintlig mall (pekad av
// welcomeDealId) om den finns → inga orphan-mallar staplas vid varje sparning.
// Lagrar i samma enheter som snapshotDealById konsumerar: FIXED i öre, minOrder
// i öre, PERCENT som %, freeDelivery ortogonal.
async function ensureWelcomeTemplate(
  currentWelcomeDealId: string | null | undefined,
  offer: { discountKind: 'PERCENT' | 'FIXED' | 'NONE'; discountValue: number; freeDelivery: boolean; minOrderKr: number },
): Promise<string> {
  const discountType = offer.discountKind === 'PERCENT' ? 'PERCENTAGE' : offer.discountKind === 'FIXED' ? 'FIXED' : 'NONE';
  const discountValue = offer.discountKind === 'FIXED' ? Math.round(offer.discountValue * 100) : Math.round(offer.discountValue);
  const data = {
    title: 'Välkomsterbjudande',
    triggerType: 'NONE',
    discountType,
    discountValue,
    freeDelivery: offer.freeDelivery,
    minOrder: Math.round(offer.minOrderKr * 100),
    isPersonalTemplate: true,
    isActive: true,
    showOnSite: false,
    popupEnabled: false,
    showAsBanner: false,
    isGlobal: false,
  };
  // Återanvänd befintlig mall om welcomeDealId fortfarande pekar på en.
  if (currentWelcomeDealId) {
    const existing = await (prisma as any).deal.findUnique({ where: { id: currentWelcomeDealId }, select: { id: true, isPersonalTemplate: true } });
    if (existing?.isPersonalTemplate) {
      await (prisma as any).deal.update({ where: { id: existing.id }, data });
      return existing.id;
    }
  }
  const created = await (prisma as any).deal.create({ data });
  return created.id;
}

async function ensureReferralTemplate(
  currentDealId: string | null | undefined,
  title: string,
  offer: InlineReferralOffer,
): Promise<string> {
  const discountType = offer.discountKind === 'PERCENT' ? 'PERCENTAGE' : offer.discountKind === 'FIXED' ? 'FIXED' : 'NONE';
  const discountValue = offer.discountKind === 'FIXED' ? Math.round(offer.discountValue * 100) : Math.round(offer.discountValue);
  const data = {
    title,
    triggerType: 'NONE',
    discountType,
    discountValue,
    freeDelivery: offer.freeDelivery,
    minOrder: Math.round(offer.minOrderKr * 100),
    isPersonalTemplate: true,
    isActive: true,
    showOnSite: false,
    popupEnabled: false,
    showAsBanner: false,
    isGlobal: false,
  };
  if (currentDealId) {
    const existing = await (prisma as any).deal.findUnique({
      where: { id: currentDealId },
      select: { id: true, isPersonalTemplate: true },
    });
    if (existing?.isPersonalTemplate) {
      await (prisma as any).deal.update({ where: { id: existing.id }, data });
      return existing.id;
    }
  }
  const created = await (prisma as any).deal.create({ data });
  return created.id;
}

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
    // Validera en deal-referens BARA när dess funktion faktiskt aktiveras.
    // En stale referens (mallen raderad → spök-id) ska aldrig blockera ett
    // sparande där funktionen är av — det orsakade
    // "Vald deal hittades inte" på allt. Partiell patch: effektivt på-läge =
    // payload-värdet om satt, annars nuvarande inställning.
    const current = await getSettings();
    const willActivateWelcome = parsed.data.welcomeDealActive ?? !!(current as any).welcomeDealActive;
    const willActivateReferral = parsed.data.referralEnabled ?? !!(current as any).referralEnabled;

    // Inline-erbjudande: skapa/uppdatera mallen automatiskt och peka welcomeDealId
    // på den. Det ersätter dropdownen helt — admin behöver aldrig en förskapad mall.
    const { welcomeOffer, referralInviteeOffer, referralInviterOffer, ...settingsPatch } = parsed.data as any;
    if (welcomeOffer) {
      const id = await ensureWelcomeTemplate((current as any).welcomeDealId, welcomeOffer);
      settingsPatch.welcomeDealId = id;
    } else if (parsed.data.welcomeDealId && willActivateWelcome) {
      // Bakåtkompat: om någon ändå skickar ett welcomeDealId (utan inline-offer).
      const err = await validatePersonalTemplate(parsed.data.welcomeDealId);
      if (err) return res.status(400).json({ error: err });
    }
    if (referralInviteeOffer) {
      settingsPatch.referralInviteeDealId = await ensureReferralTemplate(
        (current as any).referralInviteeDealId,
        'Referral – inbjuden kund',
        referralInviteeOffer,
      );
    }
    if (referralInviterOffer) {
      settingsPatch.referralInviterDealId = await ensureReferralTemplate(
        (current as any).referralInviterDealId,
        'Referral – tack för värvningen',
        referralInviterOffer,
      );
    }
    if (parsed.data.referralDealId && willActivateReferral) {
      const err = await validatePersonalTemplate(parsed.data.referralDealId);
      if (err) return res.status(400).json({ error: err });
    }
    const effectiveInviteeDealId = settingsPatch.referralInviteeDealId ?? (current as any).referralInviteeDealId ?? (current as any).referralDealId;
    const effectiveInviterDealId = settingsPatch.referralInviterDealId ?? (current as any).referralInviterDealId ?? (current as any).referralDealId;
    if (willActivateReferral && (!effectiveInviteeDealId || !effectiveInviterDealId)) {
      return res.status(400).json({ error: 'Konfigurera både rabatten för den inbjudna och belöningen för värvaren' });
    }

    const updated = await (prisma as any).restaurantSettings.update({
      where: { id: 'settings' },
      data: settingsPatch,
    });
    await audit(req as AuthRequest, 'WELCOME_DEAL_CONFIG_UPDATE', {
      resourceType: 'RestaurantSettings',
      resourceId: 'settings',
      changes: parsed.data,
    });
    res.json({
      welcomeDealActive: !!updated.welcomeDealActive,
      welcomeDealId: updated.welcomeDealId,
      welcomeAudience: updated.welcomeAudience ?? 'FIRST_ORDER',
      welcomeMaxOrders: updated.welcomeMaxOrders ?? 1,
      referralEnabled: !!updated.referralEnabled,
      referralDealId: updated.referralDealId,
      referralInviteeDealId: updated.referralInviteeDealId,
      referralInviterDealId: updated.referralInviterDealId,
      referralInviteeOffer: await readInlineOffer(updated.referralInviteeDealId),
      referralInviterOffer: await readInlineOffer(updated.referralInviterDealId),
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
        { inviterPhone: { contains: search } },
        { inviteePhone: { contains: search } },
        { shareCode: { contains: search.toUpperCase() } },
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
          inviter: { select: { id: true, name: true, email: true, phone: true } },
          invitee: { select: { id: true, name: true, email: true, phone: true } },
        },
      }),
    ]);

    res.json({
      data: rows.map((r: any) => ({
        id: r.id,
        code: r.shareCode || r.code,
        inviterPhone: r.inviterPhone || r.inviter?.phone || null,
        inviteePhone: r.inviteePhone || r.invitee?.phone || null,
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
          metadata: { path: ['referralId'], equals: referral.id },
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
 * Kallas när betalning eller orderstatus ändras. Första lyckade betalningen
 * låser upp kundens egen värvningskod. Värvarens engångsbelöning skapas först
 * när den hänvisade ordern både är betald och faktiskt slutförd.
 */
export async function maybeTriggerReferralReward(
  orderId: string,
  options: { throwOnError?: boolean } = {},
): Promise<void> {
  try {
    const order = await (prisma as any).order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        status: true,
        paymentStatus: true,
        customerPhone: true,
        type: true,
      },
    });
    if (!order?.userId) return;

    const settings = await getSettings();
    if (!settings.referralEnabled) return;

    // En lyckad betalning räcker för att kunden ska få sin stabila kod.
    // Den ligger på gäst-User-raden och följer därför med när samma telefon
    // senare registreras eller länkas till ett konto.
    if (order.paymentStatus === 'PAID') {
      await ensureReferralCode(order.userId);
    }

    // Värvaren belönas först efter genomförd leverans, aldrig enbart efter
    // betalning. Det förhindrar belöning för avbrutna/återbetalda order.
    if (!isReferralRewardCompletion(order)) {
      return;
    }

    const normalizedOrderPhone = normalizeReferralPhone(order.customerPhone);

    const referral = await (prisma as any).referral.findFirst({
      where: {
        status: 'REGISTERED',
        OR: [
          { inviteeUserId: order.userId },
          ...(normalizedOrderPhone ? [{ inviteePhone: normalizedOrderPhone }] : []),
        ],
      },
      include: { inviter: { select: { phone: true } } },
    });
    if (!referral) return;

    // Snapshot den admin-valda Dealen för INVITER-rewarden (invitee fick
    // sina kuponger redan vid redemption). Skipa om ingen Deal vald.
    const snapshot = await snapshotReferralDeal('INVITER');
    if (!snapshot) {
      // Markera Referral som ORDERED ändå (för stats) men ingen reward.
      await (prisma as any).referral.updateMany({
        where: { id: referral.id, status: 'REGISTERED' },
        data: { status: 'ORDERED', rewardedAt: new Date(), inviteeOrderId: orderId },
      });
      console.log(`[referral] Order ${orderId}: ingen referralDealId konfigurerad, hoppar reward`);
      return;
    }

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
      const personalCode = await createUniqueRewardCode(tx);
      await tx.userDeal.create({
        data: {
          userId: referral.inviterUserId,
          code: personalCode,
          dealId: snapshot.dealId,
          type: 'REFERRAL_INVITER',
          amountKr: snapshot.amountKr,
          discountPercent: snapshot.discountPercent,
          discountType: snapshot.discountType,
          freeDelivery: snapshot.freeDelivery,
          expiresAt: snapshot.expiresAt,
          metadata: {
            title: snapshot.title,
            referralId: referral.id,
            inviteeUserId: order.userId,
            ownerPhone: referral.inviterPhone || normalizeReferralPhone(referral.inviter?.phone),
            minOrderKr: snapshot.minOrderKr,
            validUntil: snapshot.validUntil ? snapshot.validUntil.toISOString() : null,
          },
        },
      });
    });

    console.log(`[referral] Inviter=${referral.inviterUserId} fick en unik engångskod från Deal=${snapshot.dealId} efter slutförd order=${orderId}`);

    // TODO: push-notis till inviter när APNs-helper är tillgänglig härifrån
  } catch (err: any) {
    console.error('[maybeTriggerReferralReward] error:', err?.message);
    if (options.throwOnError) throw err;
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
        metadata: {
          minOrderKr: snapshot.minOrderKr,
          // validUntil = raw värde från Deal (null om admin inte satt).
          // expiresAt ovan är intern 30-dagars-default — frontend ska
          // använda metadata.validUntil för display ("Gäller till X" /
          // "Gäller tillsvidare" om null).
          validUntil: snapshot.validUntil ? snapshot.validUntil.toISOString() : null,
        },
      },
    });
  } catch (err: any) {
    console.error('[maybeCreateWelcomeDeal] error:', err?.message);
  }
}

export default router;
