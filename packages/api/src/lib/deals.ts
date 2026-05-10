type DealLike = {
  id: string;
  title: string;
  description: string | null;
  imageUrl?: string | null;
  badgeText: string | null;
  popupHeadline?: string | null;
  popupBody?: string | null;
  popupCtaLabel?: string | null;
  popupCode?: string | null;
  popupOkOnly?: boolean | null;
  triggerType: string;
  discountType: string;
  discountValue: number;
  minOrder: number;
  comboProductIds: string;
  isActive: boolean;
  showOnSite: boolean;
  showAsBanner?: boolean;
  popupEnabled: boolean;
  maxUsages: number | null;
  maxUsesPerCustomer: number | null;
  usageCount: number;
  validFrom: Date | null;
  validUntil: Date | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  restaurantId?: string | null;
  isGlobal?: boolean;
  applicableRestaurantIds?: string | null;
  triggerCategoryId?: string | null;
  triggerQuantity?: number | null;
  rewardCategoryId?: string | null;
  bogoExcludedProductIds?: string | null;
  bogoMaxRewardPriceOre?: number | null;
};

type ProductPromotionLike = {
  id: string;
  price: number;
  discountActive?: boolean | null;
  discountPercent?: number | null;
  discountPrice?: number | null;
  discountImageUrl?: string | null;
  discountLabel?: string | null;
};

export type DealScopeType = 'RESTAURANT' | 'PRODUCT' | 'CATEGORY' | 'COMBO' | 'MIN_ORDER';

export type ResolvedDisplayPromotion = {
  source: 'DEAL' | 'LEGACY';
  scope: 'PRODUCT' | 'CATEGORY' | 'RESTAURANT';
  salePriceOre: number;
  discountPercent: number | null;
  discountLabel: string | null;
  imageUrl: string | null;
  dealId?: string | null;
  title?: string | null;
  sortOrder: number;
};

export type CartItemForBogo = {
  productId: string;
  categoryId: string;
  basePriceOre: number;
  quantity: number;
};

export type DealEvaluationContext = {
  subtotalOre: number;
  productIds: string[];
  cartItems?: CartItemForBogo[];
};

const oreToKr = (amount: number) => amount / 100;

export const parseDealProductIds = (raw: string | null | undefined) => {
  if (!raw) return [] as string[];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
};

export const parseDealTargetIds = parseDealProductIds;

export const parseApplicableRestaurantIds = (raw: string | null | undefined) => {
  if (!raw) return [] as string[];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
};

export const getDealScopeType = (deal: Pick<DealLike, 'triggerType'>): DealScopeType => {
  if (deal.triggerType === 'PRODUCT') return 'PRODUCT';
  if (deal.triggerType === 'CATEGORY' || deal.triggerType === 'BOGO_CATEGORY') return 'CATEGORY';
  if (deal.triggerType === 'COMBO') return 'COMBO';
  if (deal.triggerType === 'MIN_ORDER') return 'MIN_ORDER';
  return 'RESTAURANT';
};

export const isBasketDeal = (deal: Pick<DealLike, 'triggerType'>) => {
  const scope = getDealScopeType(deal);
  return scope === 'RESTAURANT' || scope === 'COMBO' || scope === 'MIN_ORDER';
};

export const getDealKind = (deal: Pick<DealLike, 'triggerType' | 'discountType'>) => {
  if (deal.triggerType === 'PRODUCT') return 'PRODUCT';
  if (deal.triggerType === 'CATEGORY') return 'CATEGORY';
  if (deal.triggerType === 'BOGO_CATEGORY') return 'BOGO_CATEGORY';
  if (deal.triggerType === 'COMBO') return 'COMBO';
  if (deal.triggerType === 'MIN_ORDER') return 'MIN_ORDER';
  if (deal.discountType === 'FIXED_PRICE') return 'FIXED_PRICE';
  if (deal.discountType === 'FIXED') return 'FIXED';
  return 'PERCENTAGE';
};

export const isDealAvailableNow = (deal: Pick<DealLike, 'isActive' | 'validFrom' | 'validUntil' | 'maxUsages' | 'usageCount'>, now = new Date()) => {
  if (!deal.isActive) return false;
  if (deal.validFrom && deal.validFrom > now) return false;
  if (deal.validUntil && deal.validUntil < now) return false;
  if (deal.maxUsages !== null && deal.usageCount >= deal.maxUsages) return false;
  return true;
};

export const getDealProgress = (deal: DealLike, context: DealEvaluationContext) => {
  const comboProductIds = parseDealProductIds(deal.comboProductIds);
  const productSet = new Set(context.productIds);

  if (deal.triggerType === 'COMBO' && comboProductIds.length > 0) {
    const current = comboProductIds.filter((productId) => productSet.has(productId)).length;
    const goal = comboProductIds.length;
    return {
      current,
      goal,
      percentage: goal === 0 ? 100 : Math.min((current / goal) * 100, 100),
      remainingLabel: goal - current > 0 ? `${goal - current} val kvar i combon` : 'Combon är klar',
    };
  }

  if (deal.minOrder > 0) {
    const current = context.subtotalOre;
    const goal = deal.minOrder;
    const missing = Math.max(goal - current, 0);
    return {
      current,
      goal,
      percentage: goal === 0 ? 100 : Math.min((current / goal) * 100, 100),
      remainingLabel: missing > 0 ? `${oreToKr(missing).toFixed(0)} kr kvar till dealen` : 'Dealen är aktiv',
    };
  }

  return {
    current: 1,
    goal: 1,
    percentage: 100,
    remainingLabel: 'Dealen är aktiv',
  };
};

export const evaluateBogoCategoryDeal = (deal: DealLike, cartItems: CartItemForBogo[]): { eligible: boolean; discountAmountOre: number } => {
  const triggerCatId = deal.triggerCategoryId;
  if (!triggerCatId) return { eligible: false, discountAmountOre: 0 };

  const rewardCatId = deal.rewardCategoryId || triggerCatId;
  const needed = deal.triggerQuantity ?? 2;
  const excludedIds = new Set(parseDealProductIds(deal.bogoExcludedProductIds));

  // Count total trigger-category items (excluded products don't count toward trigger)
  const triggerCount = cartItems
    .filter((item) => item.categoryId === triggerCatId && !excludedIds.has(item.productId))
    .reduce((sum, item) => sum + item.quantity, 0);

  if (triggerCount < needed) return { eligible: false, discountAmountOre: 0 };

  // Find eligible reward items (same category, not excluded), cheapest base price first
  const rewardPrices = cartItems
    .filter((item) => item.categoryId === rewardCatId && !excludedIds.has(item.productId))
    .flatMap((item) => Array.from({ length: item.quantity }, () => item.basePriceOre))
    .sort((a, b) => a - b);

  if (rewardPrices.length === 0) return { eligible: false, discountAmountOre: 0 };

  // Give the cheapest qualifying item free (base price only, extras always paid).
  // bogoMaxRewardPriceOre caps the discount — useful when the reward category
  // contains products at different price points and you only want to cover e.g.
  // the 33cl drink (15 kr) even if the customer picks the 50cl (25 kr).
  const rawDiscount = rewardPrices[0];
  const cap = deal.bogoMaxRewardPriceOre ?? null;
  const discountAmountOre = cap !== null ? Math.min(rawDiscount, cap) : rawDiscount;
  return { eligible: true, discountAmountOre };
};

export const evaluateDeal = (deal: DealLike, context: DealEvaluationContext) => {
  if (deal.triggerType === 'BOGO_CATEGORY') {
    const result = evaluateBogoCategoryDeal(deal, context.cartItems ?? []);
    return {
      eligible: result.eligible,
      discountAmountOre: result.discountAmountOre,
      progress: { current: 1, goal: 1, percentage: result.eligible ? 100 : 0, remainingLabel: result.eligible ? 'BOGO aktiv' : `Köp ${deal.triggerQuantity ?? 2} från kategorin` },
    };
  }

  const progress = getDealProgress(deal, context);
  const productSet = new Set(context.productIds);
  const comboProductIds = parseDealProductIds(deal.comboProductIds);

  const meetsCombo =
    deal.triggerType !== 'COMBO' ||
    comboProductIds.length === 0 ||
    comboProductIds.every((productId) => productSet.has(productId));

  const requiredMinOrder = deal.minOrder > 0 ? deal.minOrder : 0;
  const meetsMinOrder = context.subtotalOre >= requiredMinOrder;
  const eligible = meetsCombo && meetsMinOrder;

  if (!eligible) {
    return {
      eligible: false,
      discountAmountOre: 0,
      progress,
    };
  }

  const discountAmountOre =
    deal.discountType === 'FIXED'
      ? Math.min(deal.discountValue, context.subtotalOre)
      : Math.round(context.subtotalOre * deal.discountValue / 100);

  return {
    eligible: discountAmountOre > 0,
    discountAmountOre,
    progress,
  };
};

const createPromotionCandidate = (params: {
  source: 'DEAL' | 'LEGACY';
  scope: 'PRODUCT' | 'CATEGORY' | 'RESTAURANT';
  priceOre: number;
  discountType: string;
  discountValue: number;
  discountLabel?: string | null;
  imageUrl?: string | null;
  dealId?: string | null;
  title?: string | null;
  sortOrder?: number;
}) => {
  const { source, scope, priceOre, discountType, discountValue, discountLabel, imageUrl, dealId, title, sortOrder = 0 } = params;
  if (priceOre <= 0) return null;

  let salePriceOre = priceOre;
  if (discountType === 'FIXED_PRICE') {
    salePriceOre = Math.round(discountValue);
  } else if (discountType === 'PERCENTAGE') {
    salePriceOre = Math.round(priceOre * Math.max(0, 100 - Number(discountValue || 0)) / 100);
  } else {
    return null;
  }

  if (!Number.isFinite(salePriceOre) || salePriceOre <= 0 || salePriceOre >= priceOre) return null;

  const discountPercent = Math.max(1, Math.round((1 - salePriceOre / priceOre) * 100));
  return {
    source,
    scope,
    salePriceOre,
    discountPercent,
    discountLabel: discountLabel || null,
    imageUrl: imageUrl || null,
    dealId: dealId || null,
    title: title || null,
    sortOrder,
  } satisfies ResolvedDisplayPromotion;
};

const scopePriority: Record<ResolvedDisplayPromotion['scope'], number> = {
  PRODUCT: 3,
  CATEGORY: 2,
  RESTAURANT: 1,
};

export const resolveDisplayPromotionForProduct = (params: {
  product: ProductPromotionLike;
  categoryId: string;
  restaurantId: string | null;
  deals: DealLike[];
}) => {
  const { product, categoryId, deals } = params;
  const candidates: ResolvedDisplayPromotion[] = [];

  if (product.discountActive && (product.discountPercent != null || product.discountPrice != null)) {
    const legacyCandidate = createPromotionCandidate({
      source: 'LEGACY',
      scope: 'PRODUCT',
      priceOre: product.price,
      discountType: product.discountPrice != null ? 'FIXED_PRICE' : 'PERCENTAGE',
      discountValue: product.discountPrice != null ? product.discountPrice : Number(product.discountPercent || 0),
      discountLabel: product.discountLabel,
      imageUrl: product.discountImageUrl,
      title: product.discountLabel || undefined,
      sortOrder: -1,
    });

    if (legacyCandidate) {
      candidates.push(legacyCandidate);
    }
  }

  for (const deal of deals) {
    if (!isDealAvailableNow(deal)) continue;
    if (!deal.showOnSite) continue;

    const scope = getDealScopeType(deal);
    if (scope === 'COMBO' || scope === 'MIN_ORDER') continue;

    const targetIds = parseDealTargetIds(deal.comboProductIds);
    const matches =
      scope === 'PRODUCT'
        ? targetIds.includes(product.id)
        : scope === 'CATEGORY'
          ? targetIds.includes(categoryId)
          : deal.discountType === 'PERCENTAGE' && Number(deal.minOrder || 0) <= 0;

    if (!matches) continue;

    const candidate = createPromotionCandidate({
      source: 'DEAL',
      scope,
      priceOre: product.price,
      discountType: deal.discountType,
      discountValue: Number(deal.discountValue || 0),
      discountLabel: deal.badgeText,
      imageUrl: deal.imageUrl,
      dealId: deal.id,
      title: deal.title,
      sortOrder: deal.sortOrder,
    });

    if (candidate) {
      candidates.push(candidate);
    }
  }

  return candidates.sort((left, right) => {
    const byScope = scopePriority[right.scope] - scopePriority[left.scope];
    if (byScope !== 0) return byScope;
    const byPrice = left.salePriceOre - right.salePriceOre;
    if (byPrice !== 0) return byPrice;
    return left.sortOrder - right.sortOrder;
  })[0] || null;
};

export const formatDealForClient = (
  deal: DealLike,
  extra?: {
    comboProductNames?: string[];
    restaurant?: {
      id: string;
      name: string;
      slug: string;
    } | null;
    applicableRestaurantIds?: string[];
  },
) => ({
  id: deal.id,
  title: deal.title,
  description: deal.description,
  imageUrl: deal.imageUrl ?? null,
  badgeText: deal.badgeText,
  popupHeadline: deal.popupHeadline ?? null,
  popupBody: deal.popupBody ?? null,
  popupCtaLabel: deal.popupCtaLabel ?? null,
  popupCode: deal.popupCode ?? null,
  popupOkOnly: deal.popupOkOnly ?? false,
  dealType: getDealKind(deal),
  scopeType: getDealScopeType(deal),
  triggerType: deal.triggerType,
  discountType: deal.discountType,
  discountValue: deal.discountType === 'FIXED' || deal.discountType === 'FIXED_PRICE' ? oreToKr(deal.discountValue) : deal.discountValue,
  minOrder: oreToKr(deal.minOrder),
  comboProductIds: parseDealProductIds(deal.comboProductIds),
  targetIds: parseDealTargetIds(deal.comboProductIds),
  comboProductNames: extra?.comboProductNames || [],
  isActive: deal.isActive,
  showOnSite: deal.showOnSite,
  showAsBanner: deal.showAsBanner ?? false,
  popupEnabled: deal.popupEnabled,
  maxUsages: deal.maxUsages,
  maxUsesPerCustomer: deal.maxUsesPerCustomer,
  usageCount: deal.usageCount,
  validFrom: deal.validFrom,
  validUntil: deal.validUntil,
  sortOrder: deal.sortOrder,
  restaurantId: deal.restaurantId || null,
  isGlobal: deal.isGlobal ?? false,
  restaurant: extra?.restaurant || null,
  applicableRestaurantIds: extra?.applicableRestaurantIds || parseApplicableRestaurantIds(deal.applicableRestaurantIds),
  createdAt: deal.createdAt,
  updatedAt: deal.updatedAt,
});
