
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.order.deleteMany({
    where: {
      orderNumber: {
        in: ['PX-1005', 'PX-1006']
      }
    }
  });
  console.log(`Deleted ${result.count} test orders (PX-1005, PX-1006).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
