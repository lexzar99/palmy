"use client";

import { useEffect, useState, useCallback } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import axios from "axios";
import {
  User, Settings, MapPin, Mail, Phone, LogOut, ChevronRight,
  Package, History, ShieldCheck, Lock, ArrowLeft, Loader2, Save, Bell, Check, Edit2, Sparkles, Ticket, Tag,
  Star, RotateCcw, Home, Briefcase, Plus, Trash2, Scale
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";
import { useCartStore } from "@/store/cartStore";

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

  const handleClick = async () => {
    setLoading(true);
    try {
      // Use a relative callbackUrl so NextAuth redirects to the correct origin
      // (avoids issues when NEXTAUTH_URL doesn't match the current browser URL)
      await signIn(provider, { callbackUrl: "/profile" });
    } catch {
      setLoading(false);
    }
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
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "orders" | "settings" | "deals" | "addresses">("overview");
  const [hasVisited, setHasVisited] = useState(false);
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  // Saved addresses state
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [newAddrLabel, setNewAddrLabel] = useState("Hem");
  const [newAddrStreet, setNewAddrStreet] = useState("");
  const [newAddrCity, setNewAddrCity] = useState("");
  const [newAddrZip, setNewAddrZip] = useState("");
  const [newAddrNote, setNewAddrNote] = useState("");
  const [addrSaving, setAddrSaving] = useState(false);

  // Auth (Phone OTP)
  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [otpPhone, setOtpPhone] = useState(""); // Stores phone after sending OTP
  const [isLoggingOut, setIsLoggingOut] = useState(false); // To fix logout bug

  const [countryCode, setCountryCode] = useState("+46");
  const [loginPhone, setLoginPhone] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Edit profile
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editShowNameInput, setEditShowNameInput] = useState(false); // For new phone users
  const [editEmail, setEditEmail] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
 
  // Add phone for OAuth users (Transition to OTP)
  const [showAddPhone, setShowAddPhone] = useState(false);
  const [addPhoneCountry, setAddPhoneCountry] = useState("+46");
  const [addPhoneNum, setAddPhoneNum] = useState("");
  const [addPhoneLoading, setAddPhoneLoading] = useState(false);
  const [addPhoneError, setAddPhoneError] = useState("");
  const [isChangingPhone, setIsChangingPhone] = useState(false); // Link to edit phone number

  const fetchData = useCallback(async (authToken: string) => {
    try {
      const [profileRes, ordersRes, dealsRes] = await Promise.all([
        axios.get(`${API_URL}/api/profile`, { headers: { Authorization: `Bearer ${authToken}` } }),
        axios.get(`${API_URL}/api/profile/orders`, { headers: { Authorization: `Bearer ${authToken}` } }),
        axios.get(`${API_URL}/api/profile/deals`, { headers: { Authorization: `Bearer ${authToken}` } }),
      ]);
      setUser(profileRes.data);
      setEditName(profileRes.data.name || "");
      setEditEmail(profileRes.data.email || "");
      setOrders(ordersRes.data || []);
      setDeals(dealsRes.data || []);

      // Fetch saved addresses
      if (authToken) {
        try {
          const addrRes = await axios.get(`${API_URL}/api/profile/addresses`, { headers: { Authorization: `Bearer ${authToken}` } });
          setSavedAddresses(addrRes.data || []);
        } catch {}
      }
      
      // If user has no phone and we are not in the middle of verifying one, prompt them
      if (!profileRes.data.phone) {
        setShowAddPhone(true);
      } else {
        setShowAddPhone(false);
        setShowOtp(false);
      }
    } catch (err: any) {
      handleLogout();
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── OAuth Session Exchange ──────────────────────────────────────────────
  const { data: session, status } = useSession();
 
  useEffect(() => {
    if (status === "authenticated" && (session as any)?.platformToken && !isLoggingOut) {
      const pToken = (session as any).platformToken as string;
      const pUser = (session as any).platformUser as any;
      
      // Only sync from session if we don't have a token OR if the session user is different
      // and we haven't already verified our phone (to prevent stale session overwriting our new verified token)
      const isVerifiedLocally = user?.isVerified === true;
      if (token !== pToken && !isVerifiedLocally) {
        localStorage.setItem("platform_user_token", pToken);
        setToken(pToken);
        // Don't setUser(pUser) as it might be stale.
        fetchData(pToken);
      }
    }
  }, [status, session, token, user, fetchData, isLoggingOut]);

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

  const handleSendOtp = async (e: React.FormEvent, customPhone?: string) => {
    if (e) e.preventDefault();
    setIsLoggingIn(true);
    setLoginError("");
    const phoneToUse = customPhone || `${countryCode}${loginPhone.replace(/^0/, "")}`;
    setOtpPhone(phoneToUse);

    try {
      await axios.post(`${API_URL}/api/account/send-otp`, { phone: phoneToUse });
      setShowOtp(true);
      if (showAddPhone) setShowAddPhone(false); // If we were in OAuth add-phone
    } catch (err: any) {
      setLoginError(err.response?.data?.error || "Kunde inte skicka kod");
      if (showAddPhone) setAddPhoneError(err.response?.data?.error || "Kunde inte skicka kod");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifying(true);
    setLoginError("");
    try {
      const res = await axios.post(`${API_URL}/api/account/verify-otp`, {
        phone: otpPhone,
        code: otpCode,
      }, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      const { token: newToken, user: newUser } = res.data;
      localStorage.setItem("platform_user_token", newToken);
      setToken(newToken);
      setUser(newUser);
      fetchData(newToken);
      setShowOtp(false);
    } catch (err: any) {
      setLoginError(err.response?.data?.error || "Felaktig kod");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleAddPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullPhone = `${addPhoneCountry}${addPhoneNum.replace(/^0/, "")}`;
    setAddPhoneLoading(true);
    setAddPhoneError("");
    try {
      // Instead of direct add, send OTP
      await handleSendOtp(e, fullPhone);
    } catch (err: any) {
      setAddPhoneError(err.response?.data?.error || "Kunde inte verifiera nummer");
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
    setIsLoggingOut(true);
    try {
      localStorage.removeItem("platform_user_token");
      setToken(null);
      setUser(null);
      setOrders([]);
      setDeals([]);
      // Log out from NextAuth
      await signOut({ redirect: false });
    } finally {
      setIsLoggingOut(false);
    }
  };

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-obsidian flex items-center justify-center">
        <Loader2 className="animate-spin text-gold-500" size={40} />
      </div>
    );
  }

  // ─── Not logged in ────────────────────────────────────────────────────────
  if (!token || !user) {
    return (
      <div className="min-h-screen bg-obsidian flex flex-col items-center justify-center px-6 pt-20 pb-32">
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

          {/* Phone login / OTP form */}
          {showOtp ? (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-zinc-600 ml-1 mb-1 block">Verifieringskod</label>
                <input
                  required
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="000 000"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-center text-2xl font-black tracking-[0.5em] text-white placeholder:text-zinc-800 outline-none focus:ring-2 focus:ring-gold-500/40 transition-all"
                />
              </div>
              {loginError && <p className="text-red-500 text-[11px] text-center font-black uppercase">{loginError}</p>}
              <button
                type="submit"
                disabled={isVerifying}
                className="w-full py-5 bg-gold-500 text-zinc-950 rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl shadow-gold-500/20 active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                {isVerifying ? <Loader2 className="animate-spin" size={20} /> : "Verifiera"}
              </button>
              <button type="button" onClick={() => setShowOtp(false)} className="w-full text-center text-[10px] font-black uppercase tracking-widest text-zinc-600 hover:text-white transition-colors">
                Ändra telefonnummer
              </button>
            </form>
          ) : (
            <form onSubmit={handleSendOtp} className="space-y-4">
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
              {loginError && <p className="text-red-500 text-[11px] text-center font-black uppercase">{loginError}</p>}
              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-5 bg-gold-500 text-zinc-950 rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl shadow-gold-500/20 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-60"
              >
                {isLoggingIn ? <Loader2 className="animate-spin" size={20} /> : "Fortsätt"}
              </button>
            </form>
          )}

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/5" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-obsidian px-4 text-[10px] font-black uppercase tracking-widest text-zinc-600">
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
      <div className="min-h-screen bg-obsidian flex items-center justify-center px-6">
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
          </form>
        </motion.div>
      </div>
    );
  }

  // ─── Logged in ────────────────────────────────────────────────────────────
  return (
    <>
    <div className="min-h-screen bg-obsidian pt-20 pb-32 px-6">
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
              {user.isVerified ? (
                <div className="flex items-center gap-1.5 mt-1 text-emerald-400">
                  <ShieldCheck size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Verifierad</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mt-1 text-red-500">
                  <Lock size={14} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Ej verifierad</span>
                </div>
              )}
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

        {/* Verify phone banner - ONLY if they have a phone but not verified (legacy or fail) */}
        {user.phone && !user.isVerified && (
          <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-[2.5rem] flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center text-red-500">
                <Bell size={20} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-red-400 tracking-widest">Åtgärd krävs</p>
                <div className="flex items-center gap-2">
                  <p className="text-white font-bold text-sm">{user.phone}</p>
                </div>
              </div>
            </div>
            <button 
              onClick={() => {
                setAddPhoneNum(user.phone.replace("+46", ""));
                setAddPhoneCountry(user.phone.startsWith("+") ? user.phone.slice(0, 3) : "+46");
                setShowAddPhone(true);
              }}
              className="px-6 py-3 bg-red-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-red-500/20"
            >
              Fixa nu
            </button>
          </div>
        )}

        <div className="grid grid-cols-5 bg-white/5 border border-white/5 p-1.5 rounded-[2rem]">
          {[
            { id: "overview", icon: User, label: "Hem" },
            { id: "deals", icon: Sparkles, label: "Deals" },
            { id: "orders", icon: History, label: "Ordrar" },
            { id: "addresses", icon: MapPin, label: "Adresser" },
            { id: "settings", icon: Settings, label: "Inst." },
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
          {/* Deals Tab */}
          {activeTab === "deals" && (
            <motion.div key="deals" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
               {deals.length === 0 ? (
                 <div className="py-20 text-center bg-white/2 rounded-[2.5rem] border border-dashed border-white/5">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 text-white/10"><Tag size={32} /></div>
                    <p className="font-black uppercase tracking-widest text-zinc-600">Inga erbjudanden tillgängliga</p>
                    <p className="text-[10px] uppercase font-bold text-zinc-800 mt-2">Dina framtida belöningar dyker upp här</p>
                 </div>
               ) : (
                 deals.map((deal: any) => (
                   <div key={deal.id} className="p-8 rounded-[2.5rem] bg-gold-500/5 border border-gold-500/20 shadow-2xl relative overflow-hidden group">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-gold-500/10 blur-2xl group-hover:bg-gold-500/20 transition-all" />
                      <div className="flex items-start justify-between mb-6">
                         <div className="flex-1 pr-4">
                            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-500 mb-1">{deal.campaign.title}</div>
                            <h3 className="text-2xl font-black italic tracking-tighter uppercase text-white leading-tight">
                                {deal.campaign.discountType === "PERCENTAGE" ? `${deal.campaign.discountValue}% RABATT` : `${deal.campaign.discountValue} KR RABATT`}
                            </h3>
                         </div>
                         <div className="w-12 h-12 bg-gold-500 text-dark-500 rounded-2xl flex items-center justify-center shadow-xl shrink-0"><Ticket size={24} /></div>
                      </div>
                      
                      <div className="p-4 rounded-2xl bg-black/40 border border-white/5 flex items-center justify-between mb-6">
                         <div className="text-[10px] font-black tracking-[0.3em] uppercase text-white/40">KOD: <span className="text-white select-all">{deal.code}</span></div>
                         <button 
                            onClick={() => { navigator.clipboard.writeText(deal.code); }} 
                            className="text-[10px] font-black uppercase tracking-widest text-gold-500 hover:text-white transition-colors"
                          >
                            Kopiera
                          </button>
                      </div>

                      <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest">
                         <div className="text-zinc-600">Min. order: {deal.campaign.minOrder} kr</div>
                         <div className="text-zinc-600">Giltig till: {deal.campaign.validUntil ? new Date(deal.campaign.validUntil).toLocaleDateString("sv-SE") : "Oändlig"}</div>
                      </div>
                   </div>
                 ))
               )}
            </motion.div>
          )}

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
                  {user.isVerified ? (
                    <span className="text-[8px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-3 py-1.5 rounded-full uppercase font-black flex items-center gap-1">
                      <Lock size={8} /> Låst
                    </span>
                  ) : (
                    <button 
                      onClick={() => {
                        setAddPhoneNum(user.phone?.replace("+46", "") || "");
                        setAddPhoneCountry(user.phone?.startsWith("+") ? user.phone.slice(0, 3) : "+46");
                        setShowAddPhone(true);
                      }}
                      className="text-[8px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-3 py-1.5 rounded-full uppercase font-black hover:bg-amber-500/20 transition-all flex items-center gap-1"
                    >
                      <Edit2 size={8} /> Ändra
                    </button>
                  )}
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

          {/* Settings */}
          {activeTab === "settings" && !isEditing && (
            <motion.div key="set" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              <div className="space-y-2">
                <div className="px-4 text-[9px] font-black uppercase tracking-[0.4em] text-zinc-600 mb-2">Profil</div>
                <div className="bg-white/5 border border-white/5 rounded-[2.5rem]">
                  <button
                    onClick={() => setIsEditing(true)}
                    className="w-full flex items-center justify-between p-6 hover:bg-white/5 transition-all text-left rounded-[2.5rem]"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gold-500/10 text-gold-500 rounded-xl flex items-center justify-center"><Settings size={18} /></div>
                      <div>
                        <p className="text-sm font-bold uppercase italic text-white">Redigera profil</p>
                        <p className="text-[10px] text-zinc-600">Namn och e-post</p>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-zinc-700" />
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="px-4 text-[9px] font-black uppercase tracking-[0.4em] text-zinc-600 mb-2">Preferenser</div>
                <div className="bg-white/5 border border-white/5 rounded-[2.5rem] divide-y divide-white/5">
                  <div className="p-6 flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
                        <Bell size={18} />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-white">Push-notiser</p>
                        <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-widest">Orderstatus i realtid</p>
                      </div>
                    </div>
                    <div className="w-12 h-6 bg-zinc-800 rounded-full relative cursor-pointer opacity-50">
                       <div className="absolute left-1 top-1 w-4 h-4 bg-zinc-600 rounded-full" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="px-4 text-[9px] font-black uppercase tracking-[0.4em] text-zinc-600 mb-2">Juridiskt & GDPR</div>
                <div className="bg-white/5 border border-white/5 rounded-[2.5rem] divide-y divide-white/5">
                  <Link href="/privacy" className="p-6 flex items-center justify-between group hover:bg-white/5 transition-all first:rounded-t-[2.5rem]">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                        <ShieldCheck size={18} />
                      </div>
                      <p className="font-bold text-sm text-white">Integritetspolicy</p>
                    </div>
                    <ChevronRight size={18} className="text-zinc-600 group-hover:text-white transition-all" />
                  </Link>
                  <Link href="/terms" className="p-6 flex items-center justify-between group hover:bg-white/5 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                        <Scale size={18} />
                      </div>
                      <p className="font-bold text-sm text-white">Användarvillkor</p>
                    </div>
                    <ChevronRight size={18} className="text-zinc-600 group-hover:text-white transition-all" />
                  </Link>
                </div>
              </div>

              <div className="space-y-2">
                <div className="px-4 text-[9px] font-black uppercase tracking-[0.4em] text-zinc-600 mb-2">Konto-hantering</div>
                <div className="bg-white/5 border border-white/5 rounded-[2.5rem]">
                  <button 
                    onClick={async () => {
                      const confirm1 = confirm("Är du säker på att du vill radera ditt konto?");
                      if (!confirm1) return;
                      const confirm2 = confirm("Detta går INTE att ångra. All din orderhistorik kommer anonymiseras och dina sparade adresser raderas permanent. Vill du fortsätta?");
                      if (!confirm2) return;

                      try {
                        await axios.delete(`${API_URL}/api/profile`, {
                          headers: { Authorization: `Bearer ${token}` }
                        });
                        alert("Ditt konto har raderats. Hoppas vi ses igen!");
                        handleLogout();
                      } catch (err: any) {
                        alert(err.response?.data?.error || "Kunde inte radera kontot");
                      }
                    }}
                    className="w-full text-left p-6 flex items-center justify-between group hover:bg-red-500/5 transition-all rounded-[2.5rem]"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center">
                        <Trash2 size={18} />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-red-500">Radera konto</p>
                        <p className="text-[10px] text-zinc-600 font-medium uppercase tracking-widest">Rensa all personlig data</p>
                      </div>
                    </div>
                  </button>
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
                <div key={order.id} className="bg-white/5 border border-white/5 rounded-[2.5rem] p-6 hover:bg-white/10 transition-all group">
                  <Link href={`/order/${order.id}`} className="flex justify-between items-center">
                    <div>
                      <p className="font-black uppercase italic text-sm">{order.restaurant?.name || "Beställning"}</p>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1">
                        {new Date(order.createdAt).toLocaleDateString("sv-SE")}
                        {order.rating && (
                          <span className="ml-3 inline-flex items-center gap-1 text-gold-500">
                            <Star size={10} className="fill-gold-500" /> {order.rating}/5
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-xl font-black text-gold-500">{(order.total || 0).toFixed(0)} kr</p>
                      <ChevronRight size={16} className="text-zinc-600 group-hover:text-gold-500 transition-colors" />
                    </div>
                  </Link>
                  <div className="mt-4 flex gap-3">
                    <button
                      onClick={async () => {
                        setReorderingId(order.id);
                        try {
                          const res = await axios.get(`${API_URL}/api/profile/orders/${order.id}/reorder`, {
                            headers: { Authorization: `Bearer ${token}` }
                          });
                          const data = res.data;
                          const cartStore = useCartStore.getState();
                          cartStore.clearCart();
                          for (const item of data.items) {
                            cartStore.addItem(item);
                          }
                          if (data.unavailableItems?.length) {
                            alert(`${data.unavailableItems.length} produkt(er) finns inte längre: ${data.unavailableItems.join(', ')}`);
                          }
                          router.push('/cart');
                        } catch (err: any) {
                          alert(err.response?.data?.error || 'Kunde inte förbereda ombeställning');
                        } finally {
                          setReorderingId(null);
                        }
                      }}
                      disabled={reorderingId === order.id}
                      className="flex items-center gap-2 px-5 py-3 bg-gold-500/10 border border-gold-500/20 rounded-xl text-[9px] font-black uppercase tracking-widest text-gold-500 hover:bg-gold-500/20 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {reorderingId === order.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                      Beställ igen
                    </button>
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {/* Addresses Tab */}
          {activeTab === "addresses" && (
            <motion.div key="addr" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              {/* Existing Addresses */}
              {savedAddresses.length === 0 ? (
                <div className="py-16 text-center bg-white/2 rounded-[2.5rem] border border-dashed border-white/5">
                  <MapPin size={36} className="mx-auto mb-4 text-zinc-800" />
                  <p className="font-black uppercase tracking-widest text-zinc-600 text-sm">Inga sparade adresser</p>
                  <p className="text-[10px] uppercase font-bold text-zinc-800 mt-2">Lägg till din första adress nedan</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {savedAddresses.map(addr => (
                    <div key={addr.id} className="bg-white/5 border border-white/5 rounded-[2rem] p-6 flex items-center justify-between group">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm ${addr.isDefault ? 'bg-gold-500/10 text-gold-500 border border-gold-500/20' : 'bg-white/5 text-zinc-600'}`}>
                          {addr.label === 'Hem' ? <Home size={18} /> : addr.label === 'Jobb' ? <Briefcase size={18} /> : <MapPin size={18} />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-black uppercase italic text-sm text-white">{addr.label}</p>
                            {addr.isDefault && <span className="text-[7px] font-black uppercase bg-gold-500/10 text-gold-500 border border-gold-500/20 px-2 py-0.5 rounded-md">Standard</span>}
                          </div>
                          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5">{addr.street}, {addr.zip} {addr.city}</p>
                          {addr.note && <p className="text-[9px] text-zinc-700 mt-1">{addr.note}</p>}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {!addr.isDefault && (
                          <button
                            onClick={async () => {
                              try {
                                await axios.patch(`${API_URL}/api/profile/addresses/${addr.id}`, { isDefault: true }, { headers: { Authorization: `Bearer ${token}` } });
                                fetchData(token!);
                              } catch {}
                            }}
                            className="p-2 bg-white/5 rounded-lg text-zinc-600 hover:text-gold-500 transition-colors"
                            title="Gör till standard"
                          >
                            <Check size={14} />
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            if (!confirm('Radera denna adress?')) return;
                            try {
                              await axios.delete(`${API_URL}/api/profile/addresses/${addr.id}`, { headers: { Authorization: `Bearer ${token}` } });
                              setSavedAddresses(prev => prev.filter(a => a.id !== addr.id));
                            } catch {}
                          }}
                          className="p-2 bg-white/5 rounded-lg text-zinc-600 hover:text-rose-500 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add New Address */}
              <div className="bg-white/5 border border-white/5 rounded-[2.5rem] p-8 space-y-5">
                <h3 className="text-sm font-black uppercase italic text-white flex items-center gap-3">
                  <Plus size={16} className="text-gold-500" /> Lägg till adress
                </h3>
                <div className="flex gap-2">
                  {['Hem', 'Jobb', 'Annat'].map(l => (
                    <button key={l} type="button" onClick={() => setNewAddrLabel(l)} className={`flex items-center gap-2 px-4 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${
                      newAddrLabel === l ? 'bg-gold-500/10 border-gold-500/30 text-gold-500' : 'bg-white/3 border-white/5 text-zinc-600'
                    }`}>
                      {l === 'Hem' ? <Home size={12} /> : l === 'Jobb' ? <Briefcase size={12} /> : <MapPin size={12} />}
                      {l}
                    </button>
                  ))}
                </div>
                <input value={newAddrStreet} onChange={e => setNewAddrStreet(e.target.value)} placeholder="Gatuadress" className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-white text-sm font-bold placeholder:text-zinc-700 outline-none focus:ring-2 focus:ring-gold-500/40" />
                <div className="grid grid-cols-2 gap-3">
                  <input value={newAddrCity} onChange={e => setNewAddrCity(e.target.value)} placeholder="Stad" className="bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-white text-sm font-bold placeholder:text-zinc-700 outline-none focus:ring-2 focus:ring-gold-500/40" />
                  <input value={newAddrZip} onChange={e => setNewAddrZip(e.target.value)} placeholder="Postnummer" className="bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-white text-sm font-bold placeholder:text-zinc-700 outline-none focus:ring-2 focus:ring-gold-500/40" />
                </div>
                <input value={newAddrNote} onChange={e => setNewAddrNote(e.target.value)} placeholder="Portkod, våning (valfritt)" className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-white text-sm font-bold placeholder:text-zinc-700 outline-none focus:ring-2 focus:ring-gold-500/40" />
                <button
                  onClick={async () => {
                    if (!newAddrStreet || !newAddrCity || !newAddrZip) return;
                    setAddrSaving(true);
                    try {
                      await axios.post(`${API_URL}/api/profile/addresses`, {
                        label: newAddrLabel, street: newAddrStreet, city: newAddrCity, zip: newAddrZip, note: newAddrNote || undefined, isDefault: savedAddresses.length === 0,
                      }, { headers: { Authorization: `Bearer ${token}` } });
                      setNewAddrStreet(''); setNewAddrCity(''); setNewAddrZip(''); setNewAddrNote('');
                      fetchData(token!);
                    } catch (err: any) {
                      alert(err.response?.data?.error || 'Kunde inte spara');
                    } finally { setAddrSaving(false); }
                  }}
                  disabled={addrSaving || !newAddrStreet || !newAddrCity || !newAddrZip}
                  className="w-full py-5 bg-gold-500 text-zinc-950 rounded-3xl font-black uppercase tracking-widest text-[11px] shadow-xl shadow-gold-500/20 active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-3"
                >
                  {addrSaving ? <Loader2 size={16} className="animate-spin" /> : <><Plus size={16} /> Spara adress</>}
                </button>
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
    
    {/* Global OTP Overlay for Verification */}
    <AnimatePresence>
      {showOtp && (
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center px-6 bg-obsidian/90 backdrop-blur-sm"
        >
          <motion.div 
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="w-full max-w-sm bg-zinc-900 border border-white/5 rounded-[2.5rem] p-8 space-y-8 shadow-2xl"
          >
            <div className="text-center space-y-3">
              <div className="w-16 h-16 bg-gold-500/10 rounded-2xl border border-gold-500/20 flex items-center justify-center text-gold-500 mx-auto">
                <ShieldCheck size={32} />
              </div>
              <h2 className="text-2xl font-black uppercase italic text-white">Verifiera kod</h2>
              <p className="text-zinc-500 text-xs">Vi har skickat en kod till {otpPhone}</p>
            </div>

            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-zinc-600 ml-1 mb-1 block">Engångskod</label>
                <input
                  required
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder="000 000"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-center text-2xl font-black tracking-[0.5em] text-white placeholder:text-zinc-800 outline-none focus:ring-2 focus:ring-gold-500/40 transition-all"
                />
              </div>
              
              {loginError && <p className="text-red-500 text-[11px] text-center font-black uppercase">{loginError}</p>}
              
              <button
                type="submit"
                disabled={isVerifying}
                className="w-full py-5 bg-gold-500 text-zinc-950 rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl shadow-gold-500/20 active:scale-95 transition-all flex items-center justify-center gap-3"
              >
                {isVerifying ? <Loader2 className="animate-spin" size={20} /> : "Bekräfta kod"}
              </button>

              <button 
                type="button" 
                onClick={() => setShowOtp(false)}
                className="w-full text-center text-[10px] font-black uppercase tracking-widest text-zinc-600 hover:text-white transition-colors"
              >
                Avbryt
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
