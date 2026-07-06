import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const kr = (amount: number) => Math.round(amount * 100);

async function seed() {
  console.log('Seeding restaurants to direct database connection...');
  try {
    const palmyra = await prisma.restaurant.upsert({
      where: { slug: 'palmyra' },
      update: { featuredClass: 1, isOpen: true },
      create: {
        name: 'ViaEats Lund',
        slug: 'palmyra',
        description: 'Lunds klassiker med pizza, kebab och rullar.',
        cuisine: 'Pizza & Kebab',
        address: 'Västra Mårtensgatan 10',
        city: 'Lund',
        zip: '223 51',
        phone: '046-120 612',
        imageUrl: '/hero.png',
        heroImageUrl: '/hero-palmyra.svg',
        deliveryFee: kr(39),
        minOrderAmount: kr(150),
        etaMinutes: 32,
        featuredClass: 1,
        isOpen: true,
        tags: JSON.stringify(['Pizza', 'Kebab', 'Rullar']),
      },
    });

    const sushi = await prisma.restaurant.upsert({
      where: { slug: 'sushi-nori' },
      update: { featuredClass: 1, isOpen: true },
      create: {
        name: 'Sushi Nori',
        slug: 'sushi-nori',
        description: 'Poké bowls, nigiri och varma rullar.',
        cuisine: 'Sushi',
        city: 'Lund',
        imageUrl: '/burger_new.jpg',
        heroImageUrl: '/hero.png',
        deliveryFee: kr(29),
        minOrderAmount: kr(150),
        etaMinutes: 28,
        rating: 4.8,
        ratingCount: 230,
        featuredClass: 1,
        isOpen: true,
        tags: JSON.stringify(['Sushi', 'Poké', 'Japanskt']),
      },
    });

    const kebab = await prisma.restaurant.upsert({
      where: { slug: 'kebabino' },
      update: { featuredClass: 2, isOpen: true },
      create: {
        name: 'Kebabino',
        slug: 'kebabino',
        description: 'Durum, tallrikar och halal kebab.',
        cuisine: 'Kebab',
        city: 'Lund',
        imageUrl: '/kebab_new.png',
        heroImageUrl: '/hero.png',
        deliveryFee: kr(25),
        minOrderAmount: kr(140),
        etaMinutes: 24,
        rating: 4.5,
        ratingCount: 180,
        featuredClass: 2,
        isOpen: true,
        tags: JSON.stringify(['Kebab', 'Halal', 'Durum']),
      },
    });

    console.log('Seeded restaurants:', { palmyra: palmyra.id, sushi: sushi.id, kebab: kebab.id });
  } catch (error) {
    console.error('Error seeding restaurants:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
