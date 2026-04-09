import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const restaurants = await prisma.restaurant.findMany({
    select: {
      id: true,
      name: true,
      isOpen: true,
      openingHours: true
    }
  });

  console.log('--- RESTAURANT STATUS REPORT ---');
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Stockholm" }));
  console.log('Current Time (Stockholm):', now.toString());

  for (const r of restaurants) {
    console.log(`\nRestaurant: ${r.name}`);
    console.log(`Status in DB: ${r.isOpen ? 'OPEN' : 'CLOSED'}`);
    console.log(`Opening Hours:`, JSON.stringify(r.openingHours, null, 2));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
