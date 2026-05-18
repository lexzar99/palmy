import prisma from './prisma';

/**
 * Slugifier för stadnamn — matchar samma logik som Restaurant.slug.
 * Tar svenska tecken hänsyn till.
 */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // diakritiska tecken
    .replace(/å/g, 'a').replace(/ä/g, 'a').replace(/ö/g, 'o')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Resolve ett Google Places locality-namn (t.ex. "Dalby") till en City.
 *
 * Lookup-ordning (första träff vinner):
 *  1. Exakt match på City.name (case-insensitive)
 *  2. Match i City.aliases (JSON-array)
 *  3. Skapa ny City om ingen träff
 *
 * Returnerar den "effektiva" staden — om träffen har en parentCity, returneras
 * PARENT istället så restaurangen automatiskt grupperas under Storstaden.
 * Exempel: Google ger "Arlöv" → matchar City "Arlöv" → har parent "Malmö" →
 * returnerar Malmö (restaurang.cityId = malmö.id).
 *
 * Men "barnet" finns kvar i DB så admin kan se relationen i Städer-tabben.
 */
export async function resolveOrCreateCity(
  placeName: string,
  options: { centerLat?: number; centerLng?: number } = {},
): Promise<{ id: string; name: string; slug: string; parentCityId: string | null }> {
  const trimmed = (placeName || '').trim();
  if (!trimmed) {
    throw new Error('cityName required');
  }

  const allCities = await prisma.city.findMany({
    select: { id: true, name: true, slug: true, aliases: true, parentCityId: true },
  });

  const lowerName = trimmed.toLowerCase();

  // 1. Direkt name-match
  for (const c of allCities) {
    if (c.name.toLowerCase() === lowerName) {
      // Använd parent om finns — restaurangen grupperas under storstaden.
      if (c.parentCityId) {
        const parent = allCities.find((x) => x.id === c.parentCityId);
        if (parent) return { id: parent.id, name: parent.name, slug: parent.slug, parentCityId: parent.parentCityId };
      }
      return c;
    }
  }

  // 2. Alias-match
  for (const c of allCities) {
    try {
      const aliases: string[] = JSON.parse(c.aliases || '[]');
      if (aliases.some((a) => a.toLowerCase() === lowerName)) {
        if (c.parentCityId) {
          const parent = allCities.find((x) => x.id === c.parentCityId);
          if (parent) return { id: parent.id, name: parent.name, slug: parent.slug, parentCityId: parent.parentCityId };
        }
        return c;
      }
    } catch {
      /* ignore malformed aliases */
    }
  }

  // 3. Skapa ny City. Slug kollas mot collision — om finns, append number.
  let slug = slugify(trimmed);
  if (!slug) slug = `stad-${Date.now()}`;
  let attemptedSlug = slug;
  let i = 1;
  // Snabb collision-loop (i praktiken < 3 iterationer)
  while (allCities.some((c) => c.slug === attemptedSlug)) {
    attemptedSlug = `${slug}-${i++}`;
    if (i > 10) {
      attemptedSlug = `${slug}-${Date.now()}`;
      break;
    }
  }

  const created = await prisma.city.create({
    data: {
      name: trimmed,
      slug: attemptedSlug,
      isActive: true,
      centerLat: options.centerLat ?? null,
      centerLng: options.centerLng ?? null,
    },
    select: { id: true, name: true, slug: true, parentCityId: true },
  });

  return created;
}

/**
 * Hämta alla cityIds som ska räknas som "samma stad" från kundens perspektiv.
 * Exempel: lookup för Malmö returnerar [malmö-id, arlöv-id, oxie-id] om de
 * är barn till Malmö. Används av web-filter för att visa hela Storstadens
 * utbud när kund anger adress.
 */
export async function getCityFamilyIds(cityId: string): Promise<string[]> {
  const city = await prisma.city.findUnique({
    where: { id: cityId },
    select: { id: true, parentCityId: true },
  });
  if (!city) return [];

  // Hitta root — om denna stad har parent, root är parent (eller parent's parent osv).
  let rootId = city.id;
  if (city.parentCityId) {
    const parent = await prisma.city.findUnique({
      where: { id: city.parentCityId },
      select: { id: true, parentCityId: true },
    });
    if (parent) rootId = parent.parentCityId || parent.id;
  }

  // Hämta root + alla dess barn (en nivå räcker — vi tillåter inte djupare).
  const family = await prisma.city.findMany({
    where: { OR: [{ id: rootId }, { parentCityId: rootId }] },
    select: { id: true },
  });
  return family.map((c) => c.id);
}
