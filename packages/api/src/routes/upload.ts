import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import { r2Enabled, buildR2Key, uploadToR2, toWebp, listR2, existsInR2, slugifyPathSegment, r2KeyToPublicUrl } from '../lib/r2';
import prisma from '../lib/prisma';
import axios from 'axios';

const router = Router();
router.use(authenticate);

const hasCloudinaryConfig = Boolean(
  process.env.CLOUDINARY_URL ||
    (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET)
);

// Configure Cloudinary
// It will automatically pick up the CLOUDINARY_URL environment variable if set.
// Otherwise, we can pass the keys directly.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // extract extension, and let cloudinary handle the rest (like format mapping)
    return {
      folder: 'matgo_uploads',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      public_id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // increased to 5MB for high res heroes
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Endast bilder tillåts'));
      return;
    }
    cb(null, true);
  },
});

// POST /api/admin/upload - Upload a single image (Cloudinary, legacy)
router.post('/', (req: Request, res: Response, next) => {
  if (!hasCloudinaryConfig) {
    res.status(503).json({ error: 'Bilduppladdning är inte konfigurerad på servern' });
    return;
  }
  next();
}, upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'Ingen fil uppladdad' });
    return;
  }

  // With CloudinaryStorage, req.file.path contains the uploaded Cloudinary URL
  const url = req.file.path;
  const filename = req.file.filename;

  res.json({ url, filename });
});

// =====================
// R2 (Cloudflare) — primär ersättare för Cloudinary
// Memory-storage så vi får tag på rå buffer och kan konvertera till WebP
// innan upload till R2. Inget mellanlagrar på disk.
// =====================
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB raw — komprimeras ned till ~250 KB WebP
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('Endast bilder tillåts'));
      return;
    }
    cb(null, true);
  },
});

/**
 * POST /api/admin/upload-r2
 *
 * Multipart body:
 *   file: (binary)            obligatorisk
 *   kind: 'hero'|'logo'|'main-category'|'product'|'misc'
 *   restaurantId?: string     krävs för allt utom misc
 *   categoryId?: string       krävs för 'main-category' och 'product'
 *   productId?: string        krävs för 'product'
 *   filename?: string         endast för 'misc' (annars derived)
 *
 * Returnerar: { key, url, contentType }
 *
 * Konverterar alltid till WebP, max 1200px bred, kvalitet 82.
 */
router.post('/upload-r2', memoryUpload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!r2Enabled) {
      res.status(503).json({ error: 'R2 är inte konfigurerat på servern — sätt R2_* env vars' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'Ingen fil uppladdad' });
      return;
    }
    const kind = String(req.body.kind || 'misc') as 'hero' | 'logo' | 'main-category' | 'product' | 'misc';
    const restaurantId = req.body.restaurantId ? String(req.body.restaurantId) : null;
    const categoryId = req.body.categoryId ? String(req.body.categoryId) : null;
    const productId = req.body.productId ? String(req.body.productId) : null;

    // Resolva slugs från DB så path:en blir kanonisk även om admin skriver
    // "ÅngermanlandsKött & Kebab"
    let citySlug: string | null = null;
    let restaurantSlug: string | null = null;
    let categorySlug: string | null = null;
    let productSlug: string | null = null;

    if (restaurantId) {
      // city_relation = riktiga FK till City-tabellen. `city` är legacy-strängfält
      // som finns kvar för restauranger som aldrig kopplats till en City-rad.
      const rest = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { slug: true, city: true, city_relation: { select: { slug: true, name: true } } },
      });
      if (rest) {
        restaurantSlug = rest.slug;
        citySlug = rest.city_relation?.slug || slugifyPathSegment(rest.city_relation?.name || rest.city || 'global');
      }
    }
    if (categoryId) {
      const cat = await prisma.category.findUnique({ where: { id: categoryId }, select: { slug: true, name: true } });
      if (cat) categorySlug = cat.slug || slugifyPathSegment(cat.name);
    }
    if (productId) {
      const prod = await prisma.product.findUnique({ where: { id: productId }, select: { slug: true, name: true } });
      if (prod) productSlug = prod.slug || slugifyPathSegment(prod.name);
    }

    // Validera att vi har det vi behöver för den valda typen
    if (kind !== 'misc' && !citySlug) { res.status(400).json({ error: 'Saknar stad för denna restaurang' }); return; }
    if (kind !== 'misc' && !restaurantSlug) { res.status(400).json({ error: 'Saknar restaurang-slug' }); return; }
    if ((kind === 'main-category' || kind === 'product') && !categorySlug) { res.status(400).json({ error: 'Saknar kategori-slug' }); return; }
    if (kind === 'product' && !productSlug) { res.status(400).json({ error: 'Saknar produkt-slug' }); return; }

    // Konvertera till WebP
    const webp = await toWebp(req.file.buffer);

    // Bygg kanonisk nyckel
    let key: string;
    if (kind === 'misc') {
      const fn = String(req.body.filename || req.file.originalname || `upload-${Date.now()}.webp`);
      key = buildR2Key({ kind: 'misc', city: citySlug || undefined, restaurant: restaurantSlug || undefined, filename: fn });
    } else if (kind === 'hero') {
      key = buildR2Key({ kind: 'hero', city: citySlug!, restaurant: restaurantSlug! });
    } else if (kind === 'logo') {
      key = buildR2Key({ kind: 'logo', city: citySlug!, restaurant: restaurantSlug! });
    } else if (kind === 'main-category') {
      key = buildR2Key({ kind: 'main-category', city: citySlug!, restaurant: restaurantSlug!, category: categorySlug! });
    } else {
      key = buildR2Key({ kind: 'product', city: citySlug!, restaurant: restaurantSlug!, category: categorySlug!, product: productSlug! });
    }

    const { url } = await uploadToR2(key, webp, 'image/webp');
    res.json({ key, url, contentType: 'image/webp', sizeBytes: webp.length });
  } catch (error: any) {
    console.error('R2 upload error:', error);
    res.status(500).json({ error: error?.message || 'R2-upload misslyckades' });
  }
});

/**
 * GET /api/admin/images/list?prefix=lund/palmyra-pizzeria/
 * Listar object i R2-bucketen. Använt av image-picker i admin.
 */
router.get('/images/list', async (req: Request, res: Response) => {
  try {
    if (!r2Enabled) { res.status(503).json({ error: 'R2 är inte konfigurerat' }); return; }
    const prefix = String(req.query.prefix || '');
    const items = await listR2(prefix, 1000);
    res.json(items.map((it) => ({ ...it, url: r2KeyToPublicUrl(it.key) })));
  } catch (error: any) {
    console.error('R2 list error:', error);
    res.status(500).json({ error: 'Kunde inte lista bilder' });
  }
});

/**
 * GET /api/admin/images/exists?key=lund/palmy/menu/pizzor/vesuvio.webp
 * Snabb-check för admin-UI så vi kan visa ✓/✗ per produkt.
 */
router.get('/images/exists', async (req: Request, res: Response) => {
  try {
    if (!r2Enabled) { res.json({ exists: false, configured: false }); return; }
    const key = String(req.query.key || '');
    if (!key) { res.status(400).json({ error: 'Saknar ?key=' }); return; }
    const exists = await existsInR2(key);
    res.json({ exists, configured: true, url: exists ? r2KeyToPublicUrl(key) : null });
  } catch {
    res.status(500).json({ error: 'Check misslyckades' });
  }
});

/**
 * POST /api/admin/images/auto-match
 * Body: { restaurantId: string, dryRun?: boolean }
 *
 * Scannar R2-bucketen för en given restaurang och försöker matcha varje
 * bild till en produkt/kategori/main-category via slug. Uppdaterar
 * imageUrl-fältet om matchen är säker.
 *
 * Returnerar en summering: { matched: N, skipped: N, examples: [...] }
 */
router.post('/images/auto-match', async (req: Request, res: Response) => {
  try {
    if (!r2Enabled) { res.status(503).json({ error: 'R2 är inte konfigurerat' }); return; }
    const restaurantId = String(req.body.restaurantId || '');
    const dryRun = Boolean(req.body.dryRun);
    if (!restaurantId) { res.status(400).json({ error: 'Saknar restaurantId' }); return; }

    const rest = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { slug: true, city: true, city_relation: { select: { slug: true, name: true } } },
    });
    if (!rest) { res.status(404).json({ error: 'Restaurang hittades inte' }); return; }
    const citySlug = rest.city_relation?.slug || slugifyPathSegment(rest.city_relation?.name || rest.city || 'global');
    const prefix = `${citySlug}/${rest.slug}/`;
    const items = await listR2(prefix, 5000);
    const keyByKey = new Map(items.map((it) => [it.key, it]));

    let matchedHero = false;
    let matchedLogo = false;
    let matchedMain = 0;
    let matchedProducts = 0;
    const updates: Array<{ kind: string; id: string; url: string; key: string }> = [];

    // hero / logo
    const heroKey = `${prefix}hero.webp`;
    const logoKey = `${prefix}logo.webp`;
    if (keyByKey.has(heroKey)) {
      matchedHero = true;
      updates.push({ kind: 'hero', id: restaurantId, url: r2KeyToPublicUrl(heroKey), key: heroKey });
      if (!dryRun) await prisma.restaurant.update({ where: { id: restaurantId }, data: { imageUrl: r2KeyToPublicUrl(heroKey) } });
    }
    if (keyByKey.has(logoKey)) {
      matchedLogo = true;
      // restaurant has no logoUrl by default — om schema saknar fältet, hoppa
      // (admin kan sätta hero också). Vi behåller bara updates-loggen.
      updates.push({ kind: 'logo', id: restaurantId, url: r2KeyToPublicUrl(logoKey), key: logoKey });
    }

    // main-categories
    const mainCats = await prisma.mainCategory.findMany({ where: { restaurantId } });
    for (const mc of mainCats) {
      const slug = slugifyPathSegment(mc.name);
      const key = `${prefix}main/${slug}.webp`;
      if (keyByKey.has(key)) {
        matchedMain++;
        updates.push({ kind: 'main-category', id: mc.id, url: r2KeyToPublicUrl(key), key });
        if (!dryRun) await prisma.mainCategory.update({ where: { id: mc.id }, data: { imageUrl: r2KeyToPublicUrl(key) } });
      }
    }

    // products via kategori
    const products = await prisma.product.findMany({
      where: { category: { restaurantId } },
      select: { id: true, slug: true, name: true, category: { select: { slug: true, name: true } } },
    });
    for (const p of products) {
      const catSlug = p.category.slug || slugifyPathSegment(p.category.name);
      const prodSlug = p.slug || slugifyPathSegment(p.name);
      const key = `${prefix}menu/${catSlug}/${prodSlug}.webp`;
      if (keyByKey.has(key)) {
        matchedProducts++;
        updates.push({ kind: 'product', id: p.id, url: r2KeyToPublicUrl(key), key });
        if (!dryRun) await prisma.product.update({ where: { id: p.id }, data: { imageUrl: r2KeyToPublicUrl(key) } });
      }
    }

    res.json({
      restaurant: rest.slug,
      city: citySlug,
      prefix,
      totalObjectsInPrefix: items.length,
      matched: { hero: matchedHero, logo: matchedLogo, mainCategories: matchedMain, products: matchedProducts },
      updates: updates.slice(0, 10), // sample
      dryRun,
    });
  } catch (error: any) {
    console.error('Auto-match error:', error);
    res.status(500).json({ error: error?.message || 'Auto-match misslyckades' });
  }
});

export default router;
