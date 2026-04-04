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
    <motion.div layout className={`rounded-xl p-4 sm:p-5 transition-all relative overflow-hidden bg-white shadow-sm border ${isNew ? 'border-blue-400 ring-4 ring-blue-50' : 'border-slate-200'}`}>
      {/* Header - Klickbar för att expandera */}
      <div 
        onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer"
      >
        <div className="flex items-center gap-4 w-full">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black ${isNew ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
             #{order.orderNumber}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${isNew ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {STATUS_LABELS[order.status] || order.status}
              </span>
              <span className="text-[10px] text-slate-400 uppercase font-bold text-right ml-auto mr-4">
                {(new Date(order.createdAt)).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
            <h3 className="text-base font-bold uppercase text-slate-800 truncate">{order.customerName}</h3>
          </div>
          <div className="shrink-0 sm:hidden">
              <ChevronDown size={20} className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180':''}`} />
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-4">
           <div className="text-xl font-black text-slate-800">{order.total} KR</div>
           <ChevronDown size={20} className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180':''}`} />
        </div>
      </div>

      {/* Expanderad Innehåll */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-6 pt-5 border-t border-slate-100 overflow-hidden flex flex-col gap-6"
          >
            {/* Kund info */}
            <div className="grid grid-cols-2 gap-4">
               <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Leverans</div>
                  <div className="text-sm font-bold text-slate-800 flex items-center gap-2">
                     {order.type === "DELIVERY" ? <Truck size={14} className="text-blue-500"/> : <Store size={14} className="text-blue-500"/>}
                     {order.type === "DELIVERY" ? "Hemkörning" : "Hämtas"}
                  </div>
               </div>
               <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                  <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Telefon</div>
                  <div className="text-sm font-bold text-slate-800">{order.customerPhone}</div>
               </div>
            </div>

            {order.type === "DELIVERY" && (
              <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex gap-3 items-center">
                 <MapPin className="text-blue-500" size={18} />
                 <div>
                   <div className="text-sm font-bold text-slate-800">{order.deliveryStreet}</div>
                   <div className="text-xs text-slate-500">{order.deliveryZip} {order.deliveryCity}</div>
                 </div>
              </div>
            )}

            {/* Mat Info */}
            <div className="space-y-2">
               <div className="text-[10px] items-center text-slate-500 uppercase font-bold px-2 flex justify-between">
                  <span>Artiklar</span>
                  <span>Totalt: {order.total} KR</span>
               </div>
               {order.items?.map((it:any) => (
                  <div key={it.id} className="bg-slate-50 border border-slate-100 p-3 rounded-xl flex justify-between">
                     <div>
                       <span className="font-black text-blue-600 mr-2">{it.quantity}x</span>
                       <span className="font-bold text-sm text-slate-800 uppercase">{getDisplayName(it)}</span>
                       {it.note && <div className="text-xs text-rose-500 mt-1 uppercase font-bold">Notering: {it.note}</div>}
                     </div>
                  </div>
               ))}
               {order.note && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm italic mt-2">
                    <span className="font-bold uppercase text-[10px] text-amber-700 block mb-1">Kundens Meddelande:</span>
                    <span className="text-amber-900 font-medium">"{order.note}"</span>
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
                        className="px-4 py-3 bg-white border border-slate-300 shadow-sm rounded-xl font-bold text-slate-600 text-[11px] uppercase w-1/3 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all flex items-center justify-center gap-1"
                      >
                        <XCircle size={14} /> Neka
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setAcceptDialog({ orderId: order.id, time: 20 }); }} 
                        className="w-2/3 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm uppercase shadow-md shadow-blue-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                      >
                        <CheckCircle size={16} /> Godkänn Order
                      </button>
                   </>
                 ) : order.status === "PREPARING" || order.status === "ACCEPTED" ? (
                   <button 
                      onClick={(e) => { e.stopPropagation(); updateStatus(order.id, order.type === "PICKUP" ? "READY" : "DELIVERING"); }}
                      className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold text-sm uppercase flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
                   >
                     Markera som {order.type === "PICKUP" ? "Klar" : "På väg"}
                   </button>
                 ) : null}
                 
                 <button onClick={(e) => { e.stopPropagation(); window.open(`/receipt?orderId=${order.id}`, "_blank"); }} className="px-4 py-3 bg-white border border-slate-200 shadow-sm hover:bg-slate-50 rounded-xl flex items-center justify-center w-1/4 transition-colors">
                    <Printer size={18} className="text-slate-600" />
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
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#0ea5e9', '#38bdf8'] });
      }
      await fetchData();
    } catch {
      alert("Kunde inte uppdatera");
    }
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

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-32 pt-4 px-2 sm:px-0">
      
      {/* Accept Dialog */}
      <AnimatePresence>
        {acceptDialog && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-6 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-white rounded-2xl p-6 sm:p-8 w-full max-w-sm text-center shadow-2xl">
               <h3 className="text-xl font-black uppercase text-slate-800 mb-6 tracking-tight">Hur lång tid tar det?</h3>
               <div className="grid grid-cols-3 gap-3 mb-8">
                 {[15, 20, 25, 30, 45, 60].map(t => (
                   <button key={t} onClick={() => setAcceptDialog({ ...acceptDialog, time: t })} className={`py-3 rounded-lg font-bold text-sm ${acceptDialog.time === t ? 'bg-blue-500 text-white ring-2 ring-blue-500 ring-offset-2' : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'}`}>
                     {t}
                   </button>
                 ))}
               </div>
               <div className="flex gap-3">
                 <button onClick={() => setAcceptDialog(null)} className="w-1/3 py-3.5 bg-white border border-slate-200 text-slate-500 rounded-lg font-bold text-xs uppercase hover:bg-slate-50">Avbryt</button>
                 <button onClick={() => updateStatus(acceptDialog.orderId, "PREPARING", acceptDialog.time)} className="w-2/3 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm uppercase shadow-md shadow-blue-500/20">OK {acceptDialog.time} min</button>
               </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between px-2">
        <h1 className="text-2xl font-black uppercase tracking-tight text-slate-800 flex items-center gap-3">
           {!selectedRestaurantId ? <Globe size={24} className="text-blue-500"/> : <Store size={24} className="text-blue-500"/>}
           Live Ordrar
        </h1>
        <button onClick={fetchData} className="p-2.5 bg-white shadow-sm border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-500 transition-colors">
          <RefreshCw size={18} className={loading?"animate-spin":""} />
        </button>
      </div>

      {loading && orders.length === 0 ? (
        <div className="py-20 text-center text-slate-400 uppercase font-bold tracking-widest text-xs flex flex-col items-center">
          <Loader2 className="animate-spin mb-4 text-blue-500" size={28}/>Hämtar ordrar...
        </div>
      ) : (
        <div className="space-y-12">
          {pendingOrders.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-[11px] font-black uppercase tracking-widest text-blue-600 px-2 flex items-center gap-2">
                 <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> Nya Ordrar!
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
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-500 px-2">Tillagas</h2>
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
              <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 px-2">Föregående</h2>
              <div className="space-y-3 opacity-70">
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
             <div className="py-16 bg-white border border-slate-200 shadow-sm rounded-2xl text-center text-slate-400 font-bold uppercase text-[11px] tracking-widest flex flex-col items-center">
               <Store size={32} className="text-slate-300 mb-3" />
               Inga ordrar hittades
             </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminOrdersPage;
