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
  Globe
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
  const [restaurantSectionOpen, setRestaurantSectionOpen] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  
  const [restaurants, setRestaurants] = useState<any[]>([]);
  const { selectedRestaurantId, selectedRestaurantName, setRestaurant } = useRestaurantStore();

  const getToken = () => typeof window !== "undefined" ? localStorage.getItem("palmyra_token") || "" : "";

  useEffect(() => {
    try {
      const raw = localStorage.getItem("palmyra_admin");
      const admin = raw ? JSON.parse(raw) : null;
      setIsSuperAdmin(admin?.role === "SUPER_ADMIN");
      
      if (admin && admin.role !== "SUPER_ADMIN" && admin.restaurantId) {
        if (!selectedRestaurantId || selectedRestaurantId !== admin.restaurantId) {
          setRestaurant(admin.restaurantId, admin.restaurantName || "Restaurang");
        }
      }
    } catch {
      setIsSuperAdmin(false);
    }

    if (isSuperAdmin) {
      axios.get(`${API_URL}/api/restaurants`).then(res => {
        setRestaurants(res.data);
      }).catch(() => {});
    }

    if (selectedRestaurantId) {
      axios.get(`${API_URL}/api/restaurants/${selectedRestaurantId}`).then(res => {
         setIsOpen(res.data.isOpen ?? true);
      }).catch(() => {});
    }

    const socket = socketIO(SOCKET_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });
    
    socket.on("settings:updated", (data: any) => {
      if (data.restaurantId === selectedRestaurantId) {
        setIsOpen(data.isOpen ?? true);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [selectedRestaurantId, isSuperAdmin, setRestaurant]);

  const toggleOpen = async () => {
    if (!selectedRestaurantId) return;
    setToggling(true);
    try {
      const newVal = !isOpen;
      await axios.patch(`${API_URL}/api/restaurants/${selectedRestaurantId}`, { isOpen: newVal }, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setIsOpen(newVal);
    } catch {
      alert("Kunde inte ändra status");
    } finally {
      setToggling(false);
    }
  };

  const links = [
    { href: "/orders", label: "Beställningar", icon: ShoppingCart },
    { href: "/history", label: "Föregående beställningar", icon: Clock },
    { href: "/menu", label: "Menyhantering", icon: Utensils },
    { href: "/receipt", label: "Kvittolayout", icon: Printer },
    { href: "/stats", label: "Statistik / Utdrag", icon: Activity },
    { href: "/settings/global", label: "Inställningar", icon: Settings },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Header Profile */}
      <div className="p-8 pb-4">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gold-500 flex items-center justify-center text-dark-500 font-bold shadow-lg shadow-gold-500/20">
              <span className="text-xl">🍣</span>
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 leading-none mb-1">Admin Panel</div>
              <div className="font-black tracking-tight text-white uppercase leading-none">MATGO <span className="text-gold-500">SUSHI</span></div>
            </div>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden p-2 text-white/40 hover:text-white bg-white/5 rounded-lg">
            <X size={20} />
          </button>
        </div>

        {/* Super Admin Global Tools */}
        {isSuperAdmin && (
          <div className="space-y-2 mb-8">
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20 ml-1 mb-3">Systemöversikt</div>
            
            <button
              onClick={() => { setRestaurant(null, null); setIsMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all border ${
                !selectedRestaurantId 
                  ? "bg-gold-500 text-dark-500 border-gold-500 shadow-lg shadow-gold-500/20" 
                  : "bg-white/5 border-white/5 text-white/50 hover:bg-white/10"
              }`}
            >
              <Globe size={20} className={!selectedRestaurantId ? "text-dark-500" : "text-gold-500"} />
              <div className="text-left leading-tight">
                <div className="text-xs font-black uppercase tracking-widest">Global Order</div>
                <div className={`text-[9px] font-bold uppercase opacity-60 ${!selectedRestaurantId ? "text-dark-500" : "text-white/40"}`}>Alla restauranger</div>
              </div>
            </button>

            <Link
              href="/restaurants"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-4 px-5 py-4 rounded-2xl transition-all border ${
                pathname === "/restaurants"
                  ? "bg-white/15 border-white/20 text-white"
                  : "bg-white/5 border-white/5 text-white/50 hover:bg-white/10"
              }`}
            >
              <LayoutGrid size={20} className="text-gold-500" />
              <div className="text-[10px] font-black uppercase tracking-widest">Hantera Restauranger</div>
            </Link>
          </div>
        )}

        {/* Restaurant Selection Dropdown */}
        {isSuperAdmin && (
          <div className="mb-8">
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20 ml-1 mb-3 text-center">Fokusera på enhet</div>
            <div className="relative group">
              <select 
                value={selectedRestaurantId || ""} 
                onChange={(e) => {
                  if (e.target.value === "") {
                    setRestaurant(null, null);
                  } else {
                    const r = restaurants.find(res => res.id === e.target.value);
                    if (r) setRestaurant(r.id, r.name);
                  }
                }}
                className="w-full bg-dark-500 border-2 border-white/5 rounded-2xl px-5 py-4 text-xs font-black text-white appearance-none cursor-pointer focus:outline-none focus:border-gold-500/40 transition-all hover:bg-white/5 uppercase tracking-widest text-center" 
              >
                <option value="" className="bg-dark-500 text-white">-- Alla enheter --</option>
                {restaurants.map(r => (
                  <option key={r.id} value={r.id} className="bg-dark-500 text-white">{r.name}</option>
                ))}
              </select>
              <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-white/20 group-hover:text-gold-500 transition-colors">
                <ChevronDown size={14} />
              </div>
            </div>
          </div>
        )}

        {/* Open/Closed Toggle */}
        {selectedRestaurantId && (
        <button
          onClick={toggleOpen}
          disabled={toggling}
          className={`flex items-center gap-4 p-5 rounded-[2rem] border mb-8 w-full transition-all group ${
            isOpen
              ? "bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/20"
              : "bg-red-500/10 border-red-500/20 hover:bg-red-500/20"
          } ${toggling ? "opacity-50" : ""}`}
        >
          <div className={`p-2 rounded-full ${isOpen ? "bg-emerald-500 text-white" : "bg-red-500 text-white"} transition-transform group-active:scale-90`}>
            {isOpen ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
          </div>
          <div className="text-left">
            <div className={`text-xs font-black uppercase tracking-[0.2em] ${isOpen ? "text-emerald-400" : "text-red-400"}`}>
              {isOpen ? "ÖPPEN" : "STÄNGD"}
            </div>
            <div className="text-[10px] text-white/30 uppercase font-bold tracking-tighter truncate max-w-[120px]">
              {selectedRestaurantName}
            </div>
          </div>
        </button>
        )}
      </div>

      {/* Main Nav */}
      <nav className="flex-1 px-8 space-y-2 overflow-y-auto overflow-x-hidden pt-4 pb-10 custom-scrollbar">
        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20 ml-1 mb-4">Administration</div>
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;
          return (
            <Link 
              key={link.href} 
              href={link.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-4 px-5 py-4 rounded-2xl transition-all font-black text-[11px] uppercase tracking-widest ${
                isActive 
                  ? "bg-gold-500 text-dark-500 shadow-xl shadow-gold-500/30 ring-1 ring-white/20" 
                  : "text-white/40 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/5"
              }`}
            >
              <Icon size={18} className={isActive ? "text-dark-500" : "text-gold-500/60"} />
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer / Account */}
      <div className="p-8 pt-0 mt-auto border-t border-white/5 bg-dark-500/50 backdrop-blur-xl">
        <button
          onClick={() => {
            localStorage.removeItem("palmyra_token");
            localStorage.removeItem("palmyra_admin");
            window.location.href = "/login";
          }}
          className="w-full flex items-center gap-4 px-5 py-5 text-red-400/50 hover:text-red-400 transition-all font-black text-[10px] uppercase tracking-[0.2em] group"
        >
          <LogOut size={18} className="group-hover:-translate-x-1 transition-transform" />
          Avsluta Session
        </button>
      </div>
    </div>
  );

  return (
    <>
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
      `}</style>

      <div className="lg:hidden fixed top-6 left-6 z-[60]">
        <button 
          onClick={() => setIsMobileMenuOpen(true)}
          className="p-4 bg-dark-400 border border-white/10 rounded-[1.5rem] text-gold-500 shadow-2xl backdrop-blur-xl"
        >
          <Menu size={24} />
        </button>
      </div>

      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-80 bg-dark-400 border-r border-white/5 flex-col z-50">
        <div className="absolute inset-0 bg-gradient-to-b from-gold-500/[0.03] to-transparent pointer-events-none" />
        {sidebarContent}
      </aside>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-[70] lg:hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 180 }}
              className="absolute left-0 top-0 bottom-0 w-[85%] max-w-sm bg-dark-400 shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="absolute inset-0 bg-gradient-to-b from-gold-500/[0.05] to-transparent pointer-events-none" />
              {sidebarContent}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Sidebar;
