import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const kr = (amount: number) => amount * 100;

async function main() {
  console.log('🌱 Full Database Recovery Started...');

  try {
    // 1. Create Super Admin
    console.log('👤 Restoring Super Admin...');
    const hashedPassword = await bcrypt.hash('lexzar99', 10);
    await prisma.adminUser.upsert({
      where: { email: 'lexzar' },
      update: { password: hashedPassword, role: 'SUPER_ADMIN' },
      create: {
        email: 'lexzar',
        name: 'Super Admin',
        password: hashedPassword,
        role: 'SUPER_ADMIN',
      }
    });

    // 2. Create Cities
    console.log('🏙️  Seeding Cities...');
    const cities = [
      { name: 'Lund', slug: 'lund', isActive: true, deliveryMode: 'ALL' },
      { name: 'Malmö', slug: 'malmo', isActive: true, deliveryMode: 'ALL' },
      { name: 'Stockholm', slug: 'stockholm', isActive: true, deliveryMode: 'ALL' }
    ];
    for (const c of cities) {
      await prisma.city.upsert({ where: { slug: c.slug }, update: {}, create: c });
    }

    // 3. Restaurants List
    const restaurants = [
      {
        name: 'Palmyra Lund',
        slug: 'palmyra',
        description: 'Lunds klassiker med pizza, kebab och rullar.',
        cuisine: 'Pizza & Kebab',
        city: 'Lund',
        featuredClass: 1,
        imageUrl: '/hero.png',
        heroImageUrl: '/hero-palmyra.svg',
      },
      {
        name: 'Sushi Nori',
        slug: 'sushi-nori',
        description: 'Poké bowls, nigiri och varma asiatiska rätter.',
        cuisine: 'Sushi',
        city: 'Lund',
        featuredClass: 1,
        imageUrl: '/burger_new.jpg',
      },
      {
        name: 'Burger Mansion',
        slug: 'burger-mansion',
        description: 'Saftiga smashburgare gjorda på 100% högrev med våra hemliga såser.',
        cuisine: 'Hamburgare',
        city: 'Lund',
        featuredClass: 3,
        imageUrl: '/landing_hero.png',
      },
      {
         name: 'Kebabino',
         slug: 'kebabino',
         description: 'Durum, tallrikar och halal kebab.',
         cuisine: 'Kebab',
         city: 'Lund',
         featuredClass: 2,
         imageUrl: '/kebab_new.png',
       },
       {
         name: 'Golden Arches',
         slug: 'mcdonalds',
         description: 'Klassiska favoriter som Big Mac och McFeast, snabbt och enkelt.',
         cuisine: 'Snabbmat',
         city: 'Lund',
         featuredClass: 3,
         imageUrl: '/mcd.png',
       }
    ];

    // Restore Restaurants and their Admins
    console.log('🍔 Restoring Restaurants and Logins...');
    for (const r of restaurants) {
      const rest = await prisma.restaurant.upsert({
        where: { slug: r.slug },
        update: { featuredClass: r.featuredClass, name: r.name, description: r.description },
        create: {
          ...r,
          deliveryFee: 3900,
          minOrderAmount: 15000,
          etaMinutes: 30,
          isOpen: true,
          tags: JSON.stringify([r.cuisine]),
        }
      });

      // Restore Admin Login for the restaurant
      await prisma.adminUser.upsert({
        where: { email: r.slug },
        update: { password: hashedPassword, role: 'STAFF' },
        create: {
          email: r.slug,
          name: `Admin - ${r.name}`,
          password: hashedPassword,
          role: 'STAFF',
        }
      });
    }

    console.log('✅ Recovery Completed Successfully!');
  } catch (err) {
    console.error('❌ Error during recovery:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
