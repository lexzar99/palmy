"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  ShoppingCart, 
  Utensils, 
  Settings, 
  LogOut, 
  Clock, 
  Menu,
  X,
  ToggleLeft, 
  ToggleRight,
  LayoutDashboard,
  Zap,
  ChevronDown
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { io as socketIO } from "socket.io-client";
import { API_URL, SOCKET_URL } from "@/lib/api";

const Sidebar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [restaurant, setRestaurant] = useState<any>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    const token = localStorage.getItem("matgo_token");
    const admin = JSON.parse(localStorage.getItem("matgo_admin") || "{}");
    
    if (admin.restaurantId) {
      axios.get(`${API_URL}/api/restaurants/${admin.restaurantId}`, {
        headers: { Authorization: `Bearer ${token}` }
      }).then(res => {
        setRestaurant(res.data);
        setIsOpen(res.data.manualIsOpen ?? res.data.isOpen ?? true);
      }).catch(() => {});
    }

    const socket = socketIO(SOCKET_URL, { path: "/socket.io", transports: ["websocket", "polling"] });
    socket.on("settings:updated", (data: any) => { 
      if (data.restaurantId === admin.restaurantId) {
        setIsOpen(data.manualIsOpen ?? data.isOpen ?? true); 
      }
    });
    return () => { socket.disconnect(); };
  }, []);

  const toggleOpen = async () => {
    if (!restaurant?.id) return;
    setToggling(true);
    try {
      const newVal = !isOpen;
      const token = localStorage.getItem("matgo_token");
      await axios.patch(`${API_URL}/api/restaurants/${restaurant.id}`, { isOpen: newVal }, { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      setIsOpen(newVal);
    } catch { alert("Kunde inte ändra status"); } finally { setToggling(false); }
  };

  const links = [
    { href: "/", label: "Nya Ordrar", icon: ShoppingCart },
    { href: "/history", label: "Orderhistorik", icon: Clock },
    { href: "/menu", label: "Menyhantering", icon: Utensils },
    { href: "/settings", label: "Inställningar", icon: Settings },
  ];

  if (!isMounted) return null;

  const NavItem = ({ link }: { link: any }) => {
    const Icon = link.icon;
    const isActive = pathname === link.href;
    return (
      <Link 
        href={link.href} 
        onClick={() => setIsMobileMenuOpen(false)} 
        className={`flex items-center gap-3.5 px-5 py-4 rounded-2xl transition-all font-black text-[11px] uppercase tracking-widest ${isActive ? "bg-gold-500 text-zinc-950 shadow-xl shadow-gold-500/20" : "text-zinc-400 hover:text-white hover:bg-zinc-900"}`}
      >
        <Icon size={18} className={isActive ? "text-zinc-950" : "text-gold-500/60"} /> 
        <span>{link.label}</span>
      </Link>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-zinc-950 border-r border-white/5">
      <div className="p-6">
        <div className="flex items-center gap-3 mb-10">
           <div className="w-10 h-10 rounded-2xl bg-gold-500 flex items-center justify-center text-zinc-950 font-black shadow-lg shadow-gold-500/20 rotate-3 italic text-xl">M</div>
           <div>
              <div className="text-[8px] font-black uppercase tracking-[0.4em] text-gold-500/60">Partner</div>
              <div className="font-black tracking-tight text-white text-xl uppercase italic leading-none">MatGo</div>
           </div>
        </div>

        {restaurant && (
          <button 
            onClick={toggleOpen} 
            disabled={toggling} 
            className={`flex items-center gap-3 p-5 rounded-2xl border transition-all w-full mb-8 ${isOpen ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-500" : "bg-rose-500/5 border-rose-500/20 text-rose-500"} ${toggling ? "opacity-50" : "active:scale-[0.98]"}`}
          >
            {isOpen ? <ToggleRight size={24}/> : <ToggleLeft size={24}/>}
            <div className="text-left flex-1">
              <div className="text-[10px] font-black uppercase tracking-widest">{isOpen ? "ÖPPEN" : "STÄNGD"}</div>
              <div className="text-[9px] text-white/40 uppercase font-bold truncate max-w-[140px]">{restaurant.name}</div>
            </div>
          </button>
        )}
      </div>

      <nav className="flex-1 px-4 space-y-2 overflow-y-auto no-scrollbar">
        {links.map(link => <NavItem key={link.href} link={link} />)}
      </nav>

      <div className="p-6 border-t border-white/5 space-y-3">
        <button 
          onClick={async () => {
            if (!restaurant?.id) return;
            const confirmTest = confirm("Vill du skapa en automatisk test-order?");
            if (!confirmTest) return;
            try {
              const resToken = localStorage.getItem("matgo_token");
              const productsRes = await axios.get(`${API_URL}/api/menu/categories?restaurantId=${restaurant.id}`);
              const products = productsRes.data.flatMap((c: any) => c.products);
              if (products.length === 0) throw new Error("Inga produkter hittades.");
              const randomProduct = products[Math.floor(Math.random() * products.length)];
              await axios.post(`${API_URL}/api/orders`, {
                restaurantId: restaurant.id,
                type: "PICKUP",
                customerName: "PARTNER_TEST",
                customerPhone: "0700101010",
                stripePaymentIntentId: "TEST_PAYMENT",
                items: [{ productId: randomProduct.id, quantity: 1, selectedExtras: [], note: "Restaurangtest" }]
              });
              alert("Testorder skickad!");
            } catch (err) { alert("Fel: " + err); }
          }}
          className="w-full flex items-center gap-3 px-5 py-4 bg-zinc-900 hover:bg-zinc-800 rounded-xl text-gold-500/60 hover:text-gold-500 transition-all font-black text-[9px] uppercase tracking-widest active:scale-95"
        >
           <Zap size={14} /> Testa Systemet
        </button>
        <button 
          onClick={() => { 
            localStorage.removeItem("matgo_token"); 
            localStorage.removeItem("matgo_admin"); 
            window.location.href = "/login"; 
          }} 
          className="w-full flex items-center gap-3 px-5 py-4 text-rose-500/60 hover:text-rose-500 hover:bg-rose-500/5 rounded-xl transition-all font-black text-[9px] uppercase tracking-widest group"
        >
          <LogOut size={16} className="group-hover:-translate-x-1 transition-transform" /> Logga Ut
        </button>
      </div>
    </div>
  );

  return (
    <>
      <div className="lg:hidden fixed top-0 w-full h-16 bg-zinc-950 border-b border-white/5 z-40 flex items-center justify-between px-6">
        <div className="flex items-center gap-2.5">
           <div className="w-8 h-8 rounded-xl bg-gold-500 flex items-center justify-center text-zinc-950 font-black rotate-3 italic">M</div>
           <div className="font-black text-white text-base tracking-tight uppercase italic">Partner<span className="text-gold-500 ml-0.5">Go</span></div>
        </div>
        <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 text-zinc-400 bg-zinc-900 rounded-xl"><Menu size={20}/></button>
      </div>

      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden fixed inset-0 bg-black/80 backdrop-blur-sm z-[60]" />
            <motion.div initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ type: "spring", bounce: 0, duration: 0.4 }} className="lg:hidden fixed top-0 left-0 bottom-0 w-[280px] z-[70]">{sidebarContent}</motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="hidden lg:block fixed top-0 left-0 bottom-0 w-[260px] z-40">{sidebarContent}</div>
    </>
  );
};

export default Sidebar;
