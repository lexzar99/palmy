// Master→plats menysynk (kedjestöd, steg 3). Kopierar en käll-restaurangs
// meny (kategorier, produkter, tillvalsgrupper + kopplingar) till en mål-plats.
//
// Designval:
//  • EXPLICITA mål (anroparen anger target-id) — ingen schema-relation behövs,
//    och admin väljer aktivt vilka platser som synkas (säkrare än auto-sync).
//  • Deterministiska, restaurang-scopade slugs (samma som lib/slug.ts) gör
//    synken IDEMPOTENT: andra körningen UPPDATERAR samma rader i stället för
//    att duplicera. `${slugify(namn)}-${målSlug}`.
//  • LOKALA undantag bevaras: målets `isActive` skrivs ALDRIG över — en plats
//    kan ha 86:at (slutsålt) en vara lokalt utan att master rör det.
//  • Pris/beskrivning/flaggor/extras = master är sanningen.
//
// apply=false → dry-run (räknar, skriver inget). apply=true → kör.
import type { PrismaClient } from '@prisma/client';
import { slugify } from './slug';

export interface MenuSyncSummary {
  categoriesCreated: number;
  categoriesUpdated: number;
  productsCreated: number;
  productsUpdated: number;
  priceLocked: number;
  groupsCreated: number;
  groupsReused: number;
  links: number;
}

export interface MenuSyncResult {
  ok: boolean;
  dryRun: boolean;
  targetRestaurantId: string;
  summary: MenuSyncSummary;
  warnings: string[];
}

const norm = (s: string) => s.trim().toLowerCase();

export async function runMenuSync(
  prisma: PrismaClient,
  sourceRestaurantId: string,
  targetRestaurantId: string,
  apply: boolean,
): Promise<MenuSyncResult> {
  const summary: MenuSyncSummary = {
    categoriesCreated: 0, categoriesUpdated: 0,
    productsCreated: 0, productsUpdated: 0, priceLocked: 0,
    groupsCreated: 0, groupsReused: 0, links: 0,
  };
  const warnings: string[] = [];

  const target = await prisma.restaurant.findUnique({ where: { id: targetRestaurantId }, select: { id: true, slug: true } });
  if (!target) {
    return { ok: false, dryRun: !apply, targetRestaurantId, summary, warnings: ['Målrestaurang hittades inte'] };
  }
  const targetSlug = target.slug;

  // Källans fulla meny.
  const sourceCats = await prisma.category.findMany({
    where: { restaurantId: sourceRestaurantId, isActive: true },
    orderBy: { position: 'asc' },
    include: {
      products: {
        orderBy: { position: 'asc' },
        include: {
          extraGroups: {
            orderBy: { position: 'asc' },
            include: { extraGroup: { include: { extras: { orderBy: { position: 'asc' } } } } },
          },
        },
      },
    },
  });

  // Målets befintliga grupper (namn → id) för återanvändning, och befintliga
  // kategorier/produkter (slug → id) för idempotent upsert.
  const [targetGroups, targetCats] = await Promise.all([
    prisma.extraGroup.findMany({ where: { restaurantId: targetRestaurantId }, select: { id: true, name: true } }),
    prisma.category.findMany({ where: { restaurantId: targetRestaurantId }, select: { id: true, slug: true } }),
  ]);
  const groupIdByName = new Map(targetGroups.map((g) => [norm(g.name), g.id]));
  const catIdBySlug = new Map(targetCats.map((c) => [c.slug, c.id]));

  // ── 1) Tillvalsgrupper: upserta varje DISTINKT källgrupp till målet ─────────
  // Matcha på namn inom målrestaurangen; återanvänd om den finns, annars skapa
  // med sina extras. Sparar mappning källgrupp-id → mål-grupp-id för länkning.
  const sourceGroupMap = new Map<string, { name: string; extras: any[]; cfg: any }>();
  for (const cat of sourceCats) {
    for (const prod of cat.products) {
      for (const peg of prod.extraGroups) {
        const g = peg.extraGroup;
        if (!sourceGroupMap.has(g.id)) {
          sourceGroupMap.set(g.id, {
            name: g.name,
            extras: g.extras.map((e: any) => ({ name: e.name, priceAddon: e.priceAddon, isDefault: e.isDefault, position: e.position })),
            cfg: { type: g.type, required: g.required, minSelections: g.minSelections, maxSelections: g.maxSelections, description: g.description, position: g.position },
          });
        }
      }
    }
  }
  const targetGroupIdBySourceId = new Map<string, string>();
  for (const [sourceGid, g] of sourceGroupMap) {
    const existingId = groupIdByName.get(norm(g.name));
    if (existingId) {
      summary.groupsReused++;
      targetGroupIdBySourceId.set(sourceGid, existingId);
      continue;
    }
    summary.groupsCreated++;
    if (!apply) {
      targetGroupIdBySourceId.set(sourceGid, `(ny:${sourceGid})`);
      continue;
    }
    const created = await prisma.extraGroup.create({
      data: {
        restaurantId: targetRestaurantId, name: g.name, ...g.cfg,
        extras: { create: g.extras },
      },
      select: { id: true },
    });
    groupIdByName.set(norm(g.name), created.id);
    targetGroupIdBySourceId.set(sourceGid, created.id);
  }

  // ── 2) Kategorier + produkter (idempotent på scopad slug) ───────────────────
  for (const [ci, cat] of sourceCats.entries()) {
    const catSlug = `${slugify(cat.name)}-${slugify(targetSlug)}`;
    let catId = catIdBySlug.get(catSlug);
    const catExists = Boolean(catId);
    if (catExists) summary.categoriesUpdated++; else summary.categoriesCreated++;

    if (apply) {
      if (catExists) {
        await prisma.category.update({ where: { id: catId! }, data: { name: cat.name, description: cat.description, position: ci, imageUrl: cat.imageUrl } });
      } else {
        const created = await prisma.category.create({
          data: { restaurantId: targetRestaurantId, name: cat.name, slug: catSlug, description: cat.description, position: ci, imageUrl: cat.imageUrl, isActive: true },
          select: { id: true },
        });
        catId = created.id;
        catIdBySlug.set(catSlug, catId);
      }
    }

    // Målets produkter i denna kategori (slug → id) för upsert + bevara isActive.
    // Hämtas så fort kategorin FINNS (även i dry-run) så created/updated räknas
    // rätt — annars trodde dry-run att allt var nytt.
    const existingProds = catId
      ? await prisma.product.findMany({ where: { categoryId: catId }, select: { id: true, slug: true, localPriceLocked: true } })
      : [];
    const prodBySlug = new Map(existingProds.map((p) => [p.slug, p]));

    for (const [pi, prod] of cat.products.entries()) {
      const prodSlug = `${slugify(prod.name)}-${slugify(targetSlug)}`;
      const existing = prodBySlug.get(prodSlug);
      const existingPid = existing?.id;
      const prodExists = Boolean(existingPid);
      if (prodExists) summary.productsUpdated++; else summary.productsCreated++;

      const linkGroupIds = prod.extraGroups
        .map((peg: any) => targetGroupIdBySourceId.get(peg.extraGroup.id))
        .filter((id): id is string => Boolean(id) && !id!.startsWith('(ny:'));
      summary.links += prod.extraGroups.length;

      if (!apply || !catId) continue;

      // Master är sanning för namn/beskrivning/flaggor. LOKALA undantag bevaras:
      //  • isActive (slutsålt) — skickas ALDRIG i update.
      //  • price — skippas om platsen låst sitt lokala pris (localPriceLocked).
      const dataCommon: any = {
        name: prod.name, description: prod.description,
        isVegan: prod.isVegan, isVegetarian: prod.isVegetarian, isGlutenFree: prod.isGlutenFree,
        displayMode: prod.displayMode, hideDescription: prod.hideDescription, position: pi,
      };
      // Lås på en BEFINTLIG produkt → behåll lokalt pris. Nya produkter ärver alltid masterns pris.
      if (!(prodExists && existing?.localPriceLocked)) dataCommon.price = prod.price;
      if (prodExists && existing?.localPriceLocked) summary.priceLocked++;
      if (prodExists) {
        await prisma.product.update({ where: { id: existingPid! }, data: dataCommon });
        await prisma.productExtraGroup.deleteMany({ where: { productId: existingPid! } });
        if (linkGroupIds.length) {
          await prisma.productExtraGroup.createMany({
            data: linkGroupIds.map((extraGroupId, i) => ({ productId: existingPid!, extraGroupId, position: i })),
            skipDuplicates: true,
          });
        }
      } else {
        await prisma.product.create({
          data: {
            ...dataCommon, categoryId: catId, slug: prodSlug, isActive: true,
            ...(linkGroupIds.length ? { extraGroups: { create: linkGroupIds.map((extraGroupId, i) => ({ extraGroupId, position: i })) } } : {}),
          },
        });
      }
    }
  }

  return { ok: true, dryRun: !apply, targetRestaurantId, summary, warnings };
}
