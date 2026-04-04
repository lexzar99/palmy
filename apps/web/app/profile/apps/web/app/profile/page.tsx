"use client";

import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { 
  User, 
  Settings, 
  MapPin, 
  Mail, 
  Phone, 
  LogOut, 
  ChevronRight, 
  Package, 
  Calendar, 
  ShieldCheck,
  CreditCard,
  Bell,
  History,
  CheckCircle2,
  Lock,
  ArrowLeft,
  Loader2,
  Save
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { API_URL } from "@/lib/api";

const ProfilePage = () => {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'settings'>('overview');
  const [hasVisited, setHasVisited] = useState(false);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");

  const fetchData = useCallback(async (authToken: string) => {
    try {
      const [profileRes, ordersRes] = await Promise.all([
        axios.get(`${API_URL}/api/profile`, { headers: { Authorization: `Bearer ${authToken}` } }),
        axios.get(`${API_URL}/api/profile/orders`, { headers: { Authorization: `Bearer ${authToken}` } })
      ]);
      setUser(profileRes.data);
      setOrders(ordersRes.data || []);
    } catch (err) { handleLogout(); } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const visited = localStorage.getItem("platform_has_visited");
    if (visited) setHasVisited(true); else localStorage.setItem("platform_has_visited", "true");
    const savedToken = localStorage.getItem("platform_user_token");
    if (savedToken) { setToken(savedToken); fetchData(savedToken); } else { setLoading(false); }
  }, [fetchData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      const res = await axios.post(`${API_URL}/api/auth/login-user`, { identifier: phone, password });
      const { token: nt, user: ud } = res.data;
      localStorage.setItem("platform_user_token", nt);
      setToken(nt); setUser(ud); fetchData(nt);
    } catch (err: any) { setLoginError("Login misslyckades"); } finally { setIsLoggingIn(false); }
  };

  const handleLogout = () => {
    localStorage.removeItem("platform_user_token");
    setToken(null); setUser(null);
  };

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><Loader2 className="animate-spin text-gold-500" /></div>;

  if (!token || !user) {
    return (
      <div className="min-h-screen bg-zinc-950 pt-24 pb-32 px-6 flex flex-col items-center justify-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm space-y-10">
          <div className="text-center space-y-4">
             <div className="w-20 h-20 bg-gold-500/10 rounded-3xl flex items-center justify-center text-gold-500 mx-auto shadow-2xl"><Lock size={32} /></div>
             <h1 className="text-4xl font-black uppercase tracking-tight">{hasVisited ? "Välkommen" : "Skapa"} <span className="text-gold-500">{hasVisited ? "Tillbaka" : "Konto"}</span></h1>
             <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest leading-relaxed">
               {hasVisited ? "Logga in för att fortsätta" : "Gå med i vår community idag"}
             </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
             <input required value={phone} onChange={e => setPhone(e.target.value)} placeholder="Telefon eller E-post" className="w-full bg-white/5 border border-white/10 rounded-3xl py-5 px-8 outline-none focus:ring-2 focus:ring-gold-500/30 text-white font-bold" />
             <input required type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Lösenord" className="w-full bg-white/5 border border-white/10 rounded-3xl py-5 px-8 outline-none focus:ring-2 focus:ring-gold-500/30 text-white font-bold" />
             <button className="w-full bg-gold-500 text-zinc-950 py-5 rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl shadow-gold-500/20 active:scale-95 transition-all">Logga in</button>
             {loginError && <p className="text-red-500 text-[10px] text-center font-black uppercase">{loginError}</p>}
          </form>

          <div className="relative py-4">
             <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/5"></div></div>
             <div className="relative flex justify-center text-[10px] font-black uppercase tracking-widest text-zinc-600 bg-zinc-950 px-4">Eller fortsätt med</div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <button className="flex items-center justify-center gap-2 py-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase text-zinc-400 group hover:text-white transition-all"><svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 12-4.53z"/></svg> Google</button>
             <button className="flex items-center justify-center gap-2 py-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase text-zinc-400 group hover:text-white transition-all"><svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="currentColor" d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1V12h3l-.5 3H13v6.8c4.56-.93 8-4.96 8-9.8z"/></svg> Facebook</button>
          </div>

          <p className="text-center text-[10px] font-black uppercase tracking-widest text-zinc-600">Inget konto? <Link href="/register" className="text-gold-500 hover:text-gold-400">Registrera dig här</Link></p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 pt-20 px-6 max-w-xl mx-auto space-y-8">
       <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-tr from-gold-600 to-gold-400 rounded-2xl flex items-center justify-center text-zinc-950 font-black text-xl shadow-2xl">{user.name?.charAt(0)}</div>
            <div>
              <h1 className="text-2xl font-black uppercase italic tracking-tight">{user.name}</h1>
              <p className="text-[10px] font-black uppercase text-gold-500 opacity-60">Verified Member</p>
            </div>
          </div>
          <button onClick={handleLogout} className="p-4 bg-red-500/10 text-red-500 rounded-3xl transition-all hover:bg-red-500/20"><LogOut size={20}/></button>
       </div>

       <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-gold-500/10 border border-gold-500/20 p-8 rounded-[2.5rem] flex items-center justify-between shadow-2xl">
          <div className="space-y-1">
             <div className="text-[8px] font-black uppercase tracking-widest text-gold-500 italic">Säkerhetsstatus</div>
             <h3 className="text-xl font-black uppercase italic">{user.isVerified ? "Telefon Verifierad" : "Verifiering Krävs"}</h3>
          </div>
          {!user.isVerified && <Link href="/verify-phone" className="px-6 py-3 bg-gold-500 text-zinc-950 font-black uppercase tracking-widest text-[10px] rounded-2xl hover:scale-105 transition-all">Säkra konto</Link>}
       </motion.section>

       <div className="grid grid-cols-1 gap-4">
          <div className="bg-white/5 border border-white/5 p-8 rounded-[2.5rem] flex items-center justify-between group hover:bg-white/10 transition-all">
             <div className="flex items-center gap-4 text-zinc-500 group-hover:text-gold-500 transition-colors"><Phone size={20} /> <span className="font-bold text-sm">{user.phone}</span></div>
             <span className="text-[10px] font-black uppercase text-red-500/50 italic">Permanent</span>
          </div>
       </div>

       <div className="pt-10">
          <Link href="/" className="block w-full py-5 border border-white/10 rounded-3xl text-center text-[10px] font-black uppercase tracking-widest text-zinc-600 hover:text-white hover:border-white/30 transition-all uppercase tracking-[0.3em]">Tillbaka t menyn</Link>
       </div>
    </div>
  );
};

export default ProfilePage;
