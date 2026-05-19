// One-off setup för Palmyra Pizzeria: skapar 6 huvudkategorier och länkar
// existerande Category-rader. Idempotent — kör om utan att duplicera.
//
// Användning: pnpm ts-node setup_palmyra_main_categories.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const RESTAURANT_ID = 'cmnxhfd1z000110wjrhizs4nh';

const PLAN: Array<{ mainName: string; position: number; categoryMatchers: Array<string | RegExp> }> = [
  { mainName: 'Pizzor', position: 0, categoryMatchers: [/pizz/i] },
  { mainName: 'Kyckling', position: 1, categoryMatchers: ['Crispy Chicken'] },
  { mainName: 'Tallrikar & Box', position: 2, categoryMatchers: ['Tallrikar', 'Box', 'Bakad Potatis'] },
  { mainName: 'Burgare & Rullar', position: 3, categoryMatchers: ['Hamburgare', 'Rullar & Bröd'] },
  { mainName: 'Sallader & Sides', position: 4, categoryMatchers: ['Sallader', 'Tillbehör'] },
  { mainName: 'Dryck', position: 5, categoryMatchers: ['Dryck'] },
];

const matches = (catName: string, matchers: Array<string | RegExp>) =>
  matchers.some((m) => (m instanceof RegExp ? m.test(catName) : catName === m));

async function main() {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: RESTAURANT_ID } });
  if (!restaurant) throw new Error(`Restaurant ${RESTAURANT_ID} hittades inte`);

  const categories = await prisma.category.findMany({
    where: { restaurantId: RESTAURANT_ID },
    select: { id: true, name: true, mainCategoryId: true },
  });
  console.log(`Hittade ${categories.length} kategorier för ${restaurant.name}.`);

  for (const step of PLAN) {
    const existingMain = await prisma.mainCategory.findFirst({
      where: { restaurantId: RESTAURANT_ID, name: step.mainName },
    });
    const main = existingMain
      ? await prisma.mainCategory.update({
          where: { id: existingMain.id },
          data: { position: step.position, isActive: true },
        })
      : await prisma.mainCategory.create({
          data: { restaurantId: RESTAURANT_ID, name: step.mainName, position: step.position },
        });

    const matched = categories.filter((c) => matches(c.name, step.categoryMatchers));
    if (matched.length === 0) {
      console.log(`  ${step.mainName}: 0 underkategorier (inga matchningar)`);
      continue;
    }
    await prisma.category.updateMany({
      where: { id: { in: matched.map((c) => c.id) } },
      data: { mainCategoryId: main.id },
    });
    console.log(`  ${step.mainName} (${main.id}): ${matched.length} underkategorier → ${matched.map((c) => c.name).join(', ')}`);
  }

  const orphans = await prisma.category.count({
    where: { restaurantId: RESTAURANT_ID, mainCategoryId: null },
  });
  console.log(`\nKvarvarande utan huvudkategori: ${orphans}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
