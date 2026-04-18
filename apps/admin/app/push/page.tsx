 
"use client";

import { useState } from "react";
import axios from "axios";
import {
  Bell,
  Send,
  Loader2,
  Smartphone,
  ChevronRight,
  Info,
  History,
  CheckCircle2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { API_URL } from "@/lib/api";
import { useToast } from "@/components/Toast";

export default function PushCentralPage() {
  const { success, error: toastError } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    body: "",
  });

  const sendPush = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title || !form.body) return;

    if (!confirm("Är du säker på att du vill skicka denna push-notis till ALLA mobilanvändare? Detta går inte att ångra.")) return;

    setLoading(true);
    try {
      const token = localStorage.getItem("matgo_token");
      const res = await axios.post(`${API_URL}/api/notifications/admin/send-all`, form, {
        headers: { Authorization: `Bearer ${token}` },
      });
      success(`Push-notis skickad till ${res.data.count} enheter!`);
      setForm({ title: "", body: "" });
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte skicka push-notis");
    } finally {
      setLoading(false);
    }
  };

  const inputCls = "w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-gold-500/30 transition-all placeholder:opacity-30 text-[var(--text-primary)]";

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-24 px-4 bg-[var(--bg-primary)]">
      {/* Header */}
      <div className="pt-6">
        <h1 className="text-3xl font-black uppercase tracking-tight text-[var(--text-primary)] flex items-center gap-3">
          <Bell className="text-gold-500" size={28} /> Push Notis Centralen
        </h1>
        <p className="text-[var(--text-secondary)] text-xs font-bold uppercase tracking-widest mt-2 flex items-center gap-2">
          Kommunicera direkt med alla MatGo användare <ChevronRight size={12} /> Live
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8 items-start">
        {/* Left: Form */}
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="p-8 rounded-[2.5rem] border border-[var(--border-subtle)] bg-[var(--bg-secondary)] shadow-2xl relative overflow-hidden"
        >
          {/* Subtle decoration */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-gold-500/5 rounded-full blur-3xl pointer-events-none" />
          
          <form onSubmit={sendPush} className="space-y-6 relative z-10">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-2.5">
                Titel (Notisens rubrik)
              </label>
              <input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="t.ex. Lunchdags! 🥗"
                className={inputCls}
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-2.5">
                Meddelande (Brödtext)
              </label>
              <textarea
                required
                rows={4}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="t.ex. Använd koden LUNCH20 för 20kr rabatt på din nästa beställning."
                className={inputCls}
              />
            </div>

            <div className="p-5 rounded-2xl bg-gold-500/5 border border-gold-500/10 flex gap-4">
              <div className="w-8 h-8 rounded-lg bg-gold-500/10 flex items-center justify-center shrink-0">
                <Info className="text-gold-500" size={16} />
              </div>
              <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed font-bold">
                <span className="text-gold-500 font-black">SÄKERHETSKONTROLL:</span> Detta meddelande kommer att trigga en push-notis hos <span className="text-white">samtliga</span> mobilanvändare som har notiser aktiverade. Dubbelkolla stavning och länkar innan du trycker på skicka.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !form.title || !form.body}
              className="w-full py-4.5 rounded-2xl bg-gold-500 hover:bg-gold-400 disabled:opacity-30 disabled:hover:bg-gold-500 text-[#0d0d0d] font-black uppercase tracking-widest text-xs flex items-center justify-center gap-3 shadow-[0_10px_30px_rgba(231,178,75,0.3)] transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              {loading ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <>
                  <Send size={18} /> Skicka Till Alla Mobiler
                </>
              )}
            </button>
          </form>
        </motion.div>

        {/* Right: Preview */}
        <div className="space-y-8 flex flex-col items-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-2">Live Förhandsvisning</p>
          
          {/* Phone Mockup */}
          <div className="relative w-64 h-[500px] rounded-[3rem] border-[10px] border-[#1e1e1e] bg-[#0d0d0d] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] overflow-hidden">
            {/* Speaker hole */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-5 bg-[#1e1e1e] rounded-b-2xl z-20" />
            
            {/* Screen Content */}
            <div className="absolute inset-0 bg-neutral-900 overflow-hidden">
                {/* Wallpaper effect */}
                <div className="absolute inset-0 bg-gradient-to-tr from-rose-500/10 via-gold-500/5 to-sky-500/10" />
                
                {/* Time/Date */}
                <div className="mt-14 text-center">
                    <p className="text-4xl font-light text-white/90">20:00</p>
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-1">Torsdag 16 April</p>
                </div>

                {/* Notification Area */}
                <div className="mt-16 px-3">
                    <AnimatePresence mode="wait">
                      {form.title ? (
                        <motion.div 
                          key="notif"
                          initial={{ opacity: 0, scale: 0.9, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: 10 }}
                          className="p-3.5 rounded-2xl bg-[#1c1c1e]/80 backdrop-blur-xl border border-white/5 shadow-2xl"
                        >
                          <div className="flex items-center gap-2 mb-1.5 px-0.5">
                            <div className="w-5 h-5 rounded-lg bg-gold-500 flex items-center justify-center text-[10px] font-black text-black">M</div>
                            <span className="text-[10px] font-black text-white/50 uppercase tracking-wider">MatGo</span>
                            <span className="text-[10px] font-bold text-white/30 ml-auto uppercase tracking-tighter">Nu</span>
                          </div>
                          <p className="text-[11px] font-black text-white/95 leading-tight">{form.title}</p>
                          <p className="text-[10px] font-medium text-white/70 leading-tight mt-1">{form.body || "Ingen brödtext angiven..."}</p>
                        </motion.div>
                      ) : (
                        <div className="py-12 flex flex-col items-center opacity-20">
                            <Bell size={24} className="text-white mb-2" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-white text-center">Väntar på innehåll...</p>
                        </div>
                      )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Bottom Bar */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-24 h-1.5 bg-white/20 rounded-full" />
          </div>

          {/* Stats Summary */}
          <div className="w-full grid grid-cols-2 gap-3">
             <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-center">
                <p className="text-[10px] font-black uppercase text-[var(--text-secondary)] mb-1">Status</p>
                <div className="flex items-center justify-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <p className="text-xs font-black text-emerald-400 uppercase">Live</p>
                </div>
             </div>
             <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-center">
                <p className="text-[10px] font-black uppercase text-[var(--text-secondary)] mb-1">Plattform</p>
                <p className="text-xs font-black text-[var(--text-primary)] uppercase">IOS & Android</p>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
