"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, MapPin, Printer, Truck, Store, RefreshCw, Globe, ChevronDown, CheckCircle, XCircle, Loader2 } from "lucide-react";
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
  let extras = [];
  try { extras = typeof item.selectedExtras === "string" ? JSON.parse(item.selectedExtras) : item.selectedExtras || []; } catch {}
  const sizeExtras = extras.filter((e: any) => e.groupName?.toLowerCase() === "storlek");
  return sizeExtras.length > 0 ? `${item.productName} - ${sizeExtras.map((e: any) => e.extraName || e.name).join(", ")}` : item.productName;
};

const OrderCard = ({ order, isNew, expandedOrderId, setExpandedOrderId, setAcceptDialog, updateStatus, isSuperAdmin }: any) => {
  const isExpanded = expandedOrderId === order.id;
  return (
    <motion.div layout className={`rounded-[2rem] p-5 sm:p-6 transition-all relative overflow-hidden ${isNew ? 'bg-gold-500/10 border border-gold-500/30' : 'bg-[#0f111a] border border-white/5 shadow-2xl'}`}>
      {/* Header - Klickbar för att expandera */}
      <div 
        onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
        className="flex flex-col sm:flex-row items-center justify-between gap-4 cursor-pointer"
      >
        <div className="flex items-center gap-4 w-full">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${isNew ? 'bg-gold-500 text-dark-500' : 'bg-white/5 text-gold-500'}`}>
             #{order.orderNumber}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <span className={`text-[10px] font-black uppercase px-2.5 py-1 rounded-lg tracking-widest ${isNew ? 'bg-gold-500 text-dark-500' : 'bg-white/5 text-white/40'}`}>
                {STATUS_LABELS[order.status] || order.status}
              </span>
              <span className="text-[10px] text-white/20 uppercase font-black tracking-widest ml-auto">
                {(new Date(order.createdAt)).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <h3 className="text-base font-black uppercase text-white tracking-tight">{order.customerName}</h3>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-4">
           <div className="text-xl font-black text-gold-500 tabular-nums">{order.total} KR</div>
           <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} className="text-white/20">
             <ChevronDown size={20} />
           </motion.div>
        </div>
      </div>

      {/* Expanderad Innehåll */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-8 pt-8 border-t border-white/5 overflow-hidden flex flex-col gap-8"
          >
            {/* Kund info */}
            <div className="grid grid-cols-2 gap-4">
               <div className="bg-white/5 p-5 rounded-2xl border border-white/5">
                  <div className="text-[10px] text-white/20 uppercase font-black mb-2 tracking-widest">Metod</div>
                  <div className="text-sm font-black text-white flex items-center gap-3 uppercase">
                     {order.type === "DELIVERY" ? <Truck size={16} className="text-gold-500"/> : <Store size={16} className="text-gold-500"/>}
                     {order.type === "DELIVERY" ? "Hemkörning" : "Hämtas"}
                  </div>
               </div>
               <div className="bg-white/5 p-5 rounded-2xl border border-white/5">
                  <div className="text-[10px] text-white/20 uppercase font-black mb-2 tracking-widest">Telefon</div>
                  <div className="text-sm font-black text-white">{order.customerPhone}</div>
               </div>
            </div>

            {order.type === "DELIVERY" && (
              <div className="bg-white/5 border border-white/5 p-5 rounded-2xl flex gap-4 items-center">
                 <div className="w-10 h-10 rounded-xl bg-gold-500/10 flex items-center justify-center">
                   <MapPin className="text-gold-500" size={20} />
                 </div>
                 <div>
                   <div className="text-sm font-black text-white uppercase">{order.deliveryStreet}</div>
                   <div className="text-[10px] text-white/40 font-bold uppercase tracking-widest">{order.deliveryZip} {order.deliveryCity}</div>
                 </div>
              </div>
            )}

            {/* Mat Info */}
            <div className="space-y-3">
               <div className="text-[10px] items-center text-white/20 uppercase font-black px-2 flex justify-between tracking-widest mb-4">
                  <span>Innehåll</span>
                  <span>Totalt: {order.total} KR</span>
               </div>
               <div className="space-y-2">
                 {order.items?.map((it:any) => (
                    <div key={it.id} className="bg-white/5 border border-white/5 p-4 rounded-2xl flex items-center justify-between group">
                       <div className="flex items-center gap-4">
                         <div className="w-8 h-8 rounded-lg bg-gold-500/10 flex items-center justify-center font-black text-gold-500 text-xs">
                           {it.quantity}x
                         </div>
                         <div>
                           <div className="text-sm font-black text-white uppercase">{getDisplayName(it)}</div>
                           {it.note && <div className="text-[10px] text-rose-500 mt-1 uppercase font-black tracking-widest italic">"{it.note}"</div>}
                         </div>
                       </div>
                       <div className="text-white/20 text-xs font-bold group-hover:text-gold-500/50 transition-colors">
                         {it.price * it.quantity} KR
                       </div>
                    </div>
                 ))}
               </div>
               {order.note && (
                  <div className="p-5 bg-gold-500/5 border border-gold-500/10 rounded-2xl text-sm italic mt-4 relative">
                    <div className="absolute top-0 right-6 -translate-y-1/2 p-2 bg-[#0f111a] border border-white/5 rounded-lg text-gold-500">
                       <Globe size={12} />
                    </div>
                    <span className="font-black uppercase text-[10px] text-gold-500 block mb-2 tracking-widest">Kundens Meddelande:</span>
                    <span className="text-white/70 font-medium tracking-tight leading-relaxed">"{order.note}"</span>
                  </div>
               )}
            </div>

            {/* Actions */}
            {!isSuperAdmin && (
              <div className="pt-4 flex gap-3">
                 {isNew ? (
                   <>
                      <button 
                        onClick={(e) => { e.stopPropagation(); updateStatus(order.id, "REJECTED"); }} 
                        className="p-5 bg-white/5 hover:bg-rose-500/10 border border-white/5 hover:border-rose-500/20 rounded-2xl font-black text-white/30 hover:text-rose-500 text-[10px] uppercase w-1/3 transition-all flex items-center justify-center gap-2"
                      >
                        <XCircle size={16} /> Neka
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setAcceptDialog({ orderId: order.id, time: 20 }); }} 
                        className="w-2/3 p-5 bg-gold-500 hover:bg-gold-400 text-dark-500 rounded-2xl font-black text-sm uppercase shadow-xl shadow-gold-500/20 active:scale-95 transition-all flex items-center justify-center gap-3"
                      >
                        <CheckCircle size={20} /> Godkänn Order
                      </button>
                   </>
                 ) : order.status === "PREPARING" || order.status === "ACCEPTED" ? (
                   <button 
                      onClick={(e) => { e.stopPropagation(); updateStatus(order.id, order.type === "PICKUP" ? "READY" : "DELIVERING"); }}
                      className="w-full py-5 bg-emerald-500 hover:bg-emerald-400 text-dark-500 rounded-2xl font-black text-sm uppercase flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/20 active:scale-95 transition-all"
                   >
                     Markera som {order.type === "PICKUP" ? "Färdig" : "På väg"}
                   </button>
                 ) : null}
                 
                 <button onClick={(e) => { e.stopPropagation(); window.open(`/receipt?orderId=${order.id}`, "_blank"); }} className="p-5 bg-white/5 border border-white/5 hover:bg-white/10 rounded-2xl flex items-center justify-center w-1/4 transition-all">
                    <Printer size={20} className="text-white/40" />
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
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [acceptDialog, setAcceptDialog] = useState<{ orderId: string; time: number } | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const { selectedRestaurantId } = useRestaurantStore();
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== "undefined") {
      audioRef.current = new Audio("/notification.mp3");
    }
  }, []);

  const getToken = () => typeof window !== "undefined" ? localStorage.getItem("palmyra_token") || "" : "";

  useEffect(() => {
    try {
      const raw = localStorage.getItem("palmyra_admin");
      const admin = raw ? JSON.parse(raw) : null;
      setIsSuperAdmin(admin?.role === "SUPER_ADMIN");
    } catch {
      setIsSuperAdmin(false);
    }
  }, []);

  const fetchData = useCallback(async () => {
    if (!selectedRestaurantId && !isSuperAdmin) return;
    setLoading(true);
    try {
      const restaurantParam = isSuperAdmin ? (selectedRestaurantId ? `&restaurantId=${selectedRestaurantId}` : "") : `&restaurantId=${selectedRestaurantId}`;
      const res = await axios.get(`${API_URL}/api/admin/orders?limit=100${restaurantParam}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      setOrders([...(res.data.orders || [])].sort((a: Order, b: Order) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedRestaurantId, isSuperAdmin]);

  useEffect(() => {
    if (!selectedRestaurantId && !isSuperAdmin) return;
    fetchData();

    const socket = socketIO(SOCKET_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
    });
    
    socket.on("connect", () => {
      socket.emit("join:admin", { restaurantId: selectedRestaurantId });
    });

    socket.on("order:new", (order: any) => {
      const shouldShow = isSuperAdmin ? (!selectedRestaurantId || order.restaurantId === selectedRestaurantId) : (order.restaurantId === selectedRestaurantId);
      if (shouldShow) {
        setOrders((prev) => [order as Order, ...prev.filter(o => o.id !== order.id)].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        if (!isSuperAdmin) audioRef.current?.play().catch(console.error);
      }
    });

    socket.on("order:updated", () => fetchData());

    return () => { socket.disconnect(); };
  }, [fetchData, selectedRestaurantId, isSuperAdmin]);

  const updateStatus = async (orderId: string, status: string, estimatedTime?: number) => {
    if (isSuperAdmin) { alert("Endast personal kan hantera ordrar."); return; }
    try {
      await axios.patch(`${API_URL}/api/admin/orders/${orderId}/status`, { status, estimatedTime }, { headers: { Authorization: `Bearer ${getToken()}` } });
      setAcceptDialog(null);
      if (status === "PREPARING") confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#f3c96e', '#e7b24b', '#ffffff'] });
      await fetchData();
    } catch { alert("Kunde inte uppdatera status"); }
  };

  const pendingOrders = orders.filter((o) => o.status === "PENDING");
  const activeOrders = orders.filter((o) => ["ACCEPTED", "PREPARING"].includes(o.status));
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const pastOrdersFiltered = orders.filter((o) => {
    if (!["READY", "DELIVERING", "DELIVERED", "DELIVERY_FAILED", "CANCELLED", "REJECTED"].includes(o.status)) return false;
    const orderDate = new Date(o.createdAt);
    return orderDate >= yesterday;
  });

  if (!isMounted) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-32 px-4 pt-10">
      
      {/* Accept Dialog */}
      <AnimatePresence>
        {acceptDialog && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-6 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="bg-[#0f111a] border border-white/5 rounded-[2.5rem] p-10 w-full max-w-sm text-center shadow-2xl relative overflow-hidden">
               <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-1 bg-gold-500/20 rounded-full mt-4" />
               <h3 className="text-xl font-black uppercase text-white mb-8 tracking-tighter mt-4">Uppskattad tid?</h3>
               <div className="grid grid-cols-3 gap-3 mb-10">
                 {[15, 20, 25, 30, 45, 60].map(t => (
                   <button key={t} onClick={() => setAcceptDialog({ ...acceptDialog, time: t })} className={`py-4 rounded-2xl font-black text-sm transition-all ${acceptDialog.time === t ? 'bg-gold-500 text-dark-500 shadow-xl shadow-gold-500/20 scale-105' : 'bg-white/5 text-white/40 border border-white/5 hover:bg-white/10'}`}>
                     {t}
                   </button>
                 ))}
               </div>
               <div className="flex gap-4">
                 <button onClick={() => setAcceptDialog(null)} className="w-1/3 py-5 bg-white/5 text-white/30 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:text-white transition-colors">Avbryt</button>
                 <button onClick={() => updateStatus(acceptDialog.orderId, "PREPARING", acceptDialog.time)} className="w-2/3 py-5 bg-gold-500 hover:bg-gold-400 text-dark-500 rounded-2xl font-black text-sm uppercase shadow-xl shadow-gold-500/20 transition-all active:scale-95">OK {acceptDialog.time} min</button>
               </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="text-[10px] items-center gap-2 font-black uppercase tracking-[0.3em] text-gold-500/60 flex">
             <div className="w-1.5 h-1.5 rounded-full bg-gold-500 animate-pulse" /> Live Monitoring
          </div>
          <h1 className="text-4xl font-black uppercase tracking-tighter text-white">
             {selectedRestaurantName || "Central"} <span className="text-gold-500">Live</span>
          </h1>
        </div>
        <button onClick={fetchData} className="w-14 h-14 bg-[#0f111a] border border-white/5 hover:border-gold-500/20 rounded-2xl text-white/20 hover:text-gold-500 transition-all flex items-center justify-center shadow-xl">
          <RefreshCw size={24} className={loading?"animate-spin":""} />
        </button>
      </div>

      {loading && orders.length === 0 ? (
        <div className="py-32 flex flex-col items-center justify-center gap-6">
          <Loader2 className="animate-spin text-gold-500" size={40}/>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Ansluter till systemet...</p>
        </div>
      ) : (
        <div className="space-y-16">
          {pendingOrders.length > 0 && (
            <section className="space-y-6">
              <div className="flex items-center gap-4">
                 <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-500 px-4 py-2 bg-gold-500/10 rounded-full border border-gold-500/10">Nya Beställningar ({pendingOrders.length})</h2>
                 <div className="flex-1 h-px bg-gold-500/10" />
              </div>
              <div className="space-y-4">
                 {pendingOrders.map(o => (
                   <OrderCard 
                     key={o.id} 
                     order={o} 
                     isNew={true} 
                     expandedOrderId={expandedOrderId}
                     setExpandedOrderId={setExpandedOrderId}
                     setAcceptDialog={setAcceptDialog}
                     updateStatus={updateStatus}
                     isSuperAdmin={isSuperAdmin}
                   />
                 ))}
              </div>
            </section>
          )}

          {activeOrders.length > 0 && (
            <section className="space-y-6">
              <div className="flex items-center gap-4">
                 <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/30">Just nu i köket</h2>
                 <div className="flex-1 h-px bg-white/5" />
              </div>
              <div className="space-y-4">
                 {activeOrders.map(o => (
                   <OrderCard 
                     key={o.id} 
                     order={o} 
                     expandedOrderId={expandedOrderId}
                     setExpandedOrderId={setExpandedOrderId}
                     setAcceptDialog={setAcceptDialog}
                     updateStatus={updateStatus}
                     isSuperAdmin={isSuperAdmin}
                   />
                 ))}
              </div>
            </section>
          )}

          {pastOrdersFiltered.length > 0 && (
            <section className="space-y-6">
               <div className="flex items-center gap-4">
                 <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/10">Slutförda (Idag/Igår)</h2>
                 <div className="flex-1 h-px bg-white/5 opacity-50" />
              </div>
              <div className="space-y-3 opacity-60 hover:opacity-100 transition-opacity">
                 {pastOrdersFiltered.slice(0, 10).map(o => (
                   <OrderCard 
                     key={o.id} 
                     order={o} 
                     expandedOrderId={expandedOrderId}
                     setExpandedOrderId={setExpandedOrderId}
                     setAcceptDialog={setAcceptDialog}
                     updateStatus={updateStatus}
                     isSuperAdmin={isSuperAdmin}
                   />
                 ))}
              </div>
            </section>
          )}
          
          {orders.length === 0 && (
             <div className="py-24 bg-[#0f111a] border border-white/5 rounded-[2.5rem] text-center flex flex-col items-center gap-6 shadow-2xl">
               <div className="w-16 h-16 rounded-3xl bg-white/5 flex items-center justify-center text-white/10">
                 <Store size={32} />
               </div>
               <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Inga ordrar att visa</p>
             </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminOrdersPage;
