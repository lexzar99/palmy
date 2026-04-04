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
  MapPin
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
    { href: "/overview", label: "Översikt", icon: BarChart3 },
    { href: "/orders", label: "Nya Ordrar", icon: ShoppingCart },
    { href: "/history", label: "Gamla Ordrar", icon: Clock },
    { href: "/menu", label: "Meny", icon: Utensils },
    ...(isSuperAdmin ? [{ href: "/cities", label: "Utkörning", icon: MapPin }] : []),
    { href: "/stats", label: "Statistik", icon: Activity },
    { href: "/settings/printing", label: "Utskrift", icon: Printer },
    { href: "/settings/global", label: "System", icon: Settings },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0d0f1a] text-white">
      {/* Header Profile */}
      <div className="p-6 pb-2 border-b border-white/5 bg-[#07080d]">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
             <div className="w-9 h-9 rounded-xl bg-gold-500 flex items-center justify-center text-dark-500 font-bold shadow-lg shadow-gold-500/20">
               <span className="text-xl">P</span>
             </div>
             <div>
               <div className="text-[9px] font-black uppercase tracking-[0.2em] text-white/20 leading-none mb-1">Admin Panel</div>
               <div className="font-black tracking-tighter text-white text-lg leading-none uppercase">Palmyra <span className="text-gold-500">Lund</span></div>
             </div>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden p-2 text-white/30 hover:text-white bg-white/5 rounded-lg">
            <X size={20} />
          </button>
        </div>

        {/* Super Admin Global Tools */}
        {isSuperAdmin && (
          <div className="space-y-1.5 mb-6">
            <button
              onClick={() => { setRestaurant(null, null); setIsMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all border ${
                !selectedRestaurantId 
                  ? "bg-gold-500 text-dark-500 border-gold-500 shadow-xl shadow-gold-500/10" 
                  : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
              }`}
            >
              <Globe size={16} className={!selectedRestaurantId ? "text-dark-500" : "text-gold-500"} />
              <div className="text-left">
                <div className="text-[10px] font-black uppercase tracking-widest leading-none">Global Sök</div>
              </div>
            </button>
            <Link
              href="/restaurants"
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all border ${
                pathname === "/restaurants"
                  ? "bg-white/10 border-white/10 text-white"
                  : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
              }`}
            >
              <LayoutGrid size={16} className="text-gold-500" />
              <div className="text-[10px] font-black uppercase tracking-widest leading-none">Alla Enheter</div>
            </Link>
          </div>
        )}

        {/* Restaurant Selection Dropdown */}
        {isSuperAdmin && (
          <div className="mb-6">
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
                className="w-full bg-[#121421] border border-white/5 rounded-xl px-4 py-3 text-[10px] font-black text-white/60 appearance-none cursor-pointer focus:outline-none focus:border-gold-500/40 transition-all hover:bg-white/5 uppercase tracking-widest" 
              >
                <option value="" className="bg-[#121421] text-white">Välj Restaurang...</option>
                {restaurants.map(r => (
                  <option key={r.id} value={r.id} className="bg-[#121421] text-white">{r.name}</option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/20 group-hover:text-gold-500 transition-colors">
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
          className={`flex items-center gap-3 p-4 rounded-2xl border transition-all shadow-sm mb-6 w-full ${
            isOpen ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400" : "bg-rose-500/5 border-rose-500/20 text-rose-400"
          } ${toggling ? "opacity-50" : ""}`}
        >
          {isOpen ? <ToggleRight size={24} className="text-emerald-500" /> : <ToggleLeft size={24} className="text-rose-500" />}
          <div className="text-left flex-1">
             <div className="text-[10px] font-black uppercase tracking-widest">{isOpen ? "ÖPPEN" : "STÄNGD"}</div>
             <div className="text-[9px] text-white/30 uppercase font-black tracking-tighter truncate max-w-[120px]">{selectedRestaurantName}</div>
          </div>
        </button>
        )}
      </div>

      {/* Main Nav */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto custom-scrollbar">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;
          return (
            <Link 
              key={link.href} 
              href={link.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-4 px-5 py-3.5 rounded-xl transition-all font-black text-[11px] uppercase tracking-widest ${
                isActive 
                  ? "bg-gold-500 text-dark-500 shadow-xl shadow-gold-500/10" 
                  : "text-white/30 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon size={16} className={isActive ? "text-dark-500" : "text-gold-500/60"} />
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer / Account */}
      <div className="p-6 border-t border-white/5 bg-[#07080d]/80 backdrop-blur-xl">
        <button
          onClick={() => {
            localStorage.removeItem("palmyra_token");
            localStorage.removeItem("palmyra_admin");
            window.location.href = "/login";
          }}
          className="w-full flex items-center gap-4 px-4 py-4 text-rose-400/50 hover:text-rose-400 transition-all font-black text-[10px] uppercase tracking-widest group"
        >
          <LogOut size={18} className="group-hover:-translate-x-1 transition-transform" />
          Avsluta Session
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="lg:hidden fixed top-0 w-full h-16 bg-[#07080d] border-b border-white/5 z-40 flex items-center justify-between px-6 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gold-400 flex items-center justify-center text-dark-500 font-bold">P</div>
          <div className="font-black text-white text-lg tracking-tighter uppercase">Admin <span className="text-gold-500">Panel</span></div>
        </div>
        <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-white/40 hover:text-white bg-white/5 rounded-lg border border-white/10">
          <Menu size={24} />
        </button>
      </div>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden fixed inset-0 bg-[#000]/80 backdrop-blur-sm z-40" />
            <motion.div initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", bounce: 0, duration: 0.4 }} className="lg:hidden fixed top-0 left-0 bottom-0 w-[280px] bg-[#07080d] border-r border-white/5 z-50">
              {sidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="hidden lg:block fixed top-0 left-0 bottom-0 w-[260px] bg-[#07080d] border-r border-white/5 z-40">
        {sidebarContent}
      </div>
    </>
  );
};

export default Sidebar;
