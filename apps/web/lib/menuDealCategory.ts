export const DEALS_CATEGORY_ID = 'viaeats-deals';

/** Samlar riktiga serverpriser utan att kopiera eller prissätta om produkter. */
export function menuWithDeals<T extends { id: string; name: string; products: any[] }>(categories: T[], embedded: boolean): T[] {
  // Äldre data har en fysisk Deals-kategori med även ordinarie produkter.
  // Kampanjkategorin hör bara hemma på viaeats, inte i partnerns embed.
  if (embedded) return categories.filter(category => category.name.trim().toLowerCase() !== 'deals' && category.id !== DEALS_CATEGORY_ID);
  const regular = categories.map(category => category.name.toLowerCase() === 'deals' ? { ...category, name: 'Favoriter' } : category);
  const discounted = new Set<string>();
  const products = categories.flatMap(category => category.products).filter(product => {
    const reduced = (typeof product.discountPrice === 'number' && product.discountPrice > 0 && product.discountPrice < product.price)
      || (typeof product.discountPercent === 'number' && product.discountPercent > 0);
    if (!reduced || discounted.has(product.id)) return false;
    discounted.add(product.id);
    return true;
  });
  if (!products.length) return regular;
  return [
    { id: DEALS_CATEGORY_ID, name: 'Deals', products } as T,
    ...regular.map(category => ({ ...category, products: category.products.filter(product => !discounted.has(product.id)) })).filter(category => category.products.length > 0),
  ];
}
