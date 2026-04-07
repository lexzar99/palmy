"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { API_URL } from "@/lib/api";
import { Lock, Mail, ArrowRight, Loader2, Info } from "lucide-react";
import { motion } from "framer-motion";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await axios.post(`${API_URL}/api/auth/login`, { email, password });
      localStorage.setItem("matgo_token", res.data.token);
      localStorage.setItem("matgo_admin", JSON.stringify(res.data.admin));
      router.push("/");
    } catch (err: any) {
      setError(err.response?.data?.error || "Inloggning misslyckades.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm bg-zinc-900 border border-white/5 p-12 rounded-[3.5rem] shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1.5 bg-gold-500" />
        
        <div className="flex flex-col items-center text-center mb-10">
           <div className="w-16 h-16 rounded-[2rem] bg-gold-500 flex items-center justify-center text-zinc-950 font-black rotate-6 italic text-3xl mb-6 shadow-xl shadow-gold-500/20">M</div>
           <h1 className="text-3xl font-black uppercase italic tracking-tighter text-white">Partner Hub</h1>
           <p className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500 mt-3">Hantera dina order & meny</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-600 ml-1">E-post</label>
            <div className="relative group">
              <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-gold-500 transition-colors" size={18} />
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-zinc-950 border border-white/5 rounded-2xl pl-12 pr-6 py-5 text-sm font-bold outline-none focus:border-gold-500/50 transition-all text-white" placeholder="partner@matgo.se" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-600 ml-1">Lösenord</label>
            <div className="relative group">
              <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-600 group-focus-within:text-gold-500 transition-colors" size={18} />
              <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-zinc-950 border border-white/5 rounded-2xl pl-12 pr-6 py-5 text-sm font-bold outline-none focus:border-gold-500/50 transition-all text-white" placeholder="••••••••" />
            </div>
          </div>

          {error && (
            <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-500 text-[10px] font-black uppercase tracking-widest text-center">{error}</motion.div>
          )}

          <button disabled={loading} type="submit" className="w-full py-5 bg-gold-500 hover:bg-gold-600 text-zinc-950 rounded-2xl font-black uppercase tracking-[0.2em] text-xs shadow-xl shadow-gold-500/20 active:scale-95 transition-all flex items-center justify-center gap-3">
             {loading ? <Loader2 className="animate-spin" size={18} /> : <>Logga In <ArrowRight size={18} /></>}
          </button>
        </form>

        <div className="mt-12 pt-8 border-t border-white/5 flex flex-col items-center gap-3">
           <Info size={20} className="text-zinc-700" />
           <p className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest text-center leading-relaxed">Systemet är låst för auktoriserade partners.<br />Kontakta support för kontofrågor.</p>
        </div>
      </motion.div>
    </div>
  );
}
