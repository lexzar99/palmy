
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const protectedOrders = await prisma.order.count({
    where: {
      orderNumber: {
        in: ['PX-1005', 'PX-1006']
      }
    }
  });
  throw new Error(
    `Order hard delete is disabled. Found ${protectedOrders} matching test orders; keep them as audit records.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
