import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const restaurants = await prisma.restaurant.findMany();
    console.log('Restaurants:', JSON.stringify(restaurants, null, 2));

    const extraGroups = await prisma.extraGroup.findMany({
      include: { extras: true }
    });
    console.log('Extra Groups:', JSON.stringify(extraGroups, null, 2));
  } catch (error) {
    console.error('Database Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
