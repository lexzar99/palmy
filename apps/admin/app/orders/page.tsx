"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { ShoppingCart, User, MapPin, Printer, Truck, Store, RefreshCw, Globe, ChevronDown, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";
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
    <motion.div layout className={`rounded-3xl p-4 sm:p-6 transition-all border-2 relative overflow-hidden bg-dark-400 ${isNew ? 'border-yellow-400 shadow-xl shadow-yellow-400/20' : 'border-white/5'}`}>
      {/* Header - Klickbar för att expandera */}
      <div 
        onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer"
      >
        <div className="flex items-center gap-4 w-full">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black ${isNew ? 'bg-yellow-400 text-dark-500' : 'bg-white/5 text-white/50'}`}>
             #{order.orderNumber}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${isNew ? 'bg-yellow-400 text-dark-500' : 'bg-white/10 text-white/60'}`}>
                {STATUS_LABELS[order.status] || order.status}
              </span>
              <span className="text-[10px] text-white/30 uppercase font-bold text-right ml-auto mr-4">
                {(new Date(order.createdAt)).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <h3 className="text-lg font-black uppercase text-white truncate">{order.customerName}</h3>
          </div>
          <div className="shrink-0 sm:hidden">
              <ChevronDown size={20} className={`text-white/30 transition-transform ${isExpanded ? 'rotate-180':''}`} />
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-4">
           <div className="text-xl font-black text-gold-500">{order.total} KR</div>
           <ChevronDown size={20} className={`text-white/30 transition-transform ${isExpanded ? 'rotate-180':''}`} />
        </div>
      </div>

      {/* Expanderad Innehåll */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-6 pt-6 border-t border-white/5 overflow-hidden flex flex-col gap-6"
          >
            {/* Kund info */}
            <div className="grid grid-cols-2 gap-4">
               <div className="bg-white/5 p-4 rounded-2xl">
                  <div className="text-[10px] text-white/30 uppercase font-black mb-1">Leverans</div>
                  <div className="text-sm font-bold flex items-center gap-2">
                     {order.type === "DELIVERY" ? <Truck size={14} className="text-white/40"/> : <Store size={14} className="text-white/40"/>}
                     {order.type === "DELIVERY" ? "Hemkörning" : "Hämtas"}
                  </div>
               </div>
               <div className="bg-white/5 p-4 rounded-2xl">
                  <div className="text-[10px] text-white/30 uppercase font-black mb-1">Telefon</div>
                  <div className="text-sm font-bold text-white">{order.customerPhone}</div>
               </div>
            </div>

            {order.type === "DELIVERY" && (
              <div className="bg-white/5 p-4 rounded-2xl flex gap-3 items-center">
                 <MapPin className="text-white/40" size={18} />
                 <div>
                   <div className="text-sm font-bold">{order.deliveryStreet}</div>
                   <div className="text-xs text-white/40">{order.deliveryZip} {order.deliveryCity}</div>
                 </div>
              </div>
            )}

            {/* Mat Info */}
            <div className="space-y-2">
               <div className="text-[10px] items-center text-white/30 uppercase font-black px-2 flex justify-between">
                  <span>Artiklar</span>
                  <span>Totalt: {order.total} KR</span>
               </div>
               {order.items?.map((it:any) => (
                  <div key={it.id} className="bg-white/5 p-4 rounded-2xl flex justify-between">
                     <div>
                       <span className="font-black text-gold-500 mr-2">{it.quantity}x</span>
                       <span className="font-bold text-sm uppercase">{getDisplayName(it)}</span>
                       {it.note && <div className="text-xs text-red-400 mt-1 uppercase">Notering: {it.note}</div>}
                     </div>
                  </div>
               ))}
               {order.note && (
                  <div className="p-4 bg-white/5 border border-dashed border-white/20 rounded-2xl text-sm italic mt-2">
                    <span className="font-bold uppercase text-[10px] text-white/40 block mb-1">Kundens Meddelande:</span>
                    "{order.note}"
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
                        className="px-4 py-4 bg-dark-500 border border-white/10 rounded-2xl font-black text-white/50 text-[10px] uppercase w-1/3 hover:bg-red-500/10 hover:text-red-500 transition-all flex items-center justify-center gap-1"
                      >
                        <XCircle size={14} /> Neka
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setAcceptDialog({ orderId: order.id, time: 20 }); }} 
                        className="w-2/3 py-4 bg-gold-500 text-dark-500 rounded-2xl font-black text-sm uppercase shadow-lg shadow-gold-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                      >
                        <CheckCircle size={16} /> Godkänn Order
                      </button>
                   </>
                 ) : order.status === "PREPARING" || order.status === "ACCEPTED" ? (
                   <button 
                      onClick={(e) => { e.stopPropagation(); updateStatus(order.id, order.type === "PICKUP" ? "READY" : "DELIVERING"); }}
                      className="w-full py-4 bg-gold-500 text-dark-500 rounded-2xl font-black text-sm uppercase flex items-center justify-center gap-2 active:scale-95"
                   >
                     Markera som {order.type === "PICKUP" ? "Klar" : "På väg"}
                   </button>
                 ) : order.status === "READY" || order.status === "DELIVERING" ? (
                   <button 
                      onClick={(e) => { e.stopPropagation(); updateStatus(order.id, "DELIVERED"); }}
                      className="w-full py-4 bg-emerald-500 text-dark-500 rounded-2xl font-black text-sm uppercase flex items-center justify-center gap-2 active:scale-95"
                   >
                     Markera som Levererad
                   </button>
                 ) : null}
                 
                 <button onClick={(e) => { e.stopPropagation(); window.open(`/receipt?orderId=${order.id}`, "_blank"); }} className="px-4 py-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center w-1/4">
                    <Printer size={18} className="text-white/40" />
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
  const { selectedRestaurantId } = useRestaurantStore();
  
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const getToken = () => typeof window !== "undefined" ? localStorage.getItem("palmyra_token") || "" : "";

  useEffect(() => {
    // Sätt upp ljud för notifikationer
    if (typeof window !== "undefined") {
      audioRef.current = new Audio("/notification.mp3");
    }
  }, []);

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
      const sortedOrders = [...(res.data.orders || [])].sort((a: Order, b: Order) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setOrders(sortedOrders);
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
      void fetchData();
    });

    socket.on("order:new", (order: any) => {
      const shouldShow = isSuperAdmin ? (!selectedRestaurantId || order.restaurantId === selectedRestaurantId) : (order.restaurantId === selectedRestaurantId);
      if (shouldShow) {
        setOrders((prev) => [order as Order, ...prev.filter(o => o.id !== order.id)].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        if (!isSuperAdmin) {
          audioRef.current?.play().catch(console.error);
        }
      }
    });

    socket.on("order:updated", (data: any) => {
      const shouldRefresh = isSuperAdmin ? (!selectedRestaurantId || data.restaurantId === selectedRestaurantId) : (!data.restaurantId || data.restaurantId === selectedRestaurantId);
      if (shouldRefresh) void fetchData();
    });

    return () => { socket.disconnect(); };
  }, [fetchData, selectedRestaurantId, isSuperAdmin]);

  const updateStatus = async (orderId: string, status: string, estimatedTime?: number) => {
    if (isSuperAdmin) {
      alert("Endast restaurangadmin kan hantera ordrar.");
      return;
    }
    try {
      await axios.patch(
        `${API_URL}/api/admin/orders/${orderId}/status`,
        { status, estimatedTime },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      setAcceptDialog(null);
      if (status === "PREPARING") {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#D4A74A', '#FFFFFF'] });
      }
      await fetchData();
    } catch {
      alert("Kunde inte uppdatera");
    }
  };

  const pendingOrders = orders.filter((o) => o.status === "PENDING");
  const activeOrders = orders.filter((o) => ["ACCEPTED", "PREPARING", "READY", "DELIVERING"].includes(o.status));
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const pastOrdersFiltered = orders.filter((o) => {
    if (!["DELIVERED", "DELIVERY_FAILED", "CANCELLED", "REJECTED"].includes(o.status)) return false;
    const orderDate = new Date(o.createdAt);
    return orderDate >= yesterday;
  });

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-32 pt-4 px-2 sm:px-0">
      
      {/* Accept Dialog */}
      <AnimatePresence>
        {acceptDialog && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-dark-500/90 p-6 backdrop-blur-md">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-dark-400 border border-white/10 rounded-3xl p-8 w-full max-w-sm text-center">
               <h3 className="text-xl font-black uppercase mb-6">Hur lång tid tar det?</h3>
               <div className="grid grid-cols-3 gap-3 mb-8">
                 {[15, 20, 25, 30, 45, 60].map(t => (
                   <button key={t} onClick={() => setAcceptDialog({ ...acceptDialog, time: t })} className={`py-3 rounded-xl font-black ${acceptDialog.time === t ? 'bg-gold-500 text-dark-500' : 'bg-white/5 text-white/50 border border-white/10'}`}>
                     {t}
                   </button>
                 ))}
               </div>
               <div className="flex gap-3">
                 <button onClick={() => setAcceptDialog(null)} className="w-1/3 py-4 bg-white/5 border border-white/10 rounded-xl font-black text-xs uppercase text-white/50">Avbryt</button>
                 <button onClick={() => updateStatus(acceptDialog.orderId, "PREPARING", acceptDialog.time)} className="w-2/3 py-4 bg-gold-500 text-dark-500 rounded-xl font-black text-sm uppercase">OK {acceptDialog.time} min</button>
               </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between px-2">
        <h1 className="text-2xl font-black uppercase flex items-center gap-3">
           {!selectedRestaurantId ? <Globe size={24} className="text-gold-500"/> : <Store size={24} className="text-gold-500"/>}
           Live Ordrar
        </h1>
        <button onClick={fetchData} className="p-3 bg-white/5 rounded-full text-white/50"><RefreshCw size={16} className={loading?"animate-spin":""}/></button>
      </div>

      {loading && orders.length === 0 ? (
        <div className="py-20 text-center text-white/20 uppercase font-black tracking-widest text-[10px]"><Loader2 className="mx-auto animate-spin mb-4" size={24}/>Hämtar ordrar...</div>
      ) : (
        <div className="space-y-12">
          {pendingOrders.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-yellow-400 px-2 flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" /> Nya Ordrar!
              </h2>
              <div className="space-y-3">
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
            </div>
          )}

          {activeOrders.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-white/30 px-2">Pågående</h2>
              <div className="space-y-3">
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
            </div>
          )}

          {pastOrdersFiltered.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-white/30 px-2">Tidigare idag / Igår</h2>
              <div className="space-y-3 opacity-60">
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
            </div>
          )}
          
          {orders.length === 0 && (
             <div className="py-12 border-2 border-dashed border-white/10 rounded-3xl text-center text-white/30 font-black uppercase text-[10px] tracking-widest">
               Inga ordrar än idag
             </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminOrdersPage;
