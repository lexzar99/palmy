/**
 * Engångs-migration: lägg tillbaka `https://` på scheme-lösa bild-URL:er.
 *
 * Bakgrund: när R2_PUBLIC_BASE_URL en period var satt UTAN schema (t.ex.
 * "images.viaeats.se" i stället för "https://images.viaeats.se") fick varje
 * uppladdning en scheme-lös URL som "images.viaeats.se/lund/.../hero.webp".
 * Browsern tolkar det som en RELATIV path → trasig bild överallt. Koden är
 * härdad framåt (loadConfig tvingar https), men redan sparade värden i DB
 * måste lagas — det gör detta skript.
 *
 * Säkert och konservativt: rör BARA värden som ser ut som "host/path" (en
 * domän följt av en slash) och saknar schema. Relativa statiska assets
 * ("/menu/categories/x.svg"), data:-URI:er och redan schema-satta URL:er
 * lämnas orörda.
 *
 * Körning (dry-run default — visar vad som skulle ändras):
 *   DATABASE_URL=... ts-node --transpile-only scripts/fix-schemeless-image-urls.ts
 * Skarpt:
 *   DATABASE_URL=... ts-node --transpile-only scripts/fix-schemeless-image-urls.ts --apply
 */
import 'dotenv/config';
import prisma from '../src/lib/prisma';

const APPLY = process.argv.includes('--apply');

// "host/path" utan schema: minst en punkt i värdnamnet + en slash efteråt.
// Undviker relativa paths (/…), data:-URI:er och redan schema-satta URL:er.
const SCHEMELESS_HOST = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?::\d+)?\//i;

function needsScheme(url: string | null | undefined): url is string {
  if (!url) return false;
  if (/^https?:\/\//i.test(url)) return false; // redan ok
  if (url.startsWith('/')) return false;        // relativ static asset
  if (/^data:/i.test(url)) return false;        // inline data-URI
  return SCHEMELESS_HOST.test(url);
}

const fix = (url: string) => `https://${url}`;

type FieldSpec = {
  model: string;
  field: string;
  // findMany som returnerar {id, [field]}
  find: () => Promise<Array<{ id: string } & Record<string, any>>>;
  update: (id: string, value: string) => Promise<unknown>;
};

// Alla kolumner som lagrar bild-URL:er (se prisma/schema.prisma).
const specs: FieldSpec[] = [
  {
    model: 'Restaurant', field: 'imageUrl',
    find: () => prisma.restaurant.findMany({ select: { id: true, imageUrl: true } }) as any,
    update: (id, v) => prisma.restaurant.update({ where: { id }, data: { imageUrl: v } }),
  },
  {
    model: 'Restaurant', field: 'heroImageUrl',
    find: () => prisma.restaurant.findMany({ select: { id: true, heroImageUrl: true } }) as any,
    update: (id, v) => prisma.restaurant.update({ where: { id }, data: { heroImageUrl: v } }),
  },
  {
    model: 'Restaurant', field: 'offersImageUrl',
    find: () => prisma.restaurant.findMany({ select: { id: true, offersImageUrl: true } }) as any,
    update: (id, v) => prisma.restaurant.update({ where: { id }, data: { offersImageUrl: v } }),
  },
  {
    model: 'Category', field: 'imageUrl',
    find: () => prisma.category.findMany({ select: { id: true, imageUrl: true } }) as any,
    update: (id, v) => prisma.category.update({ where: { id }, data: { imageUrl: v } }),
  },
  {
    model: 'Product', field: 'imageUrl',
    find: () => prisma.product.findMany({ select: { id: true, imageUrl: true } }) as any,
    update: (id, v) => prisma.product.update({ where: { id }, data: { imageUrl: v } }),
  },
  {
    model: 'Product', field: 'discountImageUrl',
    find: () => prisma.product.findMany({ select: { id: true, discountImageUrl: true } }) as any,
    update: (id, v) => prisma.product.update({ where: { id }, data: { discountImageUrl: v } }),
  },
  {
    model: 'Extra', field: 'imageUrl',
    find: () => prisma.extra.findMany({ select: { id: true, imageUrl: true } }) as any,
    update: (id, v) => prisma.extra.update({ where: { id }, data: { imageUrl: v } }),
  },
  {
    model: 'Deal', field: 'imageUrl',
    find: () => prisma.deal.findMany({ select: { id: true, imageUrl: true } }) as any,
    update: (id, v) => prisma.deal.update({ where: { id }, data: { imageUrl: v } }),
  },
  {
    model: 'Brand', field: 'logoUrl',
    find: () => prisma.brand.findMany({ select: { id: true, logoUrl: true } }) as any,
    update: (id, v) => prisma.brand.update({ where: { id }, data: { logoUrl: v } }),
  },
  {
    model: 'Courier', field: 'profileImageUrl',
    find: () => prisma.courier.findMany({ select: { id: true, profileImageUrl: true } }) as any,
    update: (id, v) => prisma.courier.update({ where: { id }, data: { profileImageUrl: v } }),
  },
];

async function main() {
  console.log(`\n=== fix-schemeless-image-urls (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===\n`);
  let totalCandidates = 0;
  let totalUpdated = 0;

  for (const spec of specs) {
    const rows = await spec.find();
    const candidates = rows.filter((r) => needsScheme(r[spec.field]));
    if (candidates.length === 0) {
      console.log(`  ${spec.model}.${spec.field}: 0`);
      continue;
    }
    totalCandidates += candidates.length;
    console.log(`  ${spec.model}.${spec.field}: ${candidates.length} scheme-lösa`);
    for (const ex of candidates.slice(0, 3)) {
      console.log(`      ex: ${ex[spec.field]}  →  ${fix(ex[spec.field])}`);
    }
    if (APPLY) {
      for (const r of candidates) {
        await spec.update(r.id, fix(r[spec.field]));
        totalUpdated++;
      }
    }
  }

  console.log(`\n  Totalt scheme-lösa: ${totalCandidates}`);
  if (APPLY) console.log(`  Uppdaterade:        ${totalUpdated}`);
  else console.log(`  (dry-run — kör med --apply för att skriva)`);
  console.log('');
}

main()
  .catch((e) => { console.error('Migration misslyckades:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
