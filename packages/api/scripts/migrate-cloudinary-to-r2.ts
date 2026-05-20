/**
 * Migrera alla bilder från Cloudinary (eller andra URL:er) till Cloudflare R2.
 *
 * Vad scriptet gör per rad i DB:
 *   1. Läser alla rader med imageUrl/heroImageUrl
 *   2. För varje URL: laddar ner bytes, konverterar till WebP (1200px, q82)
 *   3. Bygger kanonisk R2-path baserat på city/restaurant/category/product-slug
 *   4. Pushar till R2
 *   5. Uppdaterar DB med ny R2-URL
 *
 * Säkerhet:
 *   - DRY-RUN är default. Kör med --apply för att faktiskt skriva till DB.
 *   - Behåller original-URL:en i en `imageUrlBackup`-kolumn? NEJ — skulle kräva
 *     schema-ändring. Istället loggar vi gamla URL:en till stdout så du kan
 *     spara loggen och rolla tillbaka manuellt vid behov.
 *   - Hoppar över rader vars imageUrl redan pekar på R2_PUBLIC_BASE_URL.
 *
 * Användning:
 *   pnpm tsx scripts/migrate-cloudinary-to-r2.ts              # dry-run
 *   pnpm tsx scripts/migrate-cloudinary-to-r2.ts --apply      # på riktigt
 *   pnpm tsx scripts/migrate-cloudinary-to-r2.ts --apply --only=products
 *   pnpm tsx scripts/migrate-cloudinary-to-r2.ts --apply --restaurant=palmyra-pizzeria
 */
import 'dotenv/config';
import axios from 'axios';
import prisma from '../src/lib/prisma';
import { r2Enabled, r2PublicBase, uploadToR2, toWebp, buildR2Key, slugifyPathSegment } from '../src/lib/r2';

const APPLY = process.argv.includes('--apply');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').replace('--only=', '');
const RESTAURANT_FILTER = (process.argv.find((a) => a.startsWith('--restaurant=')) || '').replace('--restaurant=', '');

const stats = {
  scanned: 0,
  alreadyR2: 0,
  migrated: 0,
  failed: 0,
  skippedNoUrl: 0,
};

const log = (s: string) => process.stdout.write(s + '\n');
const warn = (s: string) => process.stderr.write('⚠️  ' + s + '\n');

async function downloadAsBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 30_000,
      maxContentLength: 50 * 1024 * 1024,
    });
    return Buffer.from(res.data);
  } catch (e: any) {
    warn(`Download misslyckades för ${url}: ${e?.message || e}`);
    return null;
  }
}

async function migrateOne(args: {
  label: string;          // för logg
  currentUrl: string;
  targetKey: string;      // R2-nyckel
  apply: (newUrl: string) => Promise<void>;
}): Promise<void> {
  stats.scanned++;
  if (!args.currentUrl) { stats.skippedNoUrl++; return; }
  if (args.currentUrl.startsWith(r2PublicBase)) {
    stats.alreadyR2++;
    return;
  }
  log(`[${stats.scanned}] ${args.label}`);
  log(`    from: ${args.currentUrl}`);
  log(`    to:   ${args.targetKey}`);

  if (!APPLY) {
    log('    (dry-run) → ingen ändring');
    stats.migrated++;
    return;
  }

  const buf = await downloadAsBuffer(args.currentUrl);
  if (!buf) { stats.failed++; return; }
  try {
    const webp = await toWebp(buf);
    const { url } = await uploadToR2(args.targetKey, webp, 'image/webp');
    await args.apply(url);
    log(`    ✓ uppladdad (${(webp.length / 1024).toFixed(0)} KB) → DB uppdaterad`);
    stats.migrated++;
  } catch (e: any) {
    warn(`Migration misslyckades: ${e?.message || e}`);
    stats.failed++;
  }
}

async function migrateRestaurants() {
  const restaurants = await prisma.restaurant.findMany({
    where: RESTAURANT_FILTER ? { slug: RESTAURANT_FILTER } : {},
    select: {
      id: true,
      slug: true,
      city: true,
      imageUrl: true,
      heroImageUrl: true,
      city_relation: { select: { slug: true, name: true } },
    },
  });
  for (const r of restaurants) {
    const citySlug = r.city_relation?.slug || slugifyPathSegment(r.city_relation?.name || r.city || 'global');
    if (r.imageUrl) {
      const key = buildR2Key({ kind: 'logo', city: citySlug, restaurant: r.slug });
      await migrateOne({
        label: `Restaurant.imageUrl • ${r.slug}`,
        currentUrl: r.imageUrl,
        targetKey: key,
        apply: async (url) => { await prisma.restaurant.update({ where: { id: r.id }, data: { imageUrl: url } }); },
      });
    }
    if (r.heroImageUrl) {
      const key = buildR2Key({ kind: 'hero', city: citySlug, restaurant: r.slug });
      await migrateOne({
        label: `Restaurant.heroImageUrl • ${r.slug}`,
        currentUrl: r.heroImageUrl,
        targetKey: key,
        apply: async (url) => { await prisma.restaurant.update({ where: { id: r.id }, data: { heroImageUrl: url } }); },
      });
    }
  }
}

async function migrateMainCategories() {
  const mcs = await prisma.mainCategory.findMany({
    where: RESTAURANT_FILTER ? { restaurant: { slug: RESTAURANT_FILTER } } : {},
    select: {
      id: true,
      name: true,
      imageUrl: true,
      restaurant: { select: { slug: true, city: true, city_relation: { select: { slug: true, name: true } } } },
    },
  });
  for (const mc of mcs) {
    if (!mc.imageUrl || !mc.restaurant) continue;
    const citySlug = mc.restaurant.city_relation?.slug || slugifyPathSegment(mc.restaurant.city_relation?.name || mc.restaurant.city || 'global');
    const key = buildR2Key({
      kind: 'main-category',
      city: citySlug,
      restaurant: mc.restaurant.slug,
      category: slugifyPathSegment(mc.name),
    });
    await migrateOne({
      label: `MainCategory • ${mc.restaurant.slug} / ${mc.name}`,
      currentUrl: mc.imageUrl,
      targetKey: key,
      apply: async (url) => { await prisma.mainCategory.update({ where: { id: mc.id }, data: { imageUrl: url } }); },
    });
  }
}

async function migrateCategories() {
  const cats = await prisma.category.findMany({
    where: RESTAURANT_FILTER ? { restaurant: { slug: RESTAURANT_FILTER } } : {},
    select: {
      id: true,
      name: true,
      slug: true,
      imageUrl: true,
      restaurant: { select: { slug: true, city: true, city_relation: { select: { slug: true, name: true } } } },
    },
  });
  for (const c of cats) {
    if (!c.imageUrl || !c.restaurant) continue;
    const citySlug = c.restaurant.city_relation?.slug || slugifyPathSegment(c.restaurant.city_relation?.name || c.restaurant.city || 'global');
    // Kategori-bilder hamnar under main/ — om en kategori inte är knuten till
    // en main-category använder vi kategori-slug direkt.
    const key = buildR2Key({
      kind: 'main-category',
      city: citySlug,
      restaurant: c.restaurant.slug,
      category: c.slug || slugifyPathSegment(c.name),
    });
    await migrateOne({
      label: `Category • ${c.restaurant.slug} / ${c.name}`,
      currentUrl: c.imageUrl,
      targetKey: key,
      apply: async (url) => { await prisma.category.update({ where: { id: c.id }, data: { imageUrl: url } }); },
    });
  }
}

async function migrateProducts() {
  const products = await prisma.product.findMany({
    where: RESTAURANT_FILTER ? { category: { restaurant: { slug: RESTAURANT_FILTER } } } : {},
    select: {
      id: true,
      name: true,
      slug: true,
      imageUrl: true,
      category: {
        select: {
          slug: true,
          name: true,
          restaurant: { select: { slug: true, city: true, city_relation: { select: { slug: true, name: true } } } },
        },
      },
    },
  });
  for (const p of products) {
    if (!p.imageUrl || !p.category?.restaurant) continue;
    const citySlug = p.category.restaurant.city_relation?.slug || slugifyPathSegment(p.category.restaurant.city_relation?.name || p.category.restaurant.city || 'global');
    const key = buildR2Key({
      kind: 'product',
      city: citySlug,
      restaurant: p.category.restaurant.slug,
      category: p.category.slug || slugifyPathSegment(p.category.name),
      product: p.slug || slugifyPathSegment(p.name),
    });
    await migrateOne({
      label: `Product • ${p.category.restaurant.slug} / ${p.category.name} / ${p.name}`,
      currentUrl: p.imageUrl,
      targetKey: key,
      apply: async (url) => { await prisma.product.update({ where: { id: p.id }, data: { imageUrl: url } }); },
    });
  }
}

async function main() {
  log('================================================================');
  log(`R2 migration ${APPLY ? '(LIVE)' : '(DRY-RUN)'}`);
  log(`Bucket public base: ${r2PublicBase || '(ej satt)'}`);
  if (ONLY) log(`Endast: ${ONLY}`);
  if (RESTAURANT_FILTER) log(`Restaurang-filter: ${RESTAURANT_FILTER}`);
  log('================================================================');

  if (!r2Enabled) {
    warn('R2 är inte konfigurerat. Sätt env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL');
    process.exit(1);
  }

  const want = (k: string) => !ONLY || ONLY === k;
  if (want('restaurants')) await migrateRestaurants();
  if (want('main-categories')) await migrateMainCategories();
  if (want('categories')) await migrateCategories();
  if (want('products')) await migrateProducts();

  log('');
  log('================================================================');
  log(`Skannade ${stats.scanned}`);
  log(`Migrerade ${stats.migrated}`);
  log(`Redan i R2 ${stats.alreadyR2}`);
  log(`Misslyckade ${stats.failed}`);
  log(`Hoppade (tom URL) ${stats.skippedNoUrl}`);
  log('================================================================');
  if (!APPLY) log('Detta var en DRY-RUN. Inget ändrades. Kör med --apply för riktig migration.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
