/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
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
  Zap,
  ArrowRight,
  Trash2,
  CheckCircle2,
  XCircle,
  Filter,
  Search,
  Eye,
  Package,
  TrendingUp,
  Download,
  Bell,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { io as socketIO } from "socket.io-client";
import confetti from "canvas-confetti";
import { API_URL, SOCKET_URL } from "@/lib/api";
import { useRestaurantStore } from "@/store/restaurantStore";
import { Modal, ConfirmModal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Ny order",
  ACCEPTED: "Bekräftad",
  PREPARING: "Tillagas",
  READY: "Klar",
  DELIVERING: "På väg",
  DELIVERED: "Levererad",
  DELIVERY_FAILED: "Ej levererad",
  CANCELLED: "Avbokad",
  REJECTED: "Nekad",
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  ACCEPTED: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  PREPARING: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  READY: "bg-emerald-400/10 text-emerald-300 border-emerald-400/20",
  DELIVERING: "bg-sky-500/10 text-sky-400 border-sky-500/20",
  DELIVERED: "bg-[var(--border-subtle)] text-[var(--text-secondary)] border-[var(--border-subtle)]",
  DELIVERY_FAILED: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  CANCELLED: "bg-rose-500/10 text-rose-400 border-rose-500/20",
  REJECTED: "bg-rose-500/10 text-rose-400 border-rose-500/20",
};

const formatOrderNumber = (num: any) => {
  const n = String(num).replace("PX-", "");
  const prefix = String.fromCharCode(65 + (parseInt(n) % 26));
  return `${prefix}${n}`;
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
  restaurantName?: string;
  restaurantId?: string;
  items: any[];
  paymentMethod?: string;
  stripePaymentIntentId?: string;
  refundedAmount?: number;
  refundedAt?: string;
  refundReason?: string;
}

// ─── Order Card ─────────────────────────────────────────────────────────────
const OrderCard = ({
  order,
  expanded,
  onToggle,
  onAccept,
  onStatus,
  onEdit,
  onDeleteTest,
  onRefund,
}: {
  order: Order;
  expanded: boolean;
  onToggle: () => void;
  onAccept: () => void;
  onStatus: (s: string) => void;
  onEdit: () => void;
  onDeleteTest: () => void;
  onRefund: () => void;
}) => {
  const isTest =
    order.stripePaymentIntentId === "TEST_PAYMENT" ||
    order.stripePaymentIntentId === "BOT_ORDER";
  const isActive = ["ACCEPTED", "PREPARING", "READY"].includes(order.status);
  const isPending = order.status === "PENDING";
  const isDelivery = order.type === "DELIVERY";

  return (
    <motion.div
      layout
      className={`rounded-2xl overflow-hidden border transition-all ${
        isPending
          ? "border-amber-500/40 shadow-lg shadow-amber-500/5"
          : isActive
          ? "border-emerald-500/30 shadow-lg shadow-emerald-500/5"
          : "border-[var(--border-subtle)]"
      }`}
      style={{ background: "var(--bg-secondary)" }}
    >
      {isTest && (
        <div className="w-full bg-rose-500 text-white text-[8px] font-black uppercase py-1.5 tracking-[0.25em] text-center">
          Bot / Test Order
        </div>
      )}

      {/* Header row */}
      <div
        onClick={onToggle}
        className="p-4 flex items-center gap-4 cursor-pointer hover:bg-white/2 transition-colors"
      >
        {/* Order number badge */}
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
            isPending
              ? "bg-amber-500 text-[#0d0d0d]"
              : isActive
              ? "bg-emerald-500 text-white"
              : "bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
          }`}
        >
          {formatOrderNumber(order.orderNumber)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-black text-sm uppercase text-[var(--text-primary)] truncate">
              {order.customerName}
            </span>
            {order.restaurantName && (
              <span className="px-1.5 py-0.5 rounded bg-gold-500/10 text-gold-500 text-[8px] font-black uppercase">
                {order.restaurantName}
              </span>
            )}
            <span
              className={`px-1.5 py-0.5 rounded border text-[8px] font-black uppercase ${
                isDelivery
                  ? "bg-sky-500/8 text-sky-400 border-sky-500/20"
                  : "bg-emerald-500/8 text-emerald-400 border-emerald-500/20"
              }`}
            >
              {isDelivery ? "Utkörning" : "Avhämtning"}
            </span>
            <span
              className={`px-1.5 py-0.5 rounded border text-[8px] font-black uppercase ${STATUS_COLORS[order.status] || ""}`}
            >
              {STATUS_LABELS[order.status] || order.status}
            </span>
            {order.refundedAt && (
              <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white text-[8px] font-black uppercase border border-rose-500/20 shadow-lg shadow-rose-500/20">
                Återbetald {Math.round(order.refundedAmount! / 100)} kr
              </span>
            )}
          </div>
          <div className="text-[10px] text-[var(--text-secondary)] font-bold mt-0.5">
            {new Date(order.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · {order.items?.length || 0} rätter
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-base font-black text-[var(--text-primary)]">
            {Math.round(order.total / 100)} kr
          </span>
          <ChevronDown
            size={16}
            className={`text-[var(--text-secondary)] transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </div>
      </div>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-5 space-y-4 border-t border-[var(--border-subtle)] pt-4">
              {/* Address / type panel */}
              {isDelivery ? (
                <div className="bg-sky-500/8 border border-sky-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-sky-400 text-[9px] font-black uppercase tracking-widest mb-2">
                    <MapPin size={12} /> Leveransadress
                  </div>
                  <p className="text-sm font-black text-[var(--text-primary)] uppercase">
                    {order.deliveryStreet || "Adress saknas"}
                  </p>
                  <p className="text-[10px] text-[var(--text-secondary)] mt-0.5">
                    {order.deliveryZip} {order.deliveryCity}
                  </p>
                </div>
              ) : (
                <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-emerald-400 text-[9px] font-black uppercase tracking-widest mb-1">
                    <Store size={12} /> Avhämtning
                  </div>
                  <p className="text-sm font-black text-[var(--text-primary)] uppercase">
                    Kunden hämtar på restaurangen
                  </p>
                </div>
              )}

              {/* Customer contact */}
              <div className="flex items-center justify-between p-4 bg-[var(--bg-primary)] rounded-xl border border-[var(--border-subtle)]">
                <div>
                  <div className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1">
                    Kundtelefon
                  </div>
                  <div className="text-sm font-black tracking-widest text-[var(--text-primary)]">
                    {order.customerPhone}
                  </div>
                </div>
                <a
                  href={`tel:${order.customerPhone}`}
                  className="w-10 h-10 rounded-xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center text-gold-500 hover:bg-gold-500/20 transition-colors"
                >
                  <Phone size={16} />
                </a>
              </div>

              {/* Note */}
              {order.note && (
                <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                  <div className="text-[9px] font-black uppercase tracking-widest text-amber-400 mb-1.5">
                    Kundmeddelande
                  </div>
                  <p className="text-sm font-bold text-[var(--text-primary)] italic leading-relaxed">
                    {order.note}
                  </p>
                </div>
              )}

              {/* Items */}
              <div className="space-y-2">
                {order.items?.map((item: any, idx: number) => {
                  const extras =
                    typeof item.selectedExtras === "string"
                      ? JSON.parse(item.selectedExtras || "[]")
                      : item.selectedExtras || [];
                  return (
                    <div
                      key={idx}
                      className="flex items-start gap-3 p-3 bg-[var(--bg-primary)] rounded-xl border border-[var(--border-subtle)]"
                    >
                      <span className="text-gold-500 font-black text-sm w-6 shrink-0">
                        {item.quantity}×
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-black uppercase text-[var(--text-primary)]">
                          {item.productName}
                        </p>
                        {extras.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {extras.map((ex: any, i: number) => (
                              <span
                                key={i}
                                className="text-[9px] font-bold text-[var(--text-secondary)] bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded"
                              >
                                {ex.extraName || ex.name}
                              </span>
                            ))}
                          </div>
                        )}
                        {item.note && (
                          <p className="text-[9px] text-rose-400 font-black uppercase mt-1">
                            {item.note}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] font-black text-[var(--text-secondary)] shrink-0">
                        {Math.round(item.subtotal / 100)} kr
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Total */}
              <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)]">
                <span className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]">
                  Totalt
                </span>
                <span className="text-lg font-black text-gold-500">
                  {Math.round(order.total / 100)} kr
                </span>
              </div>

              {/* Action buttons */}
              <div className="space-y-2 pt-1">
                {order.status === "PENDING" && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => onStatus("REJECTED")}
                      className="py-3 rounded-xl bg-[var(--bg-primary)] border border-rose-500/20 text-rose-400 text-[10px] font-black uppercase tracking-wider hover:bg-rose-500/10 transition-all"
                    >
                      <XCircle size={14} className="inline mr-1.5" />
                      Neka
                    </button>
                    <button
                      onClick={onAccept}
                      className="py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-[10px] font-black uppercase tracking-wider transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
                    >
                      <CheckCircle2 size={14} className="inline mr-1.5" />
                      Godkänn
                    </button>
                  </div>
                )}
                {["ACCEPTED", "PREPARING", "READY"].includes(order.status) && (
                  <button
                    onClick={() =>
                      onStatus(
                        order.type === "PICKUP" ? "DELIVERED" : "DELIVERING"
                      )
                    }
                    className="w-full py-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-[10px] font-black uppercase tracking-wider transition-all shadow-lg shadow-sky-500/20 active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Zap size={14} />
                    Markera som{" "}
                    {order.type === "PICKUP" ? "klar" : "på väg"}
                  </button>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      window.open(`/receipt?orderId=${order.id}`, "_blank")
                    }
                    className="flex-1 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[9px] font-black uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-gold-500/20 transition-all flex items-center justify-center gap-1.5"
                  >
                    <Printer size={13} /> Kvitto
                  </button>
                  <button
                    onClick={onEdit}
                    className="flex-1 py-2.5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[9px] font-black uppercase tracking-wider text-[var(--text-secondary)] hover:text-gold-500 hover:border-gold-500/20 transition-all flex items-center justify-center gap-1.5"
                  >
                    <Edit2 size={13} /> Redigera
                  </button>
                  {order.stripePaymentIntentId && 
                   order.stripePaymentIntentId !== "TEST_PAYMENT" && 
                   order.stripePaymentIntentId !== "BOT_ORDER" && 
                   !order.refundedAt && (
                    <button
                      onClick={onRefund}
                      className="flex-1 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[9px] font-black uppercase tracking-wider text-rose-400 hover:bg-rose-500/20 transition-all flex items-center justify-center gap-1.5"
                    >
                      <RotateCcw size={13} /> Återbetala
                    </button>
                  )}
                  {isTest && (
                    <button
                      onClick={onDeleteTest}
                      className="py-2.5 px-4 rounded-xl bg-rose-500/8 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-all"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ─── Refund Modal Content ──────────────────────────────────────────────────
const RefundModalContent = ({ order, onConfirm, onClose }: { order: Order; onConfirm: (amt: number, reason: string) => void; onClose: () => void }) => {
  const [amount, setAmount] = useState(order.total / 100);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="space-y-6">
      <div className="p-4 bg-rose-500/5 rounded-2xl border border-rose-500/20">
        <div className="flex items-center gap-3 mb-2">
           <ShieldCheck size={18} className="text-rose-400" />
           <span className="text-[10px] font-black uppercase tracking-widest text-rose-400">Säkerhetskontroll</span>
        </div>
        <p className="text-[11px] text-[var(--text-secondary)] font-medium leading-relaxed">
          Du håller på att återbetala pengar till kunden via Stripe. Denna handling kan inte ångras och dras direkt från restaurangens saldo.
        </p>
      </div>

      <div className="space-y-4">
        <div>
           <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-2">Belopp (SEK)</label>
           <div className="relative">
              <input 
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-lg font-black outline-none focus:border-rose-500/30 transition-all text-[var(--text-primary)]"
              />
              <button 
                onClick={() => setAmount(order.total / 100)}
                className="absolute right-3 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-400 text-[9px] font-black uppercase border border-rose-500/20 hover:bg-rose-500/20 transition-all"
              >
                Max ({Math.round(order.total / 100)} kr)
              </button>
           </div>
        </div>

        <div>
           <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-2">Anledning</label>
           <input 
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="T.ex. Slutsåld vara, kund ångrade sig..."
            className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-rose-500/30 transition-all text-[var(--text-primary)]"
           />
        </div>
      </div>

      <div className="space-y-4 pt-2">
         <button 
           onClick={() => setConfirmed(!confirmed)}
           className={`w-full flex items-center gap-3 p-4 rounded-2xl border transition-all ${
             confirmed 
               ? "bg-rose-500/10 border-rose-500/40 text-rose-400" 
               : "bg-[var(--bg-primary)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-rose-500/20"
           }`}
         >
           <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
             confirmed ? "bg-rose-500 border-rose-500" : "border-[var(--border-subtle)]"
           }`}>
             {confirmed && <CheckCircle2 size={12} className="text-white" />}
           </div>
           <span className="text-[10px] font-black uppercase tracking-widest">
             Jag bekräftar {amount === order.total/100 ? "full" : "partiell"} återbetalning på {amount} kr
           </span>
         </button>

         <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:text-[var(--text-primary)] transition-all"
            >
              Avbryt
            </button>
            <button 
              disabled={!confirmed || amount <= 0 || amount > (order.total/100 + 0.01)}
              onClick={() => onConfirm(amount, reason)}
              className={`flex-2 py-3.5 px-8 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${
                confirmed 
                  ? "bg-rose-500 text-white shadow-lg shadow-rose-500/20 active:scale-95" 
                  : "bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-subtle)] opacity-50 cursor-not-allowed"
              }`}
            >
              Utför återbetalning
            </button>
         </div>
      </div>
    </div>
  );
};

// ─── Main Component ─────────────────────────────────────────────────────────
interface OrdersManagerProps {
  initialFilter?: "all" | "PENDING" | "preparing" | "ready" | "done";
  title?: string;
}

const OrdersManager = ({ initialFilter = "all", title }: OrdersManagerProps) => {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [acceptDialog, setAcceptDialog] = useState<{ orderId: string; time: number } | null>(null);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [deleteTestOrder, setDeleteTestOrder] = useState<Order | null>(null);
  const [refundOrder, setRefundOrder] = useState<Order | null>(null);
  const [filter, setFilter] = useState<"all" | "PENDING" | "preparing" | "ready" | "done">(initialFilter);
  const [search, setSearch] = useState("");
  const [isMounted, setIsMounted] = useState(false);
  const { selectedRestaurantId } = useRestaurantStore();
  const { success, error: toastError, info } = useToast();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== "undefined") {
      audioRef.current = new Audio("/notification.mp3");
      if (audioRef.current) audioRef.current.volume = 1.0;
    }
  }, []);

  useEffect(() => {
    setFilter(initialFilter);
  }, [initialFilter]);

  const getToken = () =>
    typeof window !== "undefined"
      ? localStorage.getItem("matgo_token") || ""
      : "";

  const fetchData = useCallback(async () => {
    if (!isMounted) return;
    setError(null);
    try {
      const restaurantParam = selectedRestaurantId
        ? `&restaurantId=${selectedRestaurantId}`
        : "";
      const res = await axios.get(
        `${API_URL}/api/admin/orders?limit=200${restaurantParam}`,
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      const sorted = [...(res.data.orders || [])].sort(
        (a: Order, b: Order) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setOrders(sorted);
    } catch (err: any) {
      if (err.response?.status === 404) setError("Restaurang ej hittad.");
      else setError("Kunde inte hämta ordrar.");
    } finally {
      setLoading(false);
    }
  }, [selectedRestaurantId, isMounted]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!isMounted) return;
    const socket = socketIO(SOCKET_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });
    socket.on("connect", () =>
      socket.emit("join:admin", { restaurantId: selectedRestaurantId })
    );
    socket.on("order:new", (order: any) => {
      const shouldShow = !selectedRestaurantId || order.restaurantId === selectedRestaurantId;
      if (shouldShow) {
        setOrders((prev) =>
          [order as Order, ...prev.filter((o) => o.id !== order.id)].sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
        );
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {});
        }
      }
    });
    socket.on("order:updated", () => fetchData());
    return () => { socket.disconnect(); };
  }, [isMounted, selectedRestaurantId, fetchData]);

  const updateStatus = async (orderId: string, status: string, estimatedTime?: number) => {
    try {
      await axios.patch(
        `${API_URL}/api/admin/orders/${orderId}/status`,
        { status, estimatedTime },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      setAcceptDialog(null);
      if (status === "PREPARING") {
        confetti({
          particleCount: 100,
          spread: 60,
          origin: { y: 0.6 },
          colors: ["#e7b24b", "#f3c96e", "#ffffff"],
        });
      }
      success(`Order ${STATUS_LABELS[status] || status}`);
      await fetchData();
    } catch {
      toastError("Kunde inte uppdatera orderstatus");
    }
  };

  const handleRefund = async (orderId: string, amount: number, reason: string) => {
    try {
      await axios.post(
        `${API_URL}/api/admin/orders/${orderId}/refund`,
        { amount, reason },
        { headers: { Authorization: `Bearer ${getToken()}` } }
      );
      setRefundOrder(null);
      success("Återbetalning genomförd");
      fetchData();
    } catch {
      toastError("Kunde inte genomföra återbetalning");
    }
  };

  const doDeleteTest = async (orderId: string) => {
    try {
      await axios.delete(`${API_URL}/api/admin/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      setDeleteTestOrder(null);
      success("Testorder raderad");
    } catch {
      toastError("Kunde inte radera testorder");
    }
  };

  const handleExportCSV = () => {
    const allOrders = orders;
    if (allOrders.length === 0) {
      toastError("Inga ordrar att exportera");
      return;
    }
    const headers = ["Ordernr", "Kund", "Restaurant", "Status", "Belopp", "Datum"];
    const rows = allOrders.map((o) => [
      o.orderNumber,
      o.customerName,
      o.restaurantName || "",
      o.status,
      (o.total / 100).toFixed(2),
      new Date(o.createdAt).toLocaleString("sv-SE"),
    ]);
    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ordrar_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    success(`Exporterade ${allOrders.length} ordrar`);
  };

  // Filtered orders
  const displayOrders = useMemo(() => {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    let result = orders.filter((o) => {
      const isToday = new Date(o.createdAt) >= startOfToday;
      const isPending = o.status === "PENDING";
      return isToday || isPending;
    });

    if (filter === "PENDING") result = result.filter((o) => o.status === "PENDING");
    else if (filter === "preparing")
      result = result.filter((o) => ["ACCEPTED", "PREPARING"].includes(o.status));
    else if (filter === "ready")
      result = result.filter((o) => ["READY", "DELIVERING"].includes(o.status));
    else if (filter === "done")
      result = result.filter((o) => ["DELIVERED"].includes(o.status));

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (o) =>
          o.customerName.toLowerCase().includes(q) ||
          o.orderNumber.toString().includes(q) ||
          o.restaurantName?.toLowerCase().includes(q) ||
          o.customerPhone.includes(q)
      );
    }

    return result;
  }, [orders, filter, search]);

  const stats = useMemo(() => {
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const todayOrders = orders.filter((o) => new Date(o.createdAt) >= startOfToday);
    return {
      pending: todayOrders.filter((o) => o.status === "PENDING").length,
      preparing: todayOrders.filter((o) => ["ACCEPTED", "PREPARING"].includes(o.status)).length,
      ready: todayOrders.filter((o) => ["READY", "DELIVERING"].includes(o.status)).length,
      done: todayOrders.filter((o) => ["DELIVERED"].includes(o.status)).length,
      revenue: todayOrders
        .filter((o) => o.status === "DELIVERED")
        .reduce((sum, o) => sum + o.total, 0),
    };
  }, [orders]);

  if (!isMounted) return null;

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-2.5 h-2.5 rounded-full ${loading ? "bg-amber-400 animate-pulse" : "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"}`} />
          <h1 className="text-xl font-black uppercase tracking-tight text-[var(--text-primary)]">
            {title || "Live Ordrar"}
          </h1>
          {selectedRestaurantId && (
            <span className="px-2 py-1 rounded-lg bg-gold-500/10 text-gold-500 text-[9px] font-black uppercase border border-gold-500/20">
              Filtrerat
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            disabled={loading}
            className="w-9 h-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all flex items-center justify-center"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-gold-500 hover:border-gold-500/20 transition-all text-[9px] font-black uppercase"
          >
            <Download size={13} /> CSV
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Nya ordrar", value: stats.pending, color: "text-amber-400" },
          { label: "Tillagas", value: stats.preparing, color: "text-blue-400" },
          { label: "Klara / På väg", value: stats.ready, color: "text-emerald-400" },
          {
            label: "Omsättning idag",
            value: `${Math.round(stats.revenue / 100)} kr`,
            color: "text-gold-500",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]"
          >
            <div className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1.5">
              {s.label}
            </div>
            <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filter + search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1.5 p-1 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
          {[
            { id: "all", label: "Alla", href: "/orders" },
            { id: "PENDING", label: `Nya (${stats.pending})`, href: "/orders/new" },
            { id: "preparing", label: `Tillagas (${stats.preparing})`, href: "/orders/preparing" },
            { id: "ready", label: `Klara (${stats.ready})`, href: "/orders/ready" },
            { id: "done", label: "Levererade", href: "/orders?done=true" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => {
                if (f.href.startsWith("/orders")) {
                  router.push(f.href);
                }
                setFilter(f.id as any);
              }}
              className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                filter === f.id
                  ? "bg-gold-500 text-[#0d0d0d]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sök kund, ordernummer..."
            className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl pl-9 pr-4 py-2.5 text-[11px] font-bold outline-none focus:border-gold-500/30 transition-all"
          />
        </div>
      </div>

      {/* Orders list */}
      {error ? (
        <div className="py-16 text-center rounded-2xl border border-dashed border-rose-500/20">
          <AlertCircle className="text-rose-500 mx-auto mb-4" size={36} />
          <p className="text-[10px] text-[var(--text-secondary)] font-bold uppercase tracking-widest mb-5">
            {error}
          </p>
          <button
            onClick={fetchData}
            className="px-6 py-3 bg-gold-500 text-[#0d0d0d] rounded-xl font-black uppercase tracking-widest text-[10px]"
          >
            Försök igen
          </button>
        </div>
      ) : loading ? (
        <div className="py-16 flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-gold-500" size={32} />
          <p className="text-[9px] font-black uppercase tracking-[0.4em] text-[var(--text-secondary)] animate-pulse">
            Hämtar ordrar...
          </p>
        </div>
      ) : displayOrders.length === 0 ? (
        <div className="py-16 flex flex-col items-center gap-4 rounded-2xl border border-dashed border-[var(--border-subtle)]">
          <ShoppingCart size={32} className="text-[var(--text-secondary)] opacity-20" />
          <p className="text-[9px] font-black uppercase tracking-[0.6em] text-[var(--text-secondary)] opacity-30">
            Inga ordrar
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {displayOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              expanded={expandedOrderId === order.id}
              onToggle={() =>
                setExpandedOrderId(
                  expandedOrderId === order.id ? null : order.id
                )
              }
              onAccept={() => setAcceptDialog({ orderId: order.id, time: 20 })}
              onStatus={(s) => updateStatus(order.id, s)}
              onEdit={() => setEditingOrder(order)}
              onDeleteTest={() => setDeleteTestOrder(order)}
              onRefund={() => setRefundOrder(order)}
            />
          ))}
        </div>
      )}

      {/* Accept dialog */}
      <Modal
        open={!!acceptDialog}
        onClose={() => setAcceptDialog(null)}
        title="Välj tillagningstid"
        maxWidth="max-w-sm"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-2">
            {[10, 15, 20, 25, 30, 45, 60].map((t) => (
              <button
                key={t}
                onClick={() =>
                  setAcceptDialog((prev) => prev ? { ...prev, time: t } : null)
                }
                className={`py-3.5 rounded-xl font-black text-sm transition-all active:scale-90 ${
                  acceptDialog?.time === t
                    ? "bg-gold-500 text-[#0d0d0d] shadow-lg shadow-gold-500/20"
                    : "bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:text-[var(--text-primary)]"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <p className="text-center text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)]">
            Minuter
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setAcceptDialog(null)}
              className="flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:text-[var(--text-primary)] transition-all"
            >
              Avbryt
            </button>
            <button
              onClick={() => {
                if (acceptDialog) updateStatus(acceptDialog.orderId, "PREPARING", acceptDialog.time);
              }}
              className="flex-2 py-3.5 px-8 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
            >
              Godkänn
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit order modal */}
      <Modal
        open={!!editingOrder}
        onClose={() => setEditingOrder(null)}
        title={`Order #${editingOrder?.orderNumber}`}
        maxWidth="max-w-lg"
      >
        {editingOrder && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const data = Object.fromEntries(fd.entries());
              try {
                await axios.patch(
                  `${API_URL}/api/admin/orders/${editingOrder.id}`,
                  data,
                  { headers: { Authorization: `Bearer ${getToken()}` } }
                );
                setEditingOrder(null);
                success("Order uppdaterad");
                fetchData();
              } catch {
                toastError("Fel vid sparning");
              }
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1.5">
                  Namn
                </label>
                <input
                  name="customerName"
                  defaultValue={editingOrder.customerName}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-gold-500/30"
                />
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1.5">
                  Telefon
                </label>
                <input
                  name="customerPhone"
                  defaultValue={editingOrder.customerPhone}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-gold-500/30"
                />
              </div>
            </div>
            {editingOrder.type === "DELIVERY" && (
              <>
                <div>
                  <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1.5">
                    Adress
                  </label>
                  <input
                    name="deliveryStreet"
                    defaultValue={editingOrder.deliveryStreet}
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-gold-500/30"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1.5">
                      Postnr
                    </label>
                    <input
                      name="deliveryZip"
                      defaultValue={editingOrder.deliveryZip}
                      className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-gold-500/30"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1.5">
                      Stad
                    </label>
                    <input
                      name="deliveryCity"
                      defaultValue={editingOrder.deliveryCity}
                      className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-gold-500/30"
                    />
                  </div>
                </div>
              </>
            )}
            <div>
              <label className="block text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1.5">
                Notering
              </label>
              <textarea
                name="note"
                defaultValue={editingOrder.note}
                rows={3}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-gold-500/30 resize-none"
              />
            </div>
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                className="flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:text-[var(--text-primary)] transition-all"
              >
                Avbryt
              </button>
              <button
                type="submit"
                className="flex-2 py-3.5 px-8 rounded-xl bg-gold-500 text-[#0d0d0d] text-[10px] font-black uppercase tracking-widest hover:bg-gold-400 transition-all shadow-lg shadow-gold-500/20"
              >
                Spara ändringar
              </button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmModal
        open={!!deleteTestOrder}
        onClose={() => setDeleteTestOrder(null)}
        onConfirm={() => deleteTestOrder && doDeleteTest(deleteTestOrder.id)}
        title="Radera testorder?"
        message="Detta kommer permanent radera testordern från systemet."
      />

      {/* Stripe Refund Modal */}
      <Modal 
        open={!!refundOrder}
        onClose={() => setRefundOrder(null)}
        title={refundOrder ? `Återbetala Order #${refundOrder.orderNumber}` : "Återbetalning"}
        maxWidth="max-w-sm"
      >
        {refundOrder && (
          <RefundModalContent 
            order={refundOrder}
            onConfirm={(amt, reason) => handleRefund(refundOrder.id, amt, reason)}
            onClose={() => setRefundOrder(null)}
          />
        )}
      </Modal>
    </div>
  );
};

export default OrdersManager;
