// Invite reward hook — grants Vpoints to BOTH inviter and invitee when the
// invitee completes their FIRST paid order. Drop-in replacement for the old
// maybeTriggerReferralReward, called from every payment-finalize path. Safe to
// call multiple times / on webhook retries: the atomic status race-guard
// (REGISTERED -> ORDERED) ensures the reward is granted at most once.
import prisma from './prisma';
import { recordPointsTx, getDpointsSettings, getEarnRule } from './dpoints';

// Same status set the rest of the codebase treats as "paid".
const PAID_STATUSES = ['PAID', 'COMPLETED', 'DELIVERED', 'PREPARING', 'OUT_FOR_DELIVERY', 'READY'];
// Hard fraud flags (from computeFraudFlags) that block the reward.
const HARD_FRAUD_FLAGS = ['SAME_DEVICE', 'SAME_EMAIL', 'DISPOSABLE_EMAIL'];

// Belopp + på/av styrs från admin (earn-regeln "invite"). Cap per inbjudare/30d.
const DEFAULT_MAX_REWARDS_30D = 5;

export async function maybeRewardInvite(orderId: string): Promise<void> {
  try {
    const order = await (prisma as any).order.findUnique({
      where: { id: orderId },
      select: { id: true, userId: true },
    });
    if (!order?.userId) return; // guest order — no inviter to reward
    const inviteeUserId = order.userId as string;

    const referral = await (prisma as any).referral.findFirst({
      where: { inviteeUserId, status: 'REGISTERED' },
    });
    if (!referral) return;
    if (referral.inviterUserId === inviteeUserId) return; // self-referral
    if (Array.isArray(referral.fraudFlags) && referral.fraudFlags.some((f: string) => HARD_FRAUD_FLAGS.includes(f))) {
      return; // flagged — skip reward (attribution row stays for admin review)
    }

    // Only the invitee's FIRST paid order.
    const previousPaid = await (prisma as any).order.count({
      where: { userId: inviteeUserId, id: { not: orderId }, status: { in: PAID_STATUSES } },
    });
    if (previousPaid > 0) return;

    // Cap per inviter (rolling 30d).
    const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recent = await (prisma as any).referral.count({
      where: { inviterUserId: referral.inviterUserId, status: 'ORDERED', rewardedAt: { gte: last30 } },
    });
    if (recent >= DEFAULT_MAX_REWARDS_30D) {
      console.warn(`[invite] inviter ${referral.inviterUserId} reached cap (${DEFAULT_MAX_REWARDS_30D}/30d) — skip`);
      return;
    }

    // Admin-styrd earn-regel: hoppa om avstängd eller 0 poäng.
    const rule = await getEarnRule('invite');
    if (!rule || !rule.enabled || rule.points <= 0) return;
    const inviterPts = rule.points;
    const inviteePts = rule.points;
    const ledgerKey = `invite_reward:${referral.id}`;

    // Atomic win — only ONE finalize path (Adyen webhook vs confirm race) flips
    // REGISTERED -> ORDERED and proceeds to grant. Idempotency lives here, NOT
    // in the points ledger (PointsTransaction.orderId is @unique and the
    // invitee order already has an EARN_ORDER row, so we pass no orderId below).
    const won = await (prisma as any).referral.updateMany({
      where: { id: referral.id, status: 'REGISTERED' },
      data: {
        status: 'ORDERED',
        rewardedAt: new Date(),
        inviteeOrderId: orderId,
        rewardLedgerKey: ledgerKey,
        rewardInviterPoints: inviterPts,
        rewardInviteePoints: inviteePts,
      },
    });
    if (won.count === 0) return; // lost the race — already rewarded

    // Reward = Vpoints. Only meaningful if Vpoints is enabled; otherwise the
    // attribution is recorded (status ORDERED) but no points are granted.
    const dp = await getDpointsSettings();
    if (!dp.dpointsEnabled) {
      console.log(`[invite] referral ${referral.id} -> ORDERED (Vpoints disabled, no grant)`);
      return;
    }
    const cap = dp.dpointsMaxBalance || undefined;
    await recordPointsTx({ userId: referral.inviterUserId, amount: inviterPts, type: 'CAMPAIGN', reason: 'Inbjudningsbonus', cap });
    await recordPointsTx({ userId: inviteeUserId, amount: inviteePts, type: 'CAMPAIGN', reason: 'Inbjudningsbonus (välkommen)', cap });
    console.log(`[invite] rewarded inviter=${referral.inviterUserId} + invitee=${inviteeUserId} (${inviterPts}/${inviteePts} Vpoints)`);
  } catch (err: any) {
    // Never throw — must not break the order/payment flow.
    console.error('[maybeRewardInvite] error:', err?.message);
  }
}
