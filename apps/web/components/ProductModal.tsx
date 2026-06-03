"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { X, Plus, Minus, Check, ShoppingBag, Sparkles, Coins } from "lucide-react";
import { useCartStore, type BogoChoice } from "@/store/cartStore";
import ConfirmModal from "./ConfirmModal";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { useToast } from "./Toast";
import { useTranslation } from "@/lib/i18n/LocaleProvider";
import DpointsBadge from "./DpointsBadge";
import { fetchDpointsMe, type DpointsMe } from "@/lib/dpoints";

interface ProductModalProps {
  product: any;
  restaurantId: string;
  restaurantSlug?: string;
  onClose: () => void;
  /** If set, modal edits an existing cart item instead of adding a new one. */
  editCartItemId?: string;
  initialQuantity?: number;
  initialExtras?: any[];
  initialNote?: string;
  /** BOGO: sätts av BogoPickerModal. Baspriset nollas, extras betalas normalt. */
  bogoFreeFromDealId?: string;
  bogoDealTitle?: string;
  bogoRewardCategoryName?: string | null;
  /** Extras (Extra.id) som admin har blockerat för gratisvaran — filtreras bort innan rendering. */
  bogoExcludedExtraIds?: string[];
}

const ProductModal = ({ product, restaurantId, restaurantSlug, onClose, editCartItemId, initialQuantity, initialExtras, initialNote, bogoFreeFromDealId, bogoDealTitle, bogoRewardCategoryName, bogoExcludedExtraIds }: ProductModalProps) => {
  const { t } = useTranslation();
  const addItem = useCartStore((state) => state.addItem);
  const updateItem = useCartStore((state) => state.updateItem);
  const setBogoChoice = useCartStore((state) => state.setBogoChoice);
  const currentCartRestaurantId = useCartStore((state) => state.restaurantId);
  const cartItemsCount = useCartStore((state) => state.items.length);
  const { toast } = useToast();
  // Focus-trap för a11y (WCAG 2.4.3) — screen reader-användare ska inte
  // kunna tabba ut ur modalen.
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, true);

  // Portal-mount-gate (SSR-säkert) — modalen renderas i document.body så att
  // inga transformerade förfäder (t.ex. sid-animationer) bryter position:fixed.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const [quantity, setQuantity] = useState(initialQuantity ?? 1);
  const [selectedExtras, setSelectedExtras] = useState<any[]>([]);
  const [note, setNote] = useState(initialNote ?? "");
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const buyWithPointsRef = useRef(false);
  const [dpoints, setDpoints] = useState<DpointsMe | null>(null);
  useEffect(() => { fetchDpointsMe().then(setDpoints).catch(() => {}); }, []);

  // För BOGO-gratisvara: ta bort tillval som admin har blockerat på dealen
  // (t.ex. "Familjepizza-storlek" eller "vitlökssås"). Vi filtrerar både på
  // extra-nivå och tar bort hela grupper som blivit tomma OCH inte krävs.
  const excludedExtraIdSet = bogoFreeFromDealId && bogoExcludedExtraIds ? new Set(bogoExcludedExtraIds) : null;
  const filteredExtraGroups = excludedExtraIdSet && excludedExtraIdSet.size > 0
    ? (product.extraGroups ?? [])
        .map((group: any) => ({
          ...group,
          extras: (group.extras ?? []).filter((extra: any) => !excludedExtraIdSet.has(extra.id)),
        }))
        .filter((group: any) => group.extras.length > 0 || group.required)
    : (product.extraGroups ?? []);

  useEffect(() => {
    // Lås bakgrundsskroll medan modalen är öppen. Lås både html och body
    // (body behövs för iOS Safari där enbart html-lås inte räcker).
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
    if (initialExtras && initialExtras.length > 0) {
      setSelectedExtras(initialExtras);
      return;
    }
    const defaults: any[] = [];
    filteredExtraGroups?.forEach((group: any) => {
      group.extras.forEach((extra: any) => {
        if (extra.isDefault) {
          defaults.push({
            groupId: group.id,
            groupName: group.name,
            extraId: extra.id,
            name: extra.name,
            price: extra.priceAddon,
          });
        }
      });
    });
    setSelectedExtras(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, bogoFreeFromDealId]);

  const handleToggleExtra = (group: any, extra: any) => {
    setSelectionError(null);
    const isSelected = selectedExtras.some((e) => e.extraId === extra.id);

    if (group.type === "RADIO") {
      setSelectedExtras((prev) => [
        ...prev.filter((e) => e.groupId !== group.id),
        {
          groupId: group.id,
          groupName: group.name,
          extraId: extra.id,
          name: extra.name,
          price: extra.priceAddon,
        },
      ]);
    } else {
      if (isSelected) {
        setSelectedExtras((prev) => prev.filter((e) => e.extraId !== extra.id));
      } else {
        const countInGroup = selectedExtras.filter((e) => e.groupId === group.id).length;
        if (countInGroup < (group.maxSelections || 99)) {
          setSelectedExtras((prev) => [
            ...prev,
            {
              groupId: group.id,
              groupName: group.name,
              extraId: extra.id,
              name: extra.name,
              price: extra.priceAddon,
            },
          ]);
        }
      }
    }
  };

  // Effektivt pris: använd salePrice/discountPrice om produkten är på deal,
  // annars ordinarie pris. Detta matchar exakt det pris som visas i menyn
  // så modalen och listan aldrig divergerar (tidigare bug: list visade
  // discount men modalen ordinarie pris).
  //
  // Prioritet:
  //   1. product.salePrice (från resolveDisplayPromotionForProduct backend-side)
  //   2. product.discountPrice (legacy fixed-price-fält)
  //   3. product.price * (1 - discountPercent/100) om discountActive
  //   4. product.price (ingen rabatt)
  const effectiveBasePrice = (() => {
    // BOGO-gratisvara — baspris är alltid 0 (extras betalas normalt)
    if (bogoFreeFromDealId) return 0;
    if (typeof product.salePrice === "number" && product.salePrice > 0 && product.salePrice < product.price) {
      return product.salePrice;
    }
    if (product.discountActive) {
      if (typeof product.discountPrice === "number" && product.discountPrice > 0) return product.discountPrice;
      if (typeof product.discountPercent === "number" && product.discountPercent > 0) {
        return Math.max(0, product.price - product.price * (product.discountPercent / 100));
      }
    }
    return product.price;
  })();

  const extrasPrice = selectedExtras.reduce((sum, e) => sum + e.price, 0);
  const totalPrice = (effectiveBasePrice + extrasPrice) * quantity;
  // Dpoints: kostnad i poäng för hela raden + om kunden kan betala med poäng.
  const dpointsCost = Math.round(totalPrice * (dpoints?.valuePerKr ?? 10));
  const canBuyWithPoints = !!dpoints?.enabled && !editCartItemId && !bogoFreeFromDealId && dpointsCost > 0 && (dpoints?.balance ?? 0) >= dpointsCost;
  const hasDiscount = effectiveBasePrice < product.price;

  const handleAddToCart = () => {
    for (const group of filteredExtraGroups || []) {
      const selectedInGroup = selectedExtras.filter((extra) => extra.groupId === group.id);
      if (group.required && selectedInGroup.length === 0) {
        // En obligatorisk grupp kan ha ALLA sina extras blockerade av BOGO.
        // Då kan kunden inte uppfylla kravet — vi hoppar över valideringen
        // för att inte fastna i ett ogiltigt tillstånd.
        if (group.extras.length === 0) continue;
        setSelectionError(t("product.error.pickOne", { group: group.name.toLowerCase() }));
        return;
      }
      if (selectedInGroup.length < (group.minSelections || 0) && group.extras.length > 0) {
        setSelectionError(t("product.error.minSelections", { group: group.name, n: group.minSelections }));
        return;
      }
      if (selectedInGroup.length > (group.maxSelections || 99)) {
        setSelectionError(t("product.error.maxSelections", { group: group.name, n: group.maxSelections }));
        return;
      }
    }
    if (cartItemsCount > 0 && currentCartRestaurantId !== restaurantId) {
       setShowConfirmModal(true);
       return;
    }
    performAddToCart();
  };

  const performAddToCart = () => {
    if (editCartItemId) {
      updateItem(editCartItemId, {
        productId: product.id,
        restaurantId,
        name: product.name,
        price: effectiveBasePrice,
        quantity,
        extras: selectedExtras,
        note: note.trim() || undefined,
      });
      toast(t("product.toast.updated", { name: product.name }), "success");
    } else if (buyWithPointsRef.current) {
      // Köp med Dpoints: lägg raden som gratis (price 0 + extras 0) och flagga
      // den. Backend nollar raden + drar poäng vid betalning. Priset 0 håller
      // klient- och server-totalen i synk (annars Stripe-beloppsmismatch).
      buyWithPointsRef.current = false;
      addItem({
        productId: product.id,
        restaurantId,
        restaurantSlug,
        name: product.name,
        imageUrl: product.imageUrl ?? undefined,
        price: 0,
        quantity,
        extras: selectedExtras.map((e) => ({ ...e, price: 0 })),
        note: note.trim() || undefined,
        paidWithPoints: true,
      });
      toast(t("product.toast.added", { name: product.name }), "success");
    } else {
      addItem({
        productId: product.id,
        restaurantId,
        restaurantSlug,
        name: product.name,
        imageUrl: product.imageUrl ?? undefined,
        price: effectiveBasePrice,
        quantity,
        extras: selectedExtras,
        note: note.trim() || undefined,
        ...(bogoFreeFromDealId ? { bogoFreeFromDealId } : {}),
      });
      if (bogoFreeFromDealId) {
        const choice: BogoChoice = {
          dealId: bogoFreeFromDealId,
          dealTitle: bogoDealTitle ?? "",
          rewardCategoryName: bogoRewardCategoryName ?? null,
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

  const hasImage = Boolean(product.imageUrl);

  if (!mounted) return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-zinc-900/50 backdrop-blur-sm p-0 sm:p-6"
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
        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        className="w-full max-w-md sm:rounded-3xl rounded-t-3xl overflow-hidden relative flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: "var(--bg-primary, #fff8ef)" }}
      >

        {/* Sticky top-overlay — X + favorit-knapp flyter alltid över hero */}
        <div className="absolute top-5 left-5 right-5 z-30 flex justify-between pointer-events-none">
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="w-10 h-10 rounded-full bg-white/95 backdrop-blur-md flex items-center justify-center text-zinc-800 transition-transform active:scale-95 shadow-sm pointer-events-auto"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
          <div className="pointer-events-none" />
        </div>

        {/* Scrollbar yta — hero + body + extras scrollar tillsammans */}
        <div className="flex-1 overflow-y-auto no-scrollbar" style={{ overscrollBehavior: "contain" }}>

          {/* Hero (skrollar med innehållet). Bild ger 260px hero; utan bild
              krymper hero till bara drag-handle + lite spacing — namnet visas
              istället stort i titel-blocket nedanför. */}
          {hasImage ? (
            <div
              className="relative w-full"
              style={{
                height: "260px",
                backgroundImage: `url("${product.imageUrl}")`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-white/70" />
              {hasDiscount && (
                <div className="absolute top-5 left-1/2 -translate-x-1/2 bg-gold-500 text-zinc-900 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full">
                  −{Math.round((1 - effectiveBasePrice / product.price) * 100)}%
                </div>
              )}
            </div>
          ) : (
            <div className="relative w-full" style={{ height: "30px" }}>
              <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full" style={{ backgroundColor: "rgba(28,28,30,0.18)" }} />
            </div>
          )}

          {/* Innehåll */}
          <div className="px-5 pt-5 pb-4">
            {/* Speciality/BOGO tag */}
            {bogoFreeFromDealId ? (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700 text-[9px] font-black uppercase tracking-widest mb-3">
                🎁 {t("product.freeVia", { deal: bogoDealTitle || "BOGO" })}
              </div>
            ) : null}

            {/* Titel — större när bild saknas så hero-luckan inte känns tom. */}
            <h2
              className="font-black m-0"
              style={{
                fontSize: hasImage ? "26px" : "34px",
                letterSpacing: "-0.7px",
                lineHeight: 1.05,
                color: "var(--text-primary, #1c1c1e)",
                marginTop: hasImage ? "0" : "8px",
              }}
            >
              {product.name}
            </h2>

            {/* Beskrivning */}
            {product.description ? (
              <p
                className="m-0 mt-2.5"
                style={{ fontSize: "14px", lineHeight: 1.5, color: "var(--text-secondary, #6b6b6b)", fontWeight: 500 }}
              >
                {product.description}
              </p>
            ) : null}

            {/* Pris-rad */}
            <div className="mt-3.5 flex items-baseline gap-2.5">
              <span style={{ fontSize: "22px", fontWeight: 900, letterSpacing: "-0.4px", color: "var(--text-primary, #1c1c1e)" }}>
                {effectiveBasePrice}
                <small style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-tertiary, #9a9a9a)", marginLeft: "3px" }}>KR</small>
              </span>
              {hasDiscount && (
                <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-tertiary, #9a9a9a)", textDecoration: "line-through" }}>
                  {product.price}
                </span>
              )}
              {/* Dpoints — "kostar X poäng" (göms om Dpoints är av) */}
              <DpointsBadge priceKr={effectiveBasePrice} />
            </div>

            {dpoints?.enabled && (dpoints?.balance ?? 0) > 0 && (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ backgroundColor: "#1c1c1e" }}>
                <Coins size={13} style={{ color: "#F4D086" }} />
                <span className="text-[12px] font-black" style={{ color: "#F4D086" }}>Du har {dpoints.balance} Dpoints</span>
              </div>
            )}

            {/* Dietary-pills */}
            {(product.isVegan || product.isVegetarian || product.isGlutenFree) && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {product.isVegan && (
                  <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full" style={{ backgroundColor: "rgba(34,197,94,0.12)", color: "#16803c" }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "currentColor" }} />
                    Vegan
                  </span>
                )}
                {product.isVegetarian && !product.isVegan && (
                  <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full" style={{ backgroundColor: "rgba(245,158,11,0.12)", color: "#a36711" }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "currentColor" }} />
                    Vegetariskt
                  </span>
                )}
                {product.isGlutenFree && (
                  <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full" style={{ backgroundColor: "rgba(56,189,248,0.12)", color: "#036591" }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "currentColor" }} />
                    Glutenfritt
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Extra grupper */}
          <div className="px-5">
            {[...filteredExtraGroups].sort((a, b) => (a.position || 0) - (b.position || 0)).map((group) => {
              const selectionCount = selectedExtras.filter((e) => e.groupId === group.id).length;
              return (
                <section key={group.id} className="mt-6">
                  <div className="flex items-baseline gap-2.5 mb-3">
                    <h3 className="font-black m-0" style={{ fontSize: "17px", letterSpacing: "-0.4px", color: "var(--text-primary, #1c1c1e)" }}>
                      {group.name}
                    </h3>
                    {group.required ? (
                      <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--accent, #c89a3c)" }}>
                        {t("product.required")}
                      </span>
                    ) : (
                      <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: "var(--text-tertiary, #9a9a9a)" }}>
                        {t("product.optional")}
                      </span>
                    )}
                    {group.maxSelections > 1 && (
                      <span className="ml-auto inline-flex text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full" style={{ backgroundColor: "rgba(200,154,60,0.10)", color: "#8a6418" }}>
                        {selectionCount} / {group.maxSelections}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {group.extras.map((extra: any) => {
                      const isSelected = selectedExtras.some((e) => e.extraId === extra.id);
                      return (
                        <button
                          key={extra.id}
                          onClick={() => handleToggleExtra(group, extra)}
                          className="rounded-xl px-3 py-3 flex items-center justify-between gap-2.5 transition-all active:scale-[0.98] text-left"
                          style={{
                            backgroundColor: isSelected ? "rgba(200,154,60,0.08)" : "var(--bg-secondary, #ffffff)",
                            border: `1.5px solid ${isSelected ? "#c89a3c" : "rgba(28,28,30,0.06)"}`,
                            boxShadow: "0 2px 8px rgba(28,28,30,0.04), 0 1px 2px rgba(28,28,30,0.03)",
                          }}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all"
                              style={{
                                backgroundColor: isSelected ? "#c89a3c" : "transparent",
                                border: `2px solid ${isSelected ? "#c89a3c" : "#d4d4d8"}`,
                              }}
                            >
                              {isSelected && <Check size={11} className="text-zinc-900" strokeWidth={4} />}
                            </span>
                            <span className="font-black truncate" style={{ fontSize: "13px", color: "var(--text-primary, #1c1c1e)", letterSpacing: "-0.2px" }}>
                              {extra.name}
                            </span>
                          </div>
                          {extra.priceAddon > 0 && (
                            <span className="font-black flex-shrink-0" style={{ fontSize: "11px", color: "#8a6418" }}>
                              +{extra.priceAddon}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>

          {/* Notes */}
          <div className="px-5 mt-6">
            <h3 className="font-black m-0 mb-2.5" style={{ fontSize: "17px", letterSpacing: "-0.4px", color: "var(--text-primary, #1c1c1e)" }}>
              {t("product.requests")}
            </h3>
            <div
              className="rounded-xl px-3.5 py-3"
              style={{
                backgroundColor: "var(--bg-secondary, #ffffff)",
                border: "1.5px solid rgba(28,28,30,0.06)",
                boxShadow: "0 2px 8px rgba(28,28,30,0.04), 0 1px 2px rgba(28,28,30,0.03)",
              }}
            >
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t("product.requestsPlaceholder")}
                className="w-full bg-transparent border-0 outline-none resize-none placeholder:text-zinc-400"
                style={{ color: "var(--text-primary, #1c1c1e)", fontSize: "13px", fontWeight: 500, minHeight: "50px", fontFamily: "inherit" }}
              />
            </div>
          </div>

          {selectionError && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-5 mt-4 px-3 py-2 rounded-lg text-center"
              style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#c01818", fontSize: "11px", fontWeight: 800 }}
            >
              {selectionError}
            </motion.div>
          )}

          {/* Spacer för sticky footer */}
          <div className="h-6" />
        </div>

        {/* Sticky bottom — kvantitet + lägg till */}
        <div
          className="flex-shrink-0 px-4 pt-3 pb-5 flex items-center gap-2.5"
          style={{ backgroundColor: "var(--bg-primary, #fff8ef)", boxShadow: "0 -8px 24px rgba(28,28,30,0.08)" }}
        >
          <div
            className="flex items-center p-1 rounded-full flex-shrink-0"
            style={{
              backgroundColor: "var(--bg-secondary, #ffffff)",
              boxShadow: "0 2px 8px rgba(28,28,30,0.04), 0 1px 2px rgba(28,28,30,0.03)",
            }}
          >
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-colors active:scale-95"
              style={{ color: "var(--text-primary, #1c1c1e)" }}
              aria-label="Minska"
            >
              <Minus size={18} strokeWidth={3} />
            </button>
            <span className="font-black text-center min-w-[28px]" style={{ fontSize: "15px", color: "var(--text-primary, #1c1c1e)" }}>
              {quantity}
            </span>
            <button
              onClick={() => setQuantity(quantity + 1)}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-colors active:scale-95"
              style={{ color: "var(--text-primary, #1c1c1e)" }}
              aria-label="Öka"
            >
              <Plus size={18} strokeWidth={3} />
            </button>
          </div>

          <button
            onClick={() => { buyWithPointsRef.current = false; handleAddToCart(); }}
            className={`flex-1 rounded-full px-4 py-3.5 flex items-center justify-between gap-3 transition-transform active:scale-[0.98] ${bogoFreeFromDealId ? "bg-emerald-500" : ""}`}
            style={{
              backgroundColor: bogoFreeFromDealId ? undefined : "#c89a3c",
              color: "#1c1c1e",
              boxShadow: bogoFreeFromDealId
                ? "0 6px 18px rgba(16,185,129,0.35)"
                : "0 6px 18px rgba(200,154,60,0.35)",
            }}
          >
            <span className="inline-flex items-center gap-2 font-black" style={{ fontSize: "14px", letterSpacing: "-0.2px" }}>
              <ShoppingBag size={16} strokeWidth={2.5} />
              {editCartItemId ? t("product.saveChanges") : bogoFreeFromDealId ? t("product.pickAsFree") : t("product.addToCart")}
            </span>
            <span className="font-black" style={{ fontSize: "14px" }}>
              {bogoFreeFromDealId
                ? (extrasPrice > 0 ? t("product.extrasPrice", { price: extrasPrice }) : t("product.free"))
                : <>{totalPrice}<small style={{ fontSize: "11px", fontWeight: 700, opacity: 0.7, marginLeft: "2px" }}>KR</small></>}
            </span>
          </button>
          {canBuyWithPoints && (
            <button
              onClick={() => { buyWithPointsRef.current = true; handleAddToCart(); }}
              className="rounded-full px-4 py-3.5 flex items-center gap-2 font-black transition-transform active:scale-[0.98] shrink-0"
              style={{ backgroundColor: "#1c1c1e", color: "#F4D086", fontSize: "13px", boxShadow: "0 6px 18px rgba(0,0,0,0.25)" }}
            >
              <Coins size={15} strokeWidth={2.5} />
              {dpointsCost} p
            </button>
          )}
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
};

export default ProductModal;
