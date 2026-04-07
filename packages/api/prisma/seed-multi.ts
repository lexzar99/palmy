import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const kr = (amount: number) => amount * 100;

async function main() {
  console.log('🌱 Starting Multi-Restaurant Seed...');

  // 1. Clear existing data in correct order
  console.log('🗑️  Cleaning existing data...');
  await prisma.productExtraGroup.deleteMany({});
  await prisma.extra.deleteMany({});
  await prisma.extraGroup.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.customerDeal.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.city.deleteMany({});
  await prisma.restaurant.deleteMany({});

  // --------------------------------------------------------------------------
  // PALMYRA PIZZERIA
  // --------------------------------------------------------------------------
  const palmyra = await prisma.restaurant.create({
    data: {
      name: 'Palmyra Pizzeria',
      slug: 'palmyra',
      description: 'Lunds mest älskade restaurang med generösa portioner och fantastisk mat.',
      cuisine: 'Pizza & Kebab',
      city: 'Lund',
      imageUrl: '/hero.png',
      heroImageUrl: '/hero-palmyra.svg',
      deliveryFee: kr(39),
      minOrderAmount: kr(120),
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
            price: kr(129),
            position: 0,
          },
          {
            name: 'Kebabrulle',
            slug: 'kebabrulle-palmyra',
            description: 'Nygrillat bröd, kebabkött, sallad och orientalsisk sås.',
            price: kr(115),
            position: 1,
          }
        ]
      }
    }
  });

  // --------------------------------------------------------------------------
  // SUSHI NORI
  // --------------------------------------------------------------------------
  const sushi = await prisma.restaurant.create({
    data: {
      name: 'Sushi Nori',
      slug: 'sushi-nori',
      description: 'Fräsch och modern sushi, nigiri och varma asiatiska rätter.',
      cuisine: 'Sushi',
      city: 'Lund',
      imageUrl: '/burger_new.jpg', // Placeholder image
      heroImageUrl: '/hero.png',
      deliveryFee: kr(29),
      minOrderAmount: kr(150),
      etaMinutes: 32,
      rating: 4.8,
      ratingCount: 231,
      tags: JSON.stringify(['Sushi', 'Maki', 'Asiatiskt']),
    }
  });

  // Sushi Categories
  const s_cat_nigiri = await prisma.category.create({
    data: {
      restaurantId: sushi.id,
      name: 'Nigiri Klassiker',
      slug: 'nigiri-klassiker',
      position: 0,
      products: {
        create: [
          { name: 'Lax Nigiri (8st)', slug: 'lax-nigiri-8', description: 'Klassisk handformad sushi med färsk lax.', price: kr(125), position: 0 },
          { name: 'Mix Nigiri (10st)', slug: 'mix-nigiri-10', description: 'Kockens val av dagens färskaste fiskar.', price: kr(145), position: 1 },
        ]
      }
    }
  });

  const s_cat_maki = await prisma.category.create({
    data: {
      restaurantId: sushi.id,
      name: 'Signaturmaki',
      slug: 'signaturmaki',
      position: 1,
      products: {
        create: [
          {
            name: 'Salmon Supreme',
            slug: 'salmon-supreme',
            description: 'Lax, avocado, gurka toppad med grillad lax och chilimajo.',
            price: kr(149),
            position: 0,
          },
          {
            name: 'Spicy Tuna Roll',
            slug: 'spicy-tuna',
            description: 'Tonfisk, gurka, sriracha och salladslök.',
            price: kr(139),
            position: 1,
          }
        ]
      }
    }
  });

  // --------------------------------------------------------------------------
  // KEBABINO
  // --------------------------------------------------------------------------
  const kebabino = await prisma.restaurant.create({
    data: {
      name: 'Kebabino',
      slug: 'kebabino',
      description: 'Lunds bästa kebab! Alltid färskt kött och nybakat bröd.',
      cuisine: 'Kebab & Grillspecialiteter',
      city: 'Lund',
      imageUrl: '/kebab-hero.png', // Placeholder
      heroImageUrl: '/hero.png',
      deliveryFee: kr(35),
      minOrderAmount: kr(120),
      etaMinutes: 25,
      rating: 4.9,
      ratingCount: 412,
      tags: JSON.stringify(['Kebab', 'Grill', 'Falafel']),
    }
  });

  await prisma.category.create({
    data: {
      restaurantId: kebabino.id,
      name: 'Kebabfavoriter',
      slug: 'kebabfavoriter',
      position: 0,
      products: {
        create: [
          {
            name: 'Kebabtallrik Deluxe',
            slug: 'kebabtallrik-deluxe',
            description: 'Större portion med extra allt: Pommes, färsk sallad och valfri sås.',
            price: kr(135),
            position: 0,
          },
          {
            name: 'Kebabrulle XL',
            slug: 'kebabrulle-xl',
            description: 'En gigantisk rulle i vårt hembakade tunnbröd.',
            price: kr(125),
            position: 1,
          },
          {
            name: 'Kebabino Mix',
            slug: 'kebabino-mix',
            description: 'Blandning av Kebabkött och Kycklingkebab för den hungrige.',
            price: kr(155),
            position: 2,
          }
        ]
      }
    }
  });

  // --------------------------------------------------------------------------
  // BURGER MANSION
  // --------------------------------------------------------------------------
  const burger = await prisma.restaurant.create({
    data: {
      name: 'Burger Mansion',
      slug: 'burger-mansion',
      description: 'Saftiga smashburgare gjorda på 100% högrev med våra hemliga såser.',
      cuisine: 'Hamburgare',
      city: 'Lund',
      imageUrl: '/landing_hero.png',
      heroImageUrl: '/hero.png',
      deliveryFee: kr(45),
      minOrderAmount: kr(180),
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
      position: 0
    }
  });

  // Burger Options (Radio for Size, Checkbox for toppings)
  const b_size_group = await prisma.extraGroup.create({
    data: {
      name: 'Välj Storlek',
      type: 'RADIO',
      required: true,
      minSelections: 1,
      maxSelections: 1,
      extras: {
        create: [
          { name: 'Singel (100g)', priceAddon: 0, isDefault: true },
          { name: 'Dubbel (200g)', priceAddon: kr(40) },
          { name: 'Trippel (300g)', priceAddon: kr(75) }
        ]
      }
    }
  });

  const b_topping_group = await prisma.extraGroup.create({
    data: {
      name: 'Extra Toppings',
      type: 'CHECKBOX',
      required: false,
      extras: {
        create: [
          { name: 'Bacon', priceAddon: kr(15) },
          { name: 'Extra Cheddar', priceAddon: kr(12) },
          { name: 'Tryffeldipp', priceAddon: kr(15) }
        ]
      }
    }
  });

  await prisma.product.create({
    data: {
      categoryId: b_cat1.id,
      name: 'The Mansion Burger',
      slug: 'mansion-burger',
      description: 'Vår signaturburgare med carmelized lök, mansion-sås och dubbel ost.',
      price: kr(125),
      extraGroups: {
        create: [
          { extraGroupId: b_size_group.id, position: 0 },
          { extraGroupId: b_topping_group.id, position: 1 }
        ]
      }
    }
  });

  // --------------------------------------------------------------------------
  // MCDONALDS
  // --------------------------------------------------------------------------
  const mcd = await prisma.restaurant.create({
    data: {
      name: 'Golden Arches',
      slug: 'mcdonalds',
      description: 'Klassiska favoriter som Big Mac och McFeast, snabbt och enkelt.',
      cuisine: 'Snabbmat',
      city: 'Lund',
      imageUrl: '/mcd.png', // Placeholder
      heroImageUrl: '/hero.png',
      deliveryFee: kr(19),
      minOrderAmount: kr(100),
      etaMinutes: 20,
      rating: 4.4,
      ratingCount: 3200,
      tags: JSON.stringify(['Mcdonalds', 'Snabbmat', 'Billigt']),
    }
  });

  const m_cat1 = await prisma.category.create({
    data: {
      restaurantId: mcd.id,
      name: 'Burgare & Co',
      slug: 'mcd-burgare',
      position: 0,
      products: {
        create: [
          { name: 'Big Mac', slug: 'big-mac', description: 'En tidlös klassiker.', price: kr(89) },
          { name: 'Cheeseburgare', slug: 'cheeseburger', description: 'Enkel och god.', price: kr(20) }
        ]
      }
    }
  });

  // --------------------------------------------------------------------------
  // CITIES
  // --------------------------------------------------------------------------
  console.log('🏙️  Seeding Cities...');
  await prisma.city.createMany({
    data: [
      { name: 'Lund', slug: 'lund', isActive: true, deliveryMode: 'ALL' },
      { name: 'Malmö', slug: 'malmo', isActive: true, deliveryMode: 'ALL' },
      { name: 'Stockholm', slug: 'stockholm', isActive: true, deliveryMode: 'ALL' }
    ]
  });

  // --------------------------------------------------------------------------
  // USERS & ADMINS
  // --------------------------------------------------------------------------
  console.log('👤 Seeding Users...');
  const users = [
    { name: 'Lexar', email: 'lexar@example.com', phone: '0711111111', isActive: true, isVerified: true, city: 'Lund' },
    { name: 'Jarir', email: 'jarir@example.com', phone: '0722222222', isActive: true, isVerified: true, city: 'Lund' },
    { name: 'Test Kund', email: 'kund@example.com', phone: '0700000000', isActive: true, isVerified: true, city: 'Lund' }
  ];

  const seededUsers = [];
  for (const userData of users) {
    const u = await prisma.user.create({ data: userData });
    seededUsers.push(u);
  }

  const testUser = seededUsers[2];

  // --------------------------------------------------------------------------
  // CAMPAIGNS & DEALS
  // --------------------------------------------------------------------------
  console.log('🎁 Seeding Campaigns...');
  const campaign = await prisma.campaign.create({
    data: {
      title: 'Välkomstbonus',
      description: '50% rabatt på första köpet!',
      discountType: 'PERCENTAGE',
      discountValue: 50,
      minOrder: kr(100),
      isActive: true,
    }
  });

  await prisma.customerDeal.create({
    data: {
      campaignId: campaign.id,
      userId: testUser.id,
      phone: testUser.phone!,
      code: 'WELCOME50',
      maxUsages: 1,
      isUsed: false
    }
  });

  console.log('✅ Multi-Restaurant FULL Seed Completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
