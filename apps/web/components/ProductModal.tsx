"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Plus, Minus, Check, ArrowRight } from "lucide-react";
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

  // Initialisera förvalda extran
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
      // Ta bort gamla från samma grupp och lägg till nya
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
      // CHECKBOX
      if (isSelected) {
        setSelectedExtras((prev) => prev.filter((e) => e.extraId !== extra.id));
      } else {
        // Kontrollera maxSelections
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-6 bg-dark-500/90 backdrop-blur-xl"
    >
      <motion.div
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.95, y: 10 }}
        className="w-full max-w-xl bg-dark-400 border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl relative mb-[env(safe-area-inset-bottom)]"
      >
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-3 bg-white hover:bg-gold-500 text-dark-500 rounded-full transition-all z-[100] shadow-2xl active:scale-95"
          aria-label="Stäng"
        >
          <X size={24} strokeWidth={3} />
        </button>

        <div className="max-h-[90dvh] overflow-y-auto no-scrollbar">
          {product.imageUrl && (
            <div className="w-full h-56 md:h-64 bg-white/5 relative">
              <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-dark-400 to-transparent" />
            </div>
          )}

          <div className="p-5 md:p-10">

            <h2 className="text-3xl md:text-5xl font-bold mb-3 tracking-tight">{product.name}</h2>
            <p className="text-white/40 text-lg mb-8 leading-relaxed">{product.description}</p>

            <div className="space-y-12 mb-12">
              {[...(product.extraGroups || [])].sort((a, b) => {
                // First by position
                if ((a.position || 0) !== (b.position || 0)) {
                  return (a.position || 0) - (b.position || 0);
                }
                // Then required first
                if (a.required !== b.required) {
                  return a.required ? -1 : 1;
                }
                // Finally name
                return (a.name || "").localeCompare(b.name || "");
              }).map((group: any) => (
                <div key={group.id}>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-bold uppercase tracking-wider">{group.name}</h3>
                      {group.required && (
                        <span className="text-[10px] bg-gold-500/20 text-gold-500 px-2 py-0.5 rounded-full font-bold">OBLIGATORISK</span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {group.extras.map((extra: any) => {
                      const isSelected = selectedExtras.some((e) => e.extraId === extra.id);
                      return (
                        <button
                          key={extra.id}
                          onClick={() => handleToggleExtra(group, extra)}
                          className={`group flex items-center justify-between p-4 rounded-2xl border transition-all ${
                            isSelected 
                              ? 'bg-gold-500/10 border-gold-500 text-gold-500' 
                              : 'bg-white/5 border-white/5 text-white/60 hover:border-white/20'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                              isSelected ? 'bg-gold-500 border-gold-500' : 'border-white/20'
                            }`}>
                              {isSelected && <Check size={12} className="text-dark-500" />}
                            </div>
                            <span className="font-bold">{extra.name}</span>
                          </div>
                          <span className="text-xs font-bold opacity-60">
                            {extra.priceAddon > 0 ? `+${extra.priceAddon} kr` : 'Ingen extra kostnad'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Note Field */}
            <div className="mb-12">
              <label className="block text-white/40 text-[10px] uppercase font-black tracking-widest mb-3">Speciella önskemål för denna produkt</label>
              <textarea 
                rows={2} 
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="T.ex. utan lök, extra välgräddad..."
                className="w-full bg-white/5 border border-white/5 rounded-2xl p-4 focus:ring-2 focus:ring-gold-500/50 outline-none resize-none font-medium"
              />
            </div>

            {selectionError && (
              <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {selectionError}
              </div>
            )}

            <div className="sticky bottom-0 bg-dark-400 pt-8 pb-4 mt-8 flex flex-col md:flex-row items-center gap-6 border-t border-white/5">
              <div className="flex items-center gap-6 bg-white/5 p-2 px-6 rounded-2xl border border-white/5">
                <button 
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                >
                  <Minus size={20} />
                </button>
                <span className="text-2xl font-bold w-4 text-center">{quantity}</span>
                <button 
                  onClick={() => setQuantity(quantity + 1)}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                >
                  <Plus size={20} />
                </button>
              </div>

              <button 
                onClick={handleAddToCart}
                className="w-full px-8 py-5 bg-gold-500 hover:bg-gold-400 text-dark-500 font-bold rounded-2xl transition-all shadow-xl hover:shadow-gold-500/20 flex items-center justify-between group"
              >
                <span className="uppercase tracking-widest">Lägg till i varukorg</span>
                <div className="flex items-center gap-3 font-black text-xl">
                  {totalPrice} KR
                  <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            </div>
          </div>
        </div>

        <ConfirmModal
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          onConfirm={performAddToCart}
          title="Byt restaurang?"
          message="Du har redan artiklar i din varukorg från en annan restaurang. Vill du byta restaurang och tömma din aktuella varukorg?"
          confirmText="Ja, töm och lägg till"
          cancelText="Nej, behåll befintlig"
        />
      </motion.div>
    </motion.div>
  );
};

export default ProductModal;
