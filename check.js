const { PrismaClient } = require('./packages/api/node_modules/@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const categories = await prisma.category.findMany({ include: { products: true }});
  console.log('Total categories:', categories.length);
  if(categories.length > 0) {
    console.log('Category 0:', categories[0].name, 'Restaurant ID:', categories[0].restaurantId, 'Products:', categories[0].products.length);
  }
}
main().catch(console.error).finally(()=>prisma.$disconnect());
