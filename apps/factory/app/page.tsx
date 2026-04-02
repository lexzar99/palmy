"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Rocket, Store, Globe, CheckCircle2, Loader2, Sparkles, User, Lock, MapPin, Phone, Palette } from "lucide-react";
import axios from "axios";

export default function FactoryPage() {
  const [form, setForm] = useState({
    name: "",
    tagline: "Bästa maten i stan",
    primaryColor: "#3b82f6",
    logoUrl: "",
    adminEmail: "admin@palmyrapizzeria.se",
    adminPassword: "Admin1234!",
    address: "Stora Södergatan 17, Lund",
    phone: "046-12 34 56",
    theme: "modern", // modern, classic, minimal
    stripePublic: "",
    stripeSecret: "",
    deliveryFee: "4900",
    minOrder: "15000",
  });
  const [status, setStatus] = useState<"idle" | "generating" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<any>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("generating");
    setMessage("Skapar mappar och kopierar mallar...");
    
    try {
      const res = await axios.post("/api/generate", form);
      setResult(res.data);
      setStatus("success");
      setMessage("Restaurangen skapad och servrarna är startade i bakgrunden!");
      
      // Öppna sidorna automatiskt
      setTimeout(() => {
         window.open("http://localhost:" + res.data.ports.web, "_blank");
      }, 1000);
      setTimeout(() => {
         window.open("http://localhost:" + res.data.ports.admin, "_blank");
      }, 2500);

    } catch (err: any) {
      setStatus("error");
      setMessage(err.response?.data?.error || "Ett fel uppstod vid generering. Se terminalen för mer info.");
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white p-6 font-sans">
      <div className="max-w-6xl mx-auto">
        <header className="mb-10 text-center">
          <div className="flex items-center justify-center gap-3 mb-2 text-blue-500">
            <Rocket size={32} />
            <h1 className="text-4xl font-black uppercase tracking-tighter italic">Restaurant Factory</h1>
          </div>
          <p className="text-white/40 text-lg">Skapa helt unika, oberoende restaurang-system på sekunder.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6 bg-white/5 p-8 rounded-3xl border border-white/10"
          >
            <form onSubmit={handleGenerate} className="space-y-6">
              
              {/* Varumärke */}
              <div className="space-y-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-white/50 border-b border-white/10 pb-2">Varumärke & Utseende</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Restaurangens Namn</label>
                    <div className="relative">
                      <Store className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={16} />
                      <input 
                        required
                        value={form.name}
                        onChange={e => setForm({...form, name: e.target.value})}
                        placeholder="T.ex. Palma"
                        className="w-full bg-dark-500 border border-white/10 rounded-2xl py-3 pl-10 pr-4 outline-none focus:ring-2 focus:ring-blue-500/50 text-sm transition-all"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Tagline</label>
                    <input 
                      value={form.tagline}
                      onChange={e => setForm({...form, tagline: e.target.value})}
                      className="w-full bg-dark-500 border border-white/10 rounded-2xl py-3 px-4 outline-none focus:ring-2 focus:ring-blue-500/50 text-sm transition-all"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Färg / Tema</label>
                      <div className="flex gap-2">
                        <input 
                          type="color"
                          value={form.primaryColor}
                          onChange={e => setForm({...form, primaryColor: e.target.value})}
                          className="w-12 h-12 rounded-xl bg-dark-500 border border-white/10 p-1 cursor-pointer shrink-0"
                        />
                        <select 
                          value={form.theme} 
                          onChange={e => setForm({...form, theme: e.target.value})}
                          className="flex-1 bg-dark-500 border border-white/10 rounded-xl px-3 outline-none focus:ring-2 text-sm focus:ring-blue-500/50"
                        >
                           <option value="modern">Tema: Modernt (Mörkt)</option>
                           <option value="classic">Tema: Klassiskt (Bild-tungt)</option>
                           <option value="minimal">Tema: Minimalistiskt</option>
                        </select>
                      </div>
                   </div>
                </div>
              </div>

              {/* Kontakt */}
              <div className="space-y-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-white/50 border-b border-white/10 pb-2">Kontaktuppgifter</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Adress</label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={14} />
                      <input 
                        value={form.address}
                        onChange={e => setForm({...form, address: e.target.value})}
                        className="w-full bg-dark-500 border border-white/10 rounded-xl py-2 pl-9 pr-3 outline-none focus:ring-2 focus:ring-blue-500/50 text-xs transition-all"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Telefon</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={14} />
                      <input 
                        value={form.phone}
                        onChange={e => setForm({...form, phone: e.target.value})}
                        className="w-full bg-dark-500 border border-white/10 rounded-xl py-2 pl-9 pr-3 outline-none focus:ring-2 focus:ring-blue-500/50 text-xs transition-all"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Frakktlösning & Betalning */}
              <div className="space-y-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-white/50 border-b border-white/10 pb-2">Checkout & Avgifter</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                     <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Utkörningsavgift (i ören, t.ex. 4900 = 49kr)</label>
                     <input 
                       value={form.deliveryFee}
                       onChange={e => setForm({...form, deliveryFee: e.target.value})}
                       className="w-full bg-dark-500 border border-white/10 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-blue-500/50 text-xs transition-all"
                     />
                  </div>
                  <div className="space-y-2">
                     <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Minsta beställningsbelopp (i ören)</label>
                     <input 
                       value={form.minOrder}
                       onChange={e => setForm({...form, minOrder: e.target.value})}
                       className="w-full bg-dark-500 border border-white/10 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-blue-500/50 text-xs transition-all"
                     />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                     <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Stripe Public Key</label>
                     <input 
                       value={form.stripePublic}
                       onChange={e => setForm({...form, stripePublic: e.target.value})}
                       placeholder="pk_live_..."
                       className="w-full bg-dark-500 border border-white/10 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-blue-500/50 text-xs transition-all text-white/80"
                     />
                  </div>
                  <div className="space-y-2">
                     <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Stripe Secret Key</label>
                     <input 
                       type="password"
                       value={form.stripeSecret}
                       onChange={e => setForm({...form, stripeSecret: e.target.value})}
                       placeholder="sk_live_..."
                       className="w-full bg-dark-500 border border-white/10 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-blue-500/50 text-xs transition-all text-white/80"
                     />
                  </div>
                </div>
              </div>

              {/* Inloggning */}
              <div className="space-y-4">
                <h3 className="text-sm font-black uppercase tracking-widest text-white/50 border-b border-white/10 pb-2">Admin Inloggning</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Email / Användarnamn</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={14} />
                      <input 
                        type="email"
                        required
                        value={form.adminEmail}
                        onChange={e => setForm({...form, adminEmail: e.target.value})}
                        className="w-full bg-dark-500 border border-white/10 rounded-xl py-2 pl-9 pr-3 outline-none focus:ring-2 focus:ring-blue-500/50 text-xs transition-all"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/30 ml-1">Lösenord</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" size={14} />
                      <input 
                        required
                        value={form.adminPassword}
                        onChange={e => setForm({...form, adminPassword: e.target.value})}
                        className="w-full bg-dark-500 border border-white/10 rounded-xl py-2 pl-9 pr-3 outline-none focus:ring-2 focus:ring-blue-500/50 text-xs transition-all"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={status === "generating"}
                className="w-full bg-blue-600 hover:bg-blue-500 py-4 mt-6 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl shadow-blue-600/20 disabled:opacity-50 transition-all flex items-center justify-center gap-3"
              >
                {status === "generating" ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Sparkles size={18} />
                )}
                Bygg Fristående Restaurang
              </button>
            </form>
          </motion.div>

          <div className="space-y-6">
            <div className="bg-white/5 p-8 rounded-3xl border border-white/10 h-full relative overflow-hidden flex flex-col justify-center">
               {status === "idle" && (
                 <div className="text-center space-y-4 py-10">
                   <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-white/10 mx-auto">
                     <Globe size={32} />
                   </div>
                   <p className="text-white/20 font-bold uppercase tracking-widest text-xs">Redo att klona och anpassa kodbasen</p>
                 </div>
               )}

               {status === "generating" && (
                 <div className="text-center space-y-6 py-10">
                    <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto" />
                    <p className="text-blue-200 font-bold italic">{message}</p>
                    <p className="text-white/30 text-xs uppercase tracking-widest">⚠️ Auto-Setup pågår. Detta kan ta upp till 1 minut då den installerar databas, laddar ner paket och startar servrarna. Lämna inte sidan.</p>
                 </div>
               )}

               {status === "success" && result && (
                 <motion.div 
                   initial={{ opacity: 0, scale: 0.9 }}
                   animate={{ opacity: 1, scale: 1 }}
                   className="text-center space-y-6"
                 >
                   <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
                   <div>
                     <h3 className="text-2xl font-black uppercase italic mb-2">Klart!</h3>
                     <p className="text-white/40 mb-6">{message}</p>
                   </div>
                   
                   <div className="w-full space-y-3 bg-black/40 p-5 rounded-2xl border border-emerald-500/20 text-left">
                      <div className="flex justify-between items-center text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2 border-b border-emerald-500/10 pb-2">
                        <span>Lokal Server Checklista</span>
                        <span>Aktiv</span>
                      </div>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-white/40">Hemsida (Web)</span>
                          <span className="font-mono text-emerald-400">localhost:{result.ports.web}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/40">Admin Panel</span>
                          <span className="font-mono text-emerald-400">localhost:{result.ports.admin}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-white/40">Admin Konto</span>
                          <span className="font-mono text-emerald-400">{form.adminEmail}</span>
                        </div>
                      </div>
                   </div>

                   <div className="w-full bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 text-left">
                     <p className="text-xs text-blue-200 font-bold mb-2">Starta projektet i terminalen:</p>
                     <code className="text-[10px] bg-black/50 p-2 rounded block whitespace-pre-wrap text-blue-300">
                       cd generated/{result.slug}{"\n"}
                       pnpm install{"\n"}
                       cd api && pnpm db:setup{"\n"}
                       pnpm run dev
                     </code>
                   </div>
                 </motion.div>
               )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
