const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const restaurants = await prisma.restaurant.findMany();
  console.log('RESTAURANTS:');
  restaurants.forEach(r => console.log(`- ${r.name} (ID: ${r.id}, Slug: ${r.slug})`));
  
  const categories = await prisma.category.findMany();
  console.log('\nCATEGORIES:');
  categories.forEach(c => console.log(`- ${c.name} (ID: ${c.id}, RID: ${c.restaurantId})`));
  
  await prisma.$disconnect();
}
check();
