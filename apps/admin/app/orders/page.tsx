/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ShoppingCart, 
  MapPin, 
  Printer, 
  Truck, 
  Store, 
  RefreshCw, 
  ChevronDown, 
  Loader2, 
  Clock, 
  AlertCircle,
  Phone,
  Edit2,
  X,
  Ticket,
  Zap,
  ArrowRight
} from "lucide-react";
import { io as socketIO } from "socket.io-client";
import confetti from "canvas-confetti";
import { API_URL, SOCKET_URL } from "@/lib/api";
import { useRestaurantStore } from "@/store/restaurantStore";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Ny Order",
  ACCEPTED: "Bekräftad",
  PREPARING: "Tillagas",
  READY: "Klar",
  DELIVERING: "På väg",
  DELIVERED: "Levererad",
  DELIVERY_FAILED: "Ej levererad",
  CANCELLED: "Avbokad",
  REJECTED: "Nekad",
};

const getDisplayName = (item: any) => {
  if (!item) return "";
  let extras = [];
  try { extras = typeof item.selectedExtras === "string" ? JSON.parse(item.selectedExtras) : (item.selectedExtras || []); } catch {}
  return `${item.productName}${Array.isArray(extras) && extras.length > 0 ? " - " + extras.map((e: any) => e.extraName || e.name).join(", ") : ""}`;
};

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  type: string;
  customerName: string;
  customerPhone: string;
  deliveryStreet?: string;
  deliveryZip?: string;
  deliveryCity?: string;
  note?: string;
  total: number;
  createdAt: string;
  items: any[];
  paymentMethod?: string;
  appliedDealTitle?: string;
  discountAmount: number;
  stripePaymentIntentId?: string;
  discountCode?: string;
}

const OrderCard = ({ order, isNew, expandedOrderId, setExpandedOrderId, setAcceptDialog, updateStatus, isSuperAdmin, isPast, setEditingOrder }: any) => {
  const isExpanded = expandedOrderId === order.id;
  const isTest = order.stripePaymentIntentId === "TEST_PAYMENT" || order.discountCode === "test" || order.discountCode === "testa";

  return (
    <motion.div 
      layout 
      className={`rounded-[2.5rem] p-6 transition-all relative overflow-hidden bg-bg-secondary border ${
        isTest 
          ? 'border-rose-500/30' 
          : isNew 
            ? 'border-gold-500/30 shadow-2xl shadow-gold-500/5' 
            : 'border-border-subtle'
      }`}
    >
      {isTest && (
        <div className="absolute top-0 right-10 bg-rose-500 text-white text-[8px] font-black uppercase px-4 py-1.5 rounded-b-2xl tracking-[0.2em] shadow-lg z-10 animate-pulse">
           Bot / Test Order
        </div>
      )}

      <div onClick={() => setExpandedOrderId(isExpanded ? null : order.id)} className="flex items-center justify-between gap-4 cursor-pointer">
        <div className="flex items-center gap-5 flex-1">
          <div className={`w-12 h-12 rounded-[1.2rem] transition-all flex items-center justify-center font-black text-xs ${isTest ? 'bg-rose-500 text-white' : isNew ? 'bg-gold-500 text-zinc-950 scale-105 rotate-2 shadow-xl shadow-gold-500/20' : 'bg-bg-primary text-gold-500 border border-border-subtle'}`}>
             {String(order.orderNumber).replace("PX-", "")}
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-[9px] font-black uppercase tracking-[0.2em] flex items-center gap-2 mb-1 ${isTest ? 'text-rose-500' : isNew ? 'text-gold-500' : 'text-text-secondary'}`}>
              {(new Date(order.createdAt)).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} · {STATUS_LABELS[order.status] || order.status}
              <span className={`px-2.5 py-0.5 rounded-full text-[8px] border-[1px] ${order.type === "DELIVERY" ? "border-sky-500/20 text-sky-500 bg-sky-500/5" : "border-emerald-500/20 text-emerald-500 bg-emerald-500/5"}`}>
                 {order.type === "DELIVERY" ? "UTKÖRNING" : "AVHÄMTNING"}
              </span>
            </div>
            <div className="flex items-center gap-4">
               <h3 className="text-lg font-black uppercase text-text-primary truncate italic tracking-tight">{order.customerName}</h3>
               {order.type === "DELIVERY" && order.deliveryStreet && (
                 <div className="flex items-center gap-1.5 text-[9px] font-black text-sky-500 uppercase truncate bg-sky-500/5 px-3 py-1 rounded-full border border-sky-500/10">
                    <MapPin size={10} /> {order.deliveryStreet}
                 </div>
               )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-8">
           {isSuperAdmin && (
              <button 
                onClick={(e) => { e.stopPropagation(); setEditingOrder(order); }}
                className="w-10 h-10 rounded-2xl bg-bg-primary border border-border-subtle flex items-center justify-center text-text-secondary hover:text-gold-500 hover:border-gold-500/20 transition-all"
              >
                <Edit2 size={16} />
              </button>
           )}
           <div className={`text-xl font-black italic tracking-tighter transition-colors ${isPast ? 'text-text-secondary' : isTest ? 'text-rose-500' : 'text-gold-500'}`}>{order.total / 100} <span className="text-[10px] opacity-40">SEK</span></div>
           <div className={`w-10 h-10 rounded-full flex items-center justify-center bg-bg-primary border border-border-subtle transition-transform duration-500 ${isExpanded ? 'rotate-180 border-gold-500/40 text-gold-500' : 'text-text-secondary'}`}>
              <ChevronDown size={20} />
           </div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-8 pt-8 border-t border-border-subtle space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
               <div className={`p-5 rounded-[1.8rem] border-[1px] ${order.type === "DELIVERY" ? "bg-sky-500/5 border-sky-500/20" : "bg-emerald-500/5 border-emerald-500/20"}`}>
                  <div className={`text-[8px] uppercase font-black tracking-widest mb-1 shadow-sm opacity-40 ${order.type === "DELIVERY" ? "text-sky-500" : "text-emerald-500"}`}>Logistik</div>
                  <div className={`text-[11px] font-black flex items-center gap-2 uppercase tracking-[0.1em] ${order.type === "DELIVERY" ? "text-sky-500" : "text-emerald-500"}`}>{order.type === "DELIVERY" ? <Truck size={14}/> : <Store size={14}/>} {order.type === "DELIVERY" ? "Hemleverans" : "Hämtar själv"}</div>
               </div>
               <div className="bg-bg-primary p-5 rounded-[1.8rem] border border-border-subtle">
                  <div className="text-[8px] text-text-secondary uppercase font-black tracking-widest mb-1 opacity-40">Telefonsupport</div>
                  <div className="text-[11px] font-black text-text-primary tracking-widest flex items-center gap-2">
                     <Phone size={12} className="text-gold-500/40" /> {order.customerPhone}
                  </div>
               </div>
               <div className={`p-5 rounded-[1.8rem] border-[1px] col-span-1 ${order.type === "DELIVERY" ? "bg-sky-500/5 border-sky-500/20" : "bg-bg-primary border-border-subtle"}`}>
                  <div className={`text-[8px] uppercase font-black tracking-widest mb-1 opacity-40 ${order.type === "DELIVERY" ? "text-sky-500" : "text-text-secondary"}`}>Destination</div>
                  <div className={`text-[11px] font-black uppercase italic truncate ${order.type === "DELIVERY" ? "text-text-primary" : "text-text-secondary"}`}>
                     {order.deliveryStreet ? `${order.deliveryStreet}, ${order.deliveryCity || ""}` : "Butiksadress"}
                  </div>
               </div>
            </div>

            {order.note && (
               <div className="bg-amber-500/5 border border-amber-500/20 p-6 rounded-[1.8rem] text-[10px] font-black uppercase text-amber-500 italic flex gap-4 animate-in slide-in-from-left duration-500">
                  <AlertCircle size={18} className="shrink-0" />
                  <div className="leading-relaxed"><span className="opacity-40 block mb-1 tracking-widest">KOCKENS NOTERING</span> {order.note}</div>
               </div>
            )}

            <div className="space-y-3">
               <div className="px-2 text-[8px] font-black uppercase tracking-[0.4em] text-text-secondary flex items-center gap-3 mb-4">
                  <span>Specifikation</span>
                  <div className="h-px bg-border-subtle flex-1" />
                  <span className="text-emerald-600">{order.paymentMethod || "Betald Online"}</span>
               </div>
               <div className="space-y-2">
                 {order.items?.map((it:any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center bg-bg-primary/50 p-4 rounded-2xl border border-border-subtle hover:bg-bg-primary transition-colors">
                       <div className="font-black text-text-primary text-[11px] uppercase tracking-tight flex items-center gap-4">
                          <span className="w-8 h-8 rounded-lg bg-zinc-950 flex items-center justify-center text-gold-500 text-[10px]">{it.quantity}x</span>
                          {getDisplayName(it)}
                       </div>
                       <div className="text-text-secondary text-[11px] font-bold italic">{it.subtotal / 100} KR</div>
                    </div>
                 ))}
               </div>
               
               {order.appliedDealTitle && (
                  <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-[1.5rem] flex items-center justify-between text-[11px] font-black uppercase text-emerald-500 italic">
                     <div className="flex items-center gap-3"><Ticket size={16} /> {order.appliedDealTitle}</div>
                     <div className="text-base tracking-tighter">-{order.discountAmount / 100} kr</div>
                  </motion.div>
               )}
            </div>

            {!isSuperAdmin && (
              <div className="flex flex-col sm:flex-row gap-3 pt-6">
                 {order.status === "PENDING" ? (
                    <>
                       <button onClick={(e) => { e.stopPropagation(); updateStatus(order.id, "REJECTED"); }} className="p-5 bg-bg-primary hover:bg-rose-500/10 rounded-2xl text-[10px] font-black uppercase text-rose-500/40 hover:text-rose-500 transition-all sm:w-1/3 border border-border-subtle group">
                          Neka order
                       </button>
                       <button onClick={(e) => { e.stopPropagation(); setAcceptDialog({ orderId: order.id, time: 20 }); }} className="p-5 bg-gold-500 hover:bg-gold-400 text-zinc-950 rounded-2xl text-[11px] font-black uppercase transition-all flex-1 shadow-xl shadow-gold-500/20 flex items-center justify-center gap-3 group active:scale-95">
                          Acceptera & Skicka till kök <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                       </button>
                    </>
                 ) : (order.status === "PREPARING" || order.status === "ACCEPTED") ? (
                    <button onClick={(e) => { e.stopPropagation(); updateStatus(order.id, "DELIVERED"); }} className="w-full p-5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-2xl text-[11px] font-black uppercase shadow-xl shadow-emerald-500/20 transition-all flex items-center justify-center gap-3 active:scale-95">
                       {order.type === "PICKUP" ? "Slutför & Klar för hämtning" : "Skicka på leverans"} <Zap size={18} />
                    </button>
                 ) : null}
                 <button onClick={(e) => { e.stopPropagation(); window.open(`/receipt?orderId=${order.id}`, "_blank"); }} className="p-5 bg-bg-primary hover:bg-bg-secondary rounded-2xl border border-border-subtle group transition-all active:scale-90">
                    <Printer size={20} className="text-text-secondary group-hover:text-gold-500" />
                 </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const AdminOrdersPage = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [acceptDialog, setAcceptDialog] = useState<{ orderId: string; time: number } | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { selectedRestaurantId, selectedRestaurantName } = useRestaurantStore();
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== "undefined") audioRef.current = new Audio("/notification.mp3");
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("palmyra_admin");
      const admin = raw ? JSON.parse(raw) : null;
      setIsSuperAdmin(admin?.role === "SUPER_ADMIN");
    } catch { setIsSuperAdmin(false); }
  }, []);

  const fetchData = useCallback(async () => {
    if (!isMounted) return;
    if (!selectedRestaurantId && !isSuperAdmin) { setLoading(false); return; }
    setError(null);
    try {
      const token = localStorage.getItem("palmyra_token");
      const restaurantParam = isSuperAdmin ? (selectedRestaurantId ? `&restaurantId=${selectedRestaurantId}` : "") : `&restaurantId=${selectedRestaurantId}`;
      const res = await axios.get(`${API_URL}/api/admin/orders?limit=150${restaurantParam}`, { headers: { Authorization: `Bearer ${token}` } });
      setOrders([...(res.data.orders || [])].sort((a: Order, b: Order) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (err: any) {
      if (err.response?.status === 404) setError("Restaurang ej hittad.");
      else setError("Kunde inte hämta data.");
      console.error(err);
    } finally { setLoading(false); }
  }, [selectedRestaurantId, isSuperAdmin, isMounted]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!isMounted || (!selectedRestaurantId && !isSuperAdmin)) return;
    const socket = socketIO(SOCKET_URL, { path: "/socket.io", transports: ["websocket", "polling"] });
    socket.on("connect", () => socket.emit("join:admin", { restaurantId: selectedRestaurantId }));
    socket.on("order:new", (order: any) => {
      const shouldShow = isSuperAdmin ? (!selectedRestaurantId || order.restaurantId === selectedRestaurantId) : (order.restaurantId === selectedRestaurantId);
      if (shouldShow) {
        setOrders((prev) => [order as Order, ...prev.filter(o => o.id !== order.id)].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        audioRef.current?.play().catch(() => {});
      }
    });
    socket.on("order:updated", () => fetchData());
    return () => { socket.disconnect(); };
  }, [isMounted, selectedRestaurantId, isSuperAdmin, fetchData]);

  const updateStatus = async (orderId: string, status: string, estimatedTime?: number) => {
    if (isSuperAdmin) { alert("Super Admin har endast läs-åtkomst. Använd Edit för ändringar."); return; }
    try {
      const token = localStorage.getItem("palmyra_token");
      await axios.patch(`${API_URL}/api/admin/orders/${orderId}/status`, { status, estimatedTime }, { headers: { Authorization: `Bearer ${token}` } });
      setAcceptDialog(null);
      if (status === "PREPARING") confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#e7b24b', '#f3c96e', '#ffffff'] });
      await fetchData();
    } catch { alert("Kunde inte uppdatera status"); }
  };

  const sums = useMemo(() => {
    if (!isMounted) return { pending: [], active: [], today: [], yesterday: [], activeSum: 0, todaySum: 0, yesterdaySum: 0 };
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const pending = orders.filter((o) => o.status === "PENDING" && new Date(o.createdAt) >= startOfToday);
    const active = orders.filter((o) => ["ACCEPTED", "PREPARING"].includes(o.status) && new Date(o.createdAt) >= startOfToday);
    const todayCompl = orders.filter(o => ["READY", "DELIVERING", "DELIVERED", "REJECTED", "CANCELLED"].includes(o.status) && new Date(o.createdAt) >= startOfToday);
    const yesterday = orders.filter(o => ["READY", "DELIVERING", "DELIVERED", "REJECTED", "CANCELLED"].includes(o.status) && new Date(o.createdAt) >= startOfYesterday && new Date(o.createdAt) < startOfToday);

    return {
      pending, active, today: todayCompl, yesterday,
      activeSum: [...pending, ...active].reduce((acc, o) => acc + o.total, 0),
      todaySum: todayCompl.reduce((acc, o) => acc + o.total, 0),
      yesterdaySum: yesterday.reduce((acc, o) => acc + o.total, 0)
    };
  }, [orders, isMounted]);

  if (!isMounted) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-16 pb-40 px-4 pt-10">
      
      {/* Time Dialog */}
      <AnimatePresence>
        {acceptDialog && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/90 backdrop-blur-3xl p-6">
            <motion.div initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 30 }} className="bg-bg-secondary border border-border-subtle rounded-[3rem] p-12 w-full max-w-sm text-center shadow-[0_40px_100px_rgba(0,0,0,0.6)]">
               <h3 className="text-2xl font-black uppercase text-white mb-10 italic tracking-tight underline decoration-gold-500/30 underline-offset-8">Välj Tid</h3>
               <div className="grid grid-cols-3 gap-3 mb-12">
                 {[15, 20, 25, 30, 45, 60].map(t => (
                    <button key={t} onClick={() => setAcceptDialog({ ...acceptDialog, time: t })} className={`py-5 rounded-2xl font-black text-[13px] transition-all active:scale-90 ${acceptDialog.time === t ? 'bg-gold-500 text-zinc-950 shadow-lg shadow-gold-500/20' : 'bg-bg-primary text-text-secondary border border-border-subtle'}`}>{t}m</button>
                 ))}
               </div>
               <div className="flex gap-4">
                 <button onClick={() => setAcceptDialog(null)} className="flex-1 py-5 text-[10px] font-black uppercase tracking-widest text-text-secondary hover:text-white transition-colors">Stäng</button>
                 <button onClick={() => updateStatus(acceptDialog.orderId, "PREPARING", acceptDialog.time)} className="flex-[2] py-5 bg-gold-500 text-zinc-950 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-gold-500/20 active:scale-95 transition-all">Bekräfta</button>
               </div>
            </motion.div>
          </div>
        )}

        {editingOrder && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/95 backdrop-blur-2xl p-4">
             <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-2xl bg-bg-secondary border border-border-subtle rounded-[3.5rem] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.8)] relative">
                <div className="p-10 border-b border-border-subtle flex items-center justify-between">
                   <h2 className="text-2xl font-black uppercase italic tracking-tight text-white leading-none">Hantera order <span className="text-gold-500 ml-4 font-mono">#{editingOrder.orderNumber}</span></h2>
                   <button onClick={() => setEditingOrder(null)} className="w-12 h-12 rounded-full glass-panel flex items-center justify-center text-text-secondary hover:text-white transition-all"><X size={24} /></button>
                </div>
                <form 
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const data = Object.fromEntries(formData.entries());
                    try {
                       await axios.patch(`${API_URL}/api/admin/orders/${editingOrder.id}`, data, { headers: { Authorization: `Bearer ${localStorage.getItem("palmyra_token")}` } });
                       setEditingOrder(null);
                       fetchData();
                    } catch { alert("Fel vid sparning"); }
                  }}
                  className="p-12 pt-10 space-y-8"
                >
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-2"><label className="text-[9px] font-black uppercase tracking-[0.3em] text-text-secondary ml-2">Kundnamn</label><input name="customerName" defaultValue={editingOrder.customerName} className="w-full bg-bg-primary border border-border-subtle rounded-2xl px-6 py-5 text-sm font-black focus:border-gold-500/50 outline-none transition-all" /></div>
                      <div className="space-y-2"><label className="text-[9px] font-black uppercase tracking-[0.3em] text-text-secondary ml-2">Mobilnummer</label><input name="customerPhone" defaultValue={editingOrder.customerPhone} className="w-full bg-bg-primary border border-border-subtle rounded-2xl px-6 py-5 text-sm font-black focus:border-gold-500/50 outline-none transition-all" /></div>
                      <div className="space-y-2 md:col-span-2"><label className="text-[9px] font-black uppercase tracking-[0.3em] text-text-secondary ml-2">Leveransadress</label><input name="deliveryStreet" defaultValue={editingOrder.deliveryStreet} className="w-full bg-bg-primary border border-border-subtle rounded-2xl px-6 py-5 text-sm font-black focus:border-gold-500/50 outline-none transition-all" /></div>
                      <div className="space-y-2"><label className="text-[9px] font-black uppercase tracking-[0.3em] text-text-secondary ml-2">Orderstatus</label><select name="status" defaultValue={editingOrder.status} className="w-full bg-bg-primary border border-border-subtle rounded-2xl px-6 py-5 text-sm font-black focus:border-gold-500/50 outline-none uppercase appearance-none">{Object.entries(STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                      <div className="space-y-2"><label className="text-[9px] font-black uppercase tracking-[0.3em] text-text-secondary ml-2">Transaktionsmetod</label><input name="paymentMethod" defaultValue={editingOrder.paymentMethod} className="w-full bg-bg-primary border border-border-subtle rounded-2xl px-6 py-5 text-sm font-black focus:border-gold-500/50 outline-none transition-all" /></div>
                   </div>
                   <div className="pt-8 flex gap-4">
                      <button type="button" onClick={() => setEditingOrder(null)} className="flex-1 py-5 text-[11px] font-black uppercase tracking-widest text-text-secondary hover:text-white transition-colors">Avbryt</button>
                      <button type="submit" className="flex-1 py-5 bg-gold-500 text-zinc-950 rounded-[2rem] text-[11px] font-black uppercase tracking-[0.2em] shadow-xl shadow-gold-500/20 active:scale-95 transition-all">Spara Ändringar</button>
                   </div>
                </form>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <div className="text-[9px] items-center gap-2.5 font-black uppercase tracking-[0.4em] text-gold-500 flex mb-2 italic">
            <div className={`w-2 h-2 rounded-full bg-emerald-500 ${loading ? 'animate-spin' : 'animate-pulse'}`} /> 
            Live Dataström
          </div>
          <div className="flex items-center gap-6">
            <h1 className="text-4xl lg:text-5xl font-black uppercase tracking-tighter text-text-primary italic leading-none">{selectedRestaurantName || "Globala"} <span className="text-gold-gradient">Ordrar</span></h1>
            <button 
              onClick={fetchData} 
              disabled={loading}
              className={`w-12 h-12 transition-all rounded-[1rem] border border-border-subtle bg-bg-secondary flex items-center justify-center hover:bg-bg-primary hover:border-gold-500/25 group ${loading ? 'opacity-50' : 'active:scale-90'}`}
            >
              <RefreshCw size={20} className={`text-text-secondary group-hover:text-gold-500 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </motion.div>
        
        <div className="flex gap-4">
           <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }} className="glass-panel p-6 rounded-[2.5rem] min-w-[170px] shadow-sm relative group overflow-hidden">
              <div className="absolute inset-0 bg-gold-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-gold-500 mb-2 flex items-center justify-between">Aktiv Omsättning <ShoppingCart size={14} className="opacity-40" /></div>
              <div className="text-3xl font-black italic text-text-primary">{(sums.activeSum / 100).toLocaleString()} <span className="text-[10px] text-text-secondary opacity-40 not-italic">SEK</span></div>
           </motion.div>
           <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }} className="glass-panel p-6 rounded-[2.5rem] min-w-[170px] shadow-sm relative group overflow-hidden">
              <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-500 mb-2 flex items-center justify-between">Klara Idag <RefreshCw size={14} className="opacity-40" /></div>
              <div className="text-3xl font-black italic text-text-primary">{(sums.todaySum / 100).toLocaleString()} <span className="text-[10px] text-text-secondary opacity-40 not-italic">SEK</span></div>
           </motion.div>
        </div>
      </div>

      {error ? (
        <div className="py-40 text-center glass-panel rounded-[4rem] border-dashed border-rose-500/20">
           <AlertCircle className="text-rose-500 mx-auto mb-6" size={56}/>
           <h3 className="text-xl font-black uppercase text-text-primary mb-4 italic tracking-tight">Kunde inte ansluta</h3>
           <p className="text-text-secondary text-[11px] font-bold uppercase tracking-widest mb-10">{error}</p>
           <button onClick={fetchData} className="px-10 py-5 bg-gold-500 text-zinc-950 rounded-3xl font-black uppercase tracking-widest text-[11px] shadow-xl shadow-gold-500/20 active:scale-95 transition-all">Ladda om rutan</button>
        </div>
      ) : loading ? (
        <div className="py-40 flex flex-col items-center justify-center gap-8">
           <div className="relative">
              <Loader2 className="animate-spin text-gold-500" size={64} strokeWidth={1} />
              <div className="absolute inset-0 bg-gold-500/10 blur-xl animate-pulse" />
           </div>
           <p className="text-[10px] font-black uppercase tracking-[0.5em] text-text-secondary animate-pulse italic">Autentiserar kryptering...</p>
        </div>
      ) : (
        <div className="space-y-24">
          {sums.pending.length > 0 && (
            <div className="space-y-10">
              <div className="flex items-center gap-6"><h2 className="text-[11px] font-black uppercase tracking-[0.5em] text-gold-500 italic">VÄNTANDE</h2><div className="flex-1 h-px bg-gold-500/20" /></div>
              <div className="grid grid-cols-1 gap-8">{sums.pending.map(o => <OrderCard key={o.id} order={o} isNew={true} expandedOrderId={expandedOrderId} setExpandedOrderId={setExpandedOrderId} setAcceptDialog={setAcceptDialog} updateStatus={updateStatus} isSuperAdmin={isSuperAdmin} setEditingOrder={setEditingOrder} />)}</div>
            </div>
          )}

          {sums.active.length > 0 && (
            <div className="space-y-10">
              <div className="flex items-center gap-6"><h2 className="text-[11px] font-black uppercase tracking-[0.5em] text-text-secondary italic">I PRODUKTION</h2><div className="flex-1 h-px bg-border-subtle" /></div>
              <div className="grid grid-cols-1 gap-8">{sums.active.map(o => <OrderCard key={o.id} order={o} expandedOrderId={expandedOrderId} setExpandedOrderId={setExpandedOrderId} updateStatus={updateStatus} isSuperAdmin={isSuperAdmin} setEditingOrder={setEditingOrder} />)}</div>
            </div>
          )}

          {(sums.today.length > 0 || sums.yesterday.length > 0) && (
            <div className="space-y-10">
               <div className="flex items-center gap-6 px-1"><h2 className="text-[11px] font-black uppercase tracking-[0.5em] text-text-secondary opacity-30 italic">ARKIV</h2><div className="flex-1 h-px bg-border-subtle opacity-30" /></div>
               <div className="space-y-6">
                  {[...sums.today, ...sums.yesterday].slice(0, 10).map(o => <OrderCard key={o.id} order={o} isPast={true} expandedOrderId={expandedOrderId} setExpandedOrderId={setExpandedOrderId} updateStatus={updateStatus} isSuperAdmin={isSuperAdmin} setEditingOrder={setEditingOrder} />)}
               </div>
            </div>
          )}
          
          {orders.length === 0 && (
             <div className="py-40 flex flex-col items-center justify-center gap-6 glass-panel rounded-[4rem] border-dashed">
                <ShoppingCart size={40} className="text-text-secondary opacity-10" />
                <p className="text-[10px] font-black uppercase tracking-[0.8em] text-text-secondary opacity-20">Inga transaktioner hittades</p>
             </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminOrdersPage;
