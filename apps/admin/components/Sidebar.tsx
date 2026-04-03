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
  ChevronDown
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
    } catch {
      setIsSuperAdmin(false);
    }

    if (isSuperAdmin) {
      // Fetch all restaurants for the dropdown (super admin only)
      axios.get(`${API_URL}/api/restaurants`).then(res => {
        setRestaurants(res.data);
        // Default to Palmyra if nothing selected
        if (!selectedRestaurantId && res.data.length > 0) {
          const palmyra = res.data.find((r: any) => r.slug === "palmyra");
          if (palmyra) setRestaurant(palmyra.id, palmyra.name);
        }
      }).catch(() => {});
    }

    // Fetch status for the selected restaurant
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
      // Note: We'd ideally have an endpoint that takes restaurantId
      // For now we assume the standard patch works or we'd need to update the API
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
    <div className="flex flex-col h-full p-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Palmyra Logo" className="w-8 h-8 object-contain" />
          <span className="font-bold tracking-tight text-white/80 uppercase">ADMIN <span className="text-gold-500 text-sm">MATGO</span></span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden p-2 text-white/40 hover:text-white">
          <X size={20} />
        </button>
      </div>

      {isSuperAdmin && (
      <div className="mb-6 rounded-xl border border-white/10 bg-white/5">
        <button
          onClick={() => setRestaurantSectionOpen((o) => !o)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-white/70 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-3 text-gold-500">
            <Store size={20} />
            <span className="font-black uppercase tracking-widest text-[#fff]">GLOBAL HANTERING</span>
          </span>
          <ChevronDown
            size={18}
            className={`transition-transform text-white/40 ${restaurantSectionOpen ? "rotate-180" : ""}`}
          />
        </button>
        <AnimatePresence>
          {restaurantSectionOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex flex-col border-t border-white/5">
                <Link
                  href="/restaurants"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`px-4 py-3.5 text-xs font-black uppercase tracking-widest ${
                    pathname === "/restaurants"
                      ? "bg-gold-500/15 text-gold-500"
                      : "text-white/40 hover:bg-white/5"
                  }`}
                >
                  Alla restauranger
                </Link>
                <Link
                  href="/settings/global"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`px-4 py-3.5 text-xs font-black uppercase tracking-widest ${
                    pathname === "/settings/global"
                      ? "bg-gold-500/15 text-gold-500"
                      : "text-white/40 hover:bg-white/5"
                  }`}
                >
                  Globala Inställningar
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      )}

      {/* Restaurant Selector Dropdown */}
      {isSuperAdmin && (
      <div className="relative mb-6">
        <p className="text-[10px] font-black uppercase tracking-widest text-white/20 mb-2 ml-1">Välj Restaurang</p>
        <div className="relative group">
          <select 
            value={selectedRestaurantId || ""} 
            onChange={(e) => {
              const r = restaurants.find(res => res.id === e.target.value);
              if (r) setRestaurant(r.id, r.name);
            }}
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm font-bold text-white appearance-none cursor-pointer focus:outline-none focus:border-gold-500/40 transition-all hover:bg-white/[0.08]"
          >
            {restaurants.map(r => (
              <option key={r.id} value={r.id} className="bg-dark-500 text-white font-bold">{r.name}</option>
            ))}
          </select>
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/30 group-hover:text-gold-500 transition-colors">
            <ChevronDown size={18} />
          </div>
        </div>
      </div>
      )}

      {/* Global Open/Closed Toggle */}
      <button
        onClick={toggleOpen}
        disabled={toggling || !selectedRestaurantId}
        className={`flex items-center gap-4 p-4 rounded-2xl border mb-8 w-full transition-all ${
          isOpen
            ? "bg-green-500/10 border-green-500/20 hover:bg-green-500/20"
            : "bg-red-500/10 border-red-500/20 hover:bg-red-500/20"
        } ${toggling ? "opacity-50" : ""}`}
      >
        {isOpen ? (
          <ToggleRight size={28} className="text-green-400 flex-shrink-0" />
        ) : (
          <ToggleLeft size={28} className="text-red-400 flex-shrink-0" />
        )}
        <div className="text-left">
          <div className={`text-sm font-black uppercase ${isOpen ? "text-green-400" : "text-red-400"}`}>
            {isOpen ? "ÖPPEN" : "STÄNGD"}
          </div>
          <div className="text-[9px] text-white/30 uppercase tracking-widest font-bold truncate max-w-[120px]">
            {selectedRestaurantName || "Restaurang"}
          </div>
        </div>
      </button>

      <nav className="flex-1 space-y-2">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;
          return (
            <Link 
              key={link.href} 
              href={link.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all font-medium text-sm ${
                isActive 
                  ? "bg-gold-500 text-dark-500 shadow-lg shadow-gold-500/20" 
                  : "text-white/40 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon size={20} />
              {link.label}
            </Link>
          );
        })}


      </nav>

      <button
        onClick={() => {
          localStorage.removeItem("palmyra_token");
          localStorage.removeItem("palmyra_admin");
          window.location.href = "/login";
        }}
        className="flex items-center gap-4 px-4 py-3 rounded-xl text-white/20 hover:text-red-500 hover:bg-red-500/5 transition-all font-medium text-sm mt-4 pt-4 border-t border-white/5"
      >
        <LogOut size={20} />
        Logga ut
      </button>
    </div>
  );

  return (
    <>
      {/* Mobile Toggle Button */}
      <div className="lg:hidden fixed top-4 left-4 z-[60]">
        <button 
          onClick={() => setIsMobileMenuOpen(true)}
          className="p-3 bg-dark-400 border border-white/10 rounded-2xl text-gold-500 shadow-xl"
        >
          <Menu size={24} />
        </button>
      </div>

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-64 bg-dark-400 border-r border-white/5 flex-col z-50">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-[70] lg:hidden">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="absolute left-0 top-0 bottom-0 w-72 bg-dark-400 shadow-2xl overflow-y-auto"
            >
              {sidebarContent}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Sidebar;
