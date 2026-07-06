import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const kr = (amount: number) => Math.round(amount * 100);

async function main() {
  console.log('🌱 Starting EMERGENCY SEED To Restore Data...');

  // 1. Clear existing data (Safety first)
  console.log('🗑️  Cleaning existing data...');
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.productExtraGroup.deleteMany({});
  await prisma.extra.deleteMany({});
  await prisma.extraGroup.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.customerDeal.deleteMany({});
  await prisma.campaign.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.admin.deleteMany({});
  await prisma.city.deleteMany({});
  await prisma.restaurant.deleteMany({});

  // 2. Create Admin
  console.log('👤 Creating Admin...');
  const hashedPassword = await bcrypt.hash('lexzar99', 10);
  await prisma.admin.create({
    data: {
      email: 'lexzar',
      name: 'Super Admin',
      password: hashedPassword,
      role: 'SUPER_ADMIN',
    }
  });

  // 3. Create Cities
  console.log('🏙️  Seeding Cities...');
  await prisma.city.createMany({
    data: [
      { name: 'Lund', slug: 'lund', isActive: true, deliveryMode: 'ALL' },
      { name: 'Malmö', slug: 'malmo', isActive: true, deliveryMode: 'ALL' },
      { name: 'Stockholm', slug: 'stockholm', isActive: true, deliveryMode: 'ALL' }
    ]
  });

  // 4. Create Restaurants
  console.log('🍔 Seeding Restaurants...');
  
  // PALMYRA
  const palmyra = await prisma.restaurant.create({
    data: {
      name: 'ViaEats',
      slug: 'palmyra',
      description: 'Lunds mest älskade restaurang med generösa portioner och fantastisk mat.',
      cuisine: 'Pizza & Kebab',
      city: 'Lund',
      imageUrl: '/hero.png',
      heroImageUrl: '/hero-palmyra.svg',
      deliveryFee: 39,
      minOrderAmount: 120,
      etaMinutes: 25,
      featuredClass: 1,
      tags: JSON.stringify(['Pizza', 'Kebab', 'Lund']),
    }
  });

  const p_cat1 = await prisma.category.create({
    data: {
      restaurantId: palmyra.id,
      name: 'Populära Rätter',
      slug: 'populara-ratter-palmyra',
      position: 0,
      products: {
        create: [
          {
            name: 'Kebabtallrik',
            slug: 'kebabtallrik-palmyra',
            description: 'Med pommes frites, isbergssallad, tomat, gurka och lök.',
            price: 129,
            position: 0,
          },
          {
            name: 'Kebabrulle',
            slug: 'kebabrulle-palmyra',
            description: 'Nygrillat bröd, kebabkött, sallad och orientalsisk sås.',
            price: 115,
            position: 1,
          }
        ]
      }
    }
  });

  // SUSHI NORI
  const sushi = await prisma.restaurant.create({
    data: {
      name: 'Sushi Nori',
      slug: 'sushi-nori',
      description: 'Fräsch och modern sushi, nigiri och varma asiatiska rätter.',
      cuisine: 'Sushi',
      city: 'Lund',
      imageUrl: '/burger_new.jpg', 
      heroImageUrl: '/hero.png',
      deliveryFee: 29,
      minOrderAmount: 150,
      etaMinutes: 32,
      rating: 4.8,
      ratingCount: 231,
      tags: JSON.stringify(['Sushi', 'Maki', 'Asiatiskt']),
    }
  });

  const s_cat1 = await prisma.category.create({
    data: {
      restaurantId: sushi.id,
      name: 'Signaturmaki',
      slug: 'signaturmaki',
      position: 0,
      products: {
        create: [
          { name: 'Salmon Supreme', slug: 'salmon-supreme', price: 149, description: 'Lax, avocado, gurka.' }
        ]
      }
    }
  });

  // BURGER MANSION
  const burger = await prisma.restaurant.create({
    data: {
      name: 'Burger Mansion',
      slug: 'burger-mansion',
      description: 'Saftiga smashburgare gjorda på 100% högrev med våra hemliga såser.',
      cuisine: 'Hamburgare',
      city: 'Lund',
      imageUrl: '/landing_hero.png',
      heroImageUrl: '/hero.png',
      deliveryFee: 45,
      minOrderAmount: 180,
      etaMinutes: 28,
      rating: 4.7,
      ratingCount: 154,
      tags: JSON.stringify(['Smash', 'Burger', 'Premium']),
    }
  });

  const b_cat1 = await prisma.category.create({
    data: {
      restaurantId: burger.id,
      name: 'Burgare',
      slug: 'burgare-mansion',
      position: 0,
      products: {
        create: [
          { name: 'The Mansion Burger', slug: 'mansion-burger', price: 125, description: 'Vår signaturburgare.' }
        ]
      }
    }
  });

  // 5. Create Users
  console.log('👤 Seeding Users...');
  await prisma.user.createMany({
    data: [
      { name: 'Lexar', email: 'lexar@example.com', phone: '0711111111', isActive: true, isVerified: true, city: 'Lund' },
      { name: 'Jarir', email: 'jarir@example.com', phone: '0722222222', isActive: true, isVerified: true, city: 'Lund' }
    ]
  });

  console.log('✅ EMERGENCY SEED Completed! Data Restored.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
