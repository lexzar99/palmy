/**
 * Cloudflare R2 client — S3-kompatibel storage med zero egress fees.
 *
 * Konfig läses från env:
 *   R2_ACCOUNT_ID       → t.ex. "abc123def456"
 *   R2_ACCESS_KEY_ID    → från R2 "API Tokens" i Cloudflare-dashboard
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET           → t.ex. "levera-images"
 *   R2_PUBLIC_BASE_URL  → t.ex. "https://pub-xxxx.r2.dev" (eller custom-domän)
 *
 * Om något saknas exporteras `r2Enabled = false` och endpoints returnerar
 * 503 så vi inte tyst tappar uppladdningar. Hela admin-flowet förblir
 * funktionellt mot Cloudinary tills R2 är konfigurerat.
 */
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand, CopyObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
export const r2Bucket = process.env.R2_BUCKET || '';
export const r2PublicBase = (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '');

export const r2Enabled = Boolean(accountId && accessKeyId && secretAccessKey && r2Bucket && r2PublicBase);

export const r2 = r2Enabled
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId as string,
        secretAccessKey: secretAccessKey as string,
      },
    })
  : null;

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
  return `${r2PublicBase}/${key}`;
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
  if (!r2 || !r2Enabled) throw new Error('R2 är inte konfigurerat — sätt R2_* env vars');
  await r2.send(new PutObjectCommand({
    Bucket: r2Bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    // Public-read sätts via bucket-policy/custom-domain. CacheControl ger
    // CDN-cache 1 år så bilder cachas hårt — om vi behöver byta gör vi
    // det via en ny path (key = {slug}.{hash}.webp t.ex.).
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return { key, url: r2KeyToPublicUrl(key) };
}

/**
 * Lista alla object i bucketen med givet prefix. Hanterar pagination.
 * Används av admin-UI för image-picker och auto-match.
 */
export async function listR2(prefix: string, maxKeys = 1000): Promise<Array<{ key: string; size: number; lastModified?: Date }>> {
  if (!r2 || !r2Enabled) throw new Error('R2 är inte konfigurerat');
  const items: Array<{ key: string; size: number; lastModified?: Date }> = [];
  let continuationToken: string | undefined = undefined;
  do {
    const res: any = await r2.send(new ListObjectsV2Command({
      Bucket: r2Bucket,
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
  if (!r2 || !r2Enabled) return false;
  try {
    await r2.send(new HeadObjectCommand({ Bucket: r2Bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Kopiera ett object inom samma bucket (för rename/restructure).
 */
export async function copyInR2(fromKey: string, toKey: string): Promise<void> {
  if (!r2 || !r2Enabled) throw new Error('R2 är inte konfigurerat');
  await r2.send(new CopyObjectCommand({
    Bucket: r2Bucket,
    CopySource: `/${r2Bucket}/${encodeURIComponent(fromKey)}`,
    Key: toKey,
  }));
}

export async function deleteFromR2(key: string): Promise<void> {
  if (!r2 || !r2Enabled) throw new Error('R2 är inte konfigurerat');
  await r2.send(new DeleteObjectCommand({ Bucket: r2Bucket, Key: key }));
}
