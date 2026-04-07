import prisma from './prisma';
import { Order } from '@prisma/client';

/**
 * Generates a unique, easy-to-read discount code
 */
function generateCode(prefix: string): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid O, 0, I, 1
  let code = prefix;
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Triggers loyalty and retention campaigns based on order history
 */
export async function triggerLoyaltyRewards(order: any) {
  try {
    const phone = order.customerPhone;
    if (!phone) return;

    // 1. Get user order count
    const orderCount = await prisma.order.count({
      where: { customerPhone: phone, status: { not: 'CANCELLED' } }
    });

    // --- CASE A: WELCOME REWARD (After 1st order) ---
    if (orderCount === 1) {
      const welcomeCampaign = await (prisma as any).campaign.findFirst({
        where: { title: { contains: 'Välkomst' }, isActive: true }
      });
      if (welcomeCampaign) {
        await createCustomerDeal(phone, welcomeCampaign, 'WELCOME-');
      }
    }

    // --- CASE B: LOYALTY REWARD (Every 5th order) ---
    if (orderCount > 0 && orderCount % 5 === 0) {
      const loyaltyCampaign = await (prisma as any).campaign.findFirst({
        where: { title: { contains: 'Lojalitet' }, isActive: true }
      });
      if (loyaltyCampaign) {
        await createCustomerDeal(phone, loyaltyCampaign, 'LOYAL-');
      }
    }

    // --- CASE C: HIGH VALUE REWARD (Order > 500 kr) ---
    if (order.total >= 50000) { // 500.00 kr in öre
      const vipCampaign = await (prisma as any).campaign.findFirst({
        where: { title: { contains: 'VIP' }, isActive: true }
      });
      if (vipCampaign) {
        await createCustomerDeal(phone, vipCampaign, 'VIP-');
      }
    }

  } catch (err) {
    console.error('[Loyalty] Trigger error:', err);
  }
}

async function createCustomerDeal(phone: string, campaign: any, prefix: string) {
  // Check if user already has an active deal for THIS campaign and phone
  const existing = await (prisma as any).customerDeal.findFirst({
    where: { 
      phone, 
      campaignId: campaign.id,
      isUsed: false
    }
  });

  if (existing) return; // Don't spam

  // Find user if exists
  const user = await (prisma as any).user.findUnique({ where: { phone } });

  const code = generateCode(prefix);
  
  await (prisma as any).customerDeal.create({
    data: {
      campaignId: campaign.id,
      phone,
      userId: user?.id || null,
      code,
      maxUsages: campaign.maxUsagesPerCustomer || 1,
      usageCount: 0,
      isUsed: false
    }
  });

  console.log(`[Loyalty] Gifted ${campaign.title} to ${phone} with code ${code}`);
}

/**
 * Daily check for inactive customers (win-back)
 */
export async function runDailyLoyaltyChecks() {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Get all users/phones that haven't ordered for 30+ days but HAVE ordered before
    const inactivePhones = await prisma.order.findMany({
      where: {
        status: { not: 'CANCELLED' }
      },
      select: { customerPhone: true, createdAt: true },
      orderBy: { createdAt: 'desc' }
    });

    // Strategy: Unique phone, latest order < 30 days
    const latestOrderMap = new Map<string, Date>();
    for (const o of inactivePhones) {
      if (!latestOrderMap.has(o.customerPhone)) {
        latestOrderMap.set(o.customerPhone, o.createdAt);
      }
    }

    const recoveryCampaign = await (prisma as any).campaign.findFirst({
      where: { title: { contains: 'Saknar dig' }, isActive: true }
    });

    if (!recoveryCampaign) return;

    for (const [phone, lastOrderDate] of latestOrderMap.entries()) {
      if (lastOrderDate < thirtyDaysAgo) {
        await createCustomerDeal(phone, recoveryCampaign, 'COMEBACK-');
      }
    }
  } catch (err) {
    console.error('[Loyalty] Daily check error:', err);
  }
}
