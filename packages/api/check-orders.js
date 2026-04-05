const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true, orderNumber: true, restaurantId: true, stripePaymentIntentId: true, customerName: true, discountCode: true }
  });
  console.log(JSON.stringify(orders, null, 2));
  await prisma.$disconnect();
}
check();
