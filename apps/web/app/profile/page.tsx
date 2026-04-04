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
  Loader2
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
  
  // Login State
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
    } catch (err) {
      console.error(err);
      localStorage.removeItem("platform_user_token");
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
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
    try {
      const res = await axios.post(`${API_URL}/api/auth/login-user`, { identifier: phone, password });
      const { token: newToken, user: userData } = res.data;
      localStorage.setItem("platform_user_token", newToken);
      setToken(newToken);
      setUser(userData);
      fetchData(newToken);
    } catch (err: any) {
      setLoginError(err.response?.data?.error || "Login misslyckades");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("platform_user_token");
    setToken(null);
    setUser(null);
    setOrders([]);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <Loader2 className="animate-spin text-gold-500" size={40} />
      </div>
    );
  }

  if (!token || !user) {
    return (
      <div className="min-h-screen bg-zinc-950 pt-24 pb-32 px-6 flex flex-col items-center justify-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm space-y-10"
        >
          <div className="text-center space-y-4">
             <div className="w-20 h-20 bg-gold-500/10 rounded-[2rem] border border-gold-500/20 flex items-center justify-center text-gold-500 mx-auto shadow-2xl shadow-gold-500/10">
                <Lock size={32} />
             </div>
             <h1 className="text-4xl font-black uppercase tracking-tight">Välkommen <span className="text-gold-500">Tillbaka</span></h1>
             <p className="text-zinc-500 text-xs font-black uppercase tracking-[0.2em]">Logga in för att se dina beställningar</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
             <div className="space-y-1">
                <input 
                  type="text" 
                  placeholder="Telefonnummer eller E-post"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-white/5 border border-white/5 rounded-3xl py-5 px-8 outline-none focus:ring-2 focus:ring-gold-500/30 transition-all font-bold text-lg placeholder:text-zinc-700"
                />
             </div>
             <div className="space-y-1">
                <input 
                  type="password" 
                  placeholder="Lösenord"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/5 rounded-3xl py-5 px-8 outline-none focus:ring-2 focus:ring-gold-500/30 transition-all font-bold text-lg placeholder:text-zinc-700"
                />
             </div>
             {loginError && <p className="text-red-500 text-[10px] font-black uppercase tracking-widest text-center">{loginError}</p>}
             <button 
               type="submit"
               disabled={isLoggingIn}
               className="w-full bg-gold-500 hover:bg-gold-600 text-zinc-950 py-5 rounded-3xl font-black uppercase tracking-widest text-sm shadow-xl shadow-gold-500/20 active:scale-95 transition-all flex items-center justify-center gap-3"
             >
               {isLoggingIn ? <Loader2 className="animate-spin" size={20} /> : "Logga in"}
             </button>
          </form>

          <p className="text-center text-[10px] font-black uppercase tracking-widest text-zinc-600">
             Har du inget konto? <Link href="/register" className="text-gold-500">Registrera dig</Link>
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 pt-20 pb-32 px-6">
      <div className="max-w-xl mx-auto space-y-8">
        
        {/* Profile Header */}
        <div className="flex items-center justify-between">
           <div className="flex items-center gap-6">
              <div className="relative">
                <div className="w-16 h-16 bg-gradient-to-tr from-gold-600 to-gold-400 rounded-[1.8rem] flex items-center justify-center text-zinc-950 font-black text-2xl shadow-2xl">
                   {user.name?.charAt(0) || "U"}
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 border-4 border-zinc-950 rounded-full flex items-center justify-center text-[8px] text-white">
                   <ShieldCheck size={10} />
                </div>
              </div>
              <div>
                 <h1 className="text-2xl font-black uppercase tracking-tight">{user.name}</h1>
                 <p className="text-[10px] font-black uppercase tracking-widest text-gold-500 opacity-60">Verified Member</p>
              </div>
           </div>
           <button 
             onClick={handleLogout}
             className="p-4 bg-white/5 hover:bg-red-500/10 text-zinc-500 hover:text-red-500 rounded-2xl transition-all"
           >
              <LogOut size={20} />
           </button>
        </div>

        {/* Tab Navigation */}
        <div className="grid grid-cols-3 bg-white/5 border border-white/5 p-1.5 rounded-[2rem]">
           {[
             { id: 'overview', icon: User, label: 'Hem' },
             { id: 'orders', icon: History, label: 'Ordrar' },
             { id: 'settings', icon: Settings, label: 'Inställn' }
           ].map((tab) => (
             <button
               key={tab.id}
               onClick={() => setActiveTab(tab.id as any)}
               className={`flex flex-col items-center gap-1.5 py-4 rounded-3xl transition-all ${activeTab === tab.id ? "bg-white/10 text-gold-500" : "text-zinc-500 hover:text-zinc-300"}`}
             >
               <tab.icon size={20} />
               <span className="text-[8px] font-black uppercase tracking-widest">{tab.label}</span>
             </button>
           ))}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'overview' && (
            <motion.div 
              key="overview"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-2 gap-4">
                 <div className="bg-white/5 border border-white/5 rounded-[2.5rem] p-6 space-y-4">
                    <div className="w-10 h-10 bg-blue-500/10 rounded-2xl flex items-center justify-center text-blue-500">
                       <Package size={20} />
                    </div>
                    <div>
                       <div className="text-2xl font-black">{orders.length}</div>
                       <div className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Totalt Beställt</div>
                    </div>
                 </div>
                 <div className="bg-white/5 border border-white/5 rounded-[2.5rem] p-6 space-y-4">
                    <div className="w-10 h-10 bg-gold-500/10 rounded-2xl flex items-center justify-center text-gold-500">
                       <CreditCard size={20} />
                    </div>
                    <div>
                       <div className="text-2xl font-black">Gold</div>
                       <div className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Medlemsnivå</div>
                    </div>
                 </div>
              </div>

              <div className="bg-white/5 border border-white/5 rounded-[2.5rem] p-8 space-y-6">
                 <div className="flex items-center gap-6">
                    <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-zinc-500">
                       <Phone size={20} />
                    </div>
                    <div className="flex-1">
                       <div className="text-[8px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-1">Telefonnummer</div>
                       <div className="font-bold flex items-center gap-2">
                         {user.phone}
                         <span className="text-[8px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-full uppercase">Låst</span>
                       </div>
                    </div>
                 </div>

                 <div className="flex items-center gap-6">
                    <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-zinc-500">
                       <Mail size={20} />
                    </div>
                    <div className="flex-1">
                       <div className="text-[8px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-1">E-post</div>
                       <div className="font-bold">{user.email || "Ej angiven"}</div>
                    </div>
                 </div>

                 <div className="flex items-center gap-6">
                    <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-zinc-500">
                       <MapPin size={20} />
                    </div>
                    <div className="flex-1">
                       <div className="text-[8px] font-black uppercase tracking-[0.2em] text-zinc-500 mb-1">Adress</div>
                       <div className="font-bold truncate max-w-[200px]">{user.address ? `${user.address}, ${user.zip} ${user.city}` : "Ingen adress sparad"}</div>
                    </div>
                 </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'orders' && (
            <motion.div 
               key="orders"
               initial={{ opacity: 0, x: -10 }}
               animate={{ opacity: 1, x: 0 }}
               exit={{ opacity: 0, x: 10 }}
               className="space-y-4"
            >
               {orders.length === 0 ? (
                 <div className="py-20 text-center opacity-20">
                    <History size={48} className="mx-auto mb-4" />
                    <p className="font-black uppercase tracking-widest text-xs">Inga beställningar än</p>
                 </div>
               ) : orders.map((order) => (
                 <Link 
                   href={`/order/${order.id}`}
                   key={order.id} 
                   className="block bg-white/3 border border-white/5 rounded-[2.5rem] p-6 hover:bg-white/10 transition-all group"
                 >
                    <div className="flex items-center justify-between mb-4">
                       <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-zinc-800 rounded-2xl flex items-center justify-center text-gold-500 group-hover:scale-110 transition-all">
                             <Package size={20} />
                          </div>
                          <div>
                             <div className="text-sm font-bold uppercase tracking-tight">{order.restaurant?.name || "Palmyra"}</div>
                             <div className="text-[10px] text-zinc-500 flex items-center gap-2">
                                <Calendar size={10} />
                                {new Date(order.createdAt).toLocaleDateString()}
                             </div>
                          </div>
                       </div>
                       <div className="text-xl font-black text-gold-500">{(order.total || 0).toFixed(0)} kr</div>
                    </div>
                    <div className="flex items-center justify-between pt-4 border-t border-white/5">
                       <div className="flex items-center gap-2">
                          <span className={`flex items-center gap-1 text-[8px] font-black uppercase tracking-[0.2em] ${order.status === 'COMPLETED' || order.status === 'READY' ? 'text-emerald-500 bg-emerald-500/10' : 'text-blue-400 bg-blue-500/10'} px-3 py-1 rounded-full`}>
                             {order.status === 'COMPLETED' || order.status === 'READY' ? <CheckCircle2 size={10} /> : <Loader2 size={10} className="animate-spin" />} 
                             {order.status}
                          </span>
                       </div>
                       <ChevronRight size={16} className="text-zinc-600 group-hover:text-gold-500 transition-all" />
                    </div>
                 </Link>
               ))}
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div 
               key="settings"
               initial={{ opacity: 0, x: -10 }}
               animate={{ opacity: 1, x: 0 }}
               exit={{ opacity: 0, x: 10 }}
               className="space-y-4"
            >
               {[
                 { icon: Settings, label: "Kontoinställningar", desc: "Redigera din profil" },
                 { icon: MapPin, label: "Mina Adresser", desc: "Hantera leveransadresser" },
                 { icon: Bell, label: "Notiser", desc: "Push & Push-inställningar" },
                 { icon: ShieldCheck, label: "Säkerhet", desc: "Byt lösenord & Sekretess" }
               ].map((item, i) => (
                 <button 
                   key={i}
                   className="w-full flex items-center justify-between p-6 bg-white/5 border border-white/5 rounded-[2rem] hover:bg-white/10 transition-all text-left"
                 >
                    <div className="flex items-center gap-4">
                       <div className="w-10 h-10 bg-zinc-800 rounded-2xl flex items-center justify-center text-zinc-500">
                          <item.icon size={20} />
                       </div>
                       <div>
                          <div className="text-sm font-bold uppercase tracking-tight">{item.label}</div>
                          <div className="text-[10px] text-zinc-600">{item.desc}</div>
                       </div>
                    </div>
                    <ChevronRight size={18} className="text-zinc-700" />
                 </button>
               ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ProfilePage;
