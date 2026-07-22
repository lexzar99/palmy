/**
 * Slug-/stadsbyte för en restaurang → håll R2 och databasen i synk.
 *
 * Bakgrund: R2-nyckeln byggs på `{stad-slug}/{restaurang-slug}/…` och den
 * FULLA URL:en cachas i databasen (Restaurant/Category/Product/Extra.imageUrl
 * m.fl.). När slugen (eller staden) ändras låg det tidigare INGEN kod som
 * flyttade objekten eller skrev om URL:erna — bilderna blev kvar som orphans
 * på den gamla pathen, och en ny uppladdning hamnade på den nya. Resultat:
 * två uppsättningar bilder i R2, och om man raderade den gamla mappen dog alla
 * länkar. Den här funktionen gör bytet atomiskt-nog:
 *
 *   1. Flyttar alla R2-objekt från gamla prefixet till det nya.
 *   2. Skriver om varje sparad bild-URL (restaurang + kategorier + produkter +
 *      extras) från gamla prefixet till det nya, med bevarad `?v=`-version.
 *
 * Best-effort och aldrig blockerande: kastar aldrig vidare, loggar i stället.
 * Om R2 saknar objekten (t.ex. redan raderade) skrivs URL:erna ändå om till
 * den kanoniska nya pathen — matchar systemets "predicted URL"-beteende, så
 * fältet self-healar så fort rätt bild laddas upp igen.
 */
import prisma from './prisma';
import { r2Enabled, renameR2Prefix, reprefixR2Url } from './r2';

export type ReslugResult = {
  ran: boolean;
  reason?: string;
  oldPrefix?: string;
  newPrefix?: string;
  objectsMoved?: number;
  objectsFailed?: number;
  urlsRewritten?: number;
};

export async function syncRestaurantImagePrefix(args: {
  restaurantId: string;
  oldPrefix: string;
  newPrefix: string;
}): Promise<ReslugResult> {
  const { restaurantId, oldPrefix, newPrefix } = args;
  if (!oldPrefix || !newPrefix || oldPrefix === newPrefix) {
    return { ran: false, reason: 'oförändrat prefix' };
  }
  if (!r2Enabled()) {
    return { ran: false, reason: 'R2 ej konfigurerat', oldPrefix, newPrefix };
  }

  const result: ReslugResult = { ran: true, oldPrefix, newPrefix, objectsMoved: 0, objectsFailed: 0, urlsRewritten: 0 };

  // 1) Flytta R2-objekten. Fel loggas men stoppar aldrig DB-omskrivningen —
  //    URL:erna ska bli kanoniska oavsett R2-tillstånd.
  try {
    const moved = await renameR2Prefix(oldPrefix, newPrefix);
    result.objectsMoved = moved.moved;
    result.objectsFailed = moved.failed.length;
    if (moved.failed.length) {
      console.warn(`[r2Rename] ${moved.failed.length} objekt kunde inte flyttas ${oldPrefix} → ${newPrefix}:`,
        moved.failed.slice(0, 5));
    }
  } catch (e: any) {
    console.warn(`[r2Rename] renameR2Prefix misslyckades ${oldPrefix} → ${newPrefix}:`, e?.message || e);
  }

  const fix = (url: string | null | undefined): string | null => {
    if (!url) return url ?? null;
    return reprefixR2Url(url, oldPrefix, newPrefix);
  };

  // 2) Skriv om DB-URL:er. Endast fält som faktiskt ändras rörs (idempotent).
  try {
    // Restaurang: imageUrl (logo), heroImageUrl (omslag), offersImageUrl.
    const r = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { imageUrl: true, heroImageUrl: true, offersImageUrl: true },
    });
    if (r) {
      const patch: Record<string, string | null> = {};
      const nextImage = fix(r.imageUrl);
      const nextHero = fix(r.heroImageUrl);
      const nextOffers = fix(r.offersImageUrl);
      if (nextImage !== r.imageUrl) patch.imageUrl = nextImage;
      if (nextHero !== r.heroImageUrl) patch.heroImageUrl = nextHero;
      if (nextOffers !== r.offersImageUrl) patch.offersImageUrl = nextOffers;
      if (Object.keys(patch).length) {
        await prisma.restaurant.update({ where: { id: restaurantId }, data: patch });
        result.urlsRewritten! += Object.keys(patch).length;
      }
    }

    // Kategorier: imageUrl.
    const cats = await prisma.category.findMany({
      where: { restaurantId },
      select: { id: true, imageUrl: true },
    });
    for (const c of cats) {
      const next = fix(c.imageUrl);
      if (next !== c.imageUrl) {
        await prisma.category.update({ where: { id: c.id }, data: { imageUrl: next } });
        result.urlsRewritten!++;
      }
    }

    // Produkter: imageUrl + discountImageUrl.
    const prods = await prisma.product.findMany({
      where: { category: { restaurantId } },
      select: { id: true, imageUrl: true, discountImageUrl: true },
    });
    for (const p of prods) {
      const patch: Record<string, string | null> = {};
      const nextImage = fix(p.imageUrl);
      const nextDisc = fix(p.discountImageUrl);
      if (nextImage !== p.imageUrl) patch.imageUrl = nextImage;
      if (nextDisc !== p.discountImageUrl) patch.discountImageUrl = nextDisc;
      if (Object.keys(patch).length) {
        await prisma.product.update({ where: { id: p.id }, data: patch });
        result.urlsRewritten! += Object.keys(patch).length;
      }
    }

    // Extras (tillval): imageUrl, via extraGroup → restaurant.
    const extras = await prisma.extra.findMany({
      where: { extraGroup: { restaurantId } },
      select: { id: true, imageUrl: true },
    });
    for (const ex of extras) {
      const next = fix(ex.imageUrl);
      if (next !== ex.imageUrl) {
        await prisma.extra.update({ where: { id: ex.id }, data: { imageUrl: next } });
        result.urlsRewritten!++;
      }
    }
  } catch (e: any) {
    console.warn(`[r2Rename] DB-URL-omskrivning misslyckades för ${restaurantId}:`, e?.message || e);
  }

  return result;
}
