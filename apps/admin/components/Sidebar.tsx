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
  Activity,
  Menu,
  X,
  Store,
  ChevronDown,
  LayoutGrid,
  Globe,
  BarChart3,
  MapPin,
  Users,
  Sparkles,
  Zap,
  Target
} from "lucide-react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { io as socketIO } from "socket.io-client";
import { API_URL, SOCKET_URL } from "@/lib/api";
import { useRestaurantStore } from "@/store/restaurantStore";

const Sidebar = () => {
  const pathname = usePathname();
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
    { href: "/overview", label: "Dashboard", icon: BarChart3 },
    { href: "/orders", label: "Ordrar", icon: ShoppingCart },
    { href: "/menu", label: "Meny", icon: Utensils },
  ];

  const adminLinks = isSuperAdmin ? [
    { href: "/restaurants", label: "Restauranger", icon: Store },
    { href: "/customers", label: "Kundhantering", icon: Users },
    { href: "/campaigns", label: "Kampanjer", icon: Target },
    { href: "/settings/hours", label: "Öppettider Hub", icon: Clock },
    { href: "/cities", label: "Zoner / Stad", icon: MapPin },
  ] : [];

  const systemLinks = [
    { href: "/settings/printing", label: "Utskrift", icon: Printer },
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
        className={`flex items-center gap-4 px-6 py-4 rounded-2xl transition-all font-black text-[11px] uppercase tracking-widest hover:pl-8 ${isActive ? "bg-gold-500 text-dark-500 shadow-xl shadow-gold-500/10 translate-x-2" : "text-white/20 hover:text-white/60 hover:bg-white/5"}`}
      >
        <Icon size={16} className={isActive ? "text-dark-500" : "text-gold-500/60"} /> {link.label}
      </Link>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#07080d] text-white border-r border-white/5">
      <div className="p-8 border-b border-white/5 bg-[#0a0c14]">
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
             <div className="w-10 h-10 rounded-2xl bg-gold-400 flex items-center justify-center text-dark-500 font-black shadow-xl shadow-gold-500/10 rotate-3"><span className="text-xl italic">M</span></div>
             <div className="text-left">
                <div className="text-[9px] font-black uppercase tracking-[0.3em] text-gold-500/60 mb-0.5 font-black">Kontroll</div>
                <div className="font-black tracking-tighter text-white text-lg uppercase italic">Matgo<span className="text-gold-500 ml-1">Admin</span></div>
             </div>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden p-2 text-white/20 bg-white/5 rounded-xl transition-all"><X size={20}/></button>
        </div>

        {isSuperAdmin && (
          <div className="space-y-3 mb-8">
            <button 
              onClick={() => { setRestaurant(null, null); setIsMobileMenuOpen(false); }} 
              className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl transition-all border ${!selectedRestaurantId ? "bg-gold-500 text-dark-500 border-gold-500 shadow-lg shadow-gold-500/20" : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:border-white/20"}`}
            >
               <span className="text-[10px] font-black uppercase tracking-widest leading-none">Global Sök</span>
               <Globe size={14} className={!selectedRestaurantId ? "text-dark-500" : "text-gold-500/40"} />
            </button>
            
            <div className="relative group">
              <select 
                value={selectedRestaurantId || ""} 
                onChange={(e) => { 
                  const r = restaurants.find(res => res.id === e.target.value); 
                  setRestaurant(r?.id || null, r?.name || null); 
                }} 
                className="w-full bg-dark-500 border border-white/10 rounded-2xl px-5 py-4 text-[10px] font-black text-white/80 appearance-none cursor-pointer focus:outline-none focus:border-gold-500/50 hover:border-white/20 transition-all uppercase tracking-widest"
              >
                <option value="">Välj Butik...</option>
                {restaurants.map(r => (<option key={r.id} value={r.id}>{r.name}</option>))}
              </select>
              <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gold-500/40 group-hover:text-gold-500 transition-colors"/>
            </div>
          </div>
        )}

        {selectedRestaurantId && (
        <button onClick={toggleOpen} disabled={toggling} className={`flex items-center gap-3 p-4 rounded-2xl border transition-all shadow-xl mb-6 w-full ${isOpen ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400" : "bg-rose-500/5 border-rose-500/20 text-rose-400"} ${toggling ? "opacity-50" : ""}`}>
          {isOpen ? <ToggleRight size={24}/> : <ToggleLeft size={24}/>}
          <div className="text-left flex-1"><div className="text-[10px] font-black uppercase tracking-widest">{isOpen ? "ÖPPEN" : "STÄNGD"}</div><div className="text-[9px] text-white/20 uppercase font-black tracking-tighter truncate max-w-[120px]">{selectedRestaurantName}</div></div>
        </button>
        )}
      </div>

      <nav className="flex-1 px-4 py-8 space-y-8 overflow-y-auto custom-scrollbar">
        <div className="space-y-1">
           <div className="px-6 text-[8px] font-black uppercase tracking-[0.4em] text-white/10 mb-4">Huvudmeny</div>
           {mainLinks.map(link => <NavItem key={link.href} link={link} />)}
        </div>

        {isSuperAdmin && (
           <div className="space-y-1">
              <div className="px-6 text-[8px] font-black uppercase tracking-[0.4em] text-white/10 mb-4">Administration</div>
              {adminLinks.map(link => <NavItem key={link.href} link={link} />)}
           </div>
        )}

        <div className="space-y-1">
           <div className="px-6 text-[8px] font-black uppercase tracking-[0.4em] text-white/10 mb-4">Inställningar</div>
           {systemLinks.map(link => <NavItem key={link.href} link={link} />)}
        </div>
      </nav>

      <div className="p-8 border-t border-white/5 bg-[#07080d] space-y-2">
        {selectedRestaurantId && (
          <button 
            onClick={async () => {
              if (!selectedRestaurantId) return;
              const confirmTest = confirm("Vill du skapa en automatisk test-order för att se till att systemet och aviseringar fungerar?");
              if (!confirmTest) return;
              
              try {
                const productsRes = await axios.get(`${API_URL}/api/menu?restaurantId=${selectedRestaurantId}`);
                const products = productsRes.data.flatMap((c: any) => c.products);
                if (products.length === 0) throw new Error("Hittade inga produkter i menyn för denna restaurang.");
                
                const randomProduct = products[Math.floor(Math.random() * products.length)];
                
                await axios.post(`${API_URL}/api/orders`, {
                  restaurantId: selectedRestaurantId,
                  type: "PICKUP",
                  customerName: "TEST ORDER 🤖",
                  customerPhone: "0700101010",
                  customerEmail: "test@vincents.ai",
                  discountCode: "test",
                  stripePaymentIntentId: "TEST_PAYMENT",
                  items: [{
                    productId: randomProduct.id,
                    quantity: 1,
                    selectedExtras: [],
                    note: "Detta är en automatisk test-order från sidebar"
                  }]
                });
                alert("KLART! Test-order skapad. Kontrollera listan nu.");
              } catch (err) {
                alert("Kunde inte skapa test-order: " + err);
              }
            }}
            className="w-full flex items-center gap-4 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-gold-500/60 hover:text-gold-500 hover:bg-white/10 transition-all font-black text-[9px] uppercase tracking-widest active:scale-95"
          >
             <Zap size={16} /> Skapa Testorder
          </button>
        )}
        <button onClick={() => { localStorage.removeItem("palmyra_token"); localStorage.removeItem("palmyra_admin"); window.location.href = "/login"; }} className="w-full flex items-center gap-4 px-4 py-3 text-rose-500/40 hover:text-rose-500 transition-all font-black text-[10px] uppercase tracking-widest group">
          <LogOut size={18} className="group-hover:-translate-x-1 transition-transform" /> Logga Ut
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="lg:hidden fixed top-0 w-full h-16 bg-[#0a0c14] border-b border-white/5 z-40 flex items-center justify-between px-6 shadow-2xl">
        <div className="flex items-center gap-3">
           <div className="w-8 h-8 rounded-xl bg-gold-400 flex items-center justify-center text-dark-500 font-black rotate-3 italic">P</div>
           <div className="font-black text-white text-lg tracking-tighter uppercase italic">Admin<span className="text-gold-500 ml-1">Nu</span></div>
        </div>
        <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-white/40 bg-white/5 border border-white/10 rounded-xl"><Menu size={24}/></button>
      </div>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden fixed inset-0 bg-black/90 backdrop-blur-md z-[60]" />
            <motion.div initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", bounce: 0, duration: 0.4 }} className="lg:hidden fixed top-0 left-0 bottom-0 w-[300px] z-[70]">{sidebarContent}</motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="hidden lg:block fixed top-0 left-0 bottom-0 w-[260px] z-40">{sidebarContent}</div>
    </>
  );
};

export default Sidebar;
