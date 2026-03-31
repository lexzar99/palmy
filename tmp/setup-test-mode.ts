import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function setupTestMode() {
  console.log('🔧 Sätter upp testläge för 1 kr...');

  try {
    // 1. Uppdatera restauranginställningar
    await prisma.restaurantSettings.upsert({
      where: { id: 'settings' },
      update: { minOrderAmount: 100 }, // 100 öre = 1 kr
      create: { 
        id: 'settings', 
        minOrderAmount: 100, 
        deliveryFee: 0,
        isOpen: true,
        estimatedPickupTime: 10,
        estimatedDeliveryTime: 20
      },
    });
    console.log('✅ Minsta ordersumma satt till 1 kr.');

    // 2. Hitta eller skapa en testkategori
    let category = await prisma.category.findFirst({
      where: { name: 'TEST' }
    });

    if (!category) {
      category = await prisma.category.create({
        data: { name: 'TEST', sortOrder: 0 }
      });
    }

    // 3. Skapa en testprodukt för 1 kr
    await prisma.product.upsert({
      where: { id: 'test-1kr' },
      update: { price: 100, isActive: true },
      create: {
        id: 'test-1kr',
        name: 'Testprodukt (1 kr)',
        description: 'Används endast för att testa betalningar.',
        price: 100, // 100 öre = 1 kr
        categoryId: category.id,
        isActive: true,
        sortOrder: 0
      }
    });
    console.log('✅ Testprodukt för 1 kr skapad/uppdaterad.');

  } catch (error) {
    console.error('❌ Fel vid setup:', error);
  } finally {
    await prisma.$disconnect();
  }
}

setupTestMode();
