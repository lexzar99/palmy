export class OrderExtraPricingError extends Error {
  constructor(public readonly userMessage: string) {
    super(userMessage);
    this.name = 'OrderExtraPricingError';
  }
}

type CatalogGroup = {
  id: string;
  name: string;
  required?: boolean | null;
  minSelections?: number | null;
};

type CatalogExtra = {
  id: string;
  name: string;
  priceAddon: number;
};

type RequestedExtra = {
  extraName?: string | null;
  quantity?: number | null;
};

/**
 * Converts a client selection into an order snapshot using only catalog data.
 * Negative catalog prices are intentionally supported (for example barnpizza),
 * but a client-supplied name/price can never become payment input.
 */
export function resolveAuthoritativeExtraSelection(input: {
  productName: string;
  group: CatalogGroup | null | undefined;
  extra: CatalogExtra | null | undefined;
  selected: RequestedExtra;
}) {
  const { productName, group, extra, selected } = input;
  if (!group) {
    throw new OrderExtraPricingError(`Ogiltigt tillval för ${productName}`);
  }
  if (!extra) {
    throw new OrderExtraPricingError(`Tillvalet ${selected.extraName || ''} finns inte längre`);
  }
  if (!Number.isSafeInteger(extra.priceAddon)) {
    throw new OrderExtraPricingError(`Tillvalet ${extra.name} har ett ogiltigt pris`);
  }

  return {
    groupId: group.id,
    groupName: group.name,
    extraId: extra.id,
    extraName: extra.name,
    priceAddon: extra.priceAddon / 100,
    quantity: selected.quantity ?? 1,
    groupRequired: Boolean(group.required || (group.minSelections ?? 0) > 0),
  };
}

export function assertNonnegativeCatalogLine(productName: string, basePriceOre: number, extrasOre: number): void {
  if (!Number.isSafeInteger(basePriceOre) || !Number.isSafeInteger(extrasOre) || basePriceOre + extrasOre < 0) {
    throw new OrderExtraPricingError(`${productName} har en ogiltig tillvalskombination`);
  }
}
