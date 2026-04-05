const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting EMERGENCY JS SEED...');

  try {
    // 1. Create Super Admin
    console.log('👤 Creating Admin...');
    const hashedPassword = await bcrypt.hash('lexzar99', 10);
    
    // Check if Admin table exists and create
    await prisma.adminUser.upsert({
      where: { email: 'lexzar' },
      update: { password: hashedPassword },
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

    // 3. Create Restaurants
    console.log('🍔 Seeding Restaurants...');
    
    const palmyraData = {
      name: 'Palmyra Pizzeria',
      slug: 'palmyra',
      description: 'Lunds mest älskade restaurang.',
      cuisine: 'Pizza & Kebab',
      city: 'Lund',
      imageUrl: '/hero.png',
      deliveryFee: 39,
      minOrderAmount: 120,
      etaMinutes: 25,
      isOpen: true,
      tags: '["Pizza","Kebab"]'
    };
    await prisma.restaurant.upsert({ where: { slug: 'palmyra' }, update: {}, create: palmyraData });

    const sushiData = {
      name: 'Sushi Nori',
      slug: 'sushi-nori',
      description: 'Fräsch sushi.',
      cuisine: 'Sushi',
      city: 'Lund',
      imageUrl: '/burger_new.jpg',
      deliveryFee: 29,
      minOrderAmount: 150,
      etaMinutes: 32,
      isOpen: true,
      tags: '["Sushi"]'
    };
    await prisma.restaurant.upsert({ where: { slug: 'sushi-nori' }, update: {}, create: sushiData });

    const burgerData = {
      name: 'Burger Mansion',
      slug: 'burger-mansion',
      description: 'Grymma burgare.',
      cuisine: 'Hamburgare',
      city: 'Lund',
      imageUrl: '/landing_hero.png',
      deliveryFee: 45,
      minOrderAmount: 180,
      etaMinutes: 28,
      isOpen: true,
      tags: '["Burger"]'
    };
    await prisma.restaurant.upsert({ where: { slug: 'burger-mansion' }, update: {}, create: burgerData });

    console.log('✅ EMERGENCY JS SEED Completed!');
  } catch (err) {
    console.error('❌ Error during seed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
