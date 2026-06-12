"use client";

import { useRef } from "react";
import { motion } from "framer-motion";
import { Gift, X, Plus } from "lucide-react";
import { useCartStore, type BogoChoice } from "@/store/cartStore";
import { useFocusTrap } from "@/lib/useFocusTrap";

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
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-zinc-900/50 backdrop-blur-sm p-0 sm:p-6"
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
        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        className="w-full max-w-md sm:rounded-3xl rounded-t-3xl overflow-hidden relative flex flex-col max-h-[88vh]"
        style={{ backgroundColor: "var(--bg-primary, #fff8ef)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Hero-header: lugn guld-ton, ingen emoji/versal-italic ───────────── */}
        <div
          className="relative px-6 pt-7 pb-6 shrink-0"
          style={{ background: "linear-gradient(160deg, rgba(231,178,75,0.16) 0%, rgba(231,178,75,0.04) 70%, transparent 100%)" }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Stäng"
            className="absolute top-5 right-5 w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-95"
            style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)", color: "var(--text-secondary)" }}
          >
            <X size={16} strokeWidth={2.5} />
          </button>
          <div className="w-12 h-12 rounded-2xl grid place-items-center mb-3.5" style={{ backgroundColor: "var(--color-gold-500, #E7B24B)", boxShadow: "0 4px 14px rgba(200,154,60,0.35)" }}>
            <Gift size={22} className="text-zinc-900" strokeWidth={2.2} />
          </div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold-600 mb-1">Du har låst upp en gratis vara</p>
          <h2 className="m-0 text-[1.4rem] font-bold tracking-tight leading-tight" style={{ color: "var(--text-primary)" }}>
            Välj din gratis{rewardCategoryName ? ` ${rewardCategoryName.toLowerCase()}` : " vara"}
          </h2>
          <p className="mt-1.5 text-[13px] leading-snug" style={{ color: "var(--text-secondary)" }}>
            {dealTitle} — den läggs i din order utan kostnad.
          </p>
        </div>

        {/* ── Produktlista: ren, full bredd, guld-accent (matchar menyn) ──────── */}
        <div className="overflow-y-auto flex-1 px-4 py-2" style={{ overscrollBehavior: "contain" }}>
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePick(p)}
              className="w-full flex items-center gap-3.5 py-3.5 text-left transition-opacity active:opacity-70"
              style={{ borderBottom: "1px solid var(--border-muted)" }}
            >
              {/* Bild om finns, annars ren guld-gåva-platta (ingen emoji) */}
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt="" className="w-14 h-14 rounded-xl object-cover shrink-0" style={{ backgroundColor: "var(--bg-deep)" }} />
              ) : (
                <div className="w-14 h-14 rounded-xl grid place-items-center shrink-0" style={{ backgroundColor: "var(--bg-deep)" }}>
                  <Gift size={20} className="text-gold-500" strokeWidth={2} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="m-0 text-[15px] font-bold leading-tight line-clamp-1" style={{ color: "var(--text-primary)", letterSpacing: "-0.2px" }}>{p.name}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[13px] font-bold text-gold-600">Gratis</span>
                  <span className="text-[12px] font-medium line-through" style={{ color: "var(--text-secondary)", opacity: 0.7 }}>{p.price.toFixed(0)} kr</span>
                </div>
              </div>
              {/* Flytande guld-plus, samma språk som menyn */}
              <span
                aria-hidden="true"
                className="shrink-0 w-8 h-8 rounded-full grid place-items-center"
                style={{ backgroundColor: "var(--color-gold-500, #E7B24B)", color: "#1c1c1e", boxShadow: "0 2px 6px rgba(0,0,0,0.15)" }}
              >
                <Plus size={16} strokeWidth={3} />
              </span>
            </button>
          ))}
        </div>

        {/* ── Hoppa över (man kan välja senare i kassan) ─────────────────────── */}
        <div className="px-5 pt-3 pb-5 shrink-0" style={{ borderTop: "1px solid var(--border-muted)", backgroundColor: "var(--bg-primary)" }}>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 text-[13px] font-semibold transition-opacity active:opacity-60"
            style={{ color: "var(--text-secondary)" }}
          >
            Välj senare i kassan
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
