import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Setting up 1 kr test mode...');
  
  // 1. Set minimum order to 1 kr (100 öre)
  await prisma.restaurantSettings.upsert({
    where: { id: 'settings' },
    update: { 
      minOrderAmount: 100,
      deliveryFee: 0, // No delivery fee for test
      isOpen: true 
    },
    create: { 
      id: 'settings', 
      minOrderAmount: 100,
      deliveryFee: 0,
      isOpen: true 
    }
  });

  // 2. Ensure a "Test" category exists
  const category = await prisma.category.upsert({
    where: { slug: 'test-kategori' },
    update: { isActive: true },
    create: { 
      name: 'Test Kategori', 
      slug: 'test-kategori', 
      isActive: true,
      position: 0
    }
  });

  // 3. Create a 1 kr test product
  await prisma.product.upsert({
    where: { slug: 'testprodukt-1kr' },
    update: { 
      price: 100, 
      isActive: true,
      categoryId: category.id 
    },
    create: { 
      name: 'Testprodukt (1 kr)', 
      slug: 'testprodukt-1kr', 
      price: 100, 
      isActive: true,
      categoryId: category.id,
      description: 'Använd denna för att testa betalningar.'
    }
  });

  console.log('✅ Done! Minimum order is now 1 kr and a test product is available.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
