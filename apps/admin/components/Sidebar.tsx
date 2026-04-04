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
    { href: "/cities", label: "Utkörning", icon: MapPin },
    { href: "/stats", label: "Data", icon: Activity },
    { href: "/settings/printing", label: "Utskrift", icon: Printer },
    { href: "/settings/global", label: "System", icon: Settings },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-black text-white">
      {/* Header Profile */}
      <div className="p-6 pb-2 border-b border-white/10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="font-black text-xl tracking-tight uppercase">Admin</div>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden p-2 hover:bg-white/10 rounded-lg">
            <X size={20} />
          </button>
        </div>

        {/* Super Admin Global Tools */}
        {isSuperAdmin && (
          <div className="mb-4">
            <button
              onClick={() => { setRestaurant(null, null); setIsMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition-all border ${
                !selectedRestaurantId 
                  ? "bg-white text-black border-white" 
                  : "bg-transparent border-white/20 text-white/50 hover:bg-white/5"
              }`}
            >
              <Globe size={16} />
              <span className="text-xs font-bold uppercase">Sök Alla Ordrar</span>
            </button>
            <Link
              href="/restaurants"
              onClick={() => setIsMobileMenuOpen(false)}
              className={`mt-2 flex items-center gap-3 px-4 py-2 rounded-lg transition-all border ${
                pathname === "/restaurants"
                  ? "bg-white text-black border-white"
                  : "bg-transparent border-white/20 text-white/50 hover:bg-white/5"
              }`}
            >
              <LayoutGrid size={16} />
              <span className="text-xs font-bold uppercase">Alla Restauranger</span>
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
                className="w-full bg-black border border-white/20 rounded-lg px-4 py-2 text-xs font-bold text-white uppercase appearance-none cursor-pointer focus:outline-none focus:border-white transition-all" 
              >
                <option value="" className="bg-black text-white">Välj Enhet...</option>
                {restaurants.map(r => (
                  <option key={r.id} value={r.id} className="bg-black text-white">{r.name}</option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-white/50">
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
          className={`flex items-center gap-3 p-3 rounded-lg border mb-4 w-full transition-all group ${
            isOpen ? "bg-white text-black border-white" : "bg-transparent border-white/20 text-white/50"
          } ${toggling ? "opacity-50" : ""}`}
        >
          {isOpen ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
          <div className="text-left flex-1 flex items-center justify-between">
            <div className="text-xs font-bold uppercase">{isOpen ? "ÖPPEN" : "STÄNGD"}</div>
            <div className="text-[10px] uppercase font-bold truncate max-w-[100px] opacity-70">
              {selectedRestaurantName}
            </div>
          </div>
        </button>
        )}
      </div>

      {/* Main Nav */}
      <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto custom-scrollbar">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;
          return (
            <Link 
              key={link.href} 
              href={link.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all font-bold text-xs uppercase ${
                isActive 
                  ? "bg-white text-black" 
                  : "text-white/60 hover:text-white hover:bg-white/10"
              }`}
            >
              <Icon size={16} />
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer / Account */}
      <div className="p-4 border-t border-white/10">
        <button
          onClick={() => {
            localStorage.removeItem("palmyra_token");
            localStorage.removeItem("palmyra_admin");
            window.location.href = "/login";
          }}
          className="w-full flex items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-500/10 rounded-lg transition-all font-bold text-xs uppercase"
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
      <div className="lg:hidden fixed top-0 w-full h-16 bg-black border-b border-white/10 z-40 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <div className="font-black text-white text-xl tracking-tighter uppercase">Admin</div>
        </div>
        <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-white hover:bg-white/10 rounded-lg">
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
              className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              className="lg:hidden fixed top-0 left-0 bottom-0 w-[280px] bg-black border-r border-white/10 z-50"
            >
              {sidebarContent}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <div className="hidden lg:block fixed top-0 left-0 bottom-0 w-[240px] bg-black border-r border-white/10 z-40">
        {sidebarContent}
      </div>
    </>
  );
};

export default Sidebar;
