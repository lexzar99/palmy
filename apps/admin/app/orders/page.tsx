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
  Globe, 
  ChevronDown, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  TrendingUp, 
  Clock, 
  AlertCircle,
  Settings2,
  Phone,
  Mail,
  Edit2,
  Trash2,
  X,
  CreditCard,
  Ticket
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
  orderNumber: number;
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
}

const OrderCard = ({ order, isNew, expandedOrderId, setExpandedOrderId, setAcceptDialog, updateStatus, isSuperAdmin, isPast, setEditingOrder }: any) => {
  const isExpanded = expandedOrderId === order.id;
  const isTest = order.stripePaymentIntentId === "TEST_PAYMENT" || order.discountCode === "test";

  return (
    <motion.div 
      layout 
      className={`rounded-[2.5rem] p-6 transition-all relative overflow-hidden ${
        isTest 
          ? 'bg-rose-500/10 border border-rose-500/30' 
          : isNew 
            ? 'bg-gold-500/10 border border-gold-500/30' 
            : 'bg-[#0a0c14] border border-white/5 shadow-2xl'
      }`}
    >
      {isTest && (
        <div className="absolute top-0 right-10 bg-rose-500 text-white text-[8px] font-black uppercase px-3 py-1 rounded-b-xl tracking-widest shadow-lg z-10">
          TEST ORDER 🤖
        </div>
      )}

      <div onClick={() => setExpandedOrderId(isExpanded ? null : order.id)} className="flex items-center justify-between gap-4 cursor-pointer">
        <div className="flex items-center gap-4 flex-1">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm ${isTest ? 'bg-rose-500 text-white' : isNew ? 'bg-gold-500 text-dark-500' : 'bg-white/5 text-gold-500'}`}>#{order.orderNumber}</div>
          <div className="flex-1 min-w-0">
            <div className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${isTest ? 'text-rose-400' : isNew ? 'text-gold-500' : 'text-white/20'}`}>
              {(new Date(order.createdAt)).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} · {STATUS_LABELS[order.status] || order.status}
              <span className={`px-2 py-0.5 rounded-md text-[8px] border ${order.type === "DELIVERY" ? "border-sky-500/30 text-sky-400 bg-sky-500/5" : "border-emerald-500/30 text-emerald-400 bg-emerald-500/5"}`}>
                {order.type === "DELIVERY" ? "UTKÖRNING" : "AVHÄMTNING"}
              </span>
            </div>
            <div className="flex items-center gap-4">
               <h3 className="text-base font-black uppercase text-white truncate italic">{order.customerName}</h3>
               {order.type === "DELIVERY" && order.deliveryStreet && (
                 <div className="flex items-center gap-2 text-[10px] font-black text-sky-400/80 uppercase truncate bg-sky-500/5 px-3 py-1 rounded-lg border border-sky-500/10">
                   <MapPin size={10} /> {order.deliveryStreet}
                 </div>
               )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-6">
           {isSuperAdmin && (
              <button 
                onClick={(e) => { e.stopPropagation(); setEditingOrder(order); }}
                className="w-8 h-8 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-white/20 hover:text-gold-500 transition-all"
              >
                <Edit2 size={14} />
              </button>
           )}
           <div className={`text-lg font-black tabular-nums transition-colors ${isPast ? 'text-white/30' : isTest ? 'text-rose-400' : 'text-gold-500'}`}>{order.total / 100} <span className="text-[10px]">KR</span></div>
           <ChevronDown size={18} className={`text-white/10 transition-transform ${isExpanded ? 'rotate-180 text-gold-500' : ''}`} />
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-6 pt-6 border-t border-white/5 space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
               <div className={`p-4 rounded-2xl border ${order.type === "DELIVERY" ? "bg-sky-500/5 border-sky-500/20" : "bg-emerald-500/5 border-emerald-500/20"}`}>
                  <div className={`text-[8px] uppercase font-black mb-1 ${order.type === "DELIVERY" ? "text-sky-400/40" : "text-emerald-400/40"}`}>Metod</div>
                  <div className={`text-xs font-black flex items-center gap-2 uppercase tracking-tight ${order.type === "DELIVERY" ? "text-sky-400" : "text-emerald-400"}`}>{order.type === "DELIVERY" ? <Truck size={12}/> : <Store size={12}/>} {order.type === "DELIVERY" ? "Utkörning" : "Hämta i butik"}</div>
               </div>
               <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                  <div className="text-[8px] text-white/20 uppercase font-black mb-1">Kontakt</div>
                  <div className="text-xs font-black text-white tracking-widest">{order.customerPhone}</div>
               </div>
               <div className={`p-4 rounded-2xl border col-span-2 lg:col-span-1 ${order.type === "DELIVERY" ? "bg-sky-500/10 border-sky-500/30 shadow-lg shadow-sky-500/5" : "bg-white/5 border-white/5"}`}>
                  <div className={`text-[8px] uppercase font-black mb-1 ${order.type === "DELIVERY" ? "text-sky-400" : "text-white/20"}`}>Adress</div>
                  <div className={`text-[10px] font-black italic truncate ${order.type === "DELIVERY" ? "text-white" : "text-white/40"}`}>{order.deliveryStreet ? `${order.deliveryStreet}, ${order.deliveryCity || ""}` : "Ej utkörning"}</div>
               </div>
            </div>

            {order.note && <div className="bg-amber-500/5 border border-amber-500/10 p-5 rounded-2xl text-[10px] font-black uppercase text-amber-500 italic flex gap-3"><AlertCircle size={14} /> Obs: {order.note}</div>}

            <div className="space-y-2">
               <div className="text-[8px] text-white/20 uppercase font-black px-1 flex items-center justify-between">
                  <span>Produkter</span>
                  <span className="text-emerald-500">{order.paymentMethod || "Betald"}</span>
               </div>
               {order.items?.map((it:any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center bg-white/2 p-3 rounded-xl border border-white/5 text-[11px]">
                     <div className="font-black text-white/80 uppercase">{it.quantity}x {getDisplayName(it)}</div>
                     <div className="text-white/20">{it.subtotal / 100} KR</div>
                  </div>
               ))}
               {order.appliedDealTitle && (
                  <div className="mt-4 p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex items-center justify-between text-[10px] font-black uppercase text-emerald-500">
                     <div className="flex items-center gap-2"><Ticket size={12} /> {order.appliedDealTitle}</div>
                     <div>-{order.discountAmount / 100} kr</div>
                  </div>
               )}
            </div>

            {!isSuperAdmin && (
              <div className="flex gap-2 pt-4">
                 {order.status === "PENDING" ? (
                    <>
                       <button onClick={(e) => { e.stopPropagation(); updateStatus(order.id, "REJECTED"); }} className="p-4 bg-white/5 hover:bg-rose-500/10 rounded-xl text-[10px] font-black uppercase text-white/20 hover:text-rose-500 transition-all flex-1">Neka</button>
                       <button onClick={(e) => { e.stopPropagation(); setAcceptDialog({ orderId: order.id, time: 20 }); }} className="p-4 bg-gold-500 hover:bg-gold-400 text-dark-500 rounded-xl text-[10px] font-black uppercase transition-all flex-[2] shadow-lg shadow-gold-500/20">Godkänn</button>
                    </>
                 ) : (order.status === "PREPARING" || order.status === "ACCEPTED") ? (
                    <button onClick={(e) => { e.stopPropagation(); updateStatus(order.id, order.type === "PICKUP" ? "READY" : "DELIVERING"); }} className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-dark-500 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-emerald-500/20 transition-all">Markera som {order.type === "PICKUP" ? "Färdig" : "På väg"}</button>
                 ) : (order.status === "READY" || order.status === "DELIVERING") ? (
                    <button onClick={(e) => { e.stopPropagation(); updateStatus(order.id, "DELIVERED"); }} className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-dark-500 rounded-xl text-[10px] font-black uppercase shadow-lg shadow-emerald-500/20 transition-all">Slutför Order</button>
                 ) : null}
                 <button onClick={(e) => { e.stopPropagation(); window.open(`/receipt?orderId=${order.id}`, "_blank"); }} className="p-4 bg-white/5 hover:bg-white/10 rounded-xl"><Printer size={16} className="text-white/30"/></button>
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
      console.log("📥 Ny order via socket:", order);
      const shouldShow = isSuperAdmin ? (!selectedRestaurantId || order.restaurantId === selectedRestaurantId) : (order.restaurantId === selectedRestaurantId);
      if (shouldShow) {
        setOrders((prev) => [order as Order, ...prev.filter(o => o.id !== order.id)].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        audioRef.current?.play().catch((err) => console.warn("Ljudfel:", err));
      }
    });
    socket.on("order:updated", () => fetchData());
    return () => { socket.disconnect(); };
  }, [isMounted, selectedRestaurantId, isSuperAdmin, fetchData]);

  const updateStatus = async (orderId: string, status: string, estimatedTime?: number) => {
    if (isSuperAdmin) { alert("Använd edit-knappen för att hantera ordrar som Super Admin."); return; }
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
    <div className="max-w-4xl mx-auto space-y-12 pb-32 px-4 pt-4 lg:pt-10">
      
      {/* Time Dialog */}
      <AnimatePresence>
        {acceptDialog && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="bg-[#0a0c14] border border-white/10 rounded-[2.5rem] p-10 w-full max-w-sm text-center shadow-2xl">
               <h3 className="text-xl font-black uppercase text-white mb-8 italic tracking-tighter">Välj Tillagningstid</h3>
               <div className="grid grid-cols-3 gap-3 mb-10">
                 {[15, 20, 25, 30, 45, 60].map(t => (
                   <button key={t} onClick={() => setAcceptDialog({ ...acceptDialog, time: t })} className={`py-4 rounded-2xl font-black text-sm transition-all ${acceptDialog.time === t ? 'bg-gold-500 text-dark-500' : 'bg-white/5 text-white/20'}`}>{t}</button>
                 ))}
               </div>
               <div className="flex gap-4">
                 <button onClick={() => setAcceptDialog(null)} className="w-1/3 py-4 text-xs font-black uppercase text-white/20">Stäng</button>
                 <button onClick={() => updateStatus(acceptDialog.orderId, "PREPARING", acceptDialog.time)} className="w-2/3 py-4 bg-gold-500 text-dark-500 rounded-2xl font-black text-xs uppercase shadow-xl shadow-gold-500/20">Starta {acceptDialog.time} min</button>
               </div>
            </motion.div>
          </div>
        )}

        {editingOrder && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4">
             <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-2xl bg-[#0a0c14] border border-white/10 rounded-[3rem] overflow-hidden shadow-2xl">
                <div className="p-8 border-b border-white/5 flex items-center justify-between">
                   <h2 className="text-xl font-black uppercase italic tracking-tighter">Editera Order <span className="text-gold-500">#{editingOrder.orderNumber}</span></h2>
                   <button onClick={() => setEditingOrder(null)} className="p-2 hover:bg-white/5 rounded-xl"><X size={24} className="text-white/20" /></button>
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
                    } catch { alert("Kunde inte spara"); }
                  }}
                  className="p-10 space-y-6"
                >
                   <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-1.5"><label className="text-[9px] font-black uppercase tracking-widest text-white/20 ml-2">Kundnamn</label><input name="customerName" defaultValue={editingOrder.customerName} className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-black focus:border-gold-500/40 outline-none" /></div>
                      <div className="space-y-1.5"><label className="text-[9px] font-black uppercase tracking-widest text-white/20 ml-2">Telefon</label><input name="customerPhone" defaultValue={editingOrder.customerPhone} className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-black focus:border-gold-500/40 outline-none" /></div>
                      <div className="space-y-1.5 col-span-2"><label className="text-[9px] font-black uppercase tracking-widest text-white/20 ml-2">Adress</label><input name="deliveryStreet" defaultValue={editingOrder.deliveryStreet} className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-black focus:border-gold-500/40 outline-none" /></div>
                      <div className="space-y-1.5"><label className="text-[9px] font-black uppercase tracking-widest text-white/20 ml-2">Status</label><select name="status" defaultValue={editingOrder.status} className="w-full bg-[#121421] border border-white/10 rounded-2xl px-6 py-4 text-sm font-black focus:border-gold-500/40 outline-none uppercase appearance-none">{Object.entries(STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                      <div className="space-y-1.5"><label className="text-[9px] font-black uppercase tracking-widest text-white/20 ml-2">Betalmetod</label><input name="paymentMethod" defaultValue={editingOrder.paymentMethod} className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-sm font-black focus:border-gold-500/40 outline-none" /></div>
                   </div>
                   <div className="pt-6 flex gap-4">
                      <button type="button" onClick={() => setEditingOrder(null)} className="flex-1 py-4 bg-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest">Avbryt</button>
                      <button type="submit" className="flex-1 py-4 bg-gold-500 text-dark-500 rounded-2xl text-[10px] font-black uppercase tracking-widest">Spara Order</button>
                   </div>
                </form>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
        <div>
          <div className="text-[9px] items-center gap-2 font-black uppercase tracking-[0.3em] text-gold-500/50 flex mb-1 italic">
            <div className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-amber-500 animate-spin' : 'bg-emerald-500 animate-pulse'}`} /> 
            Live Monitoring
          </div>
          <div className="flex items-center gap-4">
            <h1 className="text-4xl font-black uppercase tracking-tighter text-white italic">{selectedRestaurantName || "Central"} <span className="text-gold-500">Hub</span></h1>
            <button 
              onClick={fetchData} 
              disabled={loading}
              className={`p-2 transition-all rounded-xl border border-white/5 bg-[#0a0c14] hover:bg-white/5 ${loading ? 'opacity-50' : ''}`}
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 lg:flex gap-4">
           <div className="bg-[#0a0c14] border border-white/5 p-6 rounded-[2rem] min-w-[160px] shadow-2xl">
              <div className="text-[8px] font-black uppercase tracking-widest text-gold-500 mb-2">Aktiva (Omsättning)</div>
              <div className="text-2xl font-black italic">{sums.activeSum / 100} <span className="text-[10px] text-white/20">SEK</span></div>
           </div>
           <div className="bg-[#0a0c14] border border-white/5 p-6 rounded-[2rem] min-w-[160px] shadow-2xl">
              <div className="text-[8px] font-black uppercase tracking-widest text-emerald-400 mb-2">Klara (Idag)</div>
              <div className="text-2xl font-black italic">{sums.todaySum / 100} <span className="text-[10px] text-white/20">SEK</span></div>
           </div>
        </div>
      </div>

      {error ? (
        <div className="py-24 text-center space-y-6">
           <AlertCircle className="text-rose-500 mx-auto" size={48}/>
           <p className="text-white/40 font-black uppercase tracking-widest text-[10px]">{error}</p>
           <button onClick={fetchData} className="px-10 py-4 bg-white/5 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-white/10">Ladda om</button>
        </div>
      ) : loading ? (
        <div className="py-32 flex flex-col items-center justify-center gap-6">
          <Loader2 className="animate-spin text-gold-500" size={40}/>
          <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/10">Ansluter till stream...</p>
        </div>
      ) : (
        <div className="space-y-16">
          {sums.pending.length > 0 && (
            <div className="space-y-8">
              <div className="flex items-center gap-4"><h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-gold-500 italic">Väntande Ordrar</h2><div className="flex-1 h-px bg-gold-500/10" /></div>
              <div className="grid grid-cols-1 gap-6">{sums.pending.map(o => <OrderCard key={o.id} order={o} isNew={true} expandedOrderId={expandedOrderId} setExpandedOrderId={setExpandedOrderId} setAcceptDialog={setAcceptDialog} updateStatus={updateStatus} isSuperAdmin={isSuperAdmin} setEditingOrder={setEditingOrder} />)}</div>
            </div>
          )}

          {sums.active.length > 0 && (
            <div className="space-y-8">
              <div className="flex items-center gap-4"><h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/20 italic">Under Behandling</h2><div className="flex-1 h-px bg-white/5" /></div>
              <div className="grid grid-cols-1 gap-6">{sums.active.map(o => <OrderCard key={o.id} order={o} expandedOrderId={expandedOrderId} setExpandedOrderId={setExpandedOrderId} updateStatus={updateStatus} isSuperAdmin={isSuperAdmin} setEditingOrder={setEditingOrder} />)}</div>
            </div>
          )}

          {(sums.today.length > 0 || sums.yesterday.length > 0) && (
            <div className="space-y-8">
               <div className="flex items-center gap-4"><h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-white/10 italic">Slutförda Sessioner</h2><div className="flex-1 h-px bg-white/5" /></div>
               <div className="space-y-4 opacity-50 hover:opacity-100 transition-all">
                  {[...sums.today, ...sums.yesterday].slice(0, 8).map(o => <OrderCard key={o.id} order={o} isPast={true} expandedOrderId={expandedOrderId} setExpandedOrderId={setExpandedOrderId} updateStatus={updateStatus} isSuperAdmin={isSuperAdmin} setEditingOrder={setEditingOrder} />)}
               </div>
            </div>
          )}
          
          {orders.length === 0 && <div className="py-40 bg-[#0a0c14] border border-dashed border-white/5 rounded-[4rem] text-center text-white/5 font-black uppercase tracking-[1em] text-xs">Ingen dataström hittades</div>}
        </div>
      )}
    </div>
  );
};

export default AdminOrdersPage;
