type DealLike = {
  id: string;
  title: string;
  description: string | null;
  badgeText: string | null;
  triggerType: string;
  discountType: string;
  discountValue: number;
  minOrder: number;
  comboProductIds: string;
  isActive: boolean;
  showOnSite: boolean;
  popupEnabled: boolean;
  maxUsages: number | null;
  maxUsesPerCustomer: number | null;
  usageCount: number;
  validFrom: Date | null;
  validUntil: Date | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type DealEvaluationContext = {
  subtotalOre: number;
  productIds: string[];
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

export const getDealKind = (deal: Pick<DealLike, 'triggerType' | 'discountType'>) => {
  if (deal.triggerType === 'COMBO') return 'COMBO';
  if (deal.triggerType === 'MIN_ORDER') return 'MIN_ORDER';
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

export const evaluateDeal = (deal: DealLike, context: DealEvaluationContext) => {
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

export const formatDealForClient = (
  deal: DealLike,
  extra?: {
    comboProductNames?: string[];
  },
) => ({
  id: deal.id,
  title: deal.title,
  description: deal.description,
  badgeText: deal.badgeText,
  dealType: getDealKind(deal),
  triggerType: deal.triggerType,
  discountType: deal.discountType,
  discountValue: deal.discountType === 'FIXED' ? oreToKr(deal.discountValue) : deal.discountValue,
  minOrder: oreToKr(deal.minOrder),
  comboProductIds: parseDealProductIds(deal.comboProductIds),
  comboProductNames: extra?.comboProductNames || [],
  isActive: deal.isActive,
  showOnSite: deal.showOnSite,
  popupEnabled: deal.popupEnabled,
  maxUsages: deal.maxUsages,
  maxUsesPerCustomer: deal.maxUsesPerCustomer,
  usageCount: deal.usageCount,
  validFrom: deal.validFrom,
  validUntil: deal.validUntil,
  sortOrder: deal.sortOrder,
  createdAt: deal.createdAt,
  updatedAt: deal.updatedAt,
});
