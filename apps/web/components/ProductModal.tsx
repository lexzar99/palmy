"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Plus, Minus, Check, ShoppingBag, Sparkles } from "lucide-react";
import { useCartStore, type BogoChoice } from "@/store/cartStore";
import ConfirmModal from "./ConfirmModal";

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
  const addItem = useCartStore((state) => state.addItem);
  const updateItem = useCartStore((state) => state.updateItem);
  const setBogoChoice = useCartStore((state) => state.setBogoChoice);
  const currentCartRestaurantId = useCartStore((state) => state.restaurantId);
  const cartItemsCount = useCartStore((state) => state.items.length);

  const [quantity, setQuantity] = useState(initialQuantity ?? 1);
  const [selectedExtras, setSelectedExtras] = useState<any[]>([]);
  const [note, setNote] = useState(initialNote ?? "");
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

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
    document.documentElement.style.overflowY = "hidden";
    return () => {
      document.documentElement.style.overflowY = "";
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
  const hasDiscount = effectiveBasePrice < product.price;

  const handleAddToCart = () => {
    for (const group of filteredExtraGroups || []) {
      const selectedInGroup = selectedExtras.filter((extra) => extra.groupId === group.id);
      if (group.required && selectedInGroup.length === 0) {
        // En obligatorisk grupp kan ha ALLA sina extras blockerade av BOGO.
        // Då kan kunden inte uppfylla kravet — vi hoppar över valideringen
        // för att inte fastna i ett ogiltigt tillstånd.
        if (group.extras.length === 0) continue;
        setSelectionError(`Välj ett alternativ i ${group.name.toLowerCase()}.`);
        return;
      }
      if (selectedInGroup.length < (group.minSelections || 0) && group.extras.length > 0) {
        setSelectionError(`${group.name} kräver minst ${group.minSelections} val.`);
        return;
      }
      if (selectedInGroup.length > (group.maxSelections || 99)) {
        setSelectionError(`${group.name} tillåter högst ${group.maxSelections} val.`);
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
    } else {
      addItem({
        productId: product.id,
        restaurantId,
        restaurantSlug,
        name: product.name,
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
      }
    }
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-zinc-900/10 backdrop-blur-md p-0 sm:p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        className="w-full max-w-2xl sm:rounded-2xl rounded-t-3xl border overflow-hidden shadow-2xl relative flex flex-col max-h-[95vh]"
        onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: "var(--bg-secondary)", borderColor: "var(--border-muted)" }}
      >
        
        <button onClick={onClose} className="absolute top-6 right-6 w-10 h-10 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-400 hover:text-zinc-600 transition-all z-20 shadow-sm">
           <X size={20} />
        </button>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto no-scrollbar px-8 sm:px-10 pb-6" style={{ paddingTop: product.imageUrl ? '0' : '4rem', overscrollBehavior: "contain" }}>

        {/* Image scrolls with content */}
        {product.imageUrl && (
        <div className="relative h-56 sm:h-64 -mx-8 sm:-mx-10 mb-6">
           <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
           <div className="absolute inset-0 bg-gradient-to-t" style={{ background: "linear-gradient(to top, var(--bg-secondary), rgba(252,252,249,0.4), transparent)" }} />
        </div>
        )}
           
           <div className="mb-10">
              {bogoFreeFromDealId ? (
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[9px] font-black uppercase tracking-[0.2em] mb-4">
                  🎁 Gratis via {bogoDealTitle || "BOGO"}
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold-500/10 border border-gold-500/20 text-gold-500 text-[9px] font-black uppercase tracking-[0.2em] mb-4">
                  <Sparkles size={12} /> Specialité
                </div>
              )}
              <h2 className="text-3xl sm:text-4xl font-black uppercase italic tracking-tight leading-none mb-4" style={{ color: "var(--text-primary)" }}>{product.name}</h2>
              <p className="text-xs font-bold uppercase tracking-widest leading-relaxed border-l-2 border-gold-500/50 pl-4" style={{ color: "var(--text-secondary)" }}>{product.description || "Ingen beskrivning tillgänglig."}</p>
           </div>

           {/* Extra Groups */}
           <div className="space-y-16">
              {[...filteredExtraGroups].sort((a, b) => (a.position || 0) - (b.position || 0)).map((group) => {
                 const selectionCount = selectedExtras.filter((e) => e.groupId === group.id).length;
                 return (
                 <div key={group.id} className="relative">
                     <div className="flex items-center justify-between mb-8">
                        <div>
                           <h3 className="text-xl font-black uppercase italic tracking-tight" style={{ color: "var(--text-primary)" }}>{group.name}</h3>
                           <div className="flex items-center gap-2 mt-1">
                              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-500">{group.required ? "Måste väljas" : "Valfritt"}</span>
                              {group.maxSelections > 1 && (
                                 <div className="px-3 py-1 rounded-lg" style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)" }}>
                                   <span className="text-[9px] font-black text-gold-600 italic uppercase tracking-tighter">{selectionCount} <span className="text-zinc-400 not-italic">AV</span> {group.maxSelections}</span>
                                 </div>
                              )}
                           </div>
                        </div>
                     </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                       {group.extras.map((extra: any) => {
                          const isSelected = selectedExtras.some((e) => e.extraId === extra.id);
                          return (
                              <button
                                 key={extra.id}
                                 onClick={() => handleToggleExtra(group, extra)}
                                 className={`flex items-center justify-between p-5 rounded-[1.8rem] border-2 transition-all duration-300 ${
                                    isSelected 
                                       ? "bg-gold-500/5 border-gold-500/60 shadow-[0_10px_20px_rgba(231,178,75,0.1)]" 
                                       : "bg-white border-zinc-100 hover:border-zinc-200"
                                 }`}
                                 style={{ backgroundColor: isSelected ? undefined : "var(--bg-primary)", borderColor: isSelected ? undefined : "var(--border-muted)" }}
                              >
                                 <div className="flex items-center gap-4">
                                    <div className={`w-6 h-6 rounded-3xl border-2 flex items-center justify-center transition-all ${isSelected ? "bg-gold-500 border-gold-500" : "border-zinc-200"}`}>
                                       {isSelected && <Check size={14} className="text-zinc-950" strokeWidth={4} />}
                                    </div>
                                    <span className={`text-[11px] font-black uppercase tracking-widest ${isSelected ? "text-gold-500" : "text-zinc-500"}`}>{extra.name}</span>
                                 </div>
                                 {extra.priceAddon > 0 && <span className="text-[9px] font-black text-zinc-400">+{extra.priceAddon} kr</span>}
                              </button>
                          );
                       })}
                    </div>
                  </div>
               );
            })}
         </div>

           {/* Notes */}
           <div className="space-y-4 mt-10">
              <h3 className="text-sm font-black uppercase italic tracking-tight" style={{ color: "var(--text-primary)" }}>Önskemål</h3>
              <div className="rounded-[1.8rem] p-1 border" style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)" }}>
                 <textarea 
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Allergier? Särskilda krav? Skriv dem här..."
                    className="w-full bg-transparent border-none rounded-[1.5rem] p-5 text-sm font-bold focus:ring-0 focus:outline-none min-h-[100px] placeholder:text-zinc-400 shadow-inner"
                    style={{ color: "var(--text-primary)" }}
                 />
              </div>
           </div>

           {selectionError && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[10px] font-black uppercase tracking-widest text-center italic">{selectionError}</motion.div>
           )}
        </div>

        {/* Footer */}
        <div className="shrink-0 p-6 sm:p-8 backdrop-blur-3xl border-t flex flex-col sm:flex-row items-center gap-4" style={{ backgroundColor: "var(--glass-bg)", borderColor: "var(--border-muted)" }}>
           <div className="flex items-center gap-8 glass-panel p-2 px-8 rounded-[2rem]" style={{ backgroundColor: "var(--bg-deep)", borderColor: "var(--border-muted)" }}>
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="p-2 text-zinc-400 hover:text-zinc-800 transition-colors active:scale-75"><Minus size={22} /></button>
              <span className="text-2xl font-black w-8 text-center italic" style={{ color: "var(--text-primary)" }}>{quantity}</span>
              <button onClick={() => setQuantity(quantity + 1)} className="p-2 text-zinc-400 hover:text-zinc-800 transition-colors active:scale-75"><Plus size={22} /></button>
           </div>
           
           <button onClick={handleAddToCart} className={`w-full py-6 px-10 text-zinc-950 rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs flex items-center justify-between shadow-[0_20px_40px_rgba(231,178,75,0.25)] transition-all active:scale-[0.97] group ${bogoFreeFromDealId ? "bg-emerald-500 hover:bg-emerald-400" : "bg-gold-500 hover:bg-gold-400"}`}>
              <div className="flex items-center gap-3">
                 <ShoppingBag size={20} />
                 <span>{editCartItemId ? "Spara ändringar" : bogoFreeFromDealId ? "Välj som gratis" : "Lägg i kasse"}</span>
              </div>
              <div className="flex items-center gap-2 text-xl italic leading-none">
                 {bogoFreeFromDealId
                   ? (extrasPrice > 0 ? `+${extrasPrice} KR EXTRAS` : "GRATIS")
                   : `${totalPrice} KR`}
              </div>
           </button>
        </div>

        <ConfirmModal
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          onConfirm={performAddToCart}
          title="Byt restaurang?"
          message="Du har redan artiklar i din varukorg från en annan restaurang. Vill du byta restaurang och tömma din aktuella varukorg?"
          confirmText="Ja, byt"
          cancelText="Behåll"
        />
      </motion.div>
    </motion.div>
  );
};

export default ProductModal;
