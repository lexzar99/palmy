const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const palmyra = await prisma.restaurant.findFirst({ where: { slug: 'palmyra' }});
  const count = await prisma.category.count({ where: { restaurantId: palmyra.id }});
  const globalCount = await prisma.category.count({ where: { restaurantId: null }});
  console.log(`Palmyra categories: ${count}, Global categories: ${globalCount}`);
  process.exit(0);
}
run();
