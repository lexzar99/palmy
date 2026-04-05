"use client";

import { useEffect, useState, useCallback } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import axios from "axios";
import {
  User, Settings, MapPin, Mail, Phone, LogOut, ChevronRight,
  Package, History, ShieldCheck, Lock, ArrowLeft, Loader2, Save, Bell, Check
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";

// ─── Country codes ─────────────────────────────────────────────────────────
const COUNTRY_CODES = [
  { flag: "🇸🇪", code: "+46", country: "Sverige" },
  { flag: "🇳🇴", code: "+47", country: "Norge" },
  { flag: "🇩🇰", code: "+45", country: "Danmark" },
  { flag: "🇫🇮", code: "+358", country: "Finland" },
  { flag: "🇩🇪", code: "+49", country: "Tyskland" },
  { flag: "🇬🇧", code: "+44", country: "Storbritannien" },
  { flag: "🇵🇱", code: "+48", country: "Polen" },
  { flag: "🇸🇴", code: "+252", country: "Somalia" },
  { flag: "🇸🇾", code: "+963", country: "Syrien" },
  { flag: "🇮🇶", code: "+964", country: "Irak" },
  { flag: "🇱🇧", code: "+961", country: "Libanon" },
  { flag: "🇺🇸", code: "+1", country: "USA" },
];

function CountryPicker({
  value, onChange
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = COUNTRY_CODES.find(c => c.code === value) || COUNTRY_CODES[0];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl py-4 px-4 text-white font-bold whitespace-nowrap h-full"
      >
        <span className="text-lg">{selected.flag}</span>
        <span className="text-sm">{selected.code}</span>
        <ChevronRight size={14} className={`text-zinc-500 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            className="absolute top-full left-0 mt-2 z-50 bg-zinc-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl w-52"
          >
            {COUNTRY_CODES.map(c => (
              <button
                key={c.code}
                type="button"
                onClick={() => { onChange(c.code); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-white/5 transition-colors text-left ${value === c.code ? "text-gold-500 font-black" : "text-white"}`}
              >
                <span className="text-base">{c.flag}</span>
                <div>
                  <div className="font-bold text-xs">{c.country}</div>
                  <div className="text-zinc-600 text-[10px]">{c.code}</div>
                </div>
                {value === c.code && <Check size={14} className="ml-auto text-gold-500" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Social login button ───────────────────────────────────────────────────
function SocialButton({
  provider,
  label,
  icon,
}: {
  provider: "google" | "facebook";
  label: string;
  icon: React.ReactNode;
}) {
  const [loading, setLoading] = useState(false);

  // This component now only triggers the sign-in flow
  const handleClick = async () => {
    setLoading(true);
    await signIn(provider, { callbackUrl: window.location.origin + "/profile" });
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="flex items-center justify-center gap-2.5 py-4 bg-white/5 border border-white/10 rounded-2xl text-[11px] font-black uppercase text-zinc-300 hover:text-white hover:bg-white/10 transition-all active:scale-95 disabled:opacity-50"
    >
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      {loading ? "Laddar..." : label}
    </button>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function ProfilePage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "orders" | "settings">("overview");
  const [hasVisited, setHasVisited] = useState(false);

  // Login
  const [countryCode, setCountryCode] = useState("+46");
  const [loginPhone, setLoginPhone] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Edit
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
 
  // Add phone for OAuth users
  const [showAddPhone, setShowAddPhone] = useState(false);
  const [addPhoneCountry, setAddPhoneCountry] = useState("+46");
  const [addPhoneNum, setAddPhoneNum] = useState("");
  const [addPhoneLoading, setAddPhoneLoading] = useState(false);
  const [addPhoneError, setAddPhoneError] = useState("");

  const fetchData = useCallback(async (authToken: string) => {
    try {
      const [profileRes, ordersRes] = await Promise.all([
        axios.get(`${API_URL}/api/profile`, { headers: { Authorization: `Bearer ${authToken}` } }),
        axios.get(`${API_URL}/api/profile/orders`, { headers: { Authorization: `Bearer ${authToken}` } }),
      ]);
      setUser(profileRes.data);
      setEditName(profileRes.data.name || "");
      setEditEmail(profileRes.data.email || "");
      setOrders(ordersRes.data || []);
    } catch {
      handleLogout();
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── OAuth Session Exchange ──────────────────────────────────────────────
  const { data: session, status } = useSession();
 
  useEffect(() => {
    if (status === "authenticated" && (session as any)?.platformToken) {
      const pToken = (session as any).platformToken as string;
      const pUser = (session as any).platformUser as any;
      
      // Only update if we don't already have this token to avoid loops
      if (token !== pToken) {
        localStorage.setItem("platform_user_token", pToken);
        setToken(pToken);
        setUser(pUser);
        fetchData(pToken);
        
        // If OAuth user has no phone, show add-phone prompt
        if (pUser?.needsPhone) {
          setShowAddPhone(true);
        }
      }
    }
  }, [status, session, token, fetchData]);

  useEffect(() => {
    const visited = localStorage.getItem("platform_has_visited");
    if (visited) setHasVisited(true);
    else localStorage.setItem("platform_has_visited", "true");

    const savedToken = localStorage.getItem("platform_user_token");
    if (savedToken) {
      setToken(savedToken);
      fetchData(savedToken);
    } else {
      setLoading(false);
    }
  }, [fetchData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError("");
    const fullPhone = `${countryCode}${loginPhone.replace(/^0/, "")}`;
    try {
      const res = await axios.post(`${API_URL}/api/account/login-user`, {
        identifier: fullPhone,
        password: loginPassword,
      });
      const { token: nt } = res.data;
      localStorage.setItem("platform_user_token", nt);
      setToken(nt);
      fetchData(nt);
    } catch (err: any) {
      setLoginError(err.response?.data?.error || "Fel telefonnummer eller lösenord");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleAddPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddPhoneLoading(true);
    setAddPhoneError("");
    const fullPhone = `${addPhoneCountry}${addPhoneNum.replace(/^0/, "")}`;
    try {
      await axios.patch(`${API_URL}/api/account/add-phone`, { phone: fullPhone }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setShowAddPhone(false);
      fetchData(token!);
    } catch (err: any) {
      setAddPhoneError(err.response?.data?.error || "Kunde inte spara");
    } finally {
      setAddPhoneLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await axios.patch(`${API_URL}/api/profile`, { name: editName, email: editEmail }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUser((prev: any) => ({ ...prev, name: editName, email: editEmail }));
      setSaveSuccess(true);
      setTimeout(() => { setSaveSuccess(false); setIsEditing(false); }, 1500);
    } catch {
      alert("Kunde inte spara");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    localStorage.removeItem("platform_user_token");
    setToken(null);
    setUser(null);
    setOrders([]);
    // Sign out from NextAuth if they logged in via Google/Facebook
    await signOut({ redirect: false });
  };

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="animate-spin text-gold-500" size={40} />
      </div>
    );
  }

  // ─── Not logged in ────────────────────────────────────────────────────────
  if (!token || !user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-6 pt-20 pb-32">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm space-y-8">

          {/* Header */}
          <div className="text-center space-y-3">
            <div className="w-20 h-20 bg-gold-500/10 rounded-[2rem] border border-gold-500/20 flex items-center justify-center text-gold-500 mx-auto">
              <Lock size={36} />
            </div>
            <h1 className="text-4xl font-black uppercase tracking-tight text-white">
              {hasVisited ? "Välkommen" : "Skapa"}{" "}
              <span className="text-gold-500">{hasVisited ? "Tillbaka" : "Konto"}</span>
            </h1>
            <p className="text-zinc-500 text-[11px] font-bold uppercase tracking-widest">
              {hasVisited ? "Logga in med telefon eller social" : "Gå med — gratis och tar 30 sek"}
            </p>
          </div>

          {/* Phone login form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-zinc-600 ml-1 mb-1 block">Telefonnummer</label>
              <div className="flex gap-2">
                <CountryPicker value={countryCode} onChange={setCountryCode} />
                <input
                  required
                  type="tel"
                  autoComplete="tel"
                  value={loginPhone}
                  onChange={(e) => setLoginPhone(e.target.value)}
                  placeholder="070 000 00 00"
                  className="flex-1 bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-white font-bold placeholder:text-zinc-600 outline-none focus:ring-2 focus:ring-gold-500/40 transition-all"
                />
              </div>
            </div>
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-zinc-600 ml-1 mb-1 block">Lösenord</label>
              <input
                required
                type="password"
                autoComplete="current-password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Ditt lösenord"
                className="w-full bg-white/5 border border-white/10 rounded-3xl py-5 px-7 text-white font-bold placeholder:text-zinc-600 outline-none focus:ring-2 focus:ring-gold-500/40 transition-all"
              />
            </div>
            {loginError && (
              <p className="text-red-500 text-[11px] font-black uppercase tracking-widest text-center">{loginError}</p>
            )}
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full bg-gold-500 text-zinc-950 py-5 rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl shadow-gold-500/20 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-60"
            >
              {isLoggingIn ? <Loader2 className="animate-spin" size={20} /> : "Logga in med telefon"}
            </button>
          </form>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/5" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-zinc-950 px-4 text-[10px] font-black uppercase tracking-widest text-zinc-600">
                Eller med socialt konto
              </span>
            </div>
          </div>

          {/* Social buttons — real OAuth */}
          <div className="grid grid-cols-2 gap-3">
            <SocialButton
              provider="google"
              label="Google"
              icon={
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#EA4335" d="M5.27 9.76A7.08 7.08 0 0 1 12 5c1.69 0 3.21.6 4.4 1.59L19.9 3.1A11.94 11.94 0 0 0 12 0C8.16 0 4.82 2 2.86 5.01l2.41 2.75z"/>
                  <path fill="#34A853" d="M16.04 18.01A7.07 7.07 0 0 1 12 19.1c-2.93 0-5.44-1.78-6.6-4.34l-2.84 2.19A11.96 11.96 0 0 0 12 24c3.24 0 6.17-1.17 8.4-3.09l-4.36-2.9z"/>
                  <path fill="#4A90D9" d="M19.1 12.2c0-.73-.07-1.36-.18-2H12v4.01h4.04a3.7 3.7 0 0 1-1.53 2.36l4.36 2.9c2.61-2.41 3.23-5.96.23-7.27z"/>
                  <path fill="#FBBC05" d="M5.4 14.76A7.16 7.16 0 0 1 5 12c0-.95.19-1.86.41-2.24L2.86 7.01A11.9 11.9 0 0 0 0 12c0 1.7.37 3.31.97 4.77l4.43-2z"/>
                </svg>
              }
            />
            <SocialButton
              provider="facebook"
              label="Facebook"
              icon={
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#1877F2" d="M24 12.073C24 5.404 18.627 0 12 0S0 5.404 0 12.073C0 18.1 4.389 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.268h3.328l-.532 3.49h-2.796V24C19.61 23.094 24 18.1 24 12.073z"/>
                </svg>
              }
            />
          </div>

          {/* Register link */}
          <p className="text-center text-[11px] font-bold uppercase tracking-widest text-zinc-600">
            Inget konto?{" "}
            <Link href="/register" className="text-gold-500 hover:text-gold-400 transition-colors">
              Skapa konto gratis
            </Link>
          </p>
        </motion.div>
      </div>
    );
  }

  // ─── Add phone prompt (for OAuth users without phone) ─────────────────────
  if (showAddPhone) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-6">
        <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-sm space-y-8">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 bg-gold-500/10 rounded-2xl flex items-center justify-center text-gold-500 mx-auto"><Phone size={28} /></div>
            <h2 className="text-2xl font-black uppercase italic tracking-tight">Lägg till telefon</h2>
            <p className="text-zinc-500 text-sm leading-relaxed">
              Ditt konto är knutet till ditt sociala konto. Lägg till ditt telefonnummer för säkrare inloggning — det kan aldrig ändras.
            </p>
          </div>
          <form onSubmit={handleAddPhone} className="space-y-4">
            <div className="flex gap-2">
              <CountryPicker value={addPhoneCountry} onChange={setAddPhoneCountry} />
              <input
                required
                type="tel"
                autoComplete="tel"
                value={addPhoneNum}
                onChange={e => setAddPhoneNum(e.target.value)}
                placeholder="070 000 00 00"
                className="flex-1 bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-white font-bold placeholder:text-zinc-600 outline-none focus:ring-2 focus:ring-gold-500/40"
              />
            </div>
            {addPhoneError && <p className="text-red-500 text-[11px] text-center font-black uppercase">{addPhoneError}</p>}
            <button
              type="submit"
              disabled={addPhoneLoading}
              className="w-full py-5 bg-gold-500 text-zinc-950 rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl shadow-gold-500/20 active:scale-95 transition-all flex items-center justify-center gap-3"
            >
              {addPhoneLoading ? <Loader2 className="animate-spin" size={20} /> : "Spara nummer"}
            </button>
            <button type="button" onClick={() => setShowAddPhone(false)} className="w-full text-center text-[10px] font-black uppercase tracking-widest text-zinc-600 hover:text-white transition-colors">
              Hoppa över för nu
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // ─── Logged in ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-zinc-950 pt-20 pb-32 px-6">
      <div className="max-w-xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-gold-500 to-amber-600 rounded-[1.5rem] flex items-center justify-center text-zinc-950 font-black text-xl shadow-lg">
              {user.image ? (
                <img src={user.image} alt="" className="w-full h-full rounded-[1.5rem] object-cover" />
              ) : (
                user.name?.charAt(0)?.toUpperCase() || "U"
              )}
            </div>
            <div>
              <h1 className="text-xl font-black uppercase italic tracking-tight text-white">{user.name}</h1>
              <p className="text-[10px] font-black uppercase tracking-widest text-gold-500 opacity-70">
                {user.oauthProvider ? `${user.oauthProvider.charAt(0).toUpperCase() + user.oauthProvider.slice(1)} konto` : "Verified Member"}
              </p>
            </div>
          </div>
          <button onClick={handleLogout} className="p-3 bg-white/5 hover:bg-red-500/10 text-zinc-500 hover:text-red-500 rounded-2xl transition-all">
            <LogOut size={20} />
          </button>
        </div>

        {/* Phone missing warning for OAuth users */}
        {!user.phone && (
          <button
            onClick={() => setShowAddPhone(true)}
            className="w-full bg-amber-500/10 border border-amber-500/20 p-5 rounded-[2rem] flex items-center justify-between text-left hover:bg-amber-500/15 transition-all"
          >
            <div>
              <p className="text-[10px] font-black uppercase text-amber-400 tracking-widest">Rekommenderat</p>
              <p className="text-white font-bold text-sm mt-0.5">Lägg till telefonnummer</p>
            </div>
            <ChevronRight size={18} className="text-amber-400" />
          </button>
        )}

        {/* Verify phone banner */}
        {user.phone && !user.isVerified && (
          <div className="bg-red-500/10 border border-red-500/20 p-5 rounded-[2rem] flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase text-red-400 tracking-widest">Krävs</p>
              <p className="text-white font-bold text-sm mt-0.5">Verifiera ditt telefonnummer</p>
            </div>
            <Link href="/verify-phone" className="px-5 py-3 bg-red-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest">
              Fixa nu
            </Link>
          </div>
        )}

        {/* Tabs */}
        <div className="grid grid-cols-3 bg-white/5 border border-white/5 p-1.5 rounded-[2rem]">
          {[
            { id: "overview", icon: User, label: "Hem" },
            { id: "orders", icon: History, label: "Ordrar" },
            { id: "settings", icon: Settings, label: "Inställn" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id as any); setIsEditing(false); }}
              className={`flex flex-col items-center gap-1.5 py-4 rounded-3xl transition-all ${activeTab === tab.id ? "bg-white/10 text-gold-500" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              <tab.icon size={18} />
              <span className="text-[8px] font-black uppercase tracking-widest">{tab.label}</span>
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* Overview */}
          {activeTab === "overview" && (
            <motion.div key="ov" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <div className="bg-white/5 border border-white/5 rounded-[2.5rem] p-8 space-y-5">
                <div className="flex items-center gap-4">
                  <Phone size={16} className="text-zinc-600 shrink-0" />
                  <div className="flex-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">Telefon</p>
                    <p className="font-bold text-white text-sm">{user.phone || "Ej angivet"}</p>
                  </div>
                  {user.phone && <span className="text-[8px] bg-red-500/10 text-red-500 border border-red-500/20 px-2 py-1 rounded-full uppercase font-black">Låst</span>}
                </div>
                <div className="flex items-center gap-4">
                  <Mail size={16} className="text-zinc-600 shrink-0" />
                  <div className="flex-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600">E-post</p>
                    <p className="font-bold text-white text-sm">{user.email || "Ej angivet"}</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 border border-white/5 rounded-[2rem] p-6">
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mb-1">Beställningar</p>
                  <p className="text-3xl font-black text-white">{orders.length}</p>
                </div>
                <div className={`border rounded-[2rem] p-6 ${user.isVerified ? "bg-emerald-500/10 border-emerald-500/20" : "bg-white/5 border-white/5"}`}>
                  <p className="text-[9px] font-black uppercase tracking-widest text-zinc-600 mb-1">Status</p>
                  <p className={`text-sm font-black uppercase ${user.isVerified ? "text-emerald-400" : "text-red-400"}`}>
                    {user.isVerified ? "✓ Verifierad" : "Ej veri."}
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Orders */}
          {activeTab === "orders" && (
            <motion.div key="ord" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              {orders.length === 0 ? (
                <div className="py-20 text-center opacity-30">
                  <History size={48} className="mx-auto mb-4" />
                  <p className="font-black uppercase tracking-widest text-sm">Inga ordrar ännu</p>
                </div>
              ) : orders.map((order) => (
                <Link key={order.id} href={`/order/${order.id}`} className="block bg-white/5 border border-white/5 rounded-[2.5rem] p-6 hover:bg-white/10 transition-all group">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-black uppercase italic text-sm">{order.restaurant?.name || "Beställning"}</p>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">
                        {new Date(order.createdAt).toLocaleDateString("sv-SE")}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-xl font-black text-gold-500">{(order.total || 0).toFixed(0)} kr</p>
                      <ChevronRight size={16} className="text-zinc-600 group-hover:text-gold-500 transition-colors" />
                    </div>
                  </div>
                </Link>
              ))}
            </motion.div>
          )}

          {/* Settings */}
          {activeTab === "settings" && !isEditing && (
            <motion.div key="set" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              <button
                onClick={() => setIsEditing(true)}
                className="w-full flex items-center justify-between p-6 bg-white/5 border border-white/5 rounded-[2rem] hover:bg-white/10 transition-all text-left"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-400"><Settings size={18} /></div>
                  <div>
                    <p className="text-sm font-bold uppercase italic">Redigera profil</p>
                    <p className="text-[10px] text-zinc-600">Namn och e-post</p>
                  </div>
                </div>
                <ChevronRight size={18} className="text-zinc-700" />
              </button>
              <div className="w-full flex items-center justify-between p-6 bg-white/5 border border-white/5 rounded-[2rem] opacity-40 cursor-not-allowed">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center text-zinc-400"><Bell size={18} /></div>
                  <div>
                    <p className="text-sm font-bold uppercase italic">Notiser</p>
                    <p className="text-[10px] text-zinc-600">Kommer snart</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Edit form */}
          {isEditing && (
            <motion.form
              key="edit"
              onSubmit={handleUpdateProfile}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white/5 border border-white/5 p-8 rounded-[2.5rem] space-y-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <button type="button" onClick={() => setIsEditing(false)} className="p-2 text-zinc-500 hover:text-white rounded-xl">
                  <ArrowLeft size={18} />
                </button>
                <h3 className="text-lg font-black uppercase italic">Ändra uppgifter</h3>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-zinc-600 ml-1 mb-1 block">Namn</label>
                  <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white font-bold outline-none focus:ring-2 focus:ring-gold-500/40" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-zinc-600 ml-1 mb-1 block">E-post</label>
                  <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="din@email.se" className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 text-white font-bold outline-none focus:ring-2 focus:ring-gold-500/40" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-zinc-600 ml-1 mb-1 block">Telefon (ej ändringsbart)</label>
                  <input disabled value={user.phone || "Ej angivet"} className="w-full bg-zinc-900/60 border border-white/5 rounded-2xl py-4 px-6 text-zinc-600 font-bold cursor-not-allowed" />
                </div>
              </div>
              <button
                type="submit"
                disabled={isSaving}
                className={`w-full py-5 rounded-3xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 transition-all ${saveSuccess ? "bg-emerald-500 text-white" : "bg-gold-500 text-zinc-950 shadow-xl shadow-gold-500/20 active:scale-95"}`}
              >
                {isSaving ? <Loader2 className="animate-spin" size={20} /> : saveSuccess ? "Sparat! ✓" : <><Save size={18} /> Spara</>}
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
