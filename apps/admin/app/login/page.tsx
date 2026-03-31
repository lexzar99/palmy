"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Loader2, Lock, Mail, Eye, EyeOff } from "lucide-react";
import { API_URL } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@palmyrapizzeria.se");
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
      const res = await axios.post(`${API_URL}/api/auth/login`, { email, password });
      localStorage.setItem("palmyra_token", res.data.token);
      localStorage.setItem("palmyra_admin", JSON.stringify(res.data.admin));
      router.replace("/orders");
    } catch (err: any) {
      setError(err.response?.data?.error || "Inloggning misslyckades");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark-500 flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 justify-center mb-12">
          <div className="w-12 h-12 bg-gold-500 rounded-2xl flex items-center justify-center font-black text-dark-500 text-2xl">P</div>
          <div className="text-xl font-black tracking-tight">
            ADMIN <span className="text-gold-500">PALMYRA</span>
          </div>
        </div>

        <form
          onSubmit={handleLogin}
          className="bg-white/5 border border-white/10 rounded-[2rem] p-10 space-y-8"
        >
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tight mb-2">Logga in</h1>
            <p className="text-white/40 text-sm">Adminpanelen för Palmyra Lund</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-[10px] font-black uppercase text-white/20 mb-2 ml-1">E-post</label>
              <div className="relative">
                <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-dark-500 border border-white/10 rounded-2xl py-4 pl-12 pr-6 focus:outline-none focus:ring-2 focus:ring-gold-500/50 transition-all"
                />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-white/20 mb-2 ml-1">Lösenord</label>
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
                <input
                  required
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-dark-500 border border-white/10 rounded-2xl py-4 pl-12 pr-14 focus:outline-none focus:ring-2 focus:ring-gold-500/50 transition-all"
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/20 hover:text-white transition-colors">
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm font-medium">
              ⚠️ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-5 bg-gold-500 hover:bg-gold-400 disabled:opacity-50 text-dark-500 font-black rounded-2xl transition-all shadow-[0_10px_40px_rgba(212,167,74,0.3)] uppercase tracking-widest flex items-center justify-center gap-3"
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : <Lock size={20} />}
            {loading ? "Loggar in..." : "Logga in"}
          </button>

          <div className="text-center text-white/20 text-xs">
            <p className="font-bold">Admin1234!</p>
          </div>
        </form>
      </div>
    </div>
  );
}
