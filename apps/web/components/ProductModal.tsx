"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { X, Plus, Minus, Check, Coins } from "lucide-react";
import { useCartStore, type BogoChoice } from "@/store/cartStore";
import ConfirmModal from "./ConfirmModal";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { useToast } from "./Toast";
import { useTranslation } from "@/lib/i18n/LocaleProvider";
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
  const { t, locale } = useTranslation();
  const addItem = useCartStore((state) => state.addItem);
  const updateItem = useCartStore((state) => state.updateItem);
  const setBogoChoice = useCartStore((state) => state.setBogoChoice);
  const currentCartRestaurantId = useCartStore((state) => state.restaurantId);
  const cartItemsCount = useCartStore((state) => state.items.length);
  const cartItems = useCartStore((state) => state.items);
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
  // Bildbandet ska BARA visas för en giltig, laddbar bild. En tom/whitespace-
  // URL räknas inte som bild, och en URL som 404:ar döljs via onError så ingen
  // tom/bruten grå ruta visas för bildlösa produkter.
  const [imgFailed, setImgFailed] = useState(false);
  const hasModalImage = typeof product.imageUrl === "string" && product.imageUrl.trim() !== "" && !imgFailed;
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const buyWithPointsRef = useRef(false);
  const [dpoints, setDpoints] = useState<DpointsMe | null>(null);
  useEffect(() => { fetchDpointsMe().then(setDpoints).catch(() => {}); }, []);

  // Lokal sifferformattering ("1 190" på svenska, "1,190" på engelska).
  const nf = (n: number) => n.toLocaleString(locale === "en" ? "en-GB" : "sv-SE");

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
  const dpointsUnitCost = Math.round((effectiveBasePrice + extrasPrice) * (dpoints?.valuePerKr ?? 10));
  const dpointsCost = dpointsUnitCost * quantity;
  // Poäng-pris för basvaran — visas i header-prisraden ("eller X poäng").
  const dpointsBasePoints = Math.round(effectiveBasePrice * (dpoints?.valuePerKr ?? 10));
  // Poäng redan reserverade av andra köp-med-poäng-rader i korgen → kan inte
  // dubbel-spendera samma saldo.
  const committedPoints = cartItems.reduce((sum, i) => sum + (i.paidWithPoints ? (i.dpointsUnitCost ?? 0) * i.quantity : 0), 0);
  const availablePoints = (dpoints?.balance ?? 0) - committedPoints;
  // Endast varor markerade som rewardable kan köpas med poäng (admin/Flutter-styrt).
  const canBuyWithPoints = !!dpoints?.enabled && !!product.rewardable && !editCartItemId && !bogoFreeFromDealId && dpointsCost > 0 && availablePoints >= dpointsCost;
  const hasDiscount = effectiveBasePrice < product.price;
  const discountPct = hasDiscount && product.price > 0 ? Math.round((1 - effectiveBasePrice / product.price) * 100) : 0;

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
        dpointsUnitCost,
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

  if (!mounted) return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6"
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
        transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
        className="w-full max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden relative flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: "var(--bg-secondary)" }}
      >
        {/* ── Produktbild (endast giltig, laddbar bild): kompakt 144px-band
            överst. Bildlösa/trasiga produkter hoppar direkt till headern. ── */}
        {hasModalImage ? (
          <div className="relative flex-shrink-0 w-full h-36 overflow-hidden" style={{ backgroundColor: "var(--bg-deep)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-cover"
              loading="eager"
              decoding="async"
              onError={() => setImgFailed(true)}
            />
          </div>
        ) : null}

        {/* ── Header: drag-handle (mobil) + namn + pris + X. ──────────────── */}
        <div className="flex-shrink-0 px-5 pt-3 pb-4" style={{ borderBottom: "1px solid var(--border-muted)" }}>
          <div className="sm:hidden mx-auto mb-3 w-10 h-1 rounded-full" style={{ backgroundColor: "var(--line-strong)" }} />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              {bogoFreeFromDealId ? (
                <span className="inline-block mb-1.5 rounded-md px-2 py-0.5 bg-gold-500 text-[12px] font-semibold" style={{ color: "#141416" }}>
                  {t("product.freeVia", { deal: bogoDealTitle || "BOGO" })}
                </span>
              ) : null}
              <h2 className="m-0 text-[17px] font-bold tracking-tight leading-snug" style={{ color: "var(--text-primary)" }}>
                {product.name}
              </h2>
              <div className="mt-1 flex items-baseline gap-2 flex-wrap" style={{ fontVariantNumeric: "tabular-nums" }}>
                <span className="text-[15px] font-semibold" style={{ color: "var(--text-primary)" }}>
                  {effectiveBasePrice} kr
                </span>
                {hasDiscount && (
                  <span className="text-[13px] line-through" style={{ color: "var(--text-secondary)" }}>
                    {product.price} kr
                  </span>
                )}
                {discountPct > 0 && (
                  <span className="text-[12px] font-semibold" style={{ color: "var(--gold-ink)" }}>
                    −{discountPct} %
                  </span>
                )}
                {/* Dpoints — "eller X poäng" för rewardable varor (göms om Dpoints är av) */}
                {!bogoFreeFromDealId && !!product.rewardable && !!dpoints?.enabled && dpointsBasePoints > 0 && (
                  <span className="text-[12.5px] font-medium" style={{ color: "var(--gold-ink)" }}>
                    {t("menu.orPoints", { points: nf(dpointsBasePoints) })}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label={t("common.close")}
              className="shrink-0 -mr-1.5 w-9 h-9 rounded-full flex items-center justify-center transition-opacity hover:opacity-70"
              style={{ color: "var(--text-secondary)" }}
            >
              <X size={20} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* ── Scrollbar yta: beskrivning + tillval + önskemål ─────────────── */}
        <div className="flex-1 overflow-y-auto no-scrollbar" style={{ overscrollBehavior: "contain" }}>
          {(product.description || (dpoints?.enabled && (dpoints?.balance ?? 0) > 0) || product.isVegan || product.isVegetarian || product.isGlutenFree) && (
            <div className="px-5 pt-4">
              {product.description ? (
                <p className="m-0 text-[13.5px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {product.description}
                </p>
              ) : null}

              {dpoints?.enabled && (dpoints?.balance ?? 0) > 0 && (
                <p className="m-0 mt-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium" style={{ backgroundColor: "var(--gold-soft)", color: "var(--gold-ink)" }}>
                  <Coins size={13} strokeWidth={1.8} />
                  {t("product.dpointsBalance", { points: nf(dpoints.balance) })}
                </p>
              )}

              {/* Kostmarkörer — läsbara textchips istället för färgprickar */}
              {(product.isVegan || product.isVegetarian || product.isGlutenFree) && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {product.isVegan && (
                    <span className="text-[11.5px] font-medium rounded-md px-1.5 py-px" style={{ color: "var(--success-ink)", border: "1px solid color-mix(in srgb, var(--success-ink) 30%, transparent)" }}>
                      {t("menu.diet.vegan")}
                    </span>
                  )}
                  {product.isVegetarian && !product.isVegan && (
                    <span className="text-[11.5px] font-medium rounded-md px-1.5 py-px" style={{ color: "var(--success-ink)", border: "1px solid color-mix(in srgb, var(--success-ink) 30%, transparent)" }}>
                      {t("menu.diet.vegetarian")}
                    </span>
                  )}
                  {product.isGlutenFree && (
                    <span className="text-[11.5px] font-medium rounded-md px-1.5 py-px" style={{ color: "var(--success-ink)", border: "1px solid color-mix(in srgb, var(--success-ink) 30%, transparent)" }}>
                      {t("menu.diet.glutenFree")}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tillvalsgrupper — rena rader med hairline-separatorer */}
          <div className="px-5">
            {[...filteredExtraGroups].sort((a, b) => (a.position || 0) - (b.position || 0)).map((group) => {
              const selectionCount = selectedExtras.filter((e) => e.groupId === group.id).length;
              const isRadio = group.type === "RADIO";
              return (
                <section key={group.id} className="mt-5">
                  <div className="flex items-baseline gap-2 mb-1">
                    <h3 className="m-0 text-[14.5px] font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
                      {group.name}
                    </h3>
                    <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
                      {group.required ? t("product.required") : t("product.optional")}
                    </span>
                    {group.maxSelections > 1 && (
                      <span className="ml-auto text-[12px] font-medium" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                        {selectionCount} / {group.maxSelections}
                      </span>
                    )}
                  </div>

                  <div style={{ borderTop: "1px solid var(--border-muted)" }}>
                    {group.extras.map((extra: any) => {
                      const isSelected = selectedExtras.some((e) => e.extraId === extra.id);
                      return (
                        <button
                          key={extra.id}
                          type="button"
                          onClick={() => handleToggleExtra(group, extra)}
                          className="w-full flex items-center justify-between gap-3 py-3 text-left transition-opacity active:opacity-70"
                          style={{ borderBottom: "1px solid var(--border-muted)" }}
                        >
                          <span className="flex items-center gap-3 min-w-0">
                            {isRadio ? (
                              <span
                                aria-hidden="true"
                                className="w-[18px] h-[18px] rounded-full shrink-0 grid place-items-center transition-colors"
                                style={{ border: `1.5px solid ${isSelected ? "var(--text-primary)" : "var(--line-strong)"}` }}
                              >
                                {isSelected && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--text-primary)" }} />}
                              </span>
                            ) : (
                              <span
                                aria-hidden="true"
                                className="w-[18px] h-[18px] rounded-[5px] shrink-0 grid place-items-center transition-colors"
                                style={isSelected
                                  ? { backgroundColor: "var(--text-primary)", border: "1.5px solid var(--text-primary)" }
                                  : { border: "1.5px solid var(--line-strong)" }}
                              >
                                {isSelected && <Check size={12} strokeWidth={3} style={{ color: "var(--bg-secondary)" }} />}
                              </span>
                            )}
                            <span className="text-[14px] font-medium truncate" style={{ color: "var(--text-primary)" }}>
                              {extra.name}
                            </span>
                          </span>
                          {extra.priceAddon > 0 && (
                            <span className="shrink-0 text-[13px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                              +{extra.priceAddon} kr
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

          {/* Önskemål */}
          <div className="px-5 mt-5">
            <h3 className="m-0 mb-2 text-[14.5px] font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
              {t("product.requests")}
            </h3>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("product.requestsPlaceholder")}
              className="w-full rounded-xl px-3.5 py-3 outline-none resize-none text-[13.5px] placeholder:text-zinc-400"
              style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--line-strong)", color: "var(--text-primary)", minHeight: "56px", fontFamily: "inherit" }}
            />
          </div>

          {selectionError && (
            <p
              className="mx-5 mt-3 mb-0 px-3.5 py-2.5 rounded-xl text-[12.5px] font-medium"
              style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#c01818" }}
            >
              {selectionError}
            </p>
          )}

          {/* Spacer för footern */}
          <div className="h-5" />
        </div>

        {/* ── Footer: kvantitet-stepper + guld-CTA ("Lägg till" + pris) ───── */}
        <div
          className="flex-shrink-0 px-4 pt-3 flex items-center gap-2.5"
          style={{ backgroundColor: "var(--bg-secondary)", borderTop: "1px solid var(--border-muted)", paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}
        >
          <div className="flex items-center h-9 rounded-full shrink-0" style={{ border: "1px solid var(--line-strong)" }}>
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="w-9 h-9 flex items-center justify-center transition-opacity active:opacity-70"
              style={{ color: "var(--text-primary)" }}
              aria-label={t("product.decrease")}
            >
              <Minus size={15} strokeWidth={2} />
            </button>
            <span className="min-w-[20px] text-center text-[14px] font-semibold" style={{ color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
              {quantity}
            </span>
            <button
              onClick={() => setQuantity(quantity + 1)}
              className="w-9 h-9 flex items-center justify-center transition-opacity active:opacity-70"
              style={{ color: "var(--text-primary)" }}
              aria-label={t("product.increase")}
            >
              <Plus size={15} strokeWidth={2} />
            </button>
          </div>

          <button
            onClick={() => { buyWithPointsRef.current = false; handleAddToCart(); }}
            className="flex-1 h-12 rounded-xl bg-gold-500 px-4 flex items-center justify-between gap-3 transition-opacity active:opacity-90"
            style={{ color: "#141416" }}
          >
            <span className="text-[15px] font-semibold truncate">
              {editCartItemId ? t("product.saveChanges") : bogoFreeFromDealId ? t("product.pickAsFree") : t("product.addToCart")}
            </span>
            <span className="text-[15px] font-semibold shrink-0" style={{ fontVariantNumeric: "tabular-nums" }}>
              {bogoFreeFromDealId
                ? (extrasPrice > 0 ? t("product.extrasPrice", { price: extrasPrice }) : t("product.free"))
                : `${totalPrice} kr`}
            </span>
          </button>

          {canBuyWithPoints && (
            <button
              onClick={() => { buyWithPointsRef.current = true; handleAddToCart(); }}
              className="h-12 rounded-xl px-3.5 flex items-center gap-1.5 shrink-0 text-[13px] font-semibold transition-opacity active:opacity-70"
              style={{ border: "1px solid var(--line-strong)", color: "var(--text-primary)", backgroundColor: "var(--bg-secondary)", fontVariantNumeric: "tabular-nums" }}
            >
              <Coins size={15} strokeWidth={1.8} style={{ color: "var(--gold-ink)" }} />
              {t("product.payWithPoints", { points: nf(dpointsCost) })}
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
