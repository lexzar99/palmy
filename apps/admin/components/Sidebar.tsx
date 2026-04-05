/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  ShoppingCart, 
  Utensils, 
  Settings, 
  LogOut, 
  Printer, 
  ToggleLeft, 
  ToggleRight, 
  Clock, 
  Menu,
  X,
  Store,
  ChevronDown,
  Globe,
  BarChart3,
  MapPin,
  Users,
  Zap,
  Target,
  Sun,
  Moon,
  LayoutDashboard
} from "lucide-react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { io as socketIO } from "socket.io-client";
import { API_URL, SOCKET_URL } from "@/lib/api";
import { useRestaurantStore } from "@/store/restaurantStore";
import { useTheme } from "./ThemeProvider";

const Sidebar = () => {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const { selectedRestaurantId, selectedRestaurantName, setRestaurant } = useRestaurantStore();

  const getToken = () => typeof window !== "undefined" ? localStorage.getItem("palmyra_token") || "" : "";

  useEffect(() => {
    setIsMounted(true);
    try {
      const raw = localStorage.getItem("palmyra_admin");
      const admin = raw ? JSON.parse(raw) : null;
      setIsSuperAdmin(admin?.role === "SUPER_ADMIN");
      
      if (admin && admin.role !== "SUPER_ADMIN" && admin.restaurantId) {
        if (!selectedRestaurantId || selectedRestaurantId !== admin.restaurantId) {
          setRestaurant(admin.restaurantId, admin.restaurantName || "Restaurang");
        }
      }
    } catch { setIsSuperAdmin(false); }

    if (isSuperAdmin) {
      axios.get(`${API_URL}/api/restaurants`).then(res => setRestaurants(res.data)).catch(() => {});
    }

    if (selectedRestaurantId) {
      axios.get(`${API_URL}/api/restaurants/${selectedRestaurantId}`).then(res => setIsOpen(res.data.isOpen ?? true)).catch(() => {});
    }

    const socket = socketIO(SOCKET_URL, { path: "/socket.io", transports: ["websocket", "polling"] });
    socket.on("settings:updated", (data: any) => { if (data.restaurantId === selectedRestaurantId) setIsOpen(data.isOpen ?? true); });
    return () => { socket.disconnect(); };
  }, [selectedRestaurantId, isSuperAdmin]);

  const toggleOpen = async () => {
    if (!selectedRestaurantId) return;
    setToggling(true);
    try {
      const newVal = !isOpen;
      await axios.patch(`${API_URL}/api/restaurants/${selectedRestaurantId}`, { isOpen: newVal }, { headers: { Authorization: `Bearer ${getToken()}` } });
      setIsOpen(newVal);
    } catch { alert("Kunde inte ändra status"); } finally { setToggling(false); }
  };

  const mainLinks = [
    { href: "/overview", label: "Dashboard", icon: LayoutDashboard },
    { href: "/orders", label: "Ordrar", icon: ShoppingCart },
    { href: "/menu", label: "Meny", icon: Utensils },
  ];

  const adminLinks = isSuperAdmin ? [
    { href: "/restaurants", label: "Restauranger", icon: Store },
    { href: "/customers", label: "Kunder", icon: Users },
    { href: "/campaigns", label: "Kampanjer", icon: Target },
    { href: "/settings/hours", label: "Öppettider", icon: Clock },
    { href: "/cities", label: "Städer & Zoner", icon: MapPin },
  ] : [];

  const systemLinks = [
    { href: "/settings/printing", label: "Skrivare", icon: Printer },
    { href: "/settings/global", label: "System", icon: Settings },
  ];

  if (!isMounted) return null;

  const NavItem = ({ link }: { link: any }) => {
    const Icon = link.icon;
    const isActive = pathname === link.href || (link.href !== "/overview" && pathname.startsWith(link.href));
    return (
      <Link 
        href={link.href} 
        onClick={() => setIsMobileMenuOpen(false)} 
        className={`flex items-center gap-3.5 px-5 py-3.5 rounded-2xl transition-all font-bold text-[11px] uppercase tracking-wider ${isActive ? "bg-gold-500 text-dark-500 shadow-xl shadow-gold-500/10" : "text-text-secondary hover:text-text-primary hover:bg-bg-secondary"}`}
      >
        <Icon size={18} className={isActive ? "text-dark-500" : "text-gold-500/60"} /> 
        <span>{link.label}</span>
      </Link>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-bg-primary text-text-primary border-r border-border-subtle">
      {/* Header */}
      <div className="p-6 pb-4">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-2xl bg-gold-400 flex items-center justify-center text-zinc-950 font-black shadow-xl shadow-gold-500/10 rotate-2 active:rotate-0 transition-transform"><span className="text-xl italic">M</span></div>
             <div className="text-left">
                <div className="text-[8px] font-black uppercase tracking-[0.4em] text-gold-500/60 mb-0.5">Control</div>
                <div className="font-black tracking-tight text-text-primary text-lg uppercase italic leading-none">Food<span className="text-gold-500">Hub</span></div>
             </div>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden p-2 text-text-secondary hover:text-text-primary transition-all"><X size={20}/></button>
        </div>

        {/* Theme Toggle Button */}
        <button 
          onClick={toggleTheme}
          className="w-full flex items-center justify-between px-5 py-4 rounded-2xl bg-bg-secondary border border-border-subtle hover:border-gold-500/30 transition-all group mb-6 shadow-sm"
        >
          <span className="text-[10px] font-black uppercase tracking-widest text-text-secondary group-hover:text-text-primary">
            {theme === "dark" ? "Nattläge" : "Dagläge"}
          </span>
          {theme === "dark" ? <Moon size={16} className="text-gold-500/60" /> : <Sun size={16} className="text-amber-500" />}
        </button>

        {isSuperAdmin && (
          <div className="space-y-3 mb-6">
            <button 
              onClick={() => { setRestaurant(null, null); setIsMobileMenuOpen(false); }} 
              className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all border ${!selectedRestaurantId ? "bg-gold-500 text-dark-500 border-gold-500 shadow-xl shadow-gold-500/20" : "bg-bg-secondary border-border-subtle text-text-secondary hover:bg-bg-secondary hover:text-text-primary hover:border-border-subtle"}`}
            >
               <span className="text-[10px] font-black uppercase tracking-widest leading-none">Alla Butiker</span>
               <Globe size={14} className={!selectedRestaurantId ? "text-dark-500" : "text-gold-500/40"} />
            </button>
            
            <div className="relative group">
              <select 
                value={selectedRestaurantId || ""} 
                onChange={(e) => { 
                  const r = restaurants.find(res => res.id === e.target.value); 
                  setRestaurant(r?.id || null, r?.name || null); 
                }} 
                className="w-full bg-bg-secondary border border-border-subtle rounded-2xl px-5 py-4 text-[10px] font-black text-text-primary appearance-none cursor-pointer focus:outline-none focus:border-gold-500/50 hover:border-border-subtle transition-all uppercase tracking-widest shadow-sm"
              >
                <option value="">Välj restaurang</option>
                {restaurants.map(r => (<option key={r.id} value={r.id}>{r.name}</option>))}
              </select>
              <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gold-500/40 group-hover:text-gold-500 transition-colors"/>
            </div>
          </div>
        )}

        {selectedRestaurantId && (
          <button 
            onClick={toggleOpen} 
            disabled={toggling} 
            className={`flex items-center gap-3 p-4 rounded-2xl border transition-all shadow-sm mb-6 w-full ${isOpen ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-600" : "bg-rose-500/5 border-rose-500/20 text-rose-600"} ${toggling ? "opacity-50" : "active:scale-[0.98]"}`}
          >
            {isOpen ? <ToggleRight size={24}/> : <ToggleLeft size={24}/>}
            <div className="text-left flex-1">
              <div className="text-[10px] font-black uppercase tracking-widest">{isOpen ? "ÖPPEN" : "STÄNGD"}</div>
              <div className="text-[9px] text-text-secondary uppercase font-bold truncate max-w-[120px]">{selectedRestaurantName}</div>
            </div>
          </button>
        )}
      </div>

      <nav className="flex-1 px-4 py-4 space-y-7 overflow-y-auto no-scrollbar">
        <div className="space-y-1">
           <div className="px-5 text-[8px] font-black uppercase tracking-[0.4em] text-text-secondary opacity-30 mb-3">Översikt</div>
           {mainLinks.map(link => <NavItem key={link.href} link={link} />)}
        </div>

        {isSuperAdmin && (
           <div className="space-y-1">
              <div className="px-5 text-[8px] font-black uppercase tracking-[0.4em] text-text-secondary opacity-30 mb-3">Företag</div>
              {adminLinks.map(link => <NavItem key={link.href} link={link} />)}
           </div>
        )}

        <div className="space-y-1">
           <div className="px-5 text-[8px] font-black uppercase tracking-[0.4em] text-text-secondary opacity-30 mb-3">Verktyg</div>
           {systemLinks.map(link => <NavItem key={link.href} link={link} />)}
        </div>
      </nav>

      <div className="p-6 border-t border-border-subtle bg-bg-primary space-y-2">
        {selectedRestaurantId && (
          <button 
            onClick={async () => {
              if (!selectedRestaurantId) return;
              const confirmTest = confirm("Vill du skapa en automatisk test-order?");
              if (!confirmTest) return;
              
              try {
                const productsRes = await axios.get(`${API_URL}/api/menu/categories?restaurantId=${selectedRestaurantId}`);
                const products = productsRes.data.flatMap((c: any) => c.products);
                if (products.length === 0) throw new Error("Inga produkter hittades.");
                
                const randomProduct = products[Math.floor(Math.random() * products.length)];
                
                await axios.post(`${API_URL}/api/orders`, {
                  restaurantId: selectedRestaurantId,
                  type: "PICKUP",
                  customerName: "AUTOTEST",
                  customerPhone: "0700101010",
                  discountCode: "test",
                  stripePaymentIntentId: "TEST_PAYMENT",
                  items: [{
                    productId: randomProduct.id,
                    quantity: 1,
                    selectedExtras: [],
                    note: "Systemtest"
                  }]
                });
                alert("Testorder skickad!");
              } catch (err) {
                alert("Fel: " + err);
              }
            }}
            className="w-full flex items-center gap-3 px-4 py-3 bg-bg-secondary border border-border-subtle rounded-xl text-gold-500/60 hover:text-gold-500 hover:border-gold-500/20 transition-all font-bold text-[9px] uppercase tracking-widest active:scale-95"
          >
             <Zap size={14} /> Skapa Testorder
          </button>
        )}
        <button onClick={() => { localStorage.removeItem("palmyra_token"); localStorage.removeItem("palmyra_admin"); window.location.href = "/login"; }} className="w-full flex items-center gap-3 px-4 py-3 text-rose-500/60 hover:text-rose-500 hover:bg-rose-500/5 rounded-xl transition-all font-bold text-[9px] uppercase tracking-widest group">
          <LogOut size={16} className="group-hover:-translate-x-1 transition-transform" /> Logga Ut
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="lg:hidden fixed top-0 w-full h-16 bg-bg-primary border-b border-border-subtle z-40 flex items-center justify-between px-6 shadow-sm">
        <div className="flex items-center gap-2.5">
           <div className="w-8 h-8 rounded-xl bg-gold-400 flex items-center justify-center text-zinc-950 font-black rotate-2 italic">M</div>
           <div className="font-black text-text-primary text-base tracking-tight uppercase italic">Admin<span className="text-gold-500 ml-0.5">Hub</span></div>
        </div>
        <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-text-secondary bg-bg-secondary border border-border-subtle rounded-xl shadow-sm active:scale-90 transition-transform"><Menu size={20}/></button>
      </div>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-[60]" />
            <motion.div initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", bounce: 0, duration: 0.4 }} className="lg:hidden fixed top-0 left-0 bottom-0 w-[280px] z-[70] shadow-2xl">{sidebarContent}</motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="hidden lg:block fixed top-0 left-0 bottom-0 w-[260px] z-40">{sidebarContent}</div>
    </>
  );
};

export default Sidebar;
