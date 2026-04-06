"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Printer, Save, MessageSquare } from "lucide-react";

export default function ReceiptSettingsPage() {
  const [headerMessage, setHeaderMessage] = useState("");
  const [footerMessage, setFooterMessage] = useState("");

  const handleSave = () => {
    alert("Kvittolayout sparad globalt!");
  };

  return (
    <div className="max-w-4xl max-auto space-y-10">
      <div>
        <h1 className="text-3xl font-black text-text-primary uppercase tracking-tight mb-2">Kvittolayout</h1>
        <p className="text-text-secondary text-xs font-bold tracking-widest uppercase">Global inställning för alla restauranger</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        <div className="space-y-6">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-bg-primary border border-border-subtle p-8 rounded-[2rem] shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-widest text-text-primary mb-6 flex items-center gap-3">
              <MessageSquare size={16} className="text-gold-500" /> Meddelanden
            </h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-text-secondary mb-2">Sidhuvud (Text högst upp)</label>
                <textarea 
                  value={headerMessage}
                  onChange={(e) => setHeaderMessage(e.target.value)}
                  placeholder="T.ex: Välkommen till FoodGo!"
                  className="w-full bg-bg-secondary border border-border-subtle rounded-xl px-4 py-3 text-sm font-bold placeholder:text-text-secondary/50 focus:border-gold-500 focus:outline-none transition-colors resize-none h-24"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-text-secondary mb-2">Sidfot (Text längst ner)</label>
                <textarea 
                  value={footerMessage}
                  onChange={(e) => setFooterMessage(e.target.value)}
                  placeholder="T.ex: Tack för beställningen! Återkom snart."
                  className="w-full bg-bg-secondary border border-border-subtle rounded-xl px-4 py-3 text-sm font-bold placeholder:text-text-secondary/50 focus:border-gold-500 focus:outline-none transition-colors resize-none h-24"
                />
              </div>
            </div>

            <button onClick={handleSave} className="mt-8 w-full py-4 bg-gold-500 hover:bg-gold-400 text-dark-900 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center justify-center gap-2">
              <Save size={16} /> Spara Global Layout
            </button>
          </motion.div>
        </div>

        <div>
           <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white p-8 rounded-[2rem] shadow-2xl mx-auto max-w-sm sticky top-10 border border-gray-100">
              <div className="border-b-2 border-dashed border-gray-200 pb-6 mb-6 text-center space-y-2">
                 <div className="w-12 h-12 bg-black text-white rounded-full flex items-center justify-center mx-auto mb-4 italic font-black text-xl">M</div>
                 <h3 className="text-black font-black uppercase text-xl">FoodGo</h3>
                 {headerMessage && <div className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-2">{headerMessage}</div>}
              </div>
              
              <div className="space-y-4 mb-6">
                 <div className="flex justify-between text-xs font-bold text-gray-800">
                    <span>1x Crispy Tallrik</span>
                    <span>139 KR</span>
                 </div>
                 <div className="text-[10px] text-gray-500 uppercase font-bold pl-4 leading-tight">
                    Pommes<br/>Vitlöksås
                 </div>
              </div>

              <div className="border-t-2 border-dashed border-gray-200 pt-6 mt-6 text-center">
                 {footerMessage ? (
                    <div className="text-gray-500 text-xs font-bold uppercase tracking-widest">{footerMessage}</div>
                 ) : (
                    <div className="text-gray-300 text-[10px] font-bold uppercase tracking-widest italic">Din valda sidfot visas här...</div>
                 )}
              </div>
           </motion.div>
        </div>
      </div>
    </div>
  );
}
