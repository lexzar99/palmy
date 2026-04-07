import prisma from './prisma';

/**
 * Daily cleanup job to remove expired or stale data.
 * Keeps the database lean and prevents buildup of transient records.
 */
export async function runDailyCleanup(): Promise<void> {
  console.log('🧹 Starting daily database cleanup...');
  const now = new Date();

  try {
    // 1. Cleanup expired verification codes
    const deletedCodes = await prisma.verificationCode.deleteMany({
      where: { expiresAt: { lt: now } }
    });
    if (deletedCodes.count > 0) {
      console.log(`✅ Deleted ${deletedCodes.count} expired verification codes.`);
    }

    // 2. Cleanup expired order drafts
    const deletedDrafts = await prisma.orderDraft.deleteMany({
      where: { expiresAt: { lt: now } }
    });
    if (deletedDrafts.count > 0) {
      console.log(`✅ Deleted ${deletedDrafts.count} expired order drafts.`);
    }

    // 3. Cleanup old abandoned group orders (OPEN after 48h)
    const staleThreshold = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const deletedGroups = await (prisma as any).groupOrder.deleteMany({
      where: {
        status: 'OPEN',
        createdAt: { lt: staleThreshold }
      }
    });
    if (deletedGroups.count > 0) {
      console.log(`✅ Deleted ${deletedGroups.count} abandoned group orders.`);
    }

    console.log('✨ Cleanup complete.');
  } catch (error) {
    console.error('❌ Cleanup job failed:', error);
  }
}
