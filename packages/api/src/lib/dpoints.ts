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
}

export async function getDpointsSettings(): Promise<DpointsSettings> {
  const row: any = (await prisma.restaurantSettings.findUnique({ where: { id: 'settings' } })) || {};
  return {
    dpointsEnabled: row.dpointsEnabled ?? false,
    dpointsPerKr: row.dpointsPerKr ?? 1,
    dpointsValuePerKr: row.dpointsValuePerKr ?? 10,
  };
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
}): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: opts.userId },
      data: { pointsBalance: { increment: opts.amount } },
      select: { pointsBalance: true },
    });
    await tx.pointsTransaction.create({
      data: {
        userId: opts.userId,
        amount: opts.amount,
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
        total: true,
        deliveryFee: true,
        tipAmount: true,
        pointsAwarded: true,
        createdAt: true,
      },
    });
    if (!order || order.pointsAwarded || !order.userId) return;

    const settings = await getDpointsSettings();
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
        data: { pointsAwarded: true, pointsEarned: earned },
      });
      if (claim.count === 0) throw new Error('ALREADY_AWARDED');
      if (earned > 0) {
        const u = await tx.user.update({
          where: { id: userId },
          data: { pointsBalance: { increment: earned } },
          select: { pointsBalance: true },
        });
        await tx.pointsTransaction.create({
          data: {
            userId,
            amount: earned,
            type: 'EARN_ORDER',
            orderId,
            balanceAfter: u.pointsBalance,
            reason: mult > 1 ? `Köp (${mult}× bonus)` : 'Köp',
            metadata: { baseKr, multiplier: mult, perKr: settings.dpointsPerKr },
          },
        });
      }
    });

    // Streak-utmaningar utvärderas bara på den vinnande path:en (loser kastade
    // ALREADY_AWARDED ovan och nådde aldrig hit).
    await evaluateStreakCampaigns(userId, order.createdAt, baseKr).catch((e) =>
      console.error('[dpoints] streak-eval error:', e?.message),
    );
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
export async function evaluateStreakCampaigns(userId: string, orderDate: Date, baseKr: number): Promise<void> {
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

// ── Signup-bonus via sponsor-kort ─────────────────────────────────────────────

/**
 * Dela ut välkomstbonus om ett aktivt sponsor-kort finns. Anropas en gång vid
 * registrering. Idempotent: hoppar om kunden redan har en SIGNUP_BONUS-rad.
 * Returnerar antal utdelade poäng (0 om inget aktivt kort).
 */
export async function maybeAwardSponsorBonus(userId: string): Promise<number> {
  try {
    const settings = await getDpointsSettings();
    if (!settings.dpointsEnabled) return 0;

    const now = new Date();
    const card = await prisma.sponsorCard.findFirst({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!card || card.bonusPoints <= 0) return 0;

    const already = await prisma.pointsTransaction.findFirst({
      where: { userId, type: 'SIGNUP_BONUS' },
      select: { id: true },
    });
    if (already) return 0;

    await recordPointsTx({
      userId,
      amount: card.bonusPoints,
      type: 'SIGNUP_BONUS',
      reason: card.sponsorName ? `Välkomstbonus (${card.sponsorName})` : 'Välkomstbonus',
      metadata: { sponsorCardId: card.id },
    });
    return card.bonusPoints;
  } catch (e: any) {
    console.error('[dpoints] sponsor-bonus error:', e?.message);
    return 0;
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
            discountValue: reward.discountValue, // FIXED: öre, PERCENTAGE: %
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
