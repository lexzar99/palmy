"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, MapPin, Printer, Truck, Store, RefreshCw, Globe, ChevronDown, CheckCircle, XCircle, Loader2, TrendingUp, Clock, AlertCircle } from "lucide-react";
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
  estimatedTime?: number;
  items: any[];
  restaurantName?: string;
}

const getDisplayName = (item: any) => {
  if (!item) return "";
  let extras = [];
  try { extras = typeof item.selectedExtras === "string" ? JSON.parse(item.selectedExtras) : (item.selectedExtras || []); } catch {}
  return `${item.productName}${Array.isArray(extras) && extras.length > 0 ? " - " + extras.map((e: any) => e.extraName || e.name).join(", ") : ""}`;
};

const OrderCard = ({ order, isNew, expandedOrderId, setExpandedOrderId, setAcceptDialog, updateStatus, isSuperAdmin, isPast }: any) => {
  const isExpanded = expandedOrderId === order.id;
  return (
    <motion.div layout className={`rounded-[2rem] p-6 transition-all relative overflow-hidden ${isNew ? 'bg-gold-500/10 border border-gold-500/30' : 'bg-[#0f111a] border border-white/5 shadow-2xl'}`}>
      <div onClick={() => setExpandedOrderId(isExpanded ? null : order.id)} className="flex items-center justify-between gap-4 cursor-pointer">
        <div className="flex items-center gap-4 flex-1">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm ${isNew ? 'bg-gold-500 text-dark-500' : 'bg-white/5 text-gold-500'}`}>#{order.orderNumber}</div>
          <div>
            <div className={`text-[10px] font-black uppercase tracking-widest ${isNew ? 'text-gold-500' : 'text-white/40'}`}>{(new Date(order.createdAt)).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} · {STATUS_LABELS[order.status] || order.status}</div>
            <h3 className="text-base font-black uppercase text-white truncate max-w-[180px]">{order.customerName}</h3>
          </div>
        </div>
        <div className="flex items-center gap-6">
           <div className={`text-lg font-black tabular-nums transition-colors ${isPast ? 'text-white/30' : 'text-gold-500'}`}>{order.total} <span className="text-[10px]">KR</span></div>
           <ChevronDown size={18} className={`text-white/10 transition-transform ${isExpanded ? 'rotate-180 text-gold-500' : ''}`} />
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mt-6 pt-6 border-t border-white/5 space-y-6">
            <div className="grid grid-cols-2 gap-4">
               <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                  <div className="text-[8px] text-white/20 uppercase font-black mb-1">Metod</div>
                  <div className="text-xs font-black text-white flex items-center gap-2 uppercase">{order.type === "DELIVERY" ? <Truck size={12}/> : <Store size={12}/>} {order.type === "DELIVERY" ? "Utkörning" : "Hämtas"}</div>
               </div>
               <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                  <div className="text-[8px] text-white/20 uppercase font-black mb-1">Mobil</div>
                  <div className="text-xs font-black text-white">{order.customerPhone}</div>
               </div>
            </div>
            <div className="space-y-2">
               <div className="text-[8px] text-white/20 uppercase font-black px-1">Beställning</div>
               {order.items?.map((it:any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5 text-[11px]">
                     <div className="font-black text-white/80 uppercase">{it.quantity}x {getDisplayName(it)}</div>
                     <div className="text-white/30">{it.price * it.quantity} KR</div>
                  </div>
               ))}
            </div>
            {!isSuperAdmin && (
              <div className="flex gap-2">
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
      if (err.response?.status === 404) setError("Restaurangen hittades inte. Kontrollera din inloggning eller välj en annan enhet.");
      else setError("Kunde inte hämta data. Försök att ladda om sidan.");
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
        if (!isSuperAdmin) audioRef.current?.play().catch(() => {});
      }
    });
    socket.on("order:updated", () => fetchData());
    return () => { socket.disconnect(); };
  }, [isMounted, selectedRestaurantId, isSuperAdmin, fetchData]);

  const updateStatus = async (orderId: string, status: string, estimatedTime?: number) => {
    if (isSuperAdmin) { alert("Endast personal kan hantera ordrar."); return; }
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="bg-[#0f111a] border border-white/5 rounded-[2.5rem] p-10 w-full max-w-sm text-center shadow-2xl">
               <h3 className="text-xl font-black uppercase text-white mb-8 tracking-tighter">Klar om hur länge?</h3>
               <div className="grid grid-cols-3 gap-3 mb-10">
                 {[15, 20, 25, 30, 45, 60].map(t => (
                   <button key={t} onClick={() => setAcceptDialog({ ...acceptDialog, time: t })} className={`py-4 rounded-2xl font-black text-sm transition-all ${acceptDialog.time === t ? 'bg-gold-500 text-dark-500 scale-105' : 'bg-white/5 text-white/40 shadow-inner'}`}>{t}</button>
                 ))}
               </div>
               <div className="flex gap-4">
                 <button onClick={() => setAcceptDialog(null)} className="w-1/3 py-4 text-xs font-black uppercase text-white/20">Stäng</button>
                 <button onClick={() => updateStatus(acceptDialog.orderId, "PREPARING", acceptDialog.time)} className="w-2/3 py-4 bg-gold-500 text-dark-500 rounded-xl font-black text-xs uppercase shadow-xl shadow-gold-500/20">Kör på {acceptDialog.time} min</button>
               </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
        <div>
          <div className="text-[9px] items-center gap-2 font-black uppercase tracking-[0.3em] text-gold-500/50 flex mb-1"><div className="w-1 h-1 rounded-full bg-gold-500 animate-pulse" /> Live Kontroll</div>
          <h1 className="text-3xl font-black uppercase tracking-tighter text-white">{selectedRestaurantName || "Sök..."} <span className="text-gold-500 italic">Nu</span></h1>
        </div>
        <div className="grid grid-cols-2 lg:flex gap-3">
           <div className="bg-[#0f111a] border border-white/10 p-5 rounded-2xl min-w-[140px] shadow-2xl relative overflow-hidden group">
              <TrendingUp size={40} className="absolute top-0 right-0 p-2 opacity-5 scale-150 rotate-12 group-hover:rotate-0 transition-transform text-gold-500"/>
              <div className="text-[8px] font-black uppercase tracking-widest text-gold-500 mb-2">Aktiva Totalt</div>
              <div className="text-lg font-black text-white">{sums.activeSum} <span className="text-[9px] text-white/20 font-bold">KR</span></div>
           </div>
           <div className="bg-[#0f111a] border border-white/5 p-5 rounded-2xl min-w-[140px] shadow-2xl">
              <div className="text-[8px] font-black uppercase tracking-widest text-white/40 mb-2">Idag Slutförda</div>
              <div className="text-lg font-black text-emerald-400">{sums.todaySum} <span className="text-[9px] text-white/20 font-bold">KR</span></div>
           </div>
           <div className="bg-[#0f111a] border border-white/5 p-5 rounded-2xl min-w-[140px] shadow-2xl hidden lg:block">
              <div className="text-[8px] font-black uppercase tracking-widest text-white/40 mb-2">Igår Totalt</div>
              <div className="text-lg font-black text-white/60">{sums.yesterdaySum} <span className="text-[9px] text-white/20 font-bold">KR</span></div>
           </div>
        </div>
      </div>

      {error ? (
        <div className="py-24 flex flex-col items-center gap-6 text-center">
           <AlertCircle className="text-rose-500" size={48}/>
           <p className="text-white/60 font-medium max-w-xs">{error}</p>
           <button onClick={fetchData} className="px-8 py-3 bg-white/5 rounded-xl text-xs font-black uppercase tracking-widest border border-white/10">Ladda om</button>
        </div>
      ) : loading ? (
        <div className="py-32 flex flex-col items-center justify-center gap-6">
          <Loader2 className="animate-spin text-gold-500" size={40}/>
          <p className="text-[9px] font-black uppercase tracking-[0.4em] text-white/20">Ansluter...</p>
        </div>
      ) : (
        <div className="space-y-16">
          {sums.pending.length > 0 && (
            <section className="space-y-6">
              <div className="flex items-center gap-4"><h2 className="text-[9px] font-black uppercase tracking-[0.4em] text-gold-500">Nya Ordrar</h2><div className="flex-1 h-px bg-gold-500/10" /></div>
              <div className="space-y-4">{sums.pending.map(o => <OrderCard key={o.id} order={o} isNew={true} expandedOrderId={expandedOrderId} setExpandedOrderId={setExpandedOrderId} setAcceptDialog={setAcceptDialog} updateStatus={updateStatus} isSuperAdmin={isSuperAdmin} />)}</div>
            </section>
          )}

          {sums.active.length > 0 && (
            <section className="space-y-6">
              <div className="flex items-center gap-4"><h2 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/20">Under Tillagning</h2><div className="flex-1 h-px bg-white/5" /></div>
              <div className="space-y-4">{sums.active.map(o => <OrderCard key={o.id} order={o} expandedOrderId={expandedOrderId} setExpandedOrderId={setExpandedOrderId} setAcceptDialog={setAcceptDialog} updateStatus={updateStatus} isSuperAdmin={isSuperAdmin} />)}</div>
            </section>
          )}

          {(sums.today.length > 0 || sums.yesterday.length > 0) && (
            <section className="space-y-6">
               <div className="flex items-center gap-4"><h2 className="text-[9px] font-black uppercase tracking-[0.4em] text-white/10">Nyligen Slutförda</h2><div className="flex-1 h-px bg-white/5" /></div>
               <div className="space-y-3 opacity-60 hover:opacity-100 transition-opacity">
                  {[...sums.today, ...sums.yesterday].slice(0, 5).map(o => <OrderCard key={o.id} order={o} isPast={true} expandedOrderId={expandedOrderId} setExpandedOrderId={setExpandedOrderId} updateStatus={updateStatus} isSuperAdmin={isSuperAdmin} />)}
                  <button onClick={() => window.location.href='/history'} className="w-full py-4 text-[9px] font-black uppercase tracking-widest text-white/20 border border-white/5 rounded-2xl hover:bg-white/5 transition-all">Visa Fullständig Historik</button>
               </div>
            </section>
          )}
          
          {orders.length === 0 && <div className="py-32 bg-[#0f111a] border border-white/5 rounded-[3rem] text-center italic text-white/10 font-black uppercase tracking-[0.5em] text-xs">Väntar på ordrar...</div>}
        </div>
      )}
    </div>
  );
};

export default AdminOrdersPage;
