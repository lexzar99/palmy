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
  Bike,
  Menu,
  X
} from "lucide-react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { io as socketIO } from "socket.io-client";
import { API_URL, SOCKET_URL } from "@/lib/api";

const Sidebar = () => {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const getToken = () => typeof window !== "undefined" ? localStorage.getItem("palmyra_token") || "" : "";

  useEffect(() => {
    axios.get(`${API_URL}/api/settings`).then(res => {
      setIsOpen(res.data.isOpen ?? true);
    }).catch(() => {});

    const socket = socketIO(SOCKET_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });
    socket.on("settings:updated", (data: any) => {
      setIsOpen(data.isOpen ?? true);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const toggleOpen = async () => {
    setToggling(true);
    try {
      const newVal = !isOpen;
      await axios.patch(`${API_URL}/api/settings`, { isOpen: newVal }, {
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
    { href: "/courier", label: "Budvy", icon: Bike },
    { href: "/history", label: "Föregående beställningar", icon: Clock },
    { href: "/menu", label: "Menyhantering", icon: Utensils },
    { href: "/receipt", label: "Kvittolayout", icon: Printer },
    { href: "/stats", label: "Statistik / Utdrag", icon: Activity },
    { href: "/settings", label: "Inställningar", icon: Settings },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full p-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Palmyra Logo" className="w-8 h-8 object-contain" />
          <span className="font-bold tracking-tight text-white/80 uppercase">ADMIN <span className="text-gold-500 text-sm">PALMYRA</span></span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden p-2 text-white/40 hover:text-white">
          <X size={20} />
        </button>
      </div>

      {/* Global Open/Closed Toggle */}
      <button
        onClick={toggleOpen}
        disabled={toggling}
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
          <div className="text-[9px] text-white/30 uppercase tracking-widest font-bold">Restaurang</div>
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
