import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Konvertera kr till ören
const kr = (amount: number) => Math.round(amount * 100);

async function main() {
  console.log('🌱 Seeding Palmyra Lund database (Neon/Postgres)...');

  // Rensa befintlig data
  await prisma.orderItem.deleteMany().catch(() => {});
  await prisma.order.deleteMany().catch(() => {});
  await prisma.productExtraGroup.deleteMany().catch(() => {});
  await prisma.extra.deleteMany().catch(() => {});
  await prisma.extraGroup.deleteMany().catch(() => {});
  await prisma.product.deleteMany().catch(() => {});
  await prisma.category.deleteMany().catch(() => {});
  await prisma.deal.deleteMany().catch(() => {});
  await prisma.discountCode.deleteMany().catch(() => {});
  await prisma.adminUser.deleteMany().catch(() => {});
  await prisma.restaurantSettings.deleteMany().catch(() => {});

  // ----------------------
  // EXTRA-GRUPPER
  // ----------------------
  const pizzaSizeGroup = await prisma.extraGroup.create({
    data: {
      name: 'Storlek',
      type: 'RADIO',
      required: true,
      minSelections: 1,
      maxSelections: 1,
      extras: {
        create: [
          { name: 'Standard', priceAddon: 0, isDefault: true, position: 0 },
          { name: 'Panpizza', priceAddon: kr(20), position: 1 },
          { name: 'Familjepizza', priceAddon: kr(110), position: 2 },
        ],
      },
    },
  });

  const pizzaToppingGroup = await prisma.extraGroup.create({
    data: {
      name: 'Pålägg',
      type: 'CHECKBOX',
      required: false,
      extras: {
        create: [
          { name: 'Kebab', priceAddon: kr(25), position: 0 },
          { name: 'Kyckling', priceAddon: kr(25), position: 1 },
          { name: 'Räkor', priceAddon: kr(25), position: 2 },
          { name: 'Skinka', priceAddon: kr(25), position: 3 },
          { name: 'Svamp', priceAddon: kr(20), position: 4 },
        ],
      },
    },
  });

  const sauceGroup = await prisma.extraGroup.create({
    data: {
      name: 'Sås',
      type: 'RADIO',
      extras: {
        create: [
          { name: 'Vitlökssås', priceAddon: 0, isDefault: true, position: 0 },
          { name: 'Stark sås', priceAddon: 0, position: 1 },
          { name: 'Mamsas', priceAddon: 0, position: 2 },
        ],
      },
    },
  });

  const plateSideGroup = await prisma.extraGroup.create({
    data: {
      name: 'Tillbehör',
      type: 'RADIO',
      required: true,
      extras: {
        create: [
          { name: 'Pommes', priceAddon: 0, isDefault: true, position: 0 },
          { name: 'Ris', priceAddon: 0, position: 1 },
        ],
      },
    },
  });

  // ----------------------
  // KATEGORIER & PRODUKTER
  // ----------------------

  // 0. TESTKATEGORI
  const categTest = await prisma.category.create({
    data: {
      name: 'TESTKATEGORI (1 kr)',
      slug: 'test-kategori',
      description: 'Använd dessa för billiga live-tester',
      position: -1,
      products: {
        create: [
          { name: 'Test Pizza (1 kr)', slug: 'test-pizza-1kr', description: '1 kr för Stripe-test', price: 100, position: 0 },
          { name: 'Test Dricka (1 kr)', slug: 'test-dricka-1kr', description: '1 kr för Stripe-test', price: 100, position: 1 },
        ]
      }
    },
    include: { products: true }
  });
  await prisma.productExtraGroup.createMany({
    data: categTest.products.map(p => ({ productId: p.id, extraGroupId: pizzaSizeGroup.id, position: 0 }))
  });

  // 1. CRISPY CHICKEN
  const categCrispy = await prisma.category.create({
    data: {
      name: 'Nyhet – Crispy Chicken',
      slug: 'crispy-chicken',
      position: 0,
      products: {
        create: [
          { name: 'Crispy Tallrik', slug: 'crispy-tallrik', price: kr(139), position: 0 },
          { name: 'Hot & Crispy', slug: 'hot-crispy', price: kr(115), position: 1 },
          { name: 'Crispyrulle', slug: 'crispyrulle', price: kr(110), position: 2 },
        ],
      },
    },
    include: { products: true },
  });
  await prisma.productExtraGroup.createMany({
    data: [
      { productId: categCrispy.products[0].id, extraGroupId: plateSideGroup.id, position: 0 },
      { productId: categCrispy.products[1].id, extraGroupId: plateSideGroup.id, position: 0 },
      { productId: categCrispy.products[2].id, extraGroupId: sauceGroup.id, position: 0 },
    ],
  });

  const createPizzaCategory = async (name: string, slug: string, position: number, pizzas: any[]) => {
    const cat = await prisma.category.create({
      data: {
        name, slug, position,
        products: {
          create: pizzas.map((p, i) => ({
            name: p.name,
            slug: `${slug}-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            description: p.description,
            price: p.price,
            position: i,
          })),
        },
      },
      include: { products: true },
    });
    await prisma.productExtraGroup.createMany({
      data: cat.products.flatMap((p) => [
        { productId: p.id, extraGroupId: pizzaSizeGroup.id, position: 0 },
        { productId: p.id, extraGroupId: pizzaToppingGroup.id, position: 1 },
      ])
    });
  };

  await createPizzaCategory('Pizza Standard 1', 'pizza-standard-1', 1, [
    { name: 'Margherita', description: 'Tomat, ost', price: kr(110) },
    { name: 'Vesuvio', description: 'Skinka', price: kr(110) },
    { name: 'Capricciosa', description: 'Skinka, champinjoner', price: kr(110) },
    { name: 'Hawaii', description: 'Skinka, ananas', price: kr(110) },
  ]);

  await createPizzaCategory('Pizza Standard 2', 'pizza-standard-2', 2, [
    { name: 'Bussola', description: 'Skinka, räkor', price: kr(115) },
    { name: 'Opera', description: 'Skinka, tonfisk', price: kr(115) },
  ]);

  await createPizzaCategory('Kebabpizzor', 'kebab-pizzor', 3, [
    { name: 'Kebabpizza', description: 'Kebabkött, lök, sås', price: kr(125) },
    { name: 'Kebabpizza Special', description: 'Kebabkött, sallad, sås', price: kr(135) },
  ]);

  // ----------------------
  // ADMIN & SETTINGS
  // ----------------------
  const hashedPassword = await bcrypt.hash('Admin1234!', 12);
  await prisma.adminUser.create({
    data: { email: 'admin@palmyrapizzeria.se', password: hashedPassword, name: 'Palmyra Admin', role: 'SUPER_ADMIN' },
  });

  await prisma.restaurantSettings.create({
    data: {
      id: 'settings',
      isOpen: true,
      deliveryFee: 0,
      minOrderAmount: 0, // Ingen minsta ordersumma för test
      openingHours: JSON.stringify({
        monday: { open: '00:00', close: '23:59' }, tuesday: { open: '00:00', close: '23:59' },
        wednesday: { open: '00:00', close: '23:59' }, thursday: { open: '00:00', close: '23:59' },
        friday: { open: '00:00', close: '23:59' }, saturday: { open: '00:00', close: '23:59' },
        sunday: { open: '00:00', close: '23:59' },
      }),
    },
  });

  console.log('\n🎉 Database re-seeded for LIVE test (1 kr products added, min order 0 kr)!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
