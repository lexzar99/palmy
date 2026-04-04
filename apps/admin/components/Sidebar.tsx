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
    { href: "/overview", label: "Översikt", icon: BarChart3, color: "text-blue-500", bg: "bg-blue-500/10" },
    { href: "/orders", label: "Nya Ordrar", icon: ShoppingCart, color: "text-amber-500", bg: "bg-amber-500/10" },
    { href: "/history", label: "Gamla Ordrar", icon: Clock, color: "text-slate-500", bg: "bg-slate-500/10" },
    { href: "/menu", label: "Meny", icon: Utensils, color: "text-rose-500", bg: "bg-rose-500/10" },
    ...(isSuperAdmin ? [{ href: "/cities", label: "Utkörning", icon: MapPin, color: "text-emerald-500", bg: "bg-emerald-500/10" }] : []),
    { href: "/stats", label: "Statistik", icon: Activity, color: "text-indigo-500", bg: "bg-indigo-500/10" },
    { href: "/settings/printing", label: "Utskrift", icon: Printer, color: "text-cyan-500", bg: "bg-cyan-500/10" },
    { href: "/settings/global", label: "System", icon: Settings, color: "text-neutral-500", bg: "bg-neutral-500/10" },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0d1117] text-slate-300 shadow-2xl">
      {/* Header Profile */}
      <div className="p-6 pb-4 border-b border-white/5">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex justify-center items-center text-white font-bold text-lg shadow-md shadow-blue-500/20">P</div>
            <div className="font-extrabold text-lg tracking-tight text-white">Admin<span className="text-blue-500">Panel</span></div>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden p-2 hover:bg-white/5 rounded-lg text-slate-400">
            <X size={20} />
          </button>
        </div>

        {/* Super Admin Global Tools */}
        {isSuperAdmin && (
          <div className="mb-4">
            <button
              onClick={() => { setRestaurant(null, null); setIsMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all border ${
                !selectedRestaurantId 
                  ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20" 
                  : "bg-transparent border-white/10 text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Globe size={16} />
              <span className="text-[11px] font-bold uppercase tracking-widest">Sök Alla Ordrar</span>
            </button>
            <Link
              href="/restaurants"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`mt-2 flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all border ${
                pathname === "/restaurants"
                  ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20"
                  : "bg-transparent border-white/10 text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <LayoutGrid size={16} />
              <span className="text-[11px] font-bold uppercase tracking-widest">Enheter</span>
            </Link>
          </div>
        )}

        {/* Restaurant Selection Dropdown */}
        {isSuperAdmin && (
          <div className="mb-4">
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
                className="w-full bg-white/5 border border-white/10 outline-none rounded-xl px-4 py-3 text-[11px] tracking-widest font-bold text-slate-300 uppercase appearance-none cursor-pointer focus:border-blue-500/50 transition-all shadow-sm" 
              >
                <option value="" className="bg-[#0d1117]">Välj Enhet...</option>
                {restaurants.map(r => (
                  <option key={r.id} value={r.id} className="bg-[#0d1117]">{r.name}</option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
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
          className={`flex items-center gap-3 p-4 rounded-2xl border transition-all shadow-sm group ${
            isOpen ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-rose-500/10 border-rose-500/20 text-rose-400"
          } ${toggling ? "opacity-50" : ""}`}
        >
          {isOpen ? <ToggleRight size={26} className="text-emerald-500" /> : <ToggleLeft size={26} className="text-rose-500" />}
          <div className="text-left flex-1 flex flex-col justify-center">
            <div className="text-[11px] tracking-widest font-black uppercase whitespace-nowrap">{isOpen ? "Öppen" : "Stängd"}</div>
            <div className={`text-[10px] font-bold truncate max-w-[130px] opacity-70 uppercase`}>
              {selectedRestaurantName}
            </div>
          </div>
        </button>
        )}
      </div>

      {/* Main Nav */}
      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto custom-scrollbar">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;
          return (
            <Link 
              key={link.href} 
              href={link.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all font-bold text-[12px] uppercase tracking-widest ${
                isActive 
                  ? "bg-white/10 text-white shadow-sm border border-white/10" 
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <div className={`p-1.5 rounded-lg ${isActive ? link.color + " " + link.bg : "text-slate-500"}`}>
                <Icon size={16} />
              </div>
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer / Account */}
      <div className="p-4 border-t border-white/5">
        <button
          onClick={() => {
            localStorage.removeItem("palmyra_token");
            localStorage.removeItem("palmyra_admin");
            window.location.href = "/login";
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-3.5 text-rose-500/70 hover:bg-rose-500/10 hover:text-rose-500 rounded-xl transition-all font-bold text-[11px] uppercase tracking-widest"
        >
          <LogOut size={16} />
          Logga Ut
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Top Bar */}
      <div className="lg:hidden fixed top-0 w-full h-16 bg-[#0d1117] border-b border-white/5 z-40 flex items-center justify-between px-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex justify-center items-center text-white font-bold text-lg shadow-md shadow-blue-500/20">P</div>
          <div className="font-extrabold text-lg tracking-tight text-white">Admin<span className="text-blue-500">Panel</span></div>
        </div>
        <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-slate-300 hover:bg-white/5 rounded-lg transition-colors">
          <Menu size={24} />
        </button>
      </div>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="lg:hidden fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              className="lg:hidden fixed top-0 left-0 bottom-0 w-[280px] bg-[#0d1117] border-r border-white/5 z-50 shadow-2xl"
            >
              {sidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <div className="hidden lg:block fixed top-0 left-0 bottom-0 w-[260px] bg-[#0d1117] border-r border-white/5 z-40 shadow-xl">
        {sidebarContent}
      </div>
    </>
  );
};

export default Sidebar;
