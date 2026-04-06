
const { PrismaClient } = require('@prisma/client');
const { isRestaurantOpen } = require('./src/lib/openingHours');
const prisma = new PrismaClient();

async function main() {
  const palmyra = await prisma.restaurant.findUnique({ where: { slug: 'palmyra' } });
  if (!palmyra) {
    console.log("No palmyra found");
    return;
  }
  console.log("Manual isOpen:", palmyra.isOpen);
  console.log("Opening hours:", palmyra.openingHours);
  try {
    const computed = isRestaurantOpen(palmyra.openingHours);
    console.log("isRestaurantOpen Result:", computed);
  } catch(e) {
    console.error(e);
  }
}

main().finally(() => prisma.$disconnect());
