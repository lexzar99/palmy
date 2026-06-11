export const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Deterministisk, restaurang-scopad slug f\u00f6r meny-enheter (kategori/produkt).
 *
 * Bas = `${slugify(name)}-${slugify(restaurantSlug)}`. Restaurang-scopen g\u00f6r
 * att tv\u00e5 kedjeplatser (t.ex. \u00e5tta McDonald's) kan ha IDENTISKA produktnamn
 * utan att krocka mot den globala `@unique`-constrainten p\u00e5 slug. Vid en
 * faktisk krock (samma namn i SAMMA restaurang, eller basen redan tagen)
 * l\u00e4ggs `-2`, `-3`\u2026 till.
 *
 * Determinismen \u00e4r po\u00e4ngen: samma (namn, restaurang) ger ALLTID samma slug,
 * s\u00e5 re-import och master\u2192plats-synk kan matcha befintlig rad p\u00e5 slug och
 * UPPDATERA ist\u00e4llet f\u00f6r att duplicera. (Tidigare `-${Date.now()}` /
 * `-${random}` gav en ny slug varje g\u00e5ng \u2192 om\u00f6jligt att matcha vid synk.)
 *
 * `probe(slug)` returnerar `true` om slugen \u00e4r LEDIG. Anroparen avg\u00f6r om den
 * probar mot DB (single-create) eller mot ett ackumulerat Set (batch).
 */
export async function uniqueMenuSlug(
  name: string,
  restaurantSlug: string,
  probe: (slug: string) => boolean | Promise<boolean>,
): Promise<string> {
  const base = `${slugify(name) || 'item'}-${slugify(restaurantSlug) || 'r'}`;
  if (await probe(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`;
    if (await probe(candidate)) return candidate;
  }
  // Extremt osannolik fallback (>1000 namnkrockar i en restaurang).
  return `${base}-${Date.now().toString(36)}`;
}
