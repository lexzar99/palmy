import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Cities...');

  const lund = await (prisma as any).city.upsert({
    where: { slug: 'lund' },
    update: {
      name: 'Lund',
      deliveryMode: 'ALL',
      isActive: true,
      zones: JSON.stringify([
        { id: 'z1', name: 'Centrum', radiusKm: 3, fee: 0, minOrder: 15000, isActive: true },
        { id: 'z2', name: 'Utkant', radiusKm: 6, fee: 4900, minOrder: 25000, isActive: true },
      ])
    },
    create: {
      name: 'Lund',
      slug: 'lund',
      deliveryMode: 'ALL',
      isActive: true,
      zones: JSON.stringify([
        { id: 'z1', name: 'Centrum', radiusKm: 3, fee: 0, minOrder: 15000, isActive: true },
        { id: 'z2', name: 'Utkant', radiusKm: 6, fee: 4900, minOrder: 25000, isActive: true },
      ])
    }
  });

  const malmo = await (prisma as any).city.upsert({
    where: { slug: 'malmo' },
    update: {
      name: 'Malmö',
      deliveryMode: 'ONLY_PICKUP',
      isActive: true,
      zones: '[]'
    },
    create: {
      name: 'Malmö',
      slug: 'malmo',
      deliveryMode: 'ONLY_PICKUP',
      isActive: true,
      zones: '[]'
    }
  });

  console.log('✅ Cities Seeded: Lund, Malmö');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
