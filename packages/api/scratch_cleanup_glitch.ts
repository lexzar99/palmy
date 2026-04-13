import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    const idsToDelete = [
      'cmnxit4a5000310hsqi4k8yoj', // Pizza 
      'cmnxj718n0001yxnppl1f1vri'  // aaaaaa
    ];

    console.log('--- DELETING GLITCHED CATEGORIES ---');
    
    // Check if they exist first
    const existing = await prisma.category.findMany({
       where: { id: { in: idsToDelete } }
    });
    
    console.log(`Found ${existing.length} of ${idsToDelete.length} glitched categories.`);

    const deleted = await prisma.category.deleteMany({
      where: {
        id: { in: idsToDelete }
      }
    });

    console.log(`SUCCESS: Deleted ${deleted.count} categories.`);

    // Also check for any other categories with restaurantId: null just in case
    const otherGlobals = await prisma.category.findMany({
      where: { restaurantId: null }
    });
    
    if (otherGlobals.length > 0) {
      console.log(`WARNING: Found ${otherGlobals.length} other global categories (restaurantId: null). Names: ${otherGlobals.map(c => c.name).join(', ')}`);
    }

  } catch (error) {
    console.error('Database Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
