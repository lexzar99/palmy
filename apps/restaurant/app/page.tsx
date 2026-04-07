"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ShoppingCart, 
  MapPin, 
  Printer, 
  Store, 
  RefreshCw, 
  ChevronDown, 
  Loader2, 
  Clock, 
  AlertCircle,
  Phone,
  Zap,
  ArrowRight
} from "lucide-react";
import { io as socketIO } from "socket.io-client";
import confetti from "canvas-confetti";
import { API_URL, SOCKET_URL } from "@/lib/api";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Ny Order",
  ACCEPTED: "Bekräftad",
  PREPARING: "Tillagas",
  READY: "Klar",
  DELIVERING: "På väg",
  DELIVERED: "Levererad",
  CANCELLED: "Avbokad",
  REJECTED: "Nekad",
};

const formatOrderNumber = (num: any) => {
  const n = String(num).replace("PX-", "");
  const prefix = String.fromCharCode(65 + (parseInt(n) % 26)); 
  return `${prefix}${n}`;
};

const OrderCard = ({ order, expandedOrderId, setExpandedOrderId, setAcceptDialog, updateStatus }: any) => {
  const isExpanded = expandedOrderId === order.id;
  const isAccepted = ["ACCEPTED", "PREPARING", "READY"].includes(order.status);

  return (
    <motion.div 
      layout 
      className={`rounded-[2rem] transition-all relative overflow-hidden bg-zinc-900 border-2 ${
        isAccepted ? 'border-emerald-500 shadow-lg shadow-emerald-500/10' : 'border-white/5'
      }`}
    >
      <div onClick={() => setExpandedOrderId(isExpanded ? null : order.id)} className="p-6 flex items-center justify-between gap-4 cursor-pointer hover:bg-zinc-800/50 transition-colors">
        <div className="flex items-center gap-5 flex-1">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-sm ${isAccepted ? 'bg-emerald-500 text-white' : 'bg-zinc-950 text-gold-500 border border-white/5'}`}>
             {formatOrderNumber(order.orderNumber)}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-black uppercase text-white truncate tracking-tight mb-1">{order.customerName}</h3>
            <div className="flex items-center gap-3">
              <span className={`px-2 py-0.5 rounded-full text-[8px] font-black border ${order.type === "DELIVERY" ? "border-sky-500/20 text-sky-500 bg-sky-500/5" : "border-emerald-500/20 text-emerald-500 bg-emerald-500/5"}`}>
                 {order.type === "DELIVERY" ? "UTKÖRNING" : "AVHÄMTNING"}
              </span>
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                {(new Date(order.createdAt)).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-5">
           <div className={`text-xl font-black italic text-white`}>
              {Math.round(order.total)} <span className="text-[10px] opacity-40 not-italic uppercase">SEK</span>
           </div>
           <ChevronDown size={20} className={`text-zinc-600 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-6 pb-8 space-y-6">
            <div className="h-px bg-white/5" />
            
            <div className="grid lg:grid-cols-2 gap-4">
               {order.type === "DELIVERY" ? (
                 <div className="bg-sky-500/10 border border-sky-500/20 p-5 rounded-2xl">
                    <div className="text-[10px] font-black text-sky-500 uppercase tracking-widest mb-2 flex items-center gap-2"><MapPin size={14}/> Leveransadress</div>
                    <div className="text-lg font-black text-white uppercase italic leading-tight">
                       {order.deliveryStreet}
                       <div className="text-sm opacity-60 not-italic mt-1">{order.deliveryZip} {order.deliveryCity}</div>
                    </div>
                 </div>
               ) : (
                 <div className="bg-emerald-500/10 border border-emerald-500/20 p-5 rounded-2xl">
                    <div className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2 flex items-center gap-2"><Store size={14}/> Avhämtning</div>
                    <div className="text-lg font-black text-white uppercase italic">Hämtas i restaurangen</div>
                 </div>
               )}

               <div className="bg-zinc-950 border border-white/5 p-5 rounded-2xl flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">Kontakt</div>
                    <div className="text-lg font-black text-white tracking-widest">{order.customerPhone}</div>
                  </div>
                  <a href={`tel:${order.customerPhone}`} className="w-12 h-12 rounded-full bg-gold-500/10 border border-gold-500/20 flex items-center justify-center text-gold-500 hover:bg-gold-500 hover:text-zinc-950 transition-all">
                     <Phone size={20} />
                  </a>
               </div>
            </div>

            {order.note && (
              <div className="p-5 bg-gold-500/5 border border-gold-500/10 rounded-2xl">
                 <div className="text-[10px] font-black text-gold-500 uppercase tracking-widest mb-1 italic">Kundmeddelande</div>
                 <div className="text-sm font-bold text-white italic">{order.note}</div>
              </div>
            )}

            <div className="space-y-3">
              {order.items?.map((it:any, idx: number) => {
                const extras = typeof it.selectedExtras === "string" ? JSON.parse(it.selectedExtras) : (it.selectedExtras || []);
                return (
                  <div key={idx} className="bg-zinc-950/50 p-5 rounded-2xl border border-white/5 flex justify-between items-center">
                    <div className="flex gap-4">
                       <div className="text-gold-500 font-black text-lg">{it.quantity}x</div>
                       <div>
                          <div className="text-lg font-black text-white uppercase italic">{it.productName}</div>
                          {extras.length > 0 && (
                            <div className="text-[11px] font-bold text-zinc-500 uppercase mt-1">
                               {extras.map((ex: any) => ex.extraName || ex.name).join(", ")}
                            </div>
                          )}
                       </div>
                    </div>
                    <div className="text-zinc-500 text-sm font-black italic">{Math.round(it.subtotal)} KR</div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 pt-4">
               {order.status === "PENDING" ? (
                  <div className="flex gap-3">
                    <button onClick={(e) => { e.stopPropagation(); updateStatus(order.id, "REJECTED"); }} className="px-8 py-5 rounded-2xl text-[10px] font-black uppercase text-rose-500 border border-rose-500/20 hover:bg-rose-500/5 transition-all">
                      Neka
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); setAcceptDialog({ orderId: order.id, time: 20 }); }} className="flex-1 py-5 bg-emerald-500 text-white rounded-2xl text-xs font-black uppercase shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-3">
                      Godkänn Order <ArrowRight size={18} />
                    </button>
                  </div>
               ) : (["ACCEPTED", "PREPARING", "READY"].includes(order.status)) ? (
                  <button 
                    onClick={(e) => { e.stopPropagation(); updateStatus(order.id, order.type === "PICKUP" ? "DELIVERED" : "DELIVERING"); }} 
                    className="w-full py-5 bg-sky-500 text-white rounded-2xl text-xs font-black uppercase shadow-lg shadow-sky-500/20 transition-all flex items-center justify-center gap-3"
                  >
                     Markera som {order.type === "PICKUP" ? "Hämtad & Klar" : "Skickad till kund"} <Zap size={18} />
                  </button>
               ) : null}
               <button onClick={(e) => { e.stopPropagation(); window.open(`${API_URL}/api/receipt?orderId=${order.id}`, "_blank"); }} className="w-full py-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 flex items-center justify-center gap-2 hover:text-white transition-colors">
                  <Printer size={16} /> Skriv ut kvitto
               </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default function Dashboard() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [acceptDialog, setAcceptDialog] = useState<{ orderId: string; time: number } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const token = localStorage.getItem("matgo_token");
      const admin = JSON.parse(localStorage.getItem("matgo_admin") || "{}");
      if (!admin.restaurantId) return;

      const res = await axios.get(`${API_URL}/api/admin/orders?limit=50&restaurantId=${admin.restaurantId}`, { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      setOrders(res.data.orders.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch {
      setError("Kunde inte synkronisera.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    audioRef.current = new Audio("/notification.mp3");
    
    const admin = JSON.parse(localStorage.getItem("matgo_admin") || "{}");
    const socket = socketIO(SOCKET_URL, { path: "/socket.io", transports: ["websocket", "polling"] });
    socket.on("connect", () => socket.emit("join:admin", { restaurantId: admin.restaurantId }));
    socket.on("order:new", (order: any) => {
      setOrders(prev => [order, ...prev.filter(o => o.id !== order.id)]);
      audioRef.current?.play().catch(() => {});
    });
    socket.on("order:updated", fetchData);
    return () => { socket.disconnect(); };
  }, [fetchData]);

  const updateStatus = async (orderId: string, status: string, estimatedTime?: number) => {
    try {
      const token = localStorage.getItem("matgo_token");
      await axios.patch(`${API_URL}/api/admin/orders/${orderId}/status`, { status, estimatedTime }, { headers: { Authorization: `Bearer ${token}` } });
      setAcceptDialog(null);
      if (status === "PREPARING") confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#e7b24b', '#ffffff'] });
      fetchData();
    } catch { alert("Kunde inte uppdatera status."); }
  };

  const pending = orders.filter(o => o.status === "PENDING");
  const active = orders.filter(o => ["ACCEPTED", "PREPARING", "READY", "DELIVERING"].includes(o.status));

  return (
    <div className="space-y-10 pb-32">
       {acceptDialog && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl p-6">
            <motion.div initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} className="bg-zinc-900 border border-white/5 rounded-[3rem] p-10 w-full max-w-sm text-center shadow-2xl">
               <h3 className="text-xl font-black uppercase text-white mb-8 italic tracking-tight">Klar om hur länge?</h3>
               <div className="grid grid-cols-3 gap-3 mb-10">
                 {[15, 20, 25, 30, 45, 60].map(t => (
                    <button key={t} onClick={() => setAcceptDialog({ ...acceptDialog, time: t })} className={`py-4 rounded-xl font-black text-[13px] transition-all ${acceptDialog.time === t ? 'bg-gold-500 text-zinc-950' : 'bg-black text-zinc-500 border border-white/5'}`}>{t} min</button>
                 ))}
               </div>
               <div className="flex gap-4">
                 <button onClick={() => setAcceptDialog(null)} className="flex-1 py-4 text-[10px] font-black uppercase tracking-widest text-zinc-500">Avbryt</button>
                 <button onClick={() => updateStatus(acceptDialog.orderId, "PREPARING", acceptDialog.time)} className="flex-[2] py-4 bg-emerald-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-500/20">Godkänn</button>
               </div>
            </motion.div>
          </div>
       )}

       <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
             <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
             <h1 className="text-3xl font-black uppercase italic tracking-tighter">Live Ordrar</h1>
          </div>
          <button onClick={fetchData} className="p-4 rounded-2xl bg-zinc-900 text-zinc-500 hover:text-white transition-colors">
             <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
          </button>
       </div>

       {loading ? (
         <div className="py-20 flex flex-col items-center justify-center gap-4">
            <Loader2 className="animate-spin text-gold-500" size={40} />
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-600">Synkroniserar live-flödet...</p>
         </div>
       ) : (
         <div className="space-y-12">
            <section className="space-y-6">
               <div className="flex items-center gap-4">
                  <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-gold-500 italic">Nya Inkomna ({pending.length})</h2>
                  <div className="flex-1 h-px bg-gold-500/10" />
               </div>
               <div className="grid grid-cols-1 gap-4">
                  {pending.map(o => <OrderCard key={o.id} order={o} expandedOrderId={expandedOrderId} setExpandedOrderId={setExpandedOrderId} setAcceptDialog={setAcceptDialog} updateStatus={updateStatus} />)}
                  {pending.length === 0 && <div className="py-10 text-center border-2 border-dashed border-white/5 rounded-3xl text-zinc-700 text-[10px] font-black uppercase tracking-widest italic">Väntar på nya beställningar...</div>}
               </div>
            </section>

            <section className="space-y-6">
               <div className="flex items-center gap-4">
                  <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500 italic">Under Behandling ({active.length})</h2>
                  <div className="flex-1 h-px bg-white/5" />
               </div>
               <div className="grid grid-cols-1 gap-4">
                  {active.map(o => <OrderCard key={o.id} order={o} expandedOrderId={expandedOrderId} setExpandedOrderId={setExpandedOrderId} updateStatus={updateStatus} />)}
               </div>
            </section>
         </div>
       )}
    </div>
  );
}
