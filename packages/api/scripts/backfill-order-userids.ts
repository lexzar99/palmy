/**
 * Backfill script: Link existing orders (userId = null) to User accounts
 * by matching customerPhone → User.phone.
 *
 * Run with:
 *   npx ts-node --project tsconfig.json scripts/backfill-order-userids.ts
 * Or from the api package root:
 *   npx tsx scripts/backfill-order-userids.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔍 Looking for unlinked orders (userId = null)...');

  // Find all orders missing a userId
  const unlinkedOrders = await (prisma as any).order.findMany({
    where: { userId: null },
    select: { id: true, orderNumber: true, customerPhone: true },
  });

  console.log(`📦 Found ${unlinkedOrders.length} unlinked order(s).`);

  if (unlinkedOrders.length === 0) {
    console.log('✅ Nothing to do.');
    return;
  }

  // Gather unique phone numbers
  const phones = [...new Set(unlinkedOrders.map((o: any) => o.customerPhone).filter(Boolean))] as string[];
  console.log(`📱 Unique phone numbers involved: ${phones.length}`);

  // Build a phone → userId map
  const users = await (prisma as any).user.findMany({
    where: { phone: { in: phones } },
    select: { id: true, phone: true, name: true },
  });

  const phoneMap = new Map<string, string>(users.map((u: any) => [u.phone, u.id]));
  console.log(`👤 Matched ${phoneMap.size} phone number(s) to user accounts.`);

  let updated = 0;
  let skipped = 0;

  for (const order of unlinkedOrders) {
    const userId = order.customerPhone ? phoneMap.get(order.customerPhone) : undefined;

    if (!userId) {
      // No matching user found (guest order or unregistered phone)
      skipped++;
      continue;
    }

    await (prisma as any).order.update({
      where: { id: order.id },
      data: { userId },
    });

    console.log(`  ✔ Order ${order.orderNumber} → userId ${userId}`);
    updated++;
  }

  console.log(`\n🎉 Done! Updated: ${updated} order(s), Skipped (guest/no match): ${skipped} order(s).`);
}

main()
  .catch((e) => {
    console.error('❌ Error during backfill:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
