"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import { Gift, X, Plus } from "lucide-react";
import { useCartStore, type BogoChoice } from "@/store/cartStore";
import { useFocusTrap } from "@/lib/useFocusTrap";
import "@/components/restaurant/restaurant.css";

export type BogoPickerProduct = {
  id: string;
  name: string;
  price: number;
  imageUrl?: string | null;
  extraGroups?: any[]; // full product data — finns när pickern öppnas från restaurangsidan
};

type Props = {
  dealId: string;
  dealTitle: string;
  restaurantId: string;
  rewardCategoryName?: string | null;
  products: BogoPickerProduct[];
  onClose: () => void;
  /** Om satt anropas denna istället för direkt cart-tillägg — förälder öppnar ProductModal */
  onSelectProduct?: (product: BogoPickerProduct) => void;
};

export default function BogoPickerModal({ dealId, dealTitle, restaurantId, rewardCategoryName, products, onClose, onSelectProduct }: Props) {
  const setBogoChoice = useCartStore((s) => s.setBogoChoice);
  const addItem = useCartStore((s) => s.addItem);
  // Focus-trap för a11y: screen reader-användare ska inte kunna tabba ut.
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(modalRef, true);

  const handlePick = (p: BogoPickerProduct) => {
    if (onSelectProduct) {
      onSelectProduct(p);
      return;
    }
    addItem({
      productId: p.id,
      restaurantId,
      name: p.name,
      imageUrl: p.imageUrl ?? null,
      price: 0,
      quantity: 1,
      extras: [],
      bogoFreeFromDealId: dealId,
    });
    const choice: BogoChoice = {
      dealId,
      dealTitle,
      rewardCategoryName,
      product: { id: p.id, name: p.name, price: p.price, imageUrl: p.imageUrl },
    };
    setBogoChoice(choice);
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="ve-root fixed inset-0 z-[1400] flex items-end justify-center sm:items-center"
      style={{ backgroundColor: "rgba(0,0,0,0.42)" }}
      onClick={onClose}
    >
      <motion.div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Välj gratisvara — ${dealTitle}`}
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 380, damping: 38, mass: 0.9 }}
        className="relative flex max-h-[88dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[26px] sm:rounded-[26px]"
        style={{ backgroundColor: "var(--ve-bg)", boxShadow: "0 -8px 40px rgba(0,0,0,0.18)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 justify-center pt-2.5"><span className="ve-sheet-handle" /></div>
        <div className="shrink-0 px-5 pb-3 pt-3">
          <div className="flex items-start justify-between gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px]" style={{ backgroundColor: "var(--ve-accent-soft)", color: "var(--ve-accent)" }}>
              <Gift size={22} strokeWidth={2.2} />
            </span>
            <button type="button" onClick={onClose} aria-label="Stäng" className="ve-press grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }}>
              <X size={16} strokeWidth={2.6} />
            </button>
          </div>
          <p className="m-0 mt-3 text-[12.5px] font-semibold" style={{ color: "var(--ve-accent)" }}>Du har låst upp en gratis vara</p>
          <h2 className="m-0 mt-1 text-[22px] font-semibold leading-tight" style={{ letterSpacing: "-0.02em", color: "var(--ve-ink)" }}>
            Välj din gratis{rewardCategoryName ? ` ${rewardCategoryName.toLowerCase()}` : " vara"}
          </h2>
          <p className="m-0 mt-1 text-[14px]" style={{ color: "var(--ve-ink-2)" }}>{dealTitle}. Den läggs i din order utan kostnad.</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2" style={{ overscrollBehavior: "contain" }}>
          <div className="ve-card overflow-hidden">
            {products.map((p, index) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handlePick(p)}
                className="ve-row-press flex w-full items-center gap-3.5 px-4 py-3 text-left"
                style={{ boxShadow: index === 0 ? undefined : "inset 0 0.5px 0 var(--ve-line)" }}
              >
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-[14px] object-cover" style={{ backgroundColor: "#EBEBEE" }} />
                ) : (
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[14px]" style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-accent)" }}>
                    <Gift size={20} strokeWidth={2} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-medium" style={{ color: "var(--ve-ink)", letterSpacing: "-0.01em" }}>{p.name}</span>
                  <span className="mt-1 flex items-center gap-2">
                    <span className="rounded-full px-2 py-0.5 text-[12px] font-semibold" style={{ backgroundColor: "var(--ve-success-soft)", color: "var(--ve-success)" }}>Gratis</span>
                    <span className="ve-tabular text-[13px] line-through" style={{ color: "var(--ve-ink-3)" }}>{p.price.toFixed(0)} kr</span>
                  </span>
                </span>
                <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-full" style={{ backgroundColor: "var(--ve-fill)", color: "var(--ve-ink)" }}>
                  <Plus size={15} strokeWidth={2.6} />
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="ve-glass shrink-0 px-5 pt-2" style={{ boxShadow: "inset 0 0.5px 0 var(--ve-line)", paddingBottom: "max(env(safe-area-inset-bottom, 0px), 14px)" }}>
          <button type="button" onClick={onClose} className="ve-press h-11 w-full rounded-full text-[15px] font-medium" style={{ color: "var(--ve-ink-2)" }}>
            Välj senare i kassan
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
