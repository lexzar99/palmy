/** Menyn är prisets källa även för en varukorg från en tidigare ingång. Tillval ändras inte. */
export function palmyraCartPrice(product: { price: number; salePrice?: number | null; discountActive?: boolean; discountPrice?: number | null; discountPercent?: number | null }) {
  if (!Number.isFinite(product.price) || product.price < 0) return null;
  if (typeof product.salePrice === 'number' && product.salePrice > 0 && product.salePrice < product.price) return product.salePrice;
  if (product.discountActive && typeof product.discountPrice === 'number' && product.discountPrice > 0 && product.discountPrice < product.price) return product.discountPrice;
  if (product.discountActive && typeof product.discountPercent === 'number' && product.discountPercent > 0 && product.discountPercent <= 100) return Math.round(product.price * (1 - product.discountPercent / 100) * 100) / 100;
  return product.price;
}
