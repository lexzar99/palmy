export type PublicDeal = {
  id: string;
  title: string;
  description?: string | null;
  badgeText?: string | null;
  dealType: "PERCENTAGE" | "FIXED" | "MIN_ORDER" | "COMBO" | "BOGO_CATEGORY";
  triggerType: "NONE" | "MIN_ORDER" | "COMBO" | "BOGO_CATEGORY";
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: number;
  minOrder: number;
  comboProductIds: string[];
  comboProductNames: string[];
  isActive: boolean;
  showOnSite: boolean;
  popupEnabled: boolean;
  maxUsages?: number | null;
  maxUsesPerCustomer?: number | null;
  usageCount: number;
  validUntil?: string | null;
  // BOGO-fält
  triggerCategoryId?: string | null;
  rewardCategoryId?: string | null;
  bogoTriggerProductIds?: string[];
  bogoRewardProductIds?: string[];
  bogoExcludedExtraIds?: string[];
  triggerQuantity?: number;
  bogoMinOrderAmountOre?: number | null;
};

export type DealProgress = {
  current: number;
  goal: number;
  percentage: number;
  message: string;
};

export const formatDealReward = (deal: PublicDeal) =>
  deal.discountType === "FIXED"
    ? `${deal.discountValue.toFixed(0)} kr rabatt`
    : `${deal.discountValue.toFixed(0)}% rabatt`;

export const getDealProgress = (deal: PublicDeal, subtotal: number, productIds: string[]): DealProgress => {
  if (deal.triggerType === "COMBO" && deal.comboProductIds.length > 0) {
    const productSet = new Set(productIds);
    const current = deal.comboProductIds.filter((id) => productSet.has(id)).length;
    const goal = deal.comboProductIds.length;
    return {
      current,
      goal,
      percentage: goal === 0 ? 100 : Math.min((current / goal) * 100, 100),
      message: current >= goal ? "Combon är klar" : `${goal - current} vara kvar till dealen`,
    };
  }

  if (deal.minOrder > 0) {
    const missing = Math.max(deal.minOrder - subtotal, 0);
    return {
      current: subtotal,
      goal: deal.minOrder,
      percentage: deal.minOrder === 0 ? 100 : Math.min((subtotal / deal.minOrder) * 100, 100),
      message: missing > 0 ? `${missing.toFixed(0)} kr kvar till dealen` : "Dealen är aktiv",
    };
  }

  return {
    current: 1,
    goal: 1,
    percentage: 100,
    message: "Dealen är aktiv",
  };
};

export const evaluateDeal = (deal: PublicDeal, subtotal: number, productIds: string[]) => {
  const progress = getDealProgress(deal, subtotal, productIds);
  const productSet = new Set(productIds);

  const comboReady =
    deal.triggerType !== "COMBO" ||
    deal.comboProductIds.length === 0 ||
    deal.comboProductIds.every((id) => productSet.has(id));

  const minOrderReady = subtotal >= (deal.minOrder || 0);
  const eligible = comboReady && minOrderReady;

  const discountAmount = eligible
    ? deal.discountType === "FIXED"
      ? Math.min(deal.discountValue, subtotal)
      : Math.round(subtotal * deal.discountValue) / 100
    : 0;

  return {
    eligible,
    discountAmount,
    progress,
  };
};

export const pickBestDeal = (deals: PublicDeal[], subtotal: number, productIds: string[]) => {
  return deals.reduce<{ deal: PublicDeal | null; discountAmount: number }>((best, deal) => {
    const evaluation = evaluateDeal(deal, subtotal, productIds);
    if (evaluation.discountAmount > best.discountAmount) {
      return { deal, discountAmount: evaluation.discountAmount };
    }
    if (!best.deal && deal.popupEnabled) {
      return { deal, discountAmount: evaluation.discountAmount };
    }
    return best;
  }, { deal: null, discountAmount: 0 });
};
