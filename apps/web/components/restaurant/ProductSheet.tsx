"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { X, Plus, Minus, Check } from "lucide-react";
import { useCartStore, type BogoChoice } from "@/store/cartStore";
import ConfirmModal from "@/components/ConfirmModal";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { trackMetaAddToCart } from "@/lib/metaEvents";
import { useToast } from "@/components/Toast";
import { useTranslation } from "@/lib/i18n/LocaleProvider";
import { trackJourney } from "@/lib/journey";
import PlainImage from "./PlainImage";
import "./restaurant.css";

/**
 * ProductSheet — produktmodalen i ve-designen.
 *
 * Samma logik som components/ProductModal.tsx (tillvalsgrupper, radio/
 * checkbox/antal, BOX_IMAGE-kort, validering, BOGO-gratisvara, byte av
 * restaurang, toast + kundresa) men med ny form: ett iOS-liknande
 * bottenark med draghandtag, grupperade vita kort, svart CTA.
 */
interface Props {
  product: any;
  restaurantId: string;
  restaurantSlug?: string;
  onClose: () => void;
  editCartItemId?: string;
  initialQuantity?: number;
  initialExtras?: any[];
  initialNote?: string;
  bogoFreeFromDealId?: string;
  bogoDealTitle?: string;
  bogoRewardCategoryName?: string | null;
  bogoExcludedExtraIds?: string[];
}

const SPRING = { type: "spring", stiffness: 380, damping: 38, mass: 0.9 } as const;

export default function ProductSheet({
  product, restaurantId, restaurantSlug, onClose, editCartItemId, initialQuantity, initialExtras, initialNote,
  bogoFreeFromDealId, bogoDealTitle, bogoRewardCategoryName, bogoExcludedExtraIds,
}: Props) {
  const { t } = useTranslation();
  const addItem = useCartStore((s) => s.addItem);
  const updateItem = useCartStore((s) => s.updateItem);
  const setBogoChoice = useCartStore((s) => s.setBogoChoice);
  const currentCartRestaurantId = useCartStore((s) => s.restaurantId);
  const cartItemsCount = useCartStore((s) => s.items.length);
  const { toast } = useToast();
  const modalRef = useRef<HTMLDivElement>(null);
  const groupRefs = useRef<Record<string, HTMLElement | null>>({});
  useFocusTrap(modalRef, true);

  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (editCartItemId) return;
    trackJourney("PRODUCT_VIEWED", {
      restaurantId,
      productId: product?.id,
      meta: { name: product?.name, price: product?.price },
    });
  }, [product?.id, product?.name, product?.price, restaurantId, editCartItemId]);

  const [quantity, setQuantity] = useState(initialQuantity ?? 1);
  const [selectedExtras, setSelectedExtras] = useState<any[]>([]);
  const [note, setNote] = useState(initialNote ?? "");
  const [imgFailed, setImgFailed] = useState(false);
  const hasImage = typeof product.imageUrl === "string" && product.imageUrl.trim() !== "" && !imgFailed;
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [selectionErrorGroupId, setSelectionErrorGroupId] = useState<string | null>(null);
  const clearSelectionError = () => { setSelectionError(null); setSelectionErrorGroupId(null); };
  const showSelectionError = (message: string, groupId: string) => {
    setSelectionError(message);
    setSelectionErrorGroupId(groupId);
    window.requestAnimationFrame(() => {
      groupRefs.current[groupId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroupExpanded = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  };
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const excludedExtraIdSet = bogoFreeFromDealId && bogoExcludedExtraIds ? new Set(bogoExcludedExtraIds) : null;
  const filteredExtraGroups: any[] = excludedExtraIdSet && excludedExtraIdSet.size > 0
    ? (product.extraGroups ?? [])
        .map((group: any) => ({ ...group, extras: (group.extras ?? []).filter((extra: any) => !excludedExtraIdSet.has(extra.id)) }))
        .filter((group: any) => group.extras.length > 0 || group.required)
    : (product.extraGroups ?? []);

  useEffect(() => {
    const prevHtml = document.documentElement.style.overflowY;
    const prevBody = document.body.style.overflow;
    document.documentElement.style.overflowY = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflowY = prevHtml;
      document.body.style.overflow = prevBody;
    };
  }, []);

  useEffect(() => {
    if (initialExtras && initialExtras.length > 0) { setSelectedExtras(initialExtras); return; }
    const defaults: any[] = [];
    filteredExtraGroups?.forEach((group: any) => {
      group.extras.forEach((extra: any) => {
        if (extra.isDefault) {
          defaults.push({ groupId: group.id, groupName: group.name, extraId: extra.id, name: extra.name, price: extra.priceAddon, quantity: 1 });
        }
      });
    });
    setSelectedExtras(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, bogoFreeFromDealId]);

  const handleToggleExtra = (group: any, extra: any) => {
    clearSelectionError();
    const isSelected = selectedExtras.some((e) => e.extraId === extra.id);
    if (group.type === "RADIO") {
      setSelectedExtras((prev) => [
        ...prev.filter((e) => e.groupId !== group.id),
        { groupId: group.id, groupName: group.name, extraId: extra.id, name: extra.name, price: extra.priceAddon },
      ]);
      return;
    }
    if (isSelected) {
      setSelectedExtras((prev) => prev.filter((e) => e.extraId !== extra.id));
    } else {
      const countInGroup = selectedExtras.filter((e) => e.groupId === group.id).length;
      if (countInGroup < (group.maxSelections || 99)) {
        setSelectedExtras((prev) => [...prev, { groupId: group.id, groupName: group.name, extraId: extra.id, name: extra.name, price: extra.priceAddon }]);
      }
    }
  };

  const groupSelectedCount = (group: any) =>
    selectedExtras.filter((e) => e.groupId === group.id).reduce((n, e) => n + (group.allowQuantity ? (e.quantity ?? 1) : 1), 0);
  const getQty = (extraId: string) => selectedExtras.find((e) => e.extraId === extraId)?.quantity ?? 0;
  const setExtraQty = (group: any, extra: any, delta: number) => {
    clearSelectionError();
    setSelectedExtras((prev) => {
      const cur = prev.find((e) => e.extraId === extra.id)?.quantity ?? 0;
      const otherTotal = prev.filter((e) => e.groupId === group.id && e.extraId !== extra.id).reduce((n, e) => n + (e.quantity ?? 1), 0);
      let next = cur + delta;
      if (next < 0) next = 0;
      const max = group.maxSelections || 99;
      if (otherTotal + next > max) next = Math.max(0, max - otherTotal);
      const without = prev.filter((e) => e.extraId !== extra.id);
      if (next <= 0) return without;
      return [...without, { groupId: group.id, groupName: group.name, extraId: extra.id, name: extra.name, price: extra.priceAddon, quantity: next }];
    });
  };

  const Stepper = ({ value, onDec, onInc, decDisabled, small }: { value: number; onDec: () => void; onInc: () => void; decDisabled?: boolean; small?: boolean }) => (
    <div
      className={`flex items-center rounded-full select-none shrink-0 ${small ? "h-8" : "h-11"}`}
      style={{ backgroundColor: "var(--ve-fill)" }}
    >
      <button
        type="button"
        aria-label={t("product.decrease")}
        onClick={(e) => { e.stopPropagation(); onDec(); }}
        disabled={decDisabled}
        className={`${small ? "w-8 h-8" : "w-11 h-11"} grid place-items-center rounded-full transition-opacity disabled:opacity-30 active:opacity-60`}
        style={{ color: "var(--ve-ink)" }}
      >
        <Minus size={small ? 13 : 16} strokeWidth={2.4} />
      </button>
      <span className={`ve-tabular text-center font-semibold ${small ? "min-w-[18px] text-[14px]" : "min-w-[22px] text-[16px]"}`} style={{ color: "var(--ve-ink)" }}>
        {value}
      </span>
      <button
        type="button"
        aria-label={t("product.increase")}
        onClick={(e) => { e.stopPropagation(); onInc(); }}
        className={`${small ? "w-8 h-8" : "w-11 h-11"} grid place-items-center rounded-full transition-opacity active:opacity-60`}
        style={{ color: "var(--ve-ink)" }}
      >
        <Plus size={small ? 13 : 16} strokeWidth={2.4} />
      </button>
    </div>
  );

  const effectiveBasePrice = (() => {
    if (bogoFreeFromDealId) return 0;
    if (typeof product.salePrice === "number" && product.salePrice > 0 && product.salePrice < product.price) return product.salePrice;
    if (product.discountActive) {
      if (typeof product.discountPrice === "number" && product.discountPrice > 0) return product.discountPrice;
      if (typeof product.discountPercent === "number" && product.discountPercent > 0) {
        return Math.max(0, product.price - product.price * (product.discountPercent / 100));
      }
    }
    return product.price;
  })();

  const extrasPrice = selectedExtras.reduce((sum, e) => sum + e.price * (e.quantity ?? 1), 0);
  const totalPrice = (effectiveBasePrice + extrasPrice) * quantity;
  const hasDiscount = effectiveBasePrice < product.price;
  const discountPct = hasDiscount && product.price > 0 ? Math.round((1 - effectiveBasePrice / product.price) * 100) : 0;

  const handleAddToCart = () => {
    for (const group of filteredExtraGroups || []) {
      const selectedInGroup = selectedExtras.filter((extra) => extra.groupId === group.id);
      const cnt = group.allowQuantity
        ? selectedInGroup.reduce((n: number, e: any) => n + (e.quantity ?? 1), 0)
        : selectedInGroup.length;
      if (group.required && cnt === 0) {
        if (group.extras.length === 0) continue;
        showSelectionError(t("product.error.pickOne", { group: group.name.toLowerCase() }), group.id);
        return;
      }
      if (cnt < (group.minSelections || 0) && group.extras.length > 0) {
        showSelectionError(t("product.error.minSelections", { group: group.name, n: group.minSelections }), group.id);
        return;
      }
      if (cnt > (group.maxSelections || 99)) {
        showSelectionError(t("product.error.maxSelections", { group: group.name, n: group.maxSelections }), group.id);
        return;
      }
    }
    if (cartItemsCount > 0 && currentCartRestaurantId !== restaurantId) { setShowConfirmModal(true); return; }
    performAddToCart();
  };

  const performAddToCart = () => {
    if (editCartItemId) {
      updateItem(editCartItemId, {
        productId: product.id, restaurantId, name: product.name,
        price: effectiveBasePrice, originalPrice: product.price,
        catalogDiscountApplied: !bogoFreeFromDealId && hasDiscount,
        quantity, extras: selectedExtras, note: note.trim() || undefined,
      });
      toast(t("product.toast.updated", { name: product.name }), "success");
    } else {
      addItem({
        productId: product.id, restaurantId, restaurantSlug, name: product.name,
        imageUrl: product.imageUrl ?? undefined,
        price: effectiveBasePrice, originalPrice: product.price,
        catalogDiscountApplied: !bogoFreeFromDealId && hasDiscount,
        quantity, extras: selectedExtras, note: note.trim() || undefined,
        ...(bogoFreeFromDealId ? { bogoFreeFromDealId } : {}),
      });
      trackMetaAddToCart({ value: bogoFreeFromDealId ? 0 : effectiveBasePrice * quantity, contentName: product.name });
      if (bogoFreeFromDealId) {
        const choice: BogoChoice = {
          dealId: bogoFreeFromDealId, dealTitle: bogoDealTitle ?? "", rewardCategoryName: bogoRewardCategoryName ?? null,
          product: { id: product.id, name: product.name, price: product.price, imageUrl: product.imageUrl ?? null },
        };
        setBogoChoice(choice);
        toast(t("product.toast.freeAdded", { name: product.name }), "success");
      } else {
        toast(t("product.toast.added", { name: product.name }), "success");
      }
    }
    onClose();
  };

  if (!mounted) return null;

  const sortedGroups = [...filteredExtraGroups].sort((a, b) => (a.position || 0) - (b.position || 0));
  const diet = [
    product.isVegan && t("menu.diet.vegan"),
    product.isVegetarian && !product.isVegan && t("menu.diet.vegetarian"),
    product.isGlutenFree && t("menu.diet.glutenFree"),
  ].filter(Boolean) as string[];

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="ve-root fixed inset-0 z-[1400] flex items-end sm:items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.42)" }}
      onClick={onClose}
    >
      <motion.div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("product.modalAriaLabel", { name: product.name })}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={SPRING}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-[560px] flex flex-col overflow-hidden rounded-t-[26px] sm:rounded-[26px]"
        style={{
          height: "min(94dvh, 100%)",
          maxHeight: "94dvh",
          backgroundColor: "var(--ve-bg)",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.18)",
        }}
      >
        {/* Draghandtag + stäng */}
        <div className="absolute top-0 inset-x-0 z-20 flex justify-center pt-2.5 pointer-events-none">
          <span className="ve-sheet-handle" style={hasImage ? { background: "rgba(255,255,255,0.75)" } : undefined} />
        </div>
        <button
          onClick={onClose}
          aria-label={t("common.close")}
          className="ve-glass-btn absolute top-3.5 right-3.5 z-20 w-9 h-9 rounded-full grid place-items-center"
        >
          <X size={17} strokeWidth={2.4} />
        </button>

        {/* Skrollbar yta */}
        <div className="flex-1 overflow-y-auto ve-no-scrollbar" style={{ overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" as any }}>
          {hasImage ? (
            <div className="relative w-full overflow-hidden" style={{ aspectRatio: "16 / 10", backgroundColor: "#EBEBEE" }}>
              <PlainImage
                src={product.imageUrl}
                alt={product.name}
                width={1080}
                quality={82}
                eager
                className="absolute inset-0 w-full h-full object-cover"
                onFail={() => setImgFailed(true)}
              />
              <div className="absolute inset-x-0 bottom-0 h-16" style={{ background: "linear-gradient(to top, var(--ve-bg), transparent)" }} />
            </div>
          ) : (
            <div className="h-12" />
          )}

          {/* Titel + pris */}
          <div className="px-5 pt-1 pb-5">
            {bogoFreeFromDealId ? (
              <span className="inline-block mb-2 rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ backgroundColor: "var(--ve-accent-soft)", color: "var(--ve-accent)" }}>
                {t("product.freeVia", { deal: bogoDealTitle || "BOGO" })}
              </span>
            ) : null}
            <h2 className="m-0 text-[24px] font-semibold leading-[1.15]" style={{ letterSpacing: "-0.022em", color: "var(--ve-ink)" }}>
              {product.name}
            </h2>
            <div className="ve-tabular mt-2 flex items-baseline gap-2.5 flex-wrap">
              <span className="text-[19px] font-semibold" style={{ color: "var(--ve-ink)" }}>
                {effectiveBasePrice} kr
              </span>
              {hasDiscount && (
                <span className="text-[15px] line-through" style={{ color: "var(--ve-ink-3)" }}>{product.price} kr</span>
              )}
              {discountPct > 0 && (
                <span className="text-[12px] font-semibold rounded-full px-2 py-0.5" style={{ backgroundColor: "var(--ve-accent-soft)", color: "var(--ve-accent)" }}>
                  −{discountPct} %
                </span>
              )}
            </div>
            {product.description ? (
              <p className="m-0 mt-3 text-[15px] leading-[1.45] whitespace-pre-line" style={{ color: "var(--ve-ink-2)" }}>
                {product.description}
              </p>
            ) : null}
            {diet.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {diet.map((d) => (
                  <span key={d} className="text-[12px] font-medium rounded-full px-2.5 py-1" style={{ backgroundColor: "var(--ve-success-soft)", color: "var(--ve-success)" }}>{d}</span>
                ))}
              </div>
            )}
          </div>

          {selectionError && (
            <div role="alert" className="mx-5 mb-4 rounded-2xl px-4 py-3 text-[13.5px]" style={{ backgroundColor: "var(--ve-danger-soft)", color: "var(--ve-danger)" }}>
              <p className="m-0 font-semibold">{t("product.selectionErrorTitle")}</p>
              <p className="m-0 mt-0.5 font-medium">{selectionError}</p>
            </div>
          )}

          {/* Tillvalsgrupper */}
          <div className="px-4 flex flex-col gap-5">
            {sortedGroups.map((group) => {
              const isRadio = group.type === "RADIO";
              const isBox = group.displayStyle === "BOX_IMAGE";
              const isThreeCardGroup = isBox && group.extras.length === 3;
              const groupHasImages = isBox && group.extras.some((e: any) => Boolean(e.imageUrl));
              const isQty = !!group.allowQuantity;
              const selectionCount = groupSelectedCount(group);
              const isCollapsible = !group.required && !isBox && group.extras.length > 4;
              const isExpanded = expandedGroups.has(group.id);
              const visibleExtras = isCollapsible && !isExpanded ? group.extras.slice(0, 4) : group.extras;
              const hiddenCount = group.extras.length - 4;
              const hasError = selectionErrorGroupId === group.id;
              return (
                <section key={group.id} ref={(el) => { groupRefs.current[group.id] = el; }} className={hasError ? "scroll-mt-24" : ""}>
                  <div className="flex items-baseline gap-2 px-1 mb-2.5">
                    <h3 className="m-0 text-[17px] font-semibold" style={{ letterSpacing: "-0.015em", color: "var(--ve-ink)" }}>{group.name}</h3>
                    <span
                      className="text-[11.5px] font-semibold rounded-full px-2 py-[3px]"
                      style={group.required
                        ? { backgroundColor: hasError ? "var(--ve-danger-soft)" : "var(--ve-fill)", color: hasError ? "var(--ve-danger)" : "var(--ve-ink-2)" }
                        : { color: "var(--ve-ink-3)" }}
                    >
                      {group.required ? t("product.required") : t("product.optional")}
                    </span>
                    {(group.maxSelections > 1 || isQty) && (
                      <span className="ve-tabular ml-auto text-[12.5px] font-medium" style={{ color: "var(--ve-ink-3)" }}>
                        {selectionCount} / {group.maxSelections}
                      </span>
                    )}
                  </div>

                  {isBox ? (
                    <div className={isThreeCardGroup ? "grid grid-cols-3 gap-2.5" : "grid grid-cols-2 gap-2.5 sm:grid-cols-3"}>
                      {group.extras.map((extra: any) => {
                        const isSelected = selectedExtras.some((e) => e.extraId === extra.id);
                        return (
                          <div
                            key={extra.id}
                            className="ve-press relative rounded-[18px] overflow-hidden flex flex-col"
                            style={{
                              backgroundColor: "var(--ve-card)",
                              boxShadow: isSelected
                                ? "inset 0 0 0 2px var(--ve-ink), var(--ve-shadow-card)"
                                : "inset 0 0 0 0.5px var(--ve-line), var(--ve-shadow-card)",
                            }}
                          >
                            {isSelected && (
                              <span className="absolute top-2 right-2 w-5 h-5 rounded-full grid place-items-center" style={{ backgroundColor: "var(--ve-ink)" }}>
                                <Check size={12} strokeWidth={3} style={{ color: "#fff" }} />
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => { if (!isQty) handleToggleExtra(group, extra); else setExtraQty(group, extra, getQty(extra.id) > 0 ? 0 : 1 - getQty(extra.id)); }}
                              className={`flex flex-1 flex-col items-center gap-1 px-2 text-center ${groupHasImages ? "pt-4 pb-3" : "pt-3.5 pb-3 justify-center"}`}
                            >
                              {groupHasImages ? (
                                extra.imageUrl ? (
                                  <PlainImage src={extra.imageUrl} alt="" width={128} className="h-12 w-12 object-contain" fallback={<span aria-hidden className="h-12 w-12" />} />
                                ) : (
                                  <span aria-hidden className="h-12 w-12 shrink-0" />
                                )
                              ) : null}
                              <span className={`line-clamp-2 w-full break-words text-[13px] font-semibold leading-tight ${groupHasImages ? "min-h-[2.2rem]" : ""}`} style={{ color: "var(--ve-ink)" }}>{extra.name}</span>
                              <span className="ve-tabular text-[12px] font-medium" style={{ color: "var(--ve-ink-3)" }}>
                                {extra.priceAddon > 0 ? `+${extra.priceAddon} kr` : "Ingår"}
                              </span>
                            </button>
                            {isQty && (
                              <div className="flex items-center justify-center pb-3">
                                <Stepper small value={getQty(extra.id)} decDisabled={getQty(extra.id) <= 0} onDec={() => setExtraQty(group, extra, -1)} onInc={() => setExtraQty(group, extra, +1)} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="ve-card overflow-hidden" style={hasError ? { boxShadow: "inset 0 0 0 1.5px var(--ve-danger), var(--ve-shadow-card)" } : undefined}>
                      {visibleExtras.map((extra: any, idx: number) => {
                        const isSelected = selectedExtras.some((e) => e.extraId === extra.id);
                        const isLast = idx === visibleExtras.length - 1 && !isCollapsible;
                        const inner = (
                          <>
                            <span className="flex items-center gap-3.5 min-w-0">
                              {isQty ? null : isRadio ? (
                                <span aria-hidden className="w-[22px] h-[22px] rounded-full shrink-0 grid place-items-center transition-colors"
                                  style={isSelected ? { backgroundColor: "var(--ve-ink)" } : { boxShadow: "inset 0 0 0 1.5px var(--ve-line-2)" }}>
                                  {isSelected && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#fff" }} />}
                                </span>
                              ) : (
                                <span aria-hidden className="w-[22px] h-[22px] rounded-[7px] shrink-0 grid place-items-center transition-colors"
                                  style={isSelected ? { backgroundColor: "var(--ve-ink)" } : { boxShadow: "inset 0 0 0 1.5px var(--ve-line-2)" }}>
                                  {isSelected && <Check size={13} strokeWidth={3} style={{ color: "#fff" }} />}
                                </span>
                              )}
                              <span className="text-[16px] font-medium truncate" style={{ color: "var(--ve-ink)", letterSpacing: "-0.01em" }}>{extra.name}</span>
                            </span>
                            <span className="flex items-center gap-3 shrink-0">
                              {extra.priceAddon > 0 && (
                                <span className="ve-tabular text-[14px]" style={{ color: "var(--ve-ink-3)" }}>+{extra.priceAddon} kr</span>
                              )}
                              {isQty && <Stepper small value={getQty(extra.id)} decDisabled={getQty(extra.id) <= 0} onDec={() => setExtraQty(group, extra, -1)} onInc={() => setExtraQty(group, extra, +1)} />}
                            </span>
                          </>
                        );
                        const rowStyle = { boxShadow: isLast ? undefined : "inset 0 -0.5px 0 var(--ve-line)" };
                        return isQty ? (
                          <div key={extra.id} className="mx-4 flex items-center justify-between gap-3 py-3" style={rowStyle}>{inner}</div>
                        ) : (
                          <button key={extra.id} type="button" onClick={() => handleToggleExtra(group, extra)} className="ve-row-press w-full text-left">
                            <span className="mx-4 flex items-center justify-between gap-3 py-3.5" style={rowStyle}>{inner}</span>
                          </button>
                        );
                      })}
                      {isCollapsible && (
                        <button type="button" onClick={() => toggleGroupExpanded(group.id)} className="ve-row-press w-full text-left px-4 py-3.5 text-[15px] font-semibold" style={{ color: "var(--ve-accent)" }}>
                          {isExpanded ? t("product.showLess") : t("product.showMore", { n: hiddenCount })}
                        </button>
                      )}
                    </div>
                  )}
                </section>
              );
            })}

            {/* Önskemål */}
            <section>
              <h3 className="m-0 px-1 mb-2.5 text-[17px] font-semibold" style={{ letterSpacing: "-0.015em", color: "var(--ve-ink)" }}>{t("product.requests")}</h3>
              <div className="ve-card overflow-hidden">
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("product.requestsPlaceholder")}
                  className="ve-input w-full px-4 py-3.5 outline-none resize-none bg-transparent"
                  style={{ color: "var(--ve-ink)", minHeight: "64px" }}
                />
              </div>
            </section>
          </div>
          <div className="h-8" />
        </div>

        {/* Footer */}
        <div
          className="ve-glass shrink-0 px-4 pt-3 flex items-center gap-3"
          style={{ boxShadow: "inset 0 0.5px 0 var(--ve-line)", paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}
        >
          <Stepper value={quantity} decDisabled={quantity <= 1} onDec={() => setQuantity(Math.max(1, quantity - 1))} onInc={() => setQuantity(quantity + 1)} />
          <button
            onClick={handleAddToCart}
            className="ve-press flex-1 h-[52px] rounded-full px-6 flex items-center justify-between gap-3"
            style={{ backgroundColor: "var(--ve-cta)", color: "var(--ve-cta-ink)" }}
          >
            <span className="text-[16px] font-semibold truncate" style={{ letterSpacing: "-0.01em" }}>
              {editCartItemId ? t("common.save") : bogoFreeFromDealId ? t("product.pickAsFree") : t("product.addToCart")}
            </span>
            <span className="ve-tabular text-[16px] font-semibold shrink-0">
              {bogoFreeFromDealId
                ? (extrasPrice > 0 ? t("product.extrasPrice", { price: extrasPrice }) : t("product.free"))
                : `${totalPrice} kr`}
            </span>
          </button>
        </div>

        <ConfirmModal
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          onConfirm={performAddToCart}
          title={t("product.switchRestaurant.title")}
          message={t("product.switchRestaurant.message")}
          confirmText={t("product.switchRestaurant.confirm")}
          cancelText={t("product.switchRestaurant.cancel")}
        />
      </motion.div>
    </motion.div>,
    document.body,
  );
}
