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

const OrderCard = ({ order, expandedOrderId, setExpandedOrderId, setAcceptDialog, updateStatus, isSuperAdmin, isPast, setEditingOrder, onDeleteTestOrder }: any) => {
  const isExpanded = expandedOrderId === order.id;
  const isTest = order.stripePaymentIntentId === "TEST_PAYMENT" || order.discountCode === "test" || order.discountCode === "testa";
  const isAccepted = ["ACCEPTED", "PREPARING", "READY"].includes(order.status);

  return (
    <motion.div 
      layout 
      className={`rounded-[2rem] transition-all relative overflow-hidden bg-bg-secondary border-2 ${
        isAccepted 
          ? 'border-emerald-500 shadow-lg shadow-emerald-500/10' 
          : isTest 
            ? 'border-rose-500/30' 
            : 'border-border-subtle'
      }`}
    >
      {isTest && (
        <div className="absolute top-0 right-10 bg-rose-500 text-[var(--text-primary)] text-[8px] font-black uppercase px-4 py-1.5 rounded-b-2xl tracking-[0.2em] shadow-lg z-10 animate-pulse">
           Bot / Test Order
        </div>
      )}

      <div onClick={() => setExpandedOrderId(isExpanded ? null : order.id)} className="p-5 flex items-center justify-between gap-4 cursor-pointer">
        <div className="flex items-center gap-4 flex-1">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-sm ${isAccepted ? 'bg-emerald-500 text-white' : isTest ? 'bg-rose-500 text-white' : 'bg-bg-primary text-gold-500 border border-border-subtle'}`}>
             {String(order.orderNumber).replace("PX-", "")}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black uppercase text-text-primary truncate tracking-tight">{order.customerName}</h3>
              <span className={`px-2 py-0.5 rounded-full text-[8px] font-black border ${order.type === "DELIVERY" ? "border-sky-500/20 text-sky-500 bg-sky-500/5 transition-colors" : "border-emerald-500/20 text-emerald-500 bg-emerald-500/5 transition-colors"}`}>
                 {order.type === "DELIVERY" ? "UTKÖRNING" : "AVHÄMTNING"}
              </span>
            </div>
            <div className="text-[10px] text-text-secondary font-bold uppercase tracking-wider">
              {(new Date(order.createdAt)).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} · {STATUS_LABELS[order.status] || order.status}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
           <div className={`text-xl font-black italic ${isPast ? 'text-text-secondary' : 'text-text-primary'}`}>
              {Math.round(order.total)} <span className="text-[10px] opacity-40 not-italic uppercase">SEK</span>
           </div>
           <ChevronDown size={20} className={`text-text-secondary transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-5 pb-6 space-y-6">
            <div className="h-px bg-border-subtle" />
            
            <div className="grid grid-cols-1 gap-3">
               {order.type === "DELIVERY" ? (
                 <div className="bg-sky-500/10 border border-sky-500/20 p-5 rounded-2xl">
                    <div className="text-[10px] font-black text-sky-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-2"><MapPin size={14}/> Leveransadress</div>
                    <div className="text-xl font-black text-white uppercase italic leading-tight">
                       {order.deliveryStreet || "Ingen adress angiven"}
                       <div className="text-sm opacity-60 not-italic mt-1">{order.deliveryZip} {order.deliveryCity}</div>
                    </div>
                 </div>
               ) : (
                 <div className="bg-emerald-500/10 border border-emerald-500/20 p-5 rounded-2xl">
                    <div className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] mb-2 flex items-center gap-2"><Store size={14}/> Avhämtning</div>
                    <div className="text-xl font-black text-white uppercase italic">Hämtas i restaurangen</div>
                 </div>
               )}

               <div className="bg-bg-primary border border-border-subtle p-5 rounded-2xl flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-black text-text-secondary uppercase tracking-[0.2em] mb-1">Telefon</div>
                    <div className="text-xl font-black text-text-primary tracking-widest">{order.customerPhone}</div>
                  </div>
                  <a href={`tel:${order.customerPhone}`} className="w-12 h-12 rounded-full bg-gold-500/10 border border-gold-500/20 flex items-center justify-center text-gold-500">
                     <Phone size={20} />
                  </a>
               </div>
            </div>

            {order.note && (
               <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-2xl text-[11px] font-bold text-amber-500 italic flex gap-3">
                  <AlertCircle size={16} className="shrink-0" />
                  <div><span className="opacity-40 block text-[9px] mb-0.5 tracking-widest uppercase font-black not-italic">Notering</span> {order.note}</div>
               </div>
            )}

            <div className="space-y-2">
               <div className="text-[9px] font-black uppercase tracking-[0.3em] text-text-secondary mb-3 flex items-center gap-3">
                  <span>Beställning</span>
                  <div className="h-px bg-border-subtle flex-1" />
               </div>
               {order.items?.map((it:any, idx: number) => (
                  <div key={idx} className="flex justify-between items-center bg-bg-primary/30 p-3 rounded-xl border border-border-subtle/50">
                     <div className="font-black text-text-primary text-[11px] uppercase tracking-tight flex items-center gap-3">
                        <span className="text-gold-500">{it.quantity}x</span>
                        {getDisplayName(it)}
                     </div>
                     <div className="text-text-secondary text-[10px] font-bold italic">{Math.round(it.subtotal)} KR</div>
                  </div>
               ))}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border-subtle">
               <div className="text-[10px] font-black uppercase tracking-[0.3em] text-text-secondary">Totalt Betalt</div>
               <div className="text-2xl font-black italic text-gold-500">{Math.round(order.total)} SEK</div>
            </div>

            {!isSuperAdmin && !isPast && (
              <div className="flex flex-col gap-3 pt-2">
                 {order.status === "PENDING" ? (
                    <div className="flex gap-3">
                       <button onClick={(e) => { e.stopPropagation(); updateStatus(order.id, "REJECTED"); }} className="px-6 py-4 bg-bg-primary hover:bg-rose-500/10 rounded-2xl text-[10px] font-black uppercase text-rose-500/40 hover:text-rose-500 transition-all border border-border-subtle">
                          Neka
                       </button>
                       <button onClick={(e) => { e.stopPropagation(); setAcceptDialog({ orderId: order.id, time: 20 }); }} className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-400 text-white rounded-2xl text-[11px] font-black uppercase transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 active:scale-95">
                          Godkänn Order <ArrowRight size={16} />
                       </button>
                    </div>
                 ) : (order.status === "PREPARING" || order.status === "ACCEPTED") ? (
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        if (isTest) {
                          onDeleteTestOrder(order.id);
                        } else {
                          updateStatus(order.id, "DELIVERED"); 
                        }
                      }} 
                      className="w-full py-5 bg-sky-500 hover:bg-sky-400 text-white rounded-2xl text-xs font-black uppercase shadow-xl shadow-sky-500/20 transition-all flex items-center justify-center gap-3 active:scale-95"
                    >
                       Markera som på väg <Zap size={18} />
                    </button>
                 ) : null}
                 
                 <div className="flex gap-3">
                    <button onClick={(e) => { e.stopPropagation(); window.open(`/receipt?orderId=${order.id}`, "_blank"); }} className="flex-1 py-4 bg-bg-primary hover:bg-bg-secondary rounded-2xl border border-border-subtle flex items-center justify-center gap-2 text-[10px] font-black uppercase text-text-secondary hover:text-gold-500 transition-all">
                       <Printer size={16} /> Skriv ut kvitto
                    </button>
                    {isSuperAdmin && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setEditingOrder(order); }}
                        className="w-14 py-4 rounded-2xl bg-bg-primary border border-border-subtle flex items-center justify-center text-text-secondary hover:text-gold-500 transition-all"
                      >
                        <Edit2 size={16} />
                      </button>
                    )}
                 </div>
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
  
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== "undefined") {
      audioRef.current = new Audio("/notification.mp3");
      if (audioRef.current) audioRef.current.volume = 1.0;
    }
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
        if (audioRef.current) {
          audioRef.current.volume = 1.0;
          audioRef.current.play().catch(() => {});
          setTimeout(() => audioRef.current?.play().catch(() => {}), 1000);
        }
      }
    });
    socket.on("order:updated", () => fetchData());
    return () => { socket.disconnect(); };
  }, [isMounted, selectedRestaurantId, isSuperAdmin, fetchData]);

  const updateStatus = async (orderId: string, status: string, estimatedTime?: number) => {
    if (isSuperAdmin) {
      setConfirmDialog({ message: "Super Admin har endast läs-åtkomst. Använd Edit för ändringar.", onConfirm: () => setConfirmDialog(null) });
      return; 
    }
    try {
      const token = localStorage.getItem("palmyra_token");
      await axios.patch(`${API_URL}/api/admin/orders/${orderId}/status`, { status, estimatedTime }, { headers: { Authorization: `Bearer ${token}` } });
      setAcceptDialog(null);
      if (status === "PREPARING") confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#e7b24b', '#f3c96e', '#ffffff'] });
      await fetchData();
    } catch { 
      setConfirmDialog({ message: "Kunde inte uppdatera status", onConfirm: () => setConfirmDialog(null) });
    }
  };

  const deleteTestOrder = (orderId: string) => {
    setOrders(prev => prev.filter(o => o.id !== orderId));
    setExpandedOrderId(null);
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
    <div className="max-w-xl mx-auto space-y-10 pb-40 px-4 pt-6">
      
      <AnimatePresence>
        {confirmDialog && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center glass/90 backdrop-blur-xl p-6">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-bg-secondary border border-border-subtle rounded-[2rem] p-8 w-full max-w-sm text-center shadow-2xl">
               <AlertCircle size={40} className="mx-auto mb-4 text-gold-500" />
               <p className="text-[13px] font-bold text-text-primary mb-8 uppercase tracking-wide leading-relaxed">{confirmDialog.message}</p>
               <button onClick={confirmDialog.onConfirm} className="w-full py-4 bg-gold-500 text-dark-500 rounded-xl font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all">Stäng</button>
            </motion.div>
          </div>
        )}

        {acceptDialog && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center glass/90 backdrop-blur-xl p-6">
            <motion.div initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 30 }} className="bg-bg-secondary border border-border-subtle rounded-[3rem] p-10 w-full max-w-sm text-center shadow-2xl">
               <h3 className="text-xl font-black uppercase text-text-primary mb-8 italic tracking-tight">Välj Tid (Minuter)</h3>
               <div className="grid grid-cols-3 gap-3 mb-10">
                 {[15, 20, 25, 30, 45, 60].map(t => (
                    <button key={t} onClick={() => setAcceptDialog({ ...acceptDialog, time: t })} className={`py-4 rounded-xl font-black text-[13px] transition-all active:scale-90 ${acceptDialog.time === t ? 'bg-gold-500 text-dark-500 shadow-lg shadow-gold-500/20' : 'bg-bg-primary text-text-secondary border border-border-subtle'}`}>{t}</button>
                 ))}
               </div>
               <div className="flex gap-4">
                 <button onClick={() => setAcceptDialog(null)} className="flex-1 py-4 text-[10px] font-black uppercase tracking-widest text-text-secondary">Avbryt</button>
                 <button onClick={() => updateStatus(acceptDialog.orderId, "PREPARING", acceptDialog.time)} className="flex-[2] py-4 bg-emerald-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-emerald-500/20">Godkänn</button>
               </div>
            </motion.div>
          </div>
        )}

        {editingOrder && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center glass/95 backdrop-blur-2xl p-4">
             <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="w-full max-w-xl bg-bg-secondary border border-border-subtle rounded-[3rem] overflow-hidden shadow-2xl relative">
                <div className="p-8 border-b border-border-subtle flex items-center justify-between">
                   <h2 className="text-xl font-black uppercase italic tracking-tight text-text-primary leading-none">Order <span className="text-gold-500 font-mono">#{editingOrder.orderNumber}</span></h2>
                   <button onClick={() => setEditingOrder(null)} className="p-2 text-text-secondary hover:text-text-primary transition-all"><X size={20} /></button>
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
                    } catch { setConfirmDialog({ message: "Fel vid sparning", onConfirm: () => setConfirmDialog(null) }); }
                  }}
                  className="p-8 space-y-6"
                >
                   <div className="grid grid-cols-1 gap-6">
                      <div className="space-y-1"><label className="text-[8px] font-black uppercase tracking-[0.3em] text-text-secondary ml-1">Namn</label><input name="customerName" defaultValue={editingOrder.customerName} className="w-full bg-bg-primary border border-border-subtle rounded-xl px-5 py-4 text-xs font-black outline-none" /></div>
                      <div className="space-y-1"><label className="text-[8px] font-black uppercase tracking-[0.3em] text-text-secondary ml-1">Telefon</label><input name="customerPhone" defaultValue={editingOrder.customerPhone} className="w-full bg-bg-primary border border-border-subtle rounded-xl px-5 py-4 text-xs font-black outline-none" /></div>
                      <div className="space-y-1"><label className="text-[8px] font-black uppercase tracking-[0.3em] text-text-secondary ml-1">Adress</label><input name="deliveryStreet" defaultValue={editingOrder.deliveryStreet} className="w-full bg-bg-primary border border-border-subtle rounded-xl px-5 py-4 text-xs font-black outline-none" /></div>
                      <div className="space-y-1"><label className="text-[8px] font-black uppercase tracking-[0.3em] text-text-secondary ml-1">Status</label><select name="status" defaultValue={editingOrder.status} className="w-full bg-bg-primary border border-border-subtle rounded-xl px-5 py-4 text-xs font-black outline-none uppercase appearance-none">{Object.entries(STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                   </div>
                   <div className="pt-4 flex gap-3">
                      <button type="button" onClick={() => setEditingOrder(null)} className="flex-1 py-4 text-[10px] font-black uppercase text-text-secondary">Avbryt</button>
                      <button type="submit" className="flex-1 py-4 bg-gold-500 text-dark-500 rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all">Spara</button>
                   </div>
                </form>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4">
          <div className={`w-3 h-3 rounded-full ${loading ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]'}`} /> 
          <h1 className="text-2xl font-black uppercase italic tracking-tighter text-text-primary">System Online</h1>
        </motion.div>
        
        <button onClick={fetchData} disabled={loading} className={`p-3 rounded-xl border border-border-subtle bg-bg-secondary text-text-secondary transition-all ${loading ? 'opacity-50' : 'active:scale-90 hover:text-gold-500'}`}>
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error ? (
        <div className="py-20 text-center glass-panel rounded-[2rem] border-dashed border-rose-500/20">
           <AlertCircle className="text-rose-500 mx-auto mb-4" size={40}/>
           <p className="text-[10px] text-text-secondary font-bold uppercase tracking-widest mb-6">{error}</p>
           <button onClick={fetchData} className="px-8 py-4 bg-gold-500 text-dark-500 rounded-xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all">Försök igen</button>
        </div>
      ) : loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-4">
            <Loader2 className="animate-spin text-gold-500" size={40} />
            <p className="text-[9px] font-black uppercase tracking-[0.4em] text-text-secondary animate-pulse">Synkroniserar...</p>
        </div>
      ) : (
        <div className="space-y-16">
          {sums.pending.length > 0 && (
            <div className="space-y-6">
              <div className="flex items-center gap-4"><h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-gold-500 italic">Nya Inkomna</h2><div className="flex-1 h-px bg-gold-500/10" /></div>
              <div className="grid grid-cols-1 gap-4">{sums.pending.map(o => <OrderCard key={o.id} order={o} expandedOrderId={expandedOrderId} setExpandedOrderId={setExpandedOrderId} setAcceptDialog={setAcceptDialog} updateStatus={updateStatus} isSuperAdmin={isSuperAdmin} setEditingOrder={setEditingOrder} />)}</div>
            </div>
          )}

          {sums.active.length > 0 && (
            <div className="space-y-6">
              <div className="flex items-center gap-4"><h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-text-secondary italic">Aktiva Ordrar</h2><div className="flex-1 h-px bg-border-subtle" /></div>
              <div className="grid grid-cols-1 gap-4">{sums.active.map(o => <OrderCard key={o.id} order={o} expandedOrderId={expandedOrderId} setExpandedOrderId={setExpandedOrderId} updateStatus={updateStatus} isSuperAdmin={isSuperAdmin} setEditingOrder={setEditingOrder} onDeleteTestOrder={deleteTestOrder} />)}</div>
            </div>
          )}

          {(sums.today.length > 0 || sums.yesterday.length > 0) && (
            <div className="space-y-6">
               <div className="flex items-center gap-4 px-1"><h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-text-secondary opacity-30 italic">Föregående</h2><div className="flex-1 h-px bg-border-subtle opacity-30" /></div>
               <div className="space-y-4">
                  {[...sums.today, ...sums.yesterday].slice(0, 15).map(o => <OrderCard key={o.id} order={o} isPast={true} expandedOrderId={expandedOrderId} setExpandedOrderId={setExpandedOrderId} updateStatus={updateStatus} isSuperAdmin={isSuperAdmin} setEditingOrder={setEditingOrder} />)}
               </div>
            </div>
          )}
          
          {orders.length === 0 && (
             <div className="py-20 flex flex-col items-center justify-center gap-4 glass-panel rounded-[2rem] border-dashed">
                <ShoppingCart size={32} className="text-text-secondary opacity-10" />
                <p className="text-[9px] font-black uppercase tracking-[0.6em] text-text-secondary opacity-20">Inga beställningar</p>
             </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminOrdersPage;
