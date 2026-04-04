"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Loader2, Lock, Mail, Eye, EyeOff, User } from "lucide-react";
import { API_URL } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("admin");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPw, setShowPw] = useState(false);

  // Auto-redirect if already logged in
  useEffect(() => {
    const token = localStorage.getItem("palmyra_token");
    if (token) router.replace("/orders");
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/account/login`, { identifier, password });
      localStorage.setItem("palmyra_token", res.data.token);
      localStorage.setItem("palmyra_admin", JSON.stringify(res.data.admin));
      if (res.data.admin?.role === "SUPER_ADMIN") {
        router.replace("/restaurants");
      } else {
        router.replace("/orders");
      }
    } catch (err: any) {
      setError(err.response?.data?.error || "Inloggning misslyckades");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07080d] flex items-center justify-center px-6 font-sans relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gold-600/5 rounded-full blur-[120px]" />

      <div className="w-full max-w-md relative z-10">
        <div className="flex flex-col items-center justify-center mb-10">
          <div className="w-14 h-14 bg-gold-500 rounded-2xl flex items-center justify-center font-black text-dark-500 text-3xl shadow-2xl shadow-gold-500/20 mb-6">P</div>
          <div className="text-center">
            <div className="text-[10px] font-black uppercase tracking-[0.5em] text-gold-500/60 mb-2">Authenticated Access</div>
            <div className="text-2xl font-black tracking-tighter text-white uppercase italic">Palmyra <span className="text-gold-500">Admin</span></div>
          </div>
        </div>

        <form
          onSubmit={handleLogin}
          className="bg-[#0f111a] border border-white/5 shadow-2xl rounded-[3rem] p-10 sm:p-14 space-y-10"
        >
          <div className="space-y-8">
            <div className="group">
              <label className="block text-[11px] font-black uppercase text-white/20 mb-3 ml-2 tracking-widest group-focus-within:text-gold-500 transition-colors">Credential ID</label>
              <div className="relative">
                <User size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-white/10 group-focus-within:text-gold-500 transition-all" />
                <input
                  required
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full bg-[#07080d] border border-white/5 rounded-2xl py-5 pl-14 pr-6 focus:outline-none focus:border-gold-500/40 focus:ring-4 focus:ring-gold-500/5 transition-all text-white font-bold"
                />
              </div>
            </div>
            <div className="group">
              <label className="block text-[11px] font-black uppercase text-white/20 mb-3 ml-2 tracking-widest group-focus-within:text-gold-500 transition-colors">Access Code</label>
              <div className="relative">
                <Lock size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-white/10 group-focus-within:text-gold-500 transition-all" />
                <input
                  required
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-[#07080d] border border-white/5 rounded-2xl py-5 pl-14 pr-16 focus:outline-none focus:border-gold-500/40 focus:ring-4 focus:ring-gold-500/5 transition-all text-white font-bold"
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-5 top-1/2 -translate-y-1/2 text-white/10 hover:text-white transition-colors">
                  {showPw ? <EyeOff size={22} /> : <Eye size={22} />}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-5 bg-rose-500/5 border border-rose-500/10 rounded-2xl text-rose-500 text-xs font-black uppercase tracking-widest text-center animate-shake">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-6 bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-dark-500 font-black rounded-2xl transition-all shadow-2xl shadow-gold-500/10 uppercase tracking-widest flex items-center justify-center gap-4 active:scale-[0.98] text-sm"
          >
            {loading ? <Loader2 size={24} className="animate-spin" /> : <Lock size={24} />}
            {loading ? "Decrypting..." : "Initialize Admin"}
          </button>
        </form>
      </div>
    </div>
  );
}
