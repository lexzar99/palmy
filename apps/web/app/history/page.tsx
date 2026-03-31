"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { ShoppingBag, Clock, ChevronRight, Loader2, Hash } from "lucide-react";
import { motion } from "framer-motion";
import { API_URL } from "@/lib/api";

const ORDER_HISTORY_KEY = "palmyra_order_history_v2";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Väntar",
  ACCEPTED: "Bekräftad",
  PREPARING: "Tillagas",
  READY: "Klar",
  DELIVERED: "Levererad",
  DELIVERY_FAILED: "Leveransproblem",
  CANCELLED: "Avbokad",
  REJECTED: "Nekad",
};

export default function HistoryPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      const ids = JSON.parse(localStorage.getItem(ORDER_HISTORY_KEY) || "[]");
      if (ids.length === 0) {
        setLoading(false);
        return;
      }

      try {
        const promises = ids.map((id: string) => 
          axios.get(`${API_URL}/api/orders/${id}`).then(res => res.data).catch(() => null)
        );
        const results = await Promise.all(promises);
        setOrders(results.filter(o => o !== null));
      } catch (err) {
        console.error("Error fetching history:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  return (
    <div className="pt-32 pb-24 px-6 max-w-3xl mx-auto">
      <div className="mb-12">
        <h1 className="text-4xl md:text-6xl font-black tracking-tight mb-4 uppercase">
          Mina <span className="text-gold-500">Beställningar</span>
        </h1>
        <p className="text-white/40 font-medium">Här ser du dina senaste 10 beställningar.</p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="animate-spin text-gold-500" size={40} />
          <p className="text-white/20 uppercase font-black tracking-widest text-xs">Hämtar historik...</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-20 bg-white/5 rounded-[2.5rem] border border-white/5">
          <ShoppingBag size={48} className="mx-auto mb-6 text-white/10" />
          <h3 className="text-xl font-bold mb-2 uppercase">Inga beställningar hittades</h3>
          <p className="text-white/40 mb-8 max-w-xs mx-auto">Du har inte lagt några beställningar från den här webbläsaren ännu.</p>
          <Link href="/menu" className="inline-flex items-center gap-2 px-8 py-4 bg-gold-500 text-dark-500 font-black rounded-xl uppercase tracking-widest text-xs hover:bg-gold-400 transition-all">
            Beställ något gott →
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order, idx) => (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <Link href={`/order/${order.id}`}>
                <div className="group bg-white/5 border border-white/5 hover:border-gold-500/30 rounded-3xl p-6 transition-all flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center text-white/20 group-hover:bg-gold-500/10 group-hover:text-gold-500 transition-all">
                      <Hash size={24} />
                    </div>
                    <div>
                      <div className="font-black text-lg mb-0.5">ORDER #{order.orderNumber}</div>
                      <div className="flex items-center gap-3 text-xs font-bold text-white/40 uppercase tracking-widest">
                        <span>{new Date(order.createdAt).toLocaleDateString("sv-SE")}</span>
                        <span>•</span>
                        <span>{order.total} kr</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6 text-right">
                    <div className="hidden md:block">
                      <div className="text-[10px] text-white/20 uppercase font-black tracking-widest mb-1">Status</div>
                      <div className={`text-xs font-black uppercase tracking-widest ${
                        order.status === "PENDING" ? "text-yellow-400" : 
                        ["REJECTED", "CANCELLED", "DELIVERY_FAILED"].includes(order.status) ? "text-red-500" : "text-gold-500"
                      }`}>
                        {STATUS_LABELS[order.status] || order.status}
                      </div>
                    </div>
                    <ChevronRight size={20} className="text-white/10 group-hover:text-gold-500 group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
