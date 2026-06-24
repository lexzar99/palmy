/**
 * Dpoints — lojalitetssystemets kärna.
 *
 * Designprinciper (medvetet enkelt, inte överbyggt):
 *  - EN källa till saldot: User.pointsBalance, alltid uppdaterat i SAMMA
 *    transaktion som en PointsTransaction-rad skapas. Saldot räknas aldrig om
 *    på två ställen.
 *  - Liggare (ledger): varje händelse = en rad med signerat `amount` + `reason`
 *    + `balanceAfter`. Det ger gratis historik till kund och admin.
 *  - Intjäning är idempotent per order (Order.pointsAwarded race-guard +
 *    PointsTransaction.orderId @unique) → en order ger poäng exakt en gång.
 *  - All tids-logik (streaks) sker i Europe/Stockholm via kalender-nycklar,
 *    aldrig på råa UTC-instanser → DST-säkert.
 */
import { randomInt } from 'crypto';
import prisma from './prisma';

export type PointsTxType =
  | 'EARN_ORDER'
  | 'SIGNUP_BONUS'
  | 'CAMPAIGN'
  | 'REDEEM'
  | 'ADMIN_ADJUST'
  | 'REVERSAL';

// ── Inställningar ────────────────────────────────────────────────────────────

export interface DpointsSettings {
  dpointsEnabled: boolean;
  dpointsPerKr: number;
  dpointsValuePerKr: number;
  dpointsMaxBalance: number;
  dpointsCourierCost: number; // öre — platt budkostnad (fallback) på poäng-ENBART order vid leverans
  dpointsCourierTiers: string; // JSON-array [{ maxKm, feeKr }] — km-baserad tariff
  dpointsStreakTarget: number; // antal betalda ordrar inom 7 dagar för streak-bonus
}

export async function getDpointsSettings(): Promise<DpointsSettings> {
  const row: any = (await prisma.restaurantSettings.findUnique({ where: { id: 'settings' } })) || {};
  return {
    dpointsEnabled: row.dpointsEnabled ?? false,
    dpointsPerKr: row.dpointsPerKr ?? 1,
    dpointsValuePerKr: row.dpointsValuePerKr ?? 10,
    dpointsMaxBalance: row.dpointsMaxBalance ?? 2000,
    dpointsCourierCost: row.dpointsCourierCost ?? 0,
    dpointsCourierTiers: row.dpointsCourierTiers ?? '[]',
    dpointsStreakTarget: Math.max(2, Math.round(row.dpointsStreakTarget ?? 3)),
  };
}

// ── Intjänings-regler (earn-rules) ───────────────────────────────────────────

export interface EarnRule {
  key: string;
  label: string;
  points: number;
  enabled: boolean;
}

// Standarduppsättning. Admin ändrar poäng + på/av per regel; nycklarna är
// stabila och läses av reward-hooks (invite m.fl.) + kundens "Tjäna Dpoints".
export const DEFAULT_EARN_RULES: EarnRule[] = [
  { key: 'invite', label: 'Värva en vän', points: 200, enabled: true },
  { key: 'review_rating', label: 'Recension (betyg)', points: 20, enabled: true },
  { key: 'review_text', label: 'Recension (med text)', points: 30, enabled: true },
  { key: 'order_streak', label: 'Beställ flera gånger på en vecka', points: 200, enabled: true },
  { key: 'new_restaurant', label: 'Testa en ny restaurang', points: 50, enabled: true },
];

/** Parsa lagrade earn-regler + merga med default (nya nycklar dyker alltid upp). */
export function parseEarnRules(raw: unknown): EarnRule[] {
  let stored: any[] = [];
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(arr)) stored = arr;
  } catch {
    /* ignore */
  }
  const byKey = new Map<string, any>(stored.filter((r) => r && r.key).map((r) => [String(r.key), r]));
  return DEFAULT_EARN_RULES.map((d) => {
    const s = byKey.get(d.key);
    if (!s) return { ...d };
    const pts = Number(s.points);
    return {
      key: d.key,
      label: d.label,
      points: Number.isFinite(pts) ? Math.max(0, Math.round(pts)) : d.points,
      enabled: s.enabled !== false,
    };
  });
}

/** Earn-reglerna från settings (default-fallback). */
export async function getDpointsEarnRules(): Promise<EarnRule[]> {
  const row: any = (await prisma.restaurantSettings.findUnique({ where: { id: 'settings' }, select: { dpointsEarnRules: true } })) || {};
  return parseEarnRules(row.dpointsEarnRules);
}

/** En specifik regel (eller null om okänd nyckel). */
export async function getEarnRule(key: string): Promise<EarnRule | null> {
  const rules = await getDpointsEarnRules();
  return rules.find((r) => r.key === key) ?? null;
}

// ── Budkostnad: km-baserad tariff (poäng-ENBART leverans) ────────────────────

export interface CourierTier {
  maxKm: number;
  feeKr: number;
}

/** Parsa + sanera tariff-JSON till en sorterad (lågt→högt km) lista. */
export function parseCourierTiers(raw: unknown): CourierTier[] {
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((t: any) => ({ maxKm: Number(t?.maxKm), feeKr: Number(t?.feeKr) }))
      .filter((t) => Number.isFinite(t.maxKm) && t.maxKm > 0 && Number.isFinite(t.feeKr) && t.feeKr >= 0)
      .sort((a, b) => a.maxKm - b.maxKm);
  } catch {
    return [];
  }
}

/**
 * Budkostnad (öre) för en poäng-ENBART LEVERANS-order, km-baserad global tariff.
 * Tom tariff → fallback till platta dpointsCourierCost. Distans bortom sista
 * tier:n → sista tier:ns avgift. Hämtning anropar aldrig denna (alltid gratis).
 */
export function resolveDpointsCourierFeeOre(distanceKm: number, settings: DpointsSettings): number {
  const tiers = parseCourierTiers(settings.dpointsCourierTiers);
  if (tiers.length === 0) return settings.dpointsCourierCost ?? 0;
  const d = Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm : 0;
  const tier = tiers.find((t) => d <= t.maxKm) ?? tiers[tiers.length - 1];
  return Math.round(tier.feeKr * 100);
}

// ── Tidszon-nycklar (Europe/Stockholm) ───────────────────────────────────────

const dayFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Stockholm',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** "YYYY-MM-DD" för datumet i Stockholm-tid. */
export function stockholmDayKey(d: Date): string {
  return dayFmt.format(d); // en-CA → YYYY-MM-DD
}

function keyToUtc(key: string): Date {
  const [y, m, dd] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd));
}

function utcToKey(dt: Date): string {
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** Föregående kalenderdag (DST-säkert — räknar på datum, inte instanser). */
function prevDayKey(key: string): string {
  const dt = keyToUtc(key);
  dt.setUTCDate(dt.getUTCDate() - 1);
  return utcToKey(dt);
}

/** Kanonisk vecko-nyckel = måndagens dag-nyckel för Stockholm-veckan. */
function weekKey(d: Date): string {
  const dt = keyToUtc(stockholmDayKey(d));
  const dow = dt.getUTCDay(); // 0=Sön..6=Lör
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  dt.setUTCDate(dt.getUTCDate() + diffToMonday);
  return utcToKey(dt);
}

function prevWeekKey(mondayKey: string): string {
  const dt = keyToUtc(mondayKey);
  dt.setUTCDate(dt.getUTCDate() - 7);
  return utcToKey(dt);
}

// ── Liggare + saldo (additiv, atomisk) ───────────────────────────────────────

/**
 * Skriv en ledger-rad och uppdatera det cachade saldot atomiskt.
 * Används för additiva/justerande poster (intjäning, bonus, kampanj, admin).
 * För inlösen (spendering) se redeemReward() som har egen gte-guard.
 * Returnerar nytt saldo.
 */
export async function recordPointsTx(opts: {
  userId: string;
  amount: number;
  type: PointsTxType;
  reason?: string | null;
  orderId?: string | null;
  campaignId?: string | null;
  adminId?: string | null;
  metadata?: any;
  // Om satt (>0): clampa POSITIVA belopp så saldot inte överstiger taket.
  // Används av intjänings-typer (kampanj/signup), INTE av admin-justeringar.
  cap?: number;
}): Promise<number> {
  return prisma.$transaction(async (tx) => {
    let amount = opts.amount;
    if (opts.cap != null && opts.cap > 0 && amount > 0) {
      const before = await tx.user.findUnique({ where: { id: opts.userId }, select: { pointsBalance: true } });
      const grantable = Math.max(0, opts.cap - (before?.pointsBalance ?? 0));
      amount = Math.min(amount, grantable);
    }
    if (amount === 0) {
      const cur = await tx.user.findUnique({ where: { id: opts.userId }, select: { pointsBalance: true } });
      return cur?.pointsBalance ?? 0;
    }
    const u = await tx.user.update({
      where: { id: opts.userId },
      data: { pointsBalance: { increment: amount } },
      select: { pointsBalance: true },
    });
    await tx.pointsTransaction.create({
      data: {
        userId: opts.userId,
        amount,
        type: opts.type,
        reason: opts.reason ?? null,
        orderId: opts.orderId ?? null,
        campaignId: opts.campaignId ?? null,
        adminId: opts.adminId ?? null,
        balanceAfter: u.pointsBalance,
        metadata: opts.metadata ?? undefined,
      },
    });
    return u.pointsBalance;
  });
}

// ── Intjäning vid köp ─────────────────────────────────────────────────────────

/** Bästa aktiva multiplikator (>=1) för en order. Stackar inte — högsta vinner. */
async function bestActiveMultiplier(baseKr: number, when: Date): Promise<number> {
  const camps = await prisma.pointsCampaign.findMany({
    where: {
      type: 'MULTIPLIER',
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: when } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: when } }] },
      ],
    },
    select: { multiplier: true, minOrderKr: true },
  });
  let best = 1;
  for (const c of camps) {
    if (baseKr < (c.minOrderKr ?? 0)) continue;
    if ((c.multiplier ?? 1) > best) best = c.multiplier ?? 1;
  }
  return best;
}

/**
 * Dela ut intjänade Dpoints för en BETALD order. Idempotent: Order.pointsAwarded
 * sätts atomiskt i samma transaktion som ledger-raden → körs exakt en gång även
 * om webhook + reconcile + confirm alla landar här. Fail-safe (kastar aldrig).
 *
 * Intjäningsbas = varornas värde kunden betalade (total − leverans − dricks).
 * Gäst-ordrar (utan userId) tjänar inget.
 */
export async function awardOrderPointsIfNotAwarded(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        restaurantId: true,
        total: true,
        deliveryFee: true,
        tipAmount: true,
        pointsAwarded: true,
        pointsSpent: true,
        createdAt: true,
      },
    });
    if (!order || order.pointsAwarded || !order.userId) return;

    const settings = await getDpointsSettings();
    // Inlösen (köp-med-poäng) DRAS redan vid order-skapande (atomisk reservation).
    // Här gör vi BARA intjäning + streak, och bara när systemet är aktiverat.
    if (!settings.dpointsEnabled) return;
    const baseOre = Math.max(0, order.total - order.deliveryFee - (order.tipAmount ?? 0));
    const baseKr = baseOre / 100;
    const mult = await bestActiveMultiplier(baseKr, order.createdAt);
    const earned = Math.round(baseKr * settings.dpointsPerKr * mult);
    const userId = order.userId;

    await prisma.$transaction(async (tx) => {
      // Race-guard: bara en path får sätta pointsAwarded false→true.
      const claim = await tx.order.updateMany({
        where: { id: orderId, pointsAwarded: false },
        data: { pointsAwarded: true },
      });
      if (claim.count === 0) throw new Error('ALREADY_AWARDED');
      // Intjäning clampad mot taket → saldot överstiger aldrig dpointsMaxBalance.
      let actualEarned = 0;
      if (earned > 0) {
        const before = await tx.user.findUnique({ where: { id: userId }, select: { pointsBalance: true } });
        const cap = settings.dpointsMaxBalance;
        const grantable = cap > 0 ? Math.max(0, cap - (before?.pointsBalance ?? 0)) : earned;
        actualEarned = Math.min(earned, grantable);
        if (actualEarned > 0) {
          const u = await tx.user.update({
            where: { id: userId },
            data: { pointsBalance: { increment: actualEarned } },
            select: { pointsBalance: true },
          });
          await tx.pointsTransaction.create({
            data: {
              userId,
              amount: actualEarned,
              type: 'EARN_ORDER',
              orderId,
              balanceAfter: u.pointsBalance,
              reason: mult > 1 ? `Köp (${mult}× bonus)` : 'Köp',
              metadata: { baseKr, multiplier: mult, perKr: settings.dpointsPerKr, capped: actualEarned < earned },
            },
          });
        }
      }
      await tx.order.update({ where: { id: orderId }, data: { pointsEarned: actualEarned } });
    });

    // Streak-utmaningar utvärderas bara på den vinnande path:en (loser kastade
    // ALREADY_AWARDED ovan och nådde aldrig hit).
    await evaluateStreakCampaigns(userId, order.createdAt, baseKr, settings.dpointsMaxBalance).catch((e) =>
      console.error('[dpoints] streak-eval error:', e?.message),
    );

    // Nya config-styrda earn-regler (ny restaurang + vecko-streak). Samma
    // vinnande path → en gång per order.
    await evaluateOrderEarnRules({
      userId,
      restaurantId: (order as any).restaurantId,
      orderId,
      orderDate: order.createdAt,
      cap: settings.dpointsMaxBalance,
    }).catch((e) => console.error('[dpoints] order earn-rules error:', e?.message));

    // Invite-belöning (200 till båda) — på samma vinnande path så den triggar
    // oavsett finalize-väg (webb-direkt, Adyen-webhook, reconcile). Idempotent
    // (atomisk REGISTERED→ORDERED i maybeRewardInvite), så dubbla anrop är ofarliga.
    await import('./invite')
      .then((m) => m.maybeRewardInvite(orderId))
      .catch((e) => console.error('[dpoints] invite-reward error:', e?.message));
  } catch (e: any) {
    if (e?.message === 'ALREADY_AWARDED' || e?.code === 'P2002') return; // idempotent
    console.error('[dpoints] awardOrderPoints error:', e?.message);
  }
}

// ── Streak-utmaningar ─────────────────────────────────────────────────────────

/**
 * Uppdatera kundens framsteg i aktiva STREAK-kampanjer och dela ut fast bonus
 * när målet nås. DAILY = på varandra följande dagar, WEEKLY = på varandra
 * följande veckor (en order/period räcker). En period räknas max en gång.
 */
export async function evaluateStreakCampaigns(userId: string, orderDate: Date, baseKr: number, cap = 0): Promise<void> {
  const camps = await prisma.pointsCampaign.findMany({
    where: {
      type: { in: ['STREAK_DAILY', 'STREAK_WEEKLY'] },
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: orderDate } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: orderDate } }] },
      ],
    },
  });

  for (const c of camps) {
    if (baseKr < (c.minOrderKr ?? 0)) continue;
    const target = c.targetCount ?? 0;
    const reward = c.rewardPoints ?? 0;
    if (target <= 0 || reward <= 0) continue;

    const isWeekly = c.type === 'STREAK_WEEKLY';
    const periodKey = isWeekly ? weekKey(orderDate) : stockholmDayKey(orderDate);
    const previousKey = isWeekly ? prevWeekKey(periodKey) : prevDayKey(periodKey);

    const prog = await prisma.pointsCampaignProgress.findUnique({
      where: { campaignId_userId: { campaignId: c.id, userId } },
    });

    // Klar redan (en gång/kund) → rör inget mer.
    if (prog && !c.repeatable && prog.timesRewarded > 0) continue;
    // Redan räknad denna period → ingen förändring.
    if (prog && prog.lastCountedDay === periodKey) continue;

    let streak: number;
    if (prog && prog.lastCountedDay === previousKey) streak = prog.streakCount + 1;
    else streak = 1;

    let timesRewarded = prog?.timesRewarded ?? 0;
    const reached = streak >= target;
    if (reached) {
      timesRewarded += 1;
      await recordPointsTx({
        userId,
        amount: reward,
        type: 'CAMPAIGN',
        campaignId: c.id,
        reason: c.name,
        metadata: { streak, target, type: c.type },
        cap,
      });
    }

    await prisma.pointsCampaignProgress.upsert({
      where: { campaignId_userId: { campaignId: c.id, userId } },
      create: {
        campaignId: c.id,
        userId,
        // Vid uppnått mål (repeterbar) börjar nästa cykel om från 0.
        streakCount: reached && c.repeatable ? 0 : streak,
        lastCountedDay: periodKey,
        timesRewarded,
      },
      update: {
        streakCount: reached && c.repeatable ? 0 : streak,
        lastCountedDay: periodKey,
        timesRewarded,
      },
    });
  }
}

// ── Recensions-belöning ───────────────────────────────────────────────────────

/**
 * Dela ut Dpoints för en recension. Med text → review_text-regeln, annars
 * review_rating-regeln. En gång per order (idempotent via metadata.reviewOrderId,
 * eftersom orderId-kolumnen redan är upptagen av EARN_ORDER). Gäst-recensioner
 * (utan userId) tjänar inget. Fail-safe — kastar aldrig.
 */
export async function maybeAwardReviewPoints(opts: {
  userId?: string | null;
  orderId: string;
  hasText: boolean;
}): Promise<void> {
  try {
    const { userId, orderId, hasText } = opts;
    if (!userId) return;
    const settings = await getDpointsSettings();
    if (!settings.dpointsEnabled) return;
    const rule = await getEarnRule(hasText ? 'review_text' : 'review_rating');
    if (!rule || !rule.enabled || rule.points <= 0) return;
    // Idempotens: redan belönad recension för denna order?
    const existing = await prisma.pointsTransaction.findFirst({
      where: { userId, metadata: { path: ['reviewOrderId'], equals: orderId } },
      select: { id: true },
    });
    if (existing) return;
    await recordPointsTx({
      userId,
      amount: rule.points,
      type: 'CAMPAIGN',
      reason: rule.label,
      metadata: { earnRule: rule.key, reviewOrderId: orderId },
      cap: settings.dpointsMaxBalance,
    });
  } catch (e: any) {
    console.error('[dpoints] review-points error:', e?.message);
  }
}

// ── Order-kopplade earn-regler (utöver grund-EARN_ORDER) ──────────────────────

const STREAK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // rullande 7-dagarsfönster för streak

/**
 * Extra intjäning för en BETALD order, utöver grund-EARN_ORDER:
 *   new_restaurant — kundens första betalda order från restaurangen
 *   order_streak   — N betalda ordrar inom rullande 7 dagar (cooldown 7 dgr efter)
 * Körs bara på den vinnande pointsAwarded-path:en → en gång per order. orderId-
 * kolumnen är upptagen (unik, EARN_ORDER) så posterna bär orderId: null + egen
 * idempotens. Fail-safe per regel.
 */
export async function evaluateOrderEarnRules(opts: {
  userId: string;
  restaurantId?: string | null;
  orderId: string;
  orderDate: Date;
  cap?: number;
}): Promise<void> {
  const { userId, restaurantId, orderId, orderDate, cap } = opts;

  // new_restaurant — "testa en ny restaurang". Ges INTE för kundens allra
  // FÖRSTA restaurang (det är baslinjen, inte att testa nåt nytt) — bara när
  // kunden redan beställt från någon ANNAN restaurang och nu prövar en ny.
  if (restaurantId) {
    try {
      const rule = await getEarnRule('new_restaurant');
      if (rule?.enabled && rule.points > 0) {
        const priorPaidThisRest = await prisma.order.count({
          where: { userId, restaurantId, pointsAwarded: true, id: { not: orderId } },
        });
        if (priorPaidThisRest === 0) {
          // Ny för kunden på denna restaurang. Belöna bara om hen redan har en
          // betald order från en ANNAN restaurang (annars är detta första gången).
          const priorPaidOtherRest = await prisma.order.count({
            where: { userId, pointsAwarded: true, id: { not: orderId }, restaurantId: { not: restaurantId } },
          });
          if (priorPaidOtherRest > 0) {
            await recordPointsTx({
              userId,
              amount: rule.points,
              type: 'CAMPAIGN',
              reason: rule.label,
              metadata: { earnRule: 'new_restaurant', restaurantId, orderId },
              cap,
            });
          }
        }
      }
    } catch (e: any) {
      console.error('[dpoints] new_restaurant error:', e?.message);
    }
  }

  // order_streak — N betalda ordrar inom RULLANDE 7 dagar → bonus (utöver
  // grund-intjäningen per order). Repeterbar: 7 dagars cooldown från senaste
  // utdelning, så den kan tjänas igen ungefär en gång i veckan.
  try {
    const rule = await getEarnRule('order_streak');
    if (rule?.enabled && rule.points > 0) {
      const settings = await getDpointsSettings();
      const target = settings.dpointsStreakTarget;
      const windowStart = new Date(orderDate.getTime() - STREAK_WINDOW_MS);
      // Cooldown: redan belönad streak inom de senaste 7 dagarna?
      const recentGrant = await prisma.pointsTransaction.findFirst({
        where: { userId, metadata: { path: ['earnRule'], equals: 'order_streak' }, createdAt: { gte: windowStart } },
        select: { id: true },
      });
      if (!recentGrant) {
        const paidInWindow = await prisma.order.count({
          where: { userId, pointsAwarded: true, createdAt: { gte: windowStart } },
        });
        if (paidInWindow >= target) {
          await recordPointsTx({
            userId,
            amount: rule.points,
            type: 'CAMPAIGN',
            reason: rule.label,
            metadata: { earnRule: 'order_streak', windowDays: 7, target, count: paidInWindow },
            cap,
          });
        }
      }
    }
  } catch (e: any) {
    console.error('[dpoints] order_streak error:', e?.message);
  }
}

// Kundens streak-status (för "Tjäna Dpoints"-indikatorn). ready=false betyder
// att streaken nyligen lösts ut och är på cooldown (redo igen om readyInDays).
export async function getStreakState(userId: string): Promise<{ target: number; count: number; ready: boolean; readyInDays: number }> {
  const settings = await getDpointsSettings();
  const target = settings.dpointsStreakTarget;
  const now = new Date();
  const windowStart = new Date(now.getTime() - STREAK_WINDOW_MS);
  const lastGrant = await prisma.pointsTransaction.findFirst({
    where: { userId, metadata: { path: ['earnRule'], equals: 'order_streak' }, createdAt: { gte: windowStart } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (lastGrant) {
    const elapsed = now.getTime() - lastGrant.createdAt.getTime();
    const readyInDays = Math.max(1, Math.ceil((STREAK_WINDOW_MS - elapsed) / (24 * 60 * 60 * 1000)));
    return { target, count: target, ready: false, readyInDays };
  }
  const count = await prisma.order.count({ where: { userId, pointsAwarded: true, createdAt: { gte: windowStart } } });
  return { target, count: Math.min(count, target), ready: true, readyInDays: 0 };
}

// ── Signup-bonus via sponsor-kort ─────────────────────────────────────────────

// Senast skapade aktiva sponsor-kortet inom sitt fönster (eller null).
export async function getActiveSponsorCard() {
  const now = new Date();
  return prisma.sponsorCard.findFirst({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Är kunden berättigad att HÄMTA (claima) signup-bonusen? Path-agnostiskt —
 * funkar oavsett om kontot skapats via email eller Google/Apple. Villkor:
 *  - Dpoints på + aktivt sponsor-kort finns
 *  - Nytt konto (skapat senaste 30 dagarna)
 *  - Har inte redan en SIGNUP_BONUS-rad
 */
// Poäng-belöningens config (styrs från Välkomstkampanj-panelen). Sponsor-valfri:
// sponsorCardId satt = sponsor-brandad bonus, null = ren plattform-bonus.
async function getWelcomePointsConfig(): Promise<{ active: boolean; amount: number; sponsorCardId: string | null }> {
  const s = (await prisma.restaurantSettings.findUnique({
    where: { id: 'settings' },
    select: { welcomePointsActive: true, welcomePointsAmount: true, welcomePointsSponsorCardId: true } as any,
  })) as any;
  return {
    active: !!s?.welcomePointsActive,
    amount: s?.welcomePointsAmount ?? 0,
    sponsorCardId: s?.welcomePointsSponsorCardId ?? null,
  };
}

export async function getSignupClaim(userId: string): Promise<{ claimable: boolean; bonusPoints: number; sponsorName?: string | null }> {
  const settings = await getDpointsSettings();
  if (!settings.dpointsEnabled) return { claimable: false, bonusPoints: 0 };
  const wp = await getWelcomePointsConfig();
  if (!wp.active || wp.amount <= 0) return { claimable: false, bonusPoints: 0 };
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
  if (!user) return { claimable: false, bonusPoints: wp.amount };
  const ageDays = (Date.now() - user.createdAt.getTime()) / 86_400_000;
  if (ageDays > 30) return { claimable: false, bonusPoints: wp.amount };
  const already = await prisma.pointsTransaction.findFirst({ where: { userId, type: 'SIGNUP_BONUS' }, select: { id: true } });
  let sponsorName: string | null = null;
  if (wp.sponsorCardId) {
    const card = await prisma.sponsorCard.findUnique({ where: { id: wp.sponsorCardId }, select: { sponsorName: true } });
    sponsorName = card?.sponsorName ?? null;
  }
  return { claimable: !already, bonusPoints: wp.amount, sponsorName };
}

// Hämta välkomstbonusen. Kund-initierad (efter registrering). Idempotent guard
// mot dubbel-bonus.
export async function claimSignupBonus(userId: string): Promise<{ points: number } | { error: string }> {
  const info = await getSignupClaim(userId);
  if (!info.claimable || info.bonusPoints <= 0) return { error: 'Du är inte berättigad till välkomstbonusen' };
  const already = await prisma.pointsTransaction.findFirst({ where: { userId, type: 'SIGNUP_BONUS' }, select: { id: true } });
  if (already) return { error: 'Bonusen är redan hämtad' };
  const settings = await getDpointsSettings();
  await recordPointsTx({
    userId,
    amount: info.bonusPoints,
    type: 'SIGNUP_BONUS',
    reason: info.sponsorName ? `Välkomstbonus (${info.sponsorName})` : 'Välkomstbonus',
    metadata: info.sponsorName ? { sponsor: info.sponsorName } : {},
    cap: settings.dpointsMaxBalance,
  });
  return { points: info.bonusPoints };
}

// ── Återbetalning ─────────────────────────────────────────────────────────────

/**
 * Återför poäng vid återbetald order: re-kreditera poäng kunden SPENDERADE
 * (köp-med-poäng) och claw-backa poäng kunden TJÄNADE på ordern. Idempotent via
 * Order.pointsReverted. Server-auktoritativt — använder orderns lagrade värden,
 * aldrig klient-input. Clawback clampas så saldot aldrig går negativt.
 */
export async function revertOrderPointsForRefund(orderId: string): Promise<{ refunded: number; clawedBack: number }> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, userId: true, pointsEarned: true, pointsSpent: true, pointsReverted: true },
    });
    if (!order || !order.userId) return { refunded: 0, clawedBack: 0 };
    const claim = await prisma.order.updateMany({
      where: { id: orderId, pointsReverted: false },
      data: { pointsReverted: true },
    });
    if (claim.count === 0) return { refunded: 0, clawedBack: 0 }; // redan återfört

    const userId = order.userId;
    const refunded = order.pointsSpent ?? 0;
    const earned = order.pointsEarned ?? 0;

    if (refunded > 0) {
      await recordPointsTx({
        userId,
        amount: refunded,
        type: 'REVERSAL',
        reason: 'Återbetald order — inlösta poäng återförda',
        metadata: { orderId, kind: 'refund-recredit' },
      });
    }
    if (earned > 0) {
      await prisma.$transaction(async (tx) => {
        const cur = await tx.user.findUnique({ where: { id: userId }, select: { pointsBalance: true } });
        const dec = Math.min(earned, cur?.pointsBalance ?? 0);
        if (dec > 0) {
          const u = await tx.user.update({
            where: { id: userId },
            data: { pointsBalance: { decrement: dec } },
            select: { pointsBalance: true },
          });
          await tx.pointsTransaction.create({
            data: {
              userId,
              amount: -dec,
              type: 'REVERSAL',
              balanceAfter: u.pointsBalance,
              reason: 'Återbetald order — intjäning återtagen',
              metadata: { orderId, kind: 'refund-clawback', earned },
            },
          });
        }
      });
    }
    return { refunded, clawedBack: earned };
  } catch (e: any) {
    console.error('[dpoints] revertOrderPointsForRefund error:', e?.message);
    return { refunded: 0, clawedBack: 0 };
  }
}

// ── Inlösen → personlig kod ───────────────────────────────────────────────────

function randomCode(): string {
  // Läsbar, kollisions-osannolik kod. Inga 0/O/1/I.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'DP';
  for (let i = 0; i < 6; i++) s += alphabet[randomInt(alphabet.length)];
  return s;
}

export class RedeemError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Lös in en DpointsReward → skapa en PERSONLIG kod (Campaign + CustomerDeal)
 * låst till kontots telefonnummer, och dra poängen atomiskt (gte-guard hindrar
 * dubbel-spendering). Koden funkar bara på kundens konto i kassan (matchas på
 * code + phone) och syns i admin via /admin/customer-deals.
 */
export async function redeemReward(
  userId: string,
  rewardId: string,
): Promise<{ code: string; balanceAfter: number; reward: any }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, phone: true, pointsBalance: true },
  });
  if (!user) throw new RedeemError('NO_USER', 'Kunden hittades inte');
  if (!user.phone) throw new RedeemError('NO_PHONE', 'Lägg till ett telefonnummer på kontot innan du löser in poäng');

  const reward = await prisma.dpointsReward.findUnique({ where: { id: rewardId } });
  if (!reward || !reward.isActive) throw new RedeemError('NO_REWARD', 'Erbjudandet finns inte längre');
  if (user.pointsBalance < reward.pointsCost) throw new RedeemError('INSUFFICIENT', 'Du har inte tillräckligt med Dpoints');

  const validUntil = new Date(Date.now() + reward.validDays * 24 * 60 * 60 * 1000);

  // Upp till 3 försök ifall kod-kollision (CustomerDeal.code @unique).
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = randomCode();
    try {
      return await prisma.$transaction(async (tx) => {
        // Atomisk spendering — bara om saldot fortfarande räcker.
        const dec = await tx.user.updateMany({
          where: { id: userId, pointsBalance: { gte: reward.pointsCost } },
          data: { pointsBalance: { decrement: reward.pointsCost } },
        });
        if (dec.count === 0) throw new RedeemError('INSUFFICIENT', 'Du har inte tillräckligt med Dpoints');

        const fresh = await tx.user.findUnique({ where: { id: userId }, select: { pointsBalance: true } });
        const balanceAfter = fresh?.pointsBalance ?? 0;

        await tx.pointsTransaction.create({
          data: {
            userId,
            amount: -reward.pointsCost,
            type: 'REDEEM',
            reason: `Inlöst: ${reward.title}`,
            balanceAfter,
            metadata: { rewardId: reward.id, code },
          },
        });

        const campaign = await tx.campaign.create({
          data: {
            title: reward.title,
            description: `Dpoints-inlösen: ${reward.title}`,
            discountType: reward.discountType === 'PERCENTAGE' ? 'PERCENTAGE' : 'FIXED',
            // Checkout läser via normalizeMoneyToOre() → FIXED måste lagras i KR
            // (annars dubbel-multipliceras belopp < 10 kr: 5 kr → 500 kr). % = heltal.
            discountValue:
              reward.discountType === 'PERCENTAGE'
                ? reward.discountValue
                : Math.round((reward.discountValue ?? 0) / 100),
            minOrder: reward.minOrderKr,
            maxUsagesPerCustomer: 1,
            validUntil,
          },
        });

        await tx.customerDeal.create({
          data: {
            campaignId: campaign.id,
            userId,
            phone: user.phone as string,
            code,
            maxUsages: 1,
          },
        });

        return { code, balanceAfter, reward };
      });
    } catch (e: any) {
      if (e?.code === 'P2002') continue; // kod-kollision → nytt försök
      throw e;
    }
  }
  throw new RedeemError('CODE_COLLISION', 'Kunde inte generera en unik kod, försök igen');
}
