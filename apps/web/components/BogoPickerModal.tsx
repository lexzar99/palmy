"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Gift, X } from "lucide-react";
import { useCartStore, type BogoChoice } from "@/store/cartStore";

export type BogoPickerProduct = {
  id: string;
  name: string;
  price: number;
  imageUrl?: string | null;
};

type Props = {
  dealId: string;
  dealTitle: string;
  restaurantId: string;
  rewardCategoryName?: string | null;
  products: BogoPickerProduct[];
  onClose: () => void;
};

export default function BogoPickerModal({ dealId, dealTitle, restaurantId, rewardCategoryName, products, onClose }: Props) {
  const setBogoChoice = useCartStore((s) => s.setBogoChoice);
  const addItem = useCartStore((s) => s.addItem);

  const handlePick = (p: BogoPickerProduct) => {
    addItem({
      productId: p.id,
      restaurantId,
      name: p.name,
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
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-zinc-900/60 backdrop-blur-md p-0 sm:p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        className="w-full max-w-lg sm:rounded-3xl rounded-t-3xl border overflow-hidden shadow-2xl flex flex-col max-h-[85vh]"
        style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-7 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Gift size={18} className="text-emerald-400" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">BOGO</p>
              <h2 className="text-base font-black uppercase italic tracking-tight" style={{ color: "var(--text-primary)" }}>
                Välj din gratis{rewardCategoryName ? ` ${rewardCategoryName.toLowerCase()}` : " produkt"}!
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full border flex items-center justify-center transition-colors hover:bg-white/5"
            style={{ borderColor: "var(--border-muted)", color: "var(--text-muted)" }}
          >
            <X size={14} />
          </button>
        </div>

        <p className="px-6 pb-4 text-[11px] font-semibold italic shrink-0" style={{ color: "var(--text-muted)" }}>
          {dealTitle} — välj en produkt nedan som du får gratis.
        </p>

        {/* Product list */}
        <div className="overflow-y-auto flex-1 px-4 pb-6 flex flex-col gap-2">
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePick(p)}
              className="w-full flex items-center gap-4 rounded-2xl border px-4 py-3.5 text-left transition-all hover:border-emerald-500/40 hover:bg-emerald-500/5 active:scale-[0.98]"
              style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-secondary)" }}
            >
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt="" className="w-12 h-12 rounded-xl object-cover shrink-0" />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center shrink-0 text-xl">🍽️</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-black text-sm truncate" style={{ color: "var(--text-primary)" }}>{p.name}</p>
                <p className="text-xs mt-0.5 line-through" style={{ color: "var(--text-muted)" }}>{p.price.toFixed(0)} kr</p>
              </div>
              <span className="text-xs font-black text-emerald-400 shrink-0">GRATIS</span>
            </button>
          ))}
        </div>

        {/* Skip button */}
        <div className="px-6 pb-6 pt-2 border-t shrink-0" style={{ borderColor: "var(--border-muted)" }}>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 text-[11px] font-black uppercase tracking-widest transition-colors"
            style={{ color: "var(--text-muted)" }}
          >
            Hoppa över — välj senare i kassan
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
