"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Plus, Minus, Check, ShoppingBag, Sparkles } from "lucide-react";
import { useCartStore } from "@/store/cartStore";
import ConfirmModal from "./ConfirmModal";

interface ProductModalProps {
  product: any;
  restaurantId: string;
  onClose: () => void;
}

const ProductModal = ({ product, restaurantId, onClose }: ProductModalProps) => {
  const addItem = useCartStore((state) => state.addItem);
  const currentCartRestaurantId = useCartStore((state) => state.restaurantId);
  const cartItemsCount = useCartStore((state) => state.items.length);

  const [quantity, setQuantity] = useState(1);
  const [selectedExtras, setSelectedExtras] = useState<any[]>([]);
  const [note, setNote] = useState("");
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    const defaults: any[] = [];
    product.extraGroups?.forEach((group: any) => {
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
  }, [product]);

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

  const extrasPrice = selectedExtras.reduce((sum, e) => sum + e.price, 0);
  const totalPrice = (product.price + extrasPrice) * quantity;

  const handleAddToCart = () => {
    for (const group of product.extraGroups || []) {
      const selectedInGroup = selectedExtras.filter((extra) => extra.groupId === group.id);
      if (group.required && selectedInGroup.length === 0) {
        setSelectionError(`Välj ett alternativ i ${group.name.toLowerCase()}.`);
        return;
      }
      if (selectedInGroup.length < (group.minSelections || 0)) {
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
    addItem({
      productId: product.id,
      restaurantId,
      name: product.name,
      price: product.price,
      quantity,
      extras: selectedExtras,
      note: note.trim() || undefined,
    });
    onClose();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-obsidian/95 backdrop-blur-2xl p-0 sm:p-6" onClick={onClose}>
      <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", bounce: 0, duration: 0.5 }} className="w-full max-w-2xl bg-zinc-950 border border-white/5 rounded-t-[3rem] sm:rounded-[3.5rem] overflow-hidden shadow-[0_-20px_60px_rgba(0,0,0,0.5)] relative flex flex-col max-h-[95vh]" onClick={e => e.stopPropagation()}>
        
        {/* Header Section */}
        <div className="relative h-64 sm:h-72 shrink-0">
           {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
           ) : (
              <div className="w-full h-full bg-gradient-to-br from-zinc-900 to-obsidian flex items-center justify-center text-5xl">🍔</div>
           )}
           <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/20 to-transparent" />
           
           <button onClick={onClose} className="absolute top-8 right-8 w-12 h-12 rounded-full glass-panel flex items-center justify-center text-white hover:bg-white/10 transition-all active:scale-90">
              <X size={24} />
           </button>
           
           <div className="absolute bottom-8 left-10 right-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold-500/20 border border-gold-500/20 text-gold-500 text-[9px] font-black uppercase tracking-[0.2em] mb-4">
                 <Sparkles size={12} /> Specialité
              </div>
              <h2 className="text-4xl sm:text-5xl font-black text-white uppercase italic tracking-tight leading-none truncate">{product.name}</h2>
           </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-10 sm:p-12 space-y-12 pb-40">
           <p className="text-zinc-500 text-sm font-bold uppercase tracking-widest leading-relaxed italic border-l-4 border-gold-500/20 pl-6">{product.description || "Ingen beskrivning tillgänglig."}</p>

           {/* Extra Groups */}
           <div className="space-y-16">
              {[...(product.extraGroups || [])].sort((a, b) => (a.position || 0) - (b.position || 0)).map((group) => (
                 <div key={group.id} className="relative">
                    <div className="flex items-center justify-between mb-8">
                       <div>
                          <h3 className="text-xl font-black text-white uppercase italic tracking-tight">{group.name}</h3>
                          <div className="flex items-center gap-2 mt-1">
                             <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-700">{group.required ? "Måste väljas" : "Valfritt"}</span>
                             <div className="w-1 h-1 rounded-full bg-zinc-800" />
                             <span className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-700">Max {group.maxSelections || "∞"}</span>
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
                                className={`flex items-center justify-between p-5 rounded-[1.8rem] border-2 transition-all transition-all duration-300 ${
                                   isSelected 
                                      ? "bg-gold-500/5 border-gold-500/60 shadow-[0_10px_20px_rgba(231,178,75,0.1)]" 
                                      : "bg-zinc-950 border-white/5 hover:border-white/10"
                                }`}
                             >
                                <div className="flex items-center gap-4">
                                   <div className={`w-6 h-6 rounded-3xl border-2 flex items-center justify-center transition-all ${isSelected ? "bg-gold-500 border-gold-500" : "border-white/5"}`}>
                                      {isSelected && <Check size={14} className="text-zinc-950" strokeWidth={4} />}
                                   </div>
                                   <span className={`text-[11px] font-black uppercase tracking-widest ${isSelected ? "text-gold-500" : "text-zinc-400"}`}>{extra.name}</span>
                                </div>
                                {extra.priceAddon > 0 && <span className="text-[9px] font-black text-zinc-700">+{extra.priceAddon} kr</span>}
                             </button>
                          );
                       })}
                    </div>
                 </div>
              ))}
           </div>

           {/* Notes */}
           <div className="space-y-4">
              <h3 className="text-sm font-black text-white uppercase italic tracking-tight">Önskemål</h3>
              <div className="glass-panel rounded-[1.8rem] p-1">
                 <textarea 
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    placeholder="Allergier? Särskilda krav? Skriv dem här..."
                    className="w-full bg-transparent border-none rounded-[1.5rem] p-5 text-sm font-bold text-white focus:ring-0 focus:outline-none min-h-[100px] placeholder:text-zinc-800"
                 />
              </div>
           </div>

           {selectionError && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-[10px] font-black uppercase tracking-widest text-center italic">{selectionError}</motion.div>
           )}
        </div>

        {/* Footer sticky block */}
        <div className="absolute bottom-0 left-0 right-0 p-8 sm:p-10 bg-zinc-950/80 backdrop-blur-3xl border-t border-white/5 flex flex-col sm:flex-row items-center gap-6">
           <div className="flex items-center gap-8 glass-panel p-2 px-8 rounded-[2rem]">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="p-2 text-zinc-500 hover:text-white transition-colors active:scale-75"><Minus size={22} /></button>
              <span className="text-2xl font-black text-white w-8 text-center italic">{quantity}</span>
              <button onClick={() => setQuantity(quantity + 1)} className="p-2 text-zinc-500 hover:text-white transition-colors active:scale-75"><Plus size={22} /></button>
           </div>
           
           <button onClick={handleAddToCart} className="w-full py-6 px-10 bg-gold-500 hover:bg-gold-400 text-zinc-950 rounded-[2rem] font-black uppercase tracking-[0.2em] text-xs flex items-center justify-between shadow-[0_20px_40px_rgba(231,178,75,0.25)] transition-all active:scale-[0.97] group">
              <div className="flex items-center gap-3">
                 <ShoppingBag size={20} />
                 <span>Lägg i kasse</span>
              </div>
              <div className="flex items-center gap-2 text-xl italic leading-none">
                 {totalPrice} KR
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
