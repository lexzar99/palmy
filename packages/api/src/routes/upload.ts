import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authenticate, requireSuperAdmin, AuthRequest } from '../middleware/auth';
import { r2Enabled, buildR2Key, uploadToR2, toWebp, listR2, existsInR2, slugifyPathSegment, r2KeyToPublicUrl, r2KeyToVersionedUrl } from '../lib/r2';
import { runR2Migration, type MigrateOptions } from '../lib/r2Migrate';
import prisma from '../lib/prisma';
import { menuCacheBust } from './menu';
import axios from 'axios';

const router = Router();
router.use(authenticate);

// GLOBAL_VIEWER ("Falken") är read-only i hela systemet — uppladdning är en
// skriv-operation. MENU_AGENT ("Kocken"/"Studion") behöver den för menybilder.
router.use((req: Request, res: Response, next) => {
  if ((req as AuthRequest).admin?.role === 'GLOBAL_VIEWER') {
    res.status(403).json({ error: 'Read-only-konto kan inte ladda upp filer' });
    return;
  }
  next();
});

// Skydd mot att en RESTAURANT_ADMIN/STAFF för restaurang A laddar upp bilder
// under restaurang B:s prefix (menu-hijacking). SUPER_ADMIN passerar alltid.
// Returnerar true om OK, skickar 403 och returnerar false om scope inte matchar.
const assertRestaurantScope = (
  req: Request,
  restaurantId: string | null,
  res: Response,
): boolean => {
  if (!restaurantId) return true; // misc-uploads utan restaurang-koppling
  const adminReq = req as AuthRequest;
  const role = adminReq.admin?.role;
  if (role === 'SUPER_ADMIN') return true;
  // MENU_AGENT laddar upp menybilder för utkast-restauranger (draft-låset
  // ligger i admin-modulens menuAgentDraftGate när bilden sen kopplas).
  if (role === 'MENU_AGENT') return true;
  if (adminReq.admin?.restaurantId === restaurantId) return true;
  res
    .status(403)
    .json({ error: 'Du får bara hantera bilder för din egen restaurang' });
  return false;
};

// =====================
// R2 (Cloudflare) — enda bilduppladdaren. Cloudinary är borttaget.
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
    if (!r2Enabled()) {
      res.status(503).json({ error: 'R2 är inte konfigurerat på servern — sätt R2_* env vars' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'Ingen fil uppladdad' });
      return;
    }
    const kind = String(req.body.kind || 'misc') as 'hero' | 'logo' | 'category' | 'product' | 'extra' | 'misc';
    const restaurantId = req.body.restaurantId ? String(req.body.restaurantId) : null;
    const categoryId = req.body.categoryId ? String(req.body.categoryId) : null;
    const productId = req.body.productId ? String(req.body.productId) : null;

    if (!assertRestaurantScope(req, restaurantId, res)) return;

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
      // categoryId pekar alltid på en Category-rad (har slug).
      const cat = await prisma.category.findUnique({ where: { id: categoryId }, select: { slug: true, name: true } });
      if (cat) categorySlug = cat.slug || slugifyPathSegment(cat.name);
    }
    if (productId) {
      const prod = await prisma.product.findUnique({ where: { id: productId }, select: { slug: true, name: true } });
      if (prod) productSlug = prod.slug || slugifyPathSegment(prod.name);
    }
    // Ny produkt (inget id än): bygg path:en på det inskrivna NAMNET (fileBaseName)
    // så att en bild kan laddas upp REDAN när produkten skapas, innan den sparats.
    // Kategorin kommer via categoryId/categorySlug som vanligt.
    if (!productSlug && kind === 'product' && req.body.fileBaseName) {
      productSlug = slugifyPathSegment(String(req.body.fileBaseName));
    }
    // Virtuella kategorier utan DB-rad (t.ex. "Erbjudanden"-tilen) skickar en
    // explicit categorySlug i stället för categoryId → path:en byggs på den.
    if (!categorySlug && req.body.categorySlug) {
      categorySlug = slugifyPathSegment(String(req.body.categorySlug));
    }

    // Validera att vi har det vi behöver för den valda typen
    if (kind !== 'misc' && !citySlug) { res.status(400).json({ error: 'Saknar stad för denna restaurang' }); return; }
    if (kind !== 'misc' && !restaurantSlug) { res.status(400).json({ error: 'Saknar restaurang-slug' }); return; }
    if ((kind === 'category' || kind === 'product') && !categorySlug) { res.status(400).json({ error: 'Saknar kategori-slug' }); return; }
    if (kind === 'product' && !productSlug) { res.status(400).json({ error: 'Saknar produkt-slug' }); return; }

    // Konvertera till WebP
    const webp = await toWebp(req.file.buffer);

    // Bygg kanonisk nyckel
    let key: string;
    if (kind === 'misc') {
      // Unik webp-nyckel så plattform-bilder (t.ex. sponsorkort) inte krockar
      // med varandra när de saknar restaurang/kategori-kontext.
      const base = String(req.body.filename || req.file.originalname || 'upload').replace(/\.[a-z0-9]+$/i, '');
      const fn = `${slugifyPathSegment(base) || 'upload'}-${Date.now()}.webp`;
      key = buildR2Key({ kind: 'misc', city: citySlug || undefined, restaurant: restaurantSlug || undefined, filename: fn });
    } else if (kind === 'hero') {
      key = buildR2Key({ kind: 'hero', city: citySlug!, restaurant: restaurantSlug! });
    } else if (kind === 'logo') {
      key = buildR2Key({ kind: 'logo', city: citySlug!, restaurant: restaurantSlug! });
    } else if (kind === 'category') {
      key = buildR2Key({ kind: 'category', city: citySlug!, restaurant: restaurantSlug!, category: categorySlug! });
    } else if (kind === 'extra') {
      // Per-option (Extra) bild: namnet kommer via fileBaseName (extra-namnet),
      // annars filens originalnamn. Kanonisk path → R2-matchning + template-import.
      const extraBase = String(req.body.fileBaseName || req.file.originalname || 'extra').replace(/\.[a-z0-9]+$/i, '');
      key = buildR2Key({ kind: 'extra', city: citySlug!, restaurant: restaurantSlug!, name: slugifyPathSegment(extraBase) || 'extra' });
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
    if (!r2Enabled()) { res.status(503).json({ error: 'R2 är inte konfigurerat' }); return; }
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
    if (!r2Enabled()) { res.json({ exists: false, configured: false }); return; }
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
    if (!r2Enabled()) { res.status(503).json({ error: 'R2 är inte konfigurerat' }); return; }
    const restaurantId = String(req.body.restaurantId || '');
    const dryRun = Boolean(req.body.dryRun);
    if (!restaurantId) { res.status(400).json({ error: 'Saknar restaurantId' }); return; }
    if (!assertRestaurantScope(req, restaurantId, res)) return;

    const rest = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        slug: true, city: true,
        imageUrl: true, heroImageUrl: true,
        city_relation: { select: { slug: true, name: true } },
      },
    });
    if (!rest) { res.status(404).json({ error: 'Restaurang hittades inte' }); return; }
    const citySlug = rest.city_relation?.slug || slugifyPathSegment(rest.city_relation?.name || rest.city || 'global');
    const prefix = `${citySlug}/${rest.slug}/`;
    const items = await listR2(prefix, 5000);
    const keyByKey = new Map(items.map((it) => [it.key, it]));

    // Versionera matchade URL:er på objektets lastModified så ett byte (overwrite
    // på samma kanoniska nyckel → ny lastModified) busta:r CDN/browser-cachen.
    // Faller tillbaka till okvalificerad URL om R2 inte gav lastModified.
    const urlFor = (key: string): string => {
      const lm = keyByKey.get(key)?.lastModified;
      return lm ? r2KeyToVersionedUrl(key, lm.getTime()) : r2KeyToPublicUrl(key);
    };

    // STRIKT canonical-match — ingen fuzzy. Den enda säkra strategin när
    // flera restauranger kan ha produkter med samma slug (t.ex. "Margherita").
    // För att matcha en bild MÅSTE den ligga på den exakta path:en som
    // /admin/images/paths-template anger. Användaren får mall via UI.
    //
    // No-op skydd: vi gör BARA prisma.update om värdet faktiskt skiljer sig
    // från DB:s nuvarande imageUrl. Detta gör knappen helt idempotent —
    // klicka 100 gånger utan DB-skrivningar om inget har förändrats.

    let matchedHero = false;
    let matchedLogo = false;
    let matchedCategories = 0;
    let matchedProducts = 0;
    let actualWrites = 0;
    const updates: Array<{ kind: string; id: string; url: string; key: string; changed: boolean }> = [];

    // hero.webp → Restaurant.heroImageUrl (banner-bilden)
    const heroKey = `${prefix}hero.webp`;
    if (keyByKey.has(heroKey)) {
      matchedHero = true;
      const url = urlFor(heroKey);
      const changed = rest.heroImageUrl !== url;
      updates.push({ kind: 'hero', id: restaurantId, url, key: heroKey, changed });
      if (!dryRun && changed) {
        await prisma.restaurant.update({ where: { id: restaurantId }, data: { heroImageUrl: url } });
        actualWrites++;
      }
    }
    // logo.webp → Restaurant.imageUrl (mindre logo/avatar)
    const logoKey = `${prefix}logo.webp`;
    if (keyByKey.has(logoKey)) {
      matchedLogo = true;
      const url = urlFor(logoKey);
      const changed = rest.imageUrl !== url;
      updates.push({ kind: 'logo', id: restaurantId, url, key: logoKey, changed });
      if (!dryRun && changed) {
        await prisma.restaurant.update({ where: { id: restaurantId }, data: { imageUrl: url } });
        actualWrites++;
      }
    }

    // categories — bild på category/{slug}.webp → Category.imageUrl
    const catRows = await prisma.category.findMany({
      where: { restaurantId },
      select: { id: true, slug: true, name: true, imageUrl: true },
    });
    for (const c of catRows) {
      const slug = c.slug || slugifyPathSegment(c.name);
      const key = `${prefix}category/${slug}.webp`;
      if (keyByKey.has(key)) {
        matchedCategories++;
        const url = urlFor(key);
        const changed = c.imageUrl !== url;
        updates.push({ kind: 'category', id: c.id, url, key, changed });
        if (!dryRun && changed) {
          await prisma.category.update({ where: { id: c.id }, data: { imageUrl: url } });
          actualWrites++;
        }
      }
    }

    // products via kategori
    const products = await prisma.product.findMany({
      where: { category: { restaurantId } },
      select: {
        id: true, slug: true, name: true, imageUrl: true,
        category: { select: { slug: true, name: true } },
      },
    });
    for (const p of products) {
      const catSlug = p.category.slug || slugifyPathSegment(p.category.name);
      const prodSlug = p.slug || slugifyPathSegment(p.name);
      const key = `${prefix}menu/${catSlug}/${prodSlug}.webp`;
      if (keyByKey.has(key)) {
        matchedProducts++;
        const url = urlFor(key);
        const changed = p.imageUrl !== url;
        updates.push({ kind: 'product', id: p.id, url, key, changed });
        if (!dryRun && changed) {
          await prisma.product.update({ where: { id: p.id }, data: { imageUrl: url } });
          actualWrites++;
        }
      }
    }

    // Busta menu-cache så frontend ser de nya URL:erna direkt (utan att
    // vänta på 8s TTL-utgång). Bara om vi faktiskt skrev något.
    if (!dryRun && actualWrites > 0) {
      menuCacheBust(restaurantId);
    }

    res.json({
      restaurant: rest.slug,
      city: citySlug,
      prefix,
      totalObjectsInPrefix: items.length,
      matched: { hero: matchedHero, logo: matchedLogo, categories: matchedCategories, products: matchedProducts },
      writes: actualWrites,
      updates: updates.slice(0, 20),
      dryRun,
    });
  } catch (error: any) {
    console.error('Auto-match error:', error);
    res.status(500).json({ error: error?.message || 'Auto-match misslyckades' });
  }
});

/**
 * GET /api/admin/images/paths-template?restaurantId=X
 *
 * Returnerar exakt R2-path-template för en restaurang så admin kan se
 * vilka filnamn att använda när de manuellt laddar upp bilder till
 * Cloudflare R2-dashboarden. Direkt-canonical = noll kollisionsrisk.
 *
 * Struktur:
 *   {city}/{rest}/hero.webp                          — Hero (banner)
 *   {city}/{rest}/logo.webp                          — Logo
 *   {city}/{rest}/main/{main-cat-slug}.webp          — Main-categories
 *   {city}/{rest}/menu/{cat-slug}/{prod-slug}.webp   — Produkter
 */
router.get('/images/paths-template', async (req: Request, res: Response) => {
  try {
    const restaurantId = String(req.query.restaurantId || '');
    if (!restaurantId) { res.status(400).json({ error: 'Saknar restaurantId' }); return; }

    const rest = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        name: true,
        slug: true,
        city: true,
        city_relation: { select: { slug: true, name: true } },
      },
    });
    if (!rest) { res.status(404).json({ error: 'Restaurang hittades inte' }); return; }

    const citySlug = rest.city_relation?.slug || slugifyPathSegment(rest.city_relation?.name || rest.city || 'global');
    const prefix = `${citySlug}/${rest.slug}/`;

    const categories = await prisma.category.findMany({
      where: { restaurantId },
      select: {
        id: true,
        name: true,
        slug: true,
        products: {
          select: { id: true, name: true, slug: true },
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { position: 'asc' },
    });

    res.json({
      restaurant: { name: rest.name, slug: rest.slug },
      city: { slug: citySlug },
      prefix,
      hero: { key: `${prefix}hero.webp`, label: 'Hero (top banner)' },
      logo: { key: `${prefix}logo.webp`, label: 'Logo' },
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug || slugifyPathSegment(c.name),
        key: `${prefix}category/${c.slug || slugifyPathSegment(c.name)}.webp`,
        folder: `${prefix}menu/${c.slug || slugifyPathSegment(c.name)}/`,
        products: c.products.map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug || slugifyPathSegment(p.name),
          key: `${prefix}menu/${c.slug || slugifyPathSegment(c.name)}/${p.slug || slugifyPathSegment(p.name)}.webp`,
        })),
      })),
    });
  } catch (error: any) {
    console.error('Paths-template error:', error);
    res.status(500).json({ error: error?.message || 'Kunde inte bygga paths-template' });
  }
});

/**
 * POST /api/admin/images/migrate
 *
 * Triggar migration från Cloudinary (eller andra URL:er) till R2 SERVER-SIDE.
 * Använder env-värdena som redan finns på Railway — inget behöver skickas
 * från admin-klienten. Default = dry-run så admin kan se vad som händer
 * innan de godkänner.
 *
 * Body:
 *   { apply?: boolean = false,
 *     only?: 'restaurants'|'main-categories'|'categories'|'products',
 *     restaurantSlug?: string,
 *     maxItems?: number }
 *
 * Säkerhet:
 *   - Kräver superadmin (authenticate-middleware checkar token, men hela
 *     /admin-routern är scoped till admins). Endpointen rör bara imageUrl-
 *     kolumner, ingen radering av data.
 *   - apply måste vara explicit true — annars dry-run.
 *   - maxItems kan stoppa körningen tidigt.
 */
router.post('/images/migrate', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    if (!r2Enabled()) {
      res.status(503).json({ error: 'R2 är inte konfigurerat på servern' });
      return;
    }
    const opts: MigrateOptions = {
      apply: Boolean(req.body?.apply),
      only: req.body?.only,
      restaurantSlug: req.body?.restaurantSlug,
      maxItems: typeof req.body?.maxItems === 'number' ? req.body.maxItems : undefined,
    };
    // Long-running — säg åt klienten att vänta
    res.setTimeout(10 * 60 * 1000);
    const result = await runR2Migration(opts);
    res.json(result);
  } catch (error: any) {
    console.error('Migration error:', error);
    res.status(500).json({ error: error?.message || 'Migration misslyckades' });
  }
});

export default router;
