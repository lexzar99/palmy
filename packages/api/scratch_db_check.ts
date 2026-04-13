import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const restaurants = await prisma.restaurant.findMany();
    console.log('--- RESTAURANTS ---');
    console.log(JSON.stringify(restaurants.map(r => ({ id: r.id, name: r.name, slug: r.slug })), null, 2));

    const categories = await prisma.category.findMany({
      include: { _count: { select: { products: true } } }
    });
    console.log('\n--- CATEGORIES ---');
    console.log(JSON.stringify(categories, null, 2));

    const products = await prisma.product.findMany({
      select: { id: true, name: true, categoryId: true, slug: true }
    });
    console.log('\n--- PRODUCTS (first 10) ---');
    console.log(JSON.stringify(products.slice(0, 10), null, 2));

    const extraGroups = await prisma.extraGroup.findMany();
    console.log('\n--- EXTRA GROUPS ---');
    console.log(JSON.stringify(extraGroups, null, 2));

  } catch (error) {
    console.error('Database Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
