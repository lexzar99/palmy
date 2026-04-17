"use client";

import { useEffect, useState, useMemo } from "react";
import axios from "axios";
import {
  Calculator, Download, Loader2, Search, Calendar,
  ShoppingCart, RefreshCw, ChevronDown, ChevronRight,
  ArrowDownUp, RotateCcw, CheckCircle, XCircle, Clock,
  Wallet, FileText, Store, CalendarDays, Truck,
} from "lucide-react";
import { motion } from "framer-motion";
import { API_URL } from "@/lib/api";
import { useToast } from "@/components/Toast";

const kr = (n: number) => n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kr";

const todayStr = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10);
};
const startOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const startOfLastMonth = () => {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10);
};
const endOfLastMonth = () => {
  const d = new Date(); d.setDate(0); return d.toISOString().slice(0, 10);
};

const PERIODS = [
  { label: "This month", from: startOfMonth(), to: todayStr() },
  { label: "Last month", from: startOfLastMonth(), to: endOfLastMonth() },
  { label: "Last 7 days", from: daysAgo(7), to: todayStr() },
  { label: "Last 30 days", from: daysAgo(30), to: todayStr() },
  { label: "Last 90 days", from: daysAgo(90), to: todayStr() },
];

interface Order {
  id: string;
  orderNumber: string;
  createdAt: string;
  totalAmount: number;
  status: string;
  customerName: string;
  paymentMethod: string;
  isRefunded: boolean;
  refundedAt?: string;
}

interface RestaurantOrders {
  restaurant: any;
  orders: Order[];
}

export default function OrderStatementsPage() {
  const { success, error: toastError } = useToast();
  const [restaurantOrders, setRestaurantOrders] = useState<Record<string, RestaurantOrders>>({});
  const [loading, setLoading] = useState(false);
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState(0);
  const [customFrom, setCustomFrom] = useState(daysAgo(30));
  const [customTo, setCustomTo] = useState(todayStr());
  const [useCustom, setUseCustom] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRestaurant, setSelectedRestaurant] = useState<string | null>(null);
  const [expandedRestaurant, setExpandedRestaurant] = useState<string | null>(null);
  
  const period = useCustom ? { from: customFrom, to: customTo } : PERIODS[selectedPeriodIndex];
  const token = () => localStorage.getItem("matgo_token") || "";

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("matgo_token") || "";
      const res = await axios.get(`${API_URL}/api/admin/orders?limit=500`, {
        params: { from: period.from, to: period.to },
        headers: { Authorization: `Bearer ${token}` },
      });
      
      const allOrders: Order[] = (res.data.orders || res.data || []).map((o: any) => ({
        id: o.id,
        orderNumber: o.orderNumber || o.id?.slice(-6) || "N/A",
        createdAt: o.createdAt || o.created_at || new Date().toISOString(),
        totalAmount: o.totalAmount || o.total || 0,
        status: o.status || "COMPLETED",
        customerName: o.customerName || o.customer?.name || "Guest",
        paymentMethod: o.paymentMethod || o.payment_method || "CARD",
        isRefunded: o.isRefunded || o.refunded || false,
        refundedAt: o.refundedAt || o.refunded_at,
        restaurantId: o.restaurantId || o.restaurant_id,
        restaurantName: o.restaurantName || o.restaurant?.name || "Unknown",
      }));

      const map: Record<string, RestaurantOrders> = {};
      allOrders.forEach((o) => {
        const rId = o.restaurantId || "unknown";
        if (!map[rId]) {
          map[rId] = {
            restaurant: { id: rId, name: o.restaurantName },
            orders: []
          };
        }
        map[rId].orders.push(o);
      });
      setRestaurantOrders(map);
    } catch {
      toastError("Could not load orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [period.from, period.to]);

  const filteredRestaurants = useMemo(() => {
    const data = Object.values(restaurantOrders);
    if (!searchTerm) return data;
    return data.filter((ro) => 
      ro.restaurant.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [restaurantOrders, searchTerm]);

  const selectedData = selectedRestaurant ? restaurantOrders[selectedRestaurant] : null;

  const totals = useMemo(() => {
    let totalRevenue = 0;
    let totalRefunded = 0;
    let totalOrders = 0;
    let refundedCount = 0;
    filteredRestaurants.forEach((ro) => {
      ro.orders.forEach((o) => {
        totalOrders++;
        totalRevenue += o.totalAmount;
        if (o.isRefunded) {
          totalRefunded += o.totalAmount;
          refundedCount++;
        }
      });
    });
    return { totalRevenue, totalRefunded, totalOrders, refundedCount, netAmount: totalRevenue - totalRefunded };
  }, [filteredRestaurants]);

  const restaurantStats = useMemo(() => {
    if (!selectedData) return null;
    const stats = { totalRevenue: 0, totalRefunded: 0, totalOrders: 0, refundedCount: 0 };
    selectedData.orders.forEach((o) => {
      stats.totalOrders++;
      stats.totalRevenue += o.totalAmount;
      if (o.isRefunded) {
        stats.totalRefunded += o.totalAmount;
        stats.refundedCount++;
      }
    });
    stats.netAmount = stats.totalRevenue - stats.totalRefunded;
    return stats;
  }, [selectedData]);

  const statusBadge = (order: Order) => {
    if (order.isRefunded) {
      return <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase bg-red-500/10 text-red-400">
        <RotateCcw size={10} /> Refunded
      </span>;
    }
    if (order.status === "DELIVERED") {
      return <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase bg-emerald-500/10 text-emerald-400">
        <CheckCircle size={10} /> Delivered
      </span>;
    }
    if (order.status === "DELIVERING") {
      return <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase bg-sky-500/10 text-sky-400">
        <Truck size={10} /> On the way
      </span>;
    }
    if (order.status === "READY") {
      return <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase bg-blue-500/10 text-blue-400">
        <ShoppingCart size={10} /> Ready
      </span>;
    }
    if (order.status === "PENDING" || order.status === "ACCEPTED" || order.status === "PREPARING") {
      return <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase bg-amber-500/10 text-amber-400">
        <Clock size={10} /> Processing
      </span>;
    }
    if (order.status === "CANCELLED" || order.status === "REJECTED") {
      return <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase bg-red-500/10 text-red-400">
        <XCircle size={10} /> Cancelled
      </span>;
    }
    return <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[8px] font-black uppercase bg-gray-500/10 text-gray-400">
      {order.status}
    </span>;
  };

  return (
    <div className="space-y-5 pb-24">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-[var(--text-primary)] flex items-center gap-3">
            <FileText size={22} className="text-gold-500" /> Order Statements
          </h1>
          <p className="text-[var(--text-secondary)] text-[9px] font-bold uppercase tracking-widest mt-0.5">
            Bank-like statement per restaurant with orders and refunds
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchOrders} disabled={loading}
            className="w-9 h-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Calendar size={14} className="text-[var(--text-secondary)]" />
        <div className="flex flex-wrap gap-1 p-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl">
          {PERIODS.map((p, i) => (
            <button key={p.label} onClick={() => { setSelectedPeriodIndex(i); setUseCustom(false); }}
              className={"px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all " + (!useCustom && selectedPeriodIndex === i ? "bg-gold-500 text-[#0d0d0d]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]")}>
              {p.label}
            </button>
          ))}
          <button onClick={() => setUseCustom(true)}
            className={"px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all " + (useCustom ? "bg-gold-500 text-[#0d0d0d]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]")}>
            Custom
          </button>
        </div>
        {useCustom && (
          <>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
              className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[10px] font-bold outline-none focus:border-gold-500/30" />
            <span className="text-[var(--text-secondary)] text-xs">-</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
              className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[10px] font-bold outline-none focus:border-gold-500/30" />
          </>
        )}
        <span className="text-[9px] font-black text-[var(--text-secondary)]">
          {period.from} to {period.to}
        </span>
      </div>

      <div className="relative flex-1">
        <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
        <input 
          value={searchTerm} 
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search restaurant..."
          className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl pl-9 pr-4 py-2.5 text-[11px] font-bold outline-none focus:border-gold-500/30 transition-all"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Revenue", value: kr(totals.totalRevenue), icon: Wallet, color: "text-[var(--text-primary)]", highlight: false },
          { label: "Refunded", value: kr(totals.totalRefunded), icon: RotateCcw, color: "text-red-400", highlight: false },
          { label: "Orders", value: totals.totalOrders.toString(), icon: ShoppingCart, color: "text-blue-400", highlight: false },
          { label: "Net Amount", value: kr(totals.netAmount), icon: ArrowDownUp, color: "text-emerald-400", highlight: true },
        ].map((kpi) => (
          <div key={kpi.label} 
            className={"p-4 rounded-2xl border transition-all " + (kpi.highlight ? "bg-emerald-500/10 border-emerald-500/30" : "bg-[var(--bg-secondary)] border-[var(--border-subtle)]")}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[8px] font-black uppercase tracking-widest text-[var(--text-secondary)]">{kpi.label}</span>
              <kpi.icon size={12} className={kpi.color} />
            </div>
            <p className={"text-lg font-black " + kpi.color}>{kpi.value}</p>
            {kpi.label === "Refunded" && totals.refundedCount > 0 && (
              <p className="text-[8px] text-red-400 mt-1">{totals.refundedCount} orders refunded</p>
            )}
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3">
          <Loader2 className="animate-spin text-gold-500" size={24} />
          <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Loading...</span>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRestaurants.map((ro) => {
            const stats = {
              totalRevenue: ro.orders.reduce((s, o) => s + o.totalAmount, 0),
              totalRefunded: ro.orders.filter(o => o.isRefunded).reduce((s, o) => s + o.totalAmount, 0),
              totalOrders: ro.orders.length,
              refundedCount: ro.orders.filter(o => o.isRefunded).length,
            };
            stats.netAmount = stats.totalRevenue - stats.totalRefunded;
            const isExpanded = expandedRestaurant === ro.restaurant.id;
            const isSelected = selectedRestaurant === ro.restaurant.id;

            return (
              <div key={ro.restaurant.id} className="rounded-2xl border border-[var(--border-subtle)] overflow-hidden">
                <button 
                  onClick={() => {
                    setSelectedRestaurant(ro.restaurant.id);
                    setExpandedRestaurant(isExpanded ? null : ro.restaurant.id);
                  }}
                  className="w-full flex items-center justify-between p-4 hover:bg-[var(--bg-secondary)] transition-colors">
                  <div className="flex items-center gap-3">
                    <Store size={16} className="text-[var(--text-secondary)]" />
                    <div className="text-left">
                      <p className="font-black text-[var(--text-primary)] text-[11px]">{ro.restaurant.name}</p>
                      <p className="text-[8px] text-[var(--text-secondary)]">{ro.orders.length} orders</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-[10px] font-black text-[var(--text-primary)]">{kr(stats.totalRevenue)}</p>
                      <p className="text-[8px] text-red-400">-{kr(stats.totalRefunded)}</p>
                    </div>
                    <ChevronRight size={16} className={`text-[var(--text-secondary)] transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                  </div>
                </button>

                {isExpanded && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                    className="border-t border-[var(--border-subtle)]">
                    <div className="p-4 bg-[var(--bg-primary)]">
                      <div className="grid grid-cols-4 gap-3 mb-4">
                        <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
                          <p className="text-[8px] font-black uppercase text-[var(--text-secondary)]">Total</p>
                          <p className="text-sm font-black text-[var(--text-primary)]">{kr(stats.totalRevenue)}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20">
                          <p className="text-[8px] font-black uppercase text-red-400">Refunded</p>
                          <p className="text-sm font-black text-red-400">-{kr(stats.totalRefunded)}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
                          <p className="text-[8px] font-black uppercase text-[var(--text-secondary)]">Orders</p>
                          <p className="text-sm font-black text-blue-400">{stats.totalOrders}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                          <p className="text-[8px] font-black uppercase text-emerald-400">Net</p>
                          <p className="text-sm font-black text-emerald-400">{kr(stats.netAmount)}</p>
                        </div>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
                        <table className="w-full text-[9px] font-bold">
                          <thead>
                            <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
                              <th className="px-3 py-2 text-left text-[8px] font-black uppercase text-[var(--text-secondary)]">Order #</th>
                              <th className="px-3 py-2 text-left text-[8px] font-black uppercase text-[var(--text-secondary)]">Date/Time</th>
                              <th className="px-3 py-2 text-left text-[8px] font-black uppercase text-[var(--text-secondary)]">Customer</th>
                              <th className="px-3 py-2 text-right text-[8px] font-black uppercase text-[var(--text-secondary)]">Amount</th>
                              <th className="px-3 py-2 text-center text-[8px] font-black uppercase text-[var(--text-secondary)]">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ro.orders.slice(0, 50).map((o) => (
                              <tr key={o.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-secondary)]">
                                <td className="px-3 py-2 font-black text-gold-500">{o.orderNumber}</td>
                                <td className="px-3 py-2 text-[var(--text-secondary)]">
                                  {new Date(o.createdAt).toLocaleString("sv-SE")}
                                </td>
                                <td className="px-3 py-2 text-[var(--text-secondary)]">{o.customerName}</td>
                                <td className="px-3 py-2 text-right font-black text-[var(--text-primary)]">
                                  {o.isRefunded ? <span className="line-through text-red-400">{kr(o.totalAmount)}</span> : kr(o.totalAmount)}
                                </td>
                                <td className="px-3 py-2 text-center">{statusBadge(o)}</td>
                              </tr>
                            ))}
                            {ro.orders.length > 50 && (
                              <tr>
                                <td colSpan={5} className="px-3 py-2 text-center text-[8px] text-[var(--text-secondary)]">
                                  ... and {ro.orders.length - 50} more orders
                                </td>
                              </tr>
                            )}
                            <tr className="bg-gold-500/5 border-t-2 border-gold-500/20">
                              <td colSpan={3} className="px-3 py-2 font-black uppercase">TOTAL</td>
                              <td className="px-3 py-2 text-right font-black">{kr(stats.totalRevenue)}</td>
                              <td></td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}