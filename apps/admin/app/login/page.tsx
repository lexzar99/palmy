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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6 font-sans">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 justify-center mb-10">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-black text-white text-xl shadow-lg shadow-blue-500/20">P</div>
          <div className="text-xl font-extrabold tracking-tight text-slate-800">
            ADMIN <span className="text-blue-600">PANEL</span>
          </div>
        </div>

        <form
          onSubmit={handleLogin}
          className="bg-white border border-slate-200 shadow-2xl shadow-blue-900/5 rounded-[2.5rem] p-8 sm:p-12 space-y-8"
        >
          <div>
            <h1 className="text-3xl font-black text-slate-900 mb-2">Välkommen</h1>
            <p className="text-slate-400 text-sm font-medium">Logga in på kontrollpanelen</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-2 ml-1 tracking-widest">Användarnamn</label>
              <div className="relative">
                <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                <input
                  required
                  type="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-6 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-400 transition-all text-slate-700 font-medium"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-2 ml-1 tracking-widest">Lösenord</label>
              <div className="relative">
                <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                <input
                  required
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-14 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-400 transition-all text-slate-700 font-medium"
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors">
                  {showPw ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-500 text-xs font-bold uppercase tracking-wide flex items-center gap-2">
              <span className="text-base">⚠️</span> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-black rounded-2xl transition-all shadow-xl shadow-blue-500/25 uppercase tracking-widest flex items-center justify-center gap-3 active:scale-[0.98]"
          >
            {loading ? <Loader2 size={20} className="animate-spin" /> : <Lock size={20} />}
            {loading ? "Loggar in..." : "Logga in"}
          </button>

          <div className="text-center">
            <p className="text-slate-300 text-[10px] font-bold uppercase tracking-tighter italic">system v2.0 • secure access</p>
          </div>
        </form>
      </div>
    </div>
  );
}
