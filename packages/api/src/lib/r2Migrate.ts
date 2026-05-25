/**
 * Återanvändbar migrationslogik som kan triggas både från CLI-scriptet
 * och från admin-endpoint. Tar inga argv-läsningar — anropparen styr.
 */
import axios from 'axios';
import prisma from './prisma';
import { r2Enabled, r2PublicBase, uploadToR2, toWebp, buildR2Key, slugifyPathSegment } from './r2';

export type MigrateOptions = {
  apply: boolean;
  only?: 'restaurants' | 'main-categories' | 'categories' | 'products';
  restaurantSlug?: string;
  /** Stoppa när detta antal bilder migrerats. För säkerhet i admin-UI. */
  maxItems?: number;
};

export type MigrateResult = {
  scanned: number;
  alreadyR2: number;
  migrated: number;
  failed: number;
  skippedNoUrl: number;
  failedExamples: Array<{ label: string; url: string; error: string }>;
  migratedExamples: Array<{ label: string; from: string; to: string }>;
  dryRun: boolean;
  configured: boolean;
};

async function downloadAsBuffer(url: string): Promise<{ buf: Buffer | null; error?: string }> {
  try {
    const res = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 30_000,
      maxContentLength: 50 * 1024 * 1024,
    });
    return { buf: Buffer.from(res.data) };
  } catch (e: any) {
    return { buf: null, error: e?.message || String(e) };
  }
}

type ItemHandler = (newUrl: string) => Promise<void>;

export async function runR2Migration(opts: MigrateOptions): Promise<MigrateResult> {
  const result: MigrateResult = {
    scanned: 0,
    alreadyR2: 0,
    migrated: 0,
    failed: 0,
    skippedNoUrl: 0,
    failedExamples: [],
    migratedExamples: [],
    dryRun: !opts.apply,
    configured: r2Enabled(),
  };

  if (!r2Enabled()) return result;
  const basePublicUrl = r2PublicBase();

  const migrateOne = async (args: { label: string; currentUrl: string; targetKey: string; apply: ItemHandler }) => {
    result.scanned++;
    if (!args.currentUrl) { result.skippedNoUrl++; return; }
    if (basePublicUrl && args.currentUrl.startsWith(basePublicUrl)) { result.alreadyR2++; return; }
    if (opts.maxItems && result.migrated >= opts.maxItems) return;
    if (!opts.apply) {
      result.migrated++;
      if (result.migratedExamples.length < 20) {
        result.migratedExamples.push({ label: args.label, from: args.currentUrl, to: args.targetKey });
      }
      return;
    }
    const { buf, error } = await downloadAsBuffer(args.currentUrl);
    if (!buf) {
      result.failed++;
      if (result.failedExamples.length < 20) result.failedExamples.push({ label: args.label, url: args.currentUrl, error: error || 'okänt' });
      return;
    }
    try {
      const webp = await toWebp(buf);
      const { url } = await uploadToR2(args.targetKey, webp, 'image/webp');
      await args.apply(url);
      result.migrated++;
      if (result.migratedExamples.length < 20) {
        result.migratedExamples.push({ label: args.label, from: args.currentUrl, to: url });
      }
    } catch (e: any) {
      result.failed++;
      if (result.failedExamples.length < 20) result.failedExamples.push({ label: args.label, url: args.currentUrl, error: e?.message || String(e) });
    }
  };

  const want = (k: NonNullable<MigrateOptions['only']>) => !opts.only || opts.only === k;
  const slugFilter = opts.restaurantSlug ? { slug: opts.restaurantSlug } : {};

  if (want('restaurants')) {
    const restaurants = await prisma.restaurant.findMany({
      where: slugFilter,
      select: { id: true, slug: true, city: true, imageUrl: true, heroImageUrl: true, city_relation: { select: { slug: true, name: true } } },
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

  if (want('main-categories')) {
    const mcs = await prisma.mainCategory.findMany({
      where: opts.restaurantSlug ? { restaurant: slugFilter } : {},
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

  if (want('categories')) {
    const cats = await prisma.category.findMany({
      where: opts.restaurantSlug ? { restaurant: slugFilter } : {},
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

  if (want('products')) {
    const products = await prisma.product.findMany({
      where: opts.restaurantSlug ? { category: { restaurant: slugFilter } } : {},
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

  return result;
}
