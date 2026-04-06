"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Clock, Truck, Store, Loader2, Calendar, Phone, Hash, AlertCircle, Zap, ShieldCheck, ShoppingBag, Sparkles, MapPin, ArrowRight } from "lucide-react";
import { io as socketIO } from "socket.io-client";
import { API_URL, SOCKET_URL } from "@/lib/api";

const FlameIcon = ({ size = 24, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.3-2.35 1-3.5 1.1 2.6 2.2 3.5 3.5 3.5z" />
  </svg>
);

const BoxCheckIcon = ({ size = 24, className = "" }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="m16 16 2 2 4-4"/><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="m7.5 4.27 9 5.15"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" x2="12" y1="22" y2="12"/>
  </svg>
);

const STATUS_CONFIG: Record<string, { label: string; icon: any; colorClass: string; textClass: string; desc: string }> = {
  PENDING: {
    label: "Granskas",
    icon: Clock,
    colorClass: "bg-amber-500/10 border-amber-500/20 shadow-amber-500/5",
    textClass: "text-amber-500",
    desc: "Vi har tagit emot din beställning. Väntar på att köket ska bekräfta.",
  },
  ACCEPTED: {
    label: "Bekräftad!",
    icon: Check,
    colorClass: "bg-emerald-500/10 border-emerald-500/20 shadow-emerald-500/5",
    textClass: "text-emerald-500",
    desc: "Restaurangen har bekräftat din beställning. Nu börjar magin!",
  },
  PREPARING: {
    label: "Tillagas",
    icon: FlameIcon,
    colorClass: "bg-orange-500/10 border-orange-500/20 shadow-orange-500/5",
    textClass: "text-orange-500",
    desc: "Dina råvaror förvandlas till en fantastisk måltid just nu.",
  },
  READY: {
    label: "Redo!",
    icon: BoxCheckIcon,
    colorClass: "bg-gold-500/10 border-gold-500/20 shadow-gold-500/5",
    textClass: "text-gold-500",
    desc: "Klart! Din beställning är packad och redo att hämtas upp.",
  },
  DELIVERING: {
    label: "På väg!",
    icon: Truck,
    colorClass: "bg-sky-500/10 border-sky-500/20 shadow-sky-500/5",
    textClass: "text-sky-500",
    desc: "Utkörning pågår! Håll ett öga på dörren.",
  },
  DELIVERY_FAILED: {
    label: "Problem",
    icon: AlertCircle,
    colorClass: "bg-rose-500/10 border-rose-500/20 shadow-rose-500/5",
    textClass: "text-rose-500",
    desc: "Vi kunde inte slutföra leveransen. Restaurangen kontaktar dig snarast.",
  },
  REJECTED: {
    label: "Nekad",
    icon: AlertCircle,
    colorClass: "bg-rose-500/10 border-rose-500/20 shadow-rose-500/5",
    textClass: "text-rose-500",
    desc: "Tyvärr kunde vi inte ta emot din order. Du har ej debiterats.",
  },
  CANCELLED: {
    label: "Avbokad",
    icon: AlertCircle,
    colorClass: "bg-zinc-800/20 border-white/5",
    textClass: "text-zinc-600",
    desc: "Denna beställning har avbokats.",
  },
};

const PICKUP_STEPS = ["PENDING", "ACCEPTED", "PREPARING", "READY"];
const DELIVERY_STEPS = ["PENDING", "ACCEPTED", "PREPARING", "DELIVERING"];

const OrderStatusPage = () => {
  const { id } = useParams();
  const orderId = Array.isArray(id) ? id[0] : id;
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef<any>(null);

  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await axios.get(`${API_URL}/api/orders/${orderId}`);
      setOrder(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (!orderId) return;
    fetchOrder();
    const socket = socketIO(SOCKET_URL, { path: "/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("connect", () => { socket.emit("join:order", orderId); fetchOrder(); });
    socket.on("order:status", (data: any) => {
      if (data.orderId === orderId) {
        setOrder((prev: any) => prev ? { ...prev, status: data.status, estimatedTime: data.estimatedTime ?? prev.estimatedTime } : prev);
      }
    });

    const interval = setInterval(fetchOrder, 15000);
    return () => { clearInterval(interval); socket.disconnect(); };
  }, [orderId, fetchOrder]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center">
        <Loader2 className="animate-spin text-gold-500" size={40} />
      </div>
    );
  }

  if (!order) {
    return (
       <div className="min-h-screen bg-bg-primary flex flex-col items-center justify-center p-6 text-center">
          <AlertCircle size={48} className="text-rose-500 mb-6" />
          <h1 className="text-4xl font-black uppercase text-white italic">Order ej hittad</h1>
          <Link href="/" className="mt-10 px-10 py-5 bg-gold-500 text-zinc-950 rounded-[2rem] font-black uppercase tracking-widest text-[10px]">Till startsidan</Link>
       </div>
    );
  }

  const currentStatus = order.status === "DELIVERED" ? (order.type === "DELIVERY" ? "DELIVERING" : "READY") : order.status;
  const statusInfo = STATUS_CONFIG[currentStatus] ?? STATUS_CONFIG.PENDING;
  const StatusIcon = statusInfo.icon;
  const isRejected = currentStatus === "REJECTED" || currentStatus === "CANCELLED" || currentStatus === "DELIVERY_FAILED";
  const steps = order.type === "DELIVERY" ? DELIVERY_STEPS : PICKUP_STEPS;
  const currentIdx = steps.indexOf(currentStatus);

  return (
    <div className="min-h-screen bg-bg-primary bg-dot-pattern pt-24 pb-32 px-6">
      <div className="max-w-4xl mx-auto">
        
        {/* Dynamic Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-10 mb-16 px-4">
           <div>
              <div className="inline-flex items-center gap-3 px-3 py-1 rounded-full bg-gold-500/10 border border-gold-500/20 text-gold-500 text-[10px] font-black uppercase tracking-[0.3em] mb-4">
                 <Zap size={12} className="animate-pulse" /> Live Tracking
              </div>
              <h1 className="text-4xl md:text-6xl font-black text-white uppercase italic tracking-tighter leading-none mb-2">Order <span className="text-gold-gradient">#{order.orderNumber}</span></h1>
              <p className="text-zinc-600 text-[10px] font-black uppercase tracking-[0.4em]">Din beställning behandlas i realtid</p>
           </div>
           
           {order.estimatedTime && !isRejected && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="glass-panel p-6 rounded-[2.5rem] flex items-center gap-5 shadow-2xl relative group overflow-hidden">
                 <div className="absolute inset-0 bg-gold-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                 <div className="w-14 h-14 bg-gold-500 rounded-[1.8rem] flex items-center justify-center text-zinc-950 shadow-xl shadow-gold-500/20">
                    <Clock size={28} />
                 </div>
                 <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-1">Beräknad Väntetid</div>
                    <div className="text-2xl font-black text-white italic italic">{order.estimatedTime} MIN</div>
                 </div>
              </motion.div>
           )}
        </div>

        {/* Live Status Banner */}
        <motion.div key={currentStatus} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={`p-10 rounded-[3rem] border transition-all shadow-2xl mb-12 flex flex-col md:flex-row items-center gap-10 text-center md:text-left ${statusInfo.colorClass}`}>
           <div className={`w-20 h-20 rounded-[2.5rem] flex items-center justify-center shrink-0 border-[1px] shadow-inner ${statusInfo.textClass} bg-bg-primary/40 border-white/5`}>
              <StatusIcon size={40} className={currentStatus === 'PENDING' ? 'animate-pulse' : ''} />
           </div>
           <div className="flex-1">
              <h2 className={`text-3xl font-black uppercase italic tracking-tight mb-2 ${statusInfo.textClass}`}>{statusInfo.label}</h2>
              <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest leading-relaxed opacity-80">{statusInfo.desc}</p>
           </div>
           {currentStatus === 'PENDING' && (
              <div className="w-16 h-16 rounded-full border-4 border-amber-500/20 border-t-amber-500 animate-spin shrink-0 hidden md:block" />
           )}
        </motion.div>

        {/* Progress Bar */}
        {!isRejected && (
           <div className="mb-20 px-4">
              <div className="flex justify-between items-center mb-8">
                 {steps.map((step, idx) => {
                    const isDone = currentIdx >= idx;
                    const isActive = currentIdx === idx;
                    const info = STATUS_CONFIG[step];
                    return (
                       <div key={step} className="flex flex-col items-center gap-4 relative z-10">
                          <div className={`w-8 h-8 rounded-full border-2 transition-all duration-700 flex items-center justify-center ${isDone ? "bg-gold-500 border-gold-500 shadow-lg shadow-gold-500/20" : "bg-bg-primary border-white/5 text-zinc-900"}`}>
                             {isDone ? <Check size={14} className="text-zinc-950" strokeWidth={4} /> : <div className="w-1.5 h-1.5 rounded-full bg-current" />}
                          </div>
                          <span className={`text-[8px] font-black uppercase tracking-widest whitespace-nowrap ${isActive ? "text-gold-500" : isDone ? "text-white/40" : "text-zinc-900"}`}>{info.label.split(" ")[0]}</span>
                       </div>
                    );
                 })}
                 
                 {/* Progress line background */}
                 <div className="absolute left-6 right-6 h-px bg-white/5 z-0 mt-[-24px]" />
                 {/* Active progress line */}
                 <motion.div initial={{ width: 0 }} animate={{ width: `${(currentIdx / (steps.length - 1)) * 100}%` }} transition={{ duration: 1, ease: "circOut" }} className="absolute left-6 h-1 bg-gold-500/40 z-0 mt-[-24px] rounded-full shadow-[0_0_15px_rgba(231,178,75,0.4)]" style={{ width: `calc(${ (currentIdx / (steps.length - 1)) * 100 }% - 12px)` }} />
              </div>
           </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
           {/* Detailed Receipt */}
           <div className="lg:col-span-7 glass-panel p-10 rounded-[3.5rem] shadow-2xl relative overflow-hidden">
              <div className="absolute top-[-100px] left-[-100px] w-[300px] h-[300px] bg-white/3 rounded-full blur-[100px]" />
              <div className="flex items-center justify-between mb-12 relative z-10">
                 <h2 className="text-2xl font-black uppercase italic tracking-tight text-white leading-none">Beställningsdetaljer</h2>
                 <ShoppingBag size={24} className="text-gold-500/30" />
              </div>
              
              <div className="space-y-6 mb-12 relative z-10">
                 {order.items.map((item: any) => (
                    <div key={item.id} className="flex justify-between items-start gap-10 group">
                       <div className="flex-1">
                          <div className="flex items-center gap-4 mb-1">
                             <span className="text-xs font-black text-gold-500 bg-gold-500/5 px-2 py-0.5 rounded-md border border-gold-500/10">{item.quantity}x</span>
                             <h3 className="font-black text-white uppercase italic text-sm tracking-tight">{item.productName}</h3>
                          </div>
                          {item.selectedExtras && Array.isArray(item.selectedExtras) && item.selectedExtras.length > 0 && (
                             <div className="flex flex-col gap-1 mt-2 pl-12 group-hover:pl-14 transition-all">
                                {item.selectedExtras.map((e: any, idx: number) => (
                                   <span key={idx} className="text-[11px] font-bold uppercase text-zinc-500">{e.extraName || e.name}</span>
                                ))}
                             </div>
                          )}
                          {item.note && <p className="text-[10px] text-amber-500/60 font-black uppercase tracking-widest mt-2 italic px-3 border-l-[1px] border-amber-500/30">Obs: {item.note}</p>}
                       </div>
                       <div className="text-sm font-black italic text-zinc-600 group-hover:text-gold-500 transition-colors">{item.subtotal} KR</div>
                    </div>
                 ))}
              </div>

              <div className="border-t border-white/5 pt-10 space-y-4 relative z-10">
                 <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-zinc-700"><span>Delsumma</span><span>{(order.total - order.deliveryFee).toFixed(0)} KR</span></div>
                 {order.deliveryFee > 0 && <div className="flex justify-between text-[11px] font-black uppercase tracking-widest text-zinc-700"><span>Leveransavgift</span><span className="text-gold-500">+{order.deliveryFee.toFixed(0)} KR</span></div>}
                 <div className="flex justify-between items-end mt-10 pt-4 border-t border-white/5">
                    <span className="text-2xl font-black text-white italic uppercase tracking-tighter leading-none">SUMMA</span>
                    <span className="text-4xl font-black italic tracking-tighter text-gold-500">{order.total.toFixed(0)} <span className="text-[10px] opacity-40 not-italic uppercase tracking-widest">SEK</span></span>
                 </div>
              </div>
           </div>

           {/* Info sidebar */}
           <div className="lg:col-span-5 space-y-6">
              <div className="glass-panel p-10 rounded-[3rem] shadow-2xl relative overflow-hidden group">
                 <div className="absolute inset-0 bg-gradient-to-br from-gold-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                 <h2 className="text-xl font-black uppercase italic tracking-tight text-white mb-10 flex items-center justify-between">
                    Hantering
                    {order.type === "DELIVERY" ? <Truck size={22} className="text-gold-500" /> : <Store size={22} className="text-gold-500" />}
                 </h2>
                 
                 <div className="space-y-8">
                    <div className="flex items-start gap-5">
                       <Phone className="text-gold-500/30 mt-1" size={20} />
                       <div>
                          <div className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-800 mb-1">Ditt Nummer</div>
                          <div className="text-base font-black text-white tracking-widest italic">{order.customerPhone}</div>
                       </div>
                    </div>
                    
                    <div className="flex items-start gap-5">
                       <Store className="text-gold-500/30 mt-1" size={20} />
                       <div>
                          <div className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-800 mb-1">Restaurang</div>
                          <div className="text-base font-black text-white italic uppercase">{order.restaurantName}</div>
                          {order.restaurantPhone && <div className="text-[10px] font-black text-gold-500/60 mt-1">{order.restaurantPhone}</div>}
                       </div>
                    </div>

                    {order.type === 'DELIVERY' ? (
                       order.deliveryStreet && (
                          <div className="flex items-start gap-5">
                             <MapPin className="text-sky-500/30 mt-1" size={20} />
                             <div>
                                <div className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-800 mb-1">Leveransadress</div>
                                <div className="text-sm font-black text-white uppercase italic leading-tight">{order.deliveryStreet}</div>
                                <div className="text-[11px] font-black text-zinc-700 uppercase tracking-widest mt-1">{order.restaurantCity || "LUND"}</div>
                             </div>
                          </div>
                       )
                    ) : (
                       order.restaurantAddress && (
                          <div className="flex items-start gap-5">
                             <MapPin className="text-emerald-500/30 mt-1" size={20} />
                             <div>
                                <div className="text-[9px] font-black uppercase tracking-[0.3em] text-emerald-800 mb-1">Hämta Hos</div>
                                <div className="text-sm font-black text-white uppercase italic leading-tight">{order.restaurantAddress}</div>
                                <div className="text-[11px] font-black text-zinc-700 uppercase tracking-widest mt-1">{order.restaurantZip} {order.restaurantCity}</div>
                              </div>
                          </div>
                       )
                    )}

                    <div className="flex items-start gap-5">
                       <Calendar className="text-zinc-800 mt-1" size={20} />
                       <div>
                          <div className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-800 mb-1">Beställningstjänst</div>
                          <div className="text-[11px] font-black text-white uppercase tracking-widest">{new Date(order.createdAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })} idag</div>
                       </div>
                    </div>
                 </div>
              </div>

              <div className="glass-panel p-10 rounded-[3rem] border-emerald-500/5 shadow-2xl text-center group active:scale-95 transition-all cursor-default">
                 <div className="w-16 h-16 bg-emerald-500/10 rounded-[2rem] border border-emerald-500/20 flex items-center justify-center mx-auto mb-6 text-emerald-500 shadow-xl shadow-emerald-500/5 group-hover:scale-110 transition-transform">
                    <ShieldCheck size={32} />
                 </div>
                 <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white italic mb-2">Tack för förtroendet</h3>
                 <p className="text-zinc-600 text-[10px] font-bold uppercase tracking-widest">Spara ordernumret #{order.orderNumber} för referens vid kontakt.</p>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default OrderStatusPage;
