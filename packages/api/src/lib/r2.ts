/**
 * Cloudflare R2 client — S3-kompatibel storage med zero egress fees.
 *
 * Konfig läses från env vid första anrop (lazy), inte på module-top-level.
 * Detta gör att Railpack/BuildKit inte auto-detekterar R2_* som build-time-
 * secret. Build-systemet behöver inte värdena (de används bara vid runtime),
 * men statisk analys av `process.env.X` på top-level kan annars lura
 * build-systemet att kräva dem som secret-mounts. Lazy-init kringgår det.
 *
 *   R2_ACCOUNT_ID       → t.ex. "abc123def456"
 *   R2_ACCESS_KEY_ID    → från R2 "API Tokens" i Cloudflare-dashboard
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET           → t.ex. "levera-images"
 *   R2_PUBLIC_BASE_URL  → t.ex. "https://pub-xxxx.r2.dev" (eller custom-domän)
 *
 * Om något saknas returnerar `r2Enabled()` false och endpoints svarar 503
 * så vi inte tyst tappar uppladdningar. Hela admin-flowet förblir
 * funktionellt mot Cloudinary tills R2 är konfigurerat.
 */
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand, CopyObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import sharp from 'sharp';

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBase: string;
  /** Resolved endpoint URL — beror på jurisdiktion (default/EU/FedRAMP). */
  endpoint: string;
};

let _cachedConfig: R2Config | null = null;
let _cachedClient: S3Client | null = null;
let _cacheBuilt = false;

function loadConfig(): R2Config | null {
  if (_cacheBuilt) return _cachedConfig;
  _cacheBuilt = true;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET || '';
  const publicBase = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '');

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBase) {
    _cachedConfig = null;
    return null;
  }

  // Endpoint väljs baserat på bucket-jurisdiktion. EU-buckets MÅSTE använda
  // .eu.r2.cloudflarestorage.com — annars returnerar R2 AccessDenied vid
  // PutObject även med valid token. Default = global (auto-region).
  //   R2_JURISDICTION=eu      → https://{account}.eu.r2.cloudflarestorage.com
  //   R2_JURISDICTION=fedramp → https://{account}.fedramp.r2.cloudflarestorage.com
  //   (saknat eller "default") → https://{account}.r2.cloudflarestorage.com
  // R2_ENDPOINT kan också sättas explicit för att overrida helt.
  const jurisdiction = (process.env.R2_JURISDICTION || '').trim().toLowerCase();
  const subdomain = jurisdiction === 'eu' ? 'eu.'
    : jurisdiction === 'fedramp' ? 'fedramp.'
    : '';
  const endpoint = process.env.R2_ENDPOINT
    || `https://${accountId}.${subdomain}r2.cloudflarestorage.com`;

  _cachedConfig = { accountId, accessKeyId, secretAccessKey, bucket, publicBase, endpoint };
  return _cachedConfig;
}

function getClient(): { client: S3Client; cfg: R2Config } | null {
  const cfg = loadConfig();
  if (!cfg) return null;
  if (!_cachedClient) {
    _cachedClient = new S3Client({
      region: 'auto',
      endpoint: cfg.endpoint,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
  }
  return { client: _cachedClient, cfg };
}

/** Lazy-getter för r2Enabled. Använd som funktion: `r2Enabled()`. */
export function r2Enabled(): boolean {
  return loadConfig() !== null;
}

/** Lazy-getter för bucket-namnet. Tomt om inte konfigurerat. */
export function r2Bucket(): string {
  return loadConfig()?.bucket || '';
}

/** Lazy-getter för publik bas-URL. Tomt om inte konfigurerat. */
export function r2PublicBase(): string {
  return loadConfig()?.publicBase || '';
}

/**
 * Slugify för path-segment: åäö → a/a/o, lowercase, ersätt allt icke-alfanum med "-".
 * Används överallt så path-strukturen blir deterministisk.
 */
export function slugifyPathSegment(input: string): string {
  return (input || '')
    .toLowerCase()
    .replace(/å/g, 'a')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Bygg den kanoniska R2-pathen för en bild.
 *
 * Strukturen:
 *   {city}/{restaurant}/hero.webp
 *   {city}/{restaurant}/logo.webp
 *   {city}/{restaurant}/main/{category}.webp
 *   {city}/{restaurant}/menu/{category}/{product}.webp
 *
 * Kallaren bestämmer typ. Om något slug-segment saknas faller vi tillbaka
 * till "misc/{filename}" så det aldrig blir tomma segment i nyckeln.
 */
export type R2PathArgs =
  | { kind: 'hero'; city: string; restaurant: string; ext?: string }
  | { kind: 'logo'; city: string; restaurant: string; ext?: string }
  | { kind: 'main-category'; city: string; restaurant: string; category: string; ext?: string }
  | { kind: 'product'; city: string; restaurant: string; category: string; product: string; ext?: string }
  | { kind: 'misc'; city?: string; restaurant?: string; filename: string };

export function buildR2Key(args: R2PathArgs): string {
  const ext = ('ext' in args && args.ext) || 'webp';
  const city = 'city' in args && args.city ? slugifyPathSegment(args.city) : 'global';
  const rest = 'restaurant' in args && args.restaurant ? slugifyPathSegment(args.restaurant) : null;
  switch (args.kind) {
    case 'hero':
      return `${city}/${rest}/hero.${ext}`;
    case 'logo':
      return `${city}/${rest}/logo.${ext}`;
    case 'main-category':
      return `${city}/${rest}/main/${slugifyPathSegment(args.category)}.${ext}`;
    case 'product':
      return `${city}/${rest}/menu/${slugifyPathSegment(args.category)}/${slugifyPathSegment(args.product)}.${ext}`;
    case 'misc':
      return `${city}/${rest ? `${rest}/` : ''}misc/${args.filename}`;
  }
}

export function r2KeyToPublicUrl(key: string): string {
  return `${r2PublicBase()}/${key}`;
}

/**
 * Publik URL med en cache-busting-version (`?v=…`).
 *
 * Pathen i R2 är KANONISK ({stad}/{restaurang}/logo.webp) och objektet skrivs
 * över på samma nyckel vid byte — så själva URL:en ändras aldrig. Men vi cachar
 * stenhårt (`Cache-Control: immutable, max-age=1 år`), vilket betyder att en ny
 * uppladdning annars fortsätter visa GAMLA bilden i upp till ett år. Lösningen:
 * lägg en version i query-strängen som ändras när innehållet ändras. CDN/browser
 * ser då en ny URL och hämtar färskt, medan immutable-cachen fortfarande gäller.
 *
 * `version` är en kort content-hash (vid uppladdning) eller objektets
 * lastModified-ms (vid auto-match) — vad som helst som ändras vid byte.
 */
export function r2KeyToVersionedUrl(key: string, version: string | number): string {
  const v = String(version);
  return v ? `${r2KeyToPublicUrl(key)}?v=${encodeURIComponent(v)}` : r2KeyToPublicUrl(key);
}

/** Kort, deterministisk content-hash (sha1, 10 hex) för cache-busting. */
export function shortContentHash(body: Buffer): string {
  return createHash('sha1').update(body).digest('hex').slice(0, 10);
}

/**
 * Predicera kanonisk R2-URL för en produkt baserat på slug-konventionen.
 * Returnerar null om R2 inte är konfigurerat eller någon slug saknas.
 *
 * Används av menu-routen för att returnera en "speculative" imageUrl när
 * databasens imageUrl är null — klienten försöker hämta, om filen finns
 * i R2 visas den; annars triggas browser-fallback (text-only kort).
 *
 * Detta gör att uppladdning direkt till R2 med rätt namn → auto-discovery
 * utan att admin behöver klicka "Matcha bilder från R2".
 */
export function predictedProductUrl(args: { city: string; restaurant: string; category: string; product: string }): string | null {
  if (!r2Enabled()) return null;
  if (!args.city || !args.restaurant || !args.category || !args.product) return null;
  return r2KeyToPublicUrl(buildR2Key({ kind: 'product', ...args }));
}

export function predictedMainCategoryUrl(args: { city: string; restaurant: string; category: string }): string | null {
  if (!r2Enabled()) return null;
  if (!args.city || !args.restaurant || !args.category) return null;
  return r2KeyToPublicUrl(buildR2Key({ kind: 'main-category', ...args }));
}

export function predictedHeroUrl(args: { city: string; restaurant: string }): string | null {
  if (!r2Enabled()) return null;
  if (!args.city || !args.restaurant) return null;
  return r2KeyToPublicUrl(buildR2Key({ kind: 'hero', ...args }));
}

export function predictedLogoUrl(args: { city: string; restaurant: string }): string | null {
  if (!r2Enabled()) return null;
  if (!args.city || !args.restaurant) return null;
  return r2KeyToPublicUrl(buildR2Key({ kind: 'logo', ...args }));
}

/**
 * Konvertera buffer till WebP, max 1200px bred, kvalitet 82.
 * Behåller original-aspect ratio. Bild som redan är WebP processas ändå
 * för konsistent komprimering — sharp är snabbt nog att inte spelar roll.
 */
export async function toWebp(input: Buffer, opts?: { maxWidth?: number; quality?: number }): Promise<Buffer> {
  const maxWidth = opts?.maxWidth ?? 1200;
  const quality = opts?.quality ?? 82;
  return sharp(input)
    .rotate() // respektera EXIF-orientering
    .resize({ width: maxWidth, withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();
}

/**
 * Ladda upp buffer (eller original-bytes) till R2 vid given nyckel.
 * Returnerar både key och public-URL.
 */
export async function uploadToR2(key: string, body: Buffer, contentType = 'image/webp'): Promise<{ key: string; url: string }> {
  const c = getClient();
  if (!c) throw new Error('R2 är inte konfigurerat — sätt R2_* env vars');
  try {
    await c.client.send(new PutObjectCommand({
      Bucket: c.cfg.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      // Public-read sätts via bucket-policy/custom-domain. CacheControl ger
      // CDN-cache 1 år så bilder cachas hårt — om vi behöver byta gör vi
      // det via en ny path (key = {slug}.{hash}.webp t.ex.).
      CacheControl: 'public, max-age=31536000, immutable',
    }));
  } catch (e: any) {
    // S3-SDK-fel: bygg meddelande med code + bucket + key så vi ser
    // exakt vad R2 svarade. Vanliga case:
    //   "AccessDenied"  → API-token saknar Object Write för bucketen
    //   "NoSuchBucket"  → R2_BUCKET-namnet matchar inte verklig bucket
    //   "InvalidAccessKeyId" → R2_ACCESS_KEY_ID stämmer inte
    //   "SignatureDoesNotMatch" → R2_SECRET_ACCESS_KEY stämmer inte
    const code = e?.Code || e?.name || e?.$metadata?.httpStatusCode || 'unknown';
    const msg = e?.message || String(e);
    throw new Error(`R2 PutObject misslyckades (${code}): bucket="${c.cfg.bucket}", key="${key}" — ${msg}`);
  }
  // Returnera en content-versionad URL så att en "replace" på samma kanoniska
  // nyckel faktiskt syns: samma innehåll → samma ?v (idempotent), ny bild → ny
  // ?v → CDN/browser hämtar färskt trots immutable-cachen.
  return { key, url: r2KeyToVersionedUrl(key, shortContentHash(body)) };
}

/**
 * Lista alla object i bucketen med givet prefix. Hanterar pagination.
 * Används av admin-UI för image-picker och auto-match.
 */
export async function listR2(prefix: string, maxKeys = 1000): Promise<Array<{ key: string; size: number; lastModified?: Date }>> {
  const c = getClient();
  if (!c) throw new Error('R2 är inte konfigurerat');
  const items: Array<{ key: string; size: number; lastModified?: Date }> = [];
  let continuationToken: string | undefined = undefined;
  do {
    const res: any = await c.client.send(new ListObjectsV2Command({
      Bucket: c.cfg.bucket,
      Prefix: prefix,
      MaxKeys: Math.min(maxKeys, 1000),
      ContinuationToken: continuationToken,
    }));
    for (const obj of res.Contents || []) {
      if (obj.Key) items.push({ key: obj.Key, size: obj.Size || 0, lastModified: obj.LastModified });
    }
    continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (continuationToken && items.length < maxKeys);
  return items;
}

/**
 * Kolla om ett object finns. Snabbare än list när du bara vill veta
 * "har den här produkten en bild?".
 */
export async function existsInR2(key: string): Promise<boolean> {
  const c = getClient();
  if (!c) return false;
  try {
    await c.client.send(new HeadObjectCommand({ Bucket: c.cfg.bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Kopiera ett object inom samma bucket (för rename/restructure).
 */
export async function copyInR2(fromKey: string, toKey: string): Promise<void> {
  const c = getClient();
  if (!c) throw new Error('R2 är inte konfigurerat');
  await c.client.send(new CopyObjectCommand({
    Bucket: c.cfg.bucket,
    CopySource: `/${c.cfg.bucket}/${encodeURIComponent(fromKey)}`,
    Key: toKey,
  }));
}

export async function deleteFromR2(key: string): Promise<void> {
  const c = getClient();
  if (!c) throw new Error('R2 är inte konfigurerat');
  await c.client.send(new DeleteObjectCommand({ Bucket: c.cfg.bucket, Key: key }));
}
