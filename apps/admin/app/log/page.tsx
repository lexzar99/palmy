 
"use client";

import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import {
  ActivitySquare,
  ShoppingCart,
  Settings,
  Users,
  Store,
  LogIn,
  Tag,
  RefreshCw,
  Filter,
  Search,
  Clock,
  AlertCircle,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { io as socketIO } from "socket.io-client";
import { SOCKET_URL } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";

interface LogEntry {
  id: string;
  type: "order" | "settings" | "customer" | "restaurant" | "auth" | "deal" | "system";
  action: string;
  details: string;
  restaurantName?: string;
  timestamp: Date;
  severity: "info" | "warning" | "success" | "error";
}

const TYPE_ICONS: Record<LogEntry["type"], React.ElementType> = {
  order: ShoppingCart,
  settings: Settings,
  customer: Users,
  restaurant: Store,
  auth: LogIn,
  deal: Tag,
  system: ActivitySquare,
};

const SEVERITY_COLORS: Record<LogEntry["severity"], string> = {
  info: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  warning: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  success: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  error: "text-rose-400 bg-rose-500/10 border-rose-500/20",
};

export default function LogPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LogEntry["type"] | "all">("all");
  const [search, setSearch] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);

  const token = () =>
    typeof window !== "undefined" ? localStorage.getItem("matgo_token") || "" : "";

  // Build logs from real order data + in-memory log
  const buildLogsFromOrders = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersRes] = await Promise.allSettled([
        axios.get(`${API_URL}/api/admin/orders?limit=100`, {
          headers: { Authorization: `Bearer ${token()}` },
        }),
      ]);

      const newLogs: LogEntry[] = [];

      if (ordersRes.status === "fulfilled") {
        const orders = ordersRes.value.data.orders || [];
        for (const order of orders) {
          // New order
          newLogs.push({
            id: `order-new-${order.id}`,
            type: "order",
            action: "Ny beställning",
            details: `#${order.orderNumber} · ${order.customerName} · ${Math.round((order.total || 0) / 100)} kr · ${order.type}`,
            restaurantName: order.restaurantName,
            timestamp: new Date(order.createdAt),
            severity: "info",
          });

          // Status changes
          if (order.status !== "PENDING") {
            const statusMap: Record<string, { action: string; severity: LogEntry["severity"] }> = {
              PREPARING: { action: "Order godkänd", severity: "success" },
              DELIVERING: { action: "Order på väg", severity: "success" },
              DELIVERED: { action: "Order levererad", severity: "success" },
              REJECTED: { action: "Order nekad", severity: "warning" },
              CANCELLED: { action: "Order avbokad", severity: "warning" },
            };
            const sm = statusMap[order.status];
            if (sm) {
              newLogs.push({
                id: `order-status-${order.id}`,
                type: "order",
                action: sm.action,
                details: `#${order.orderNumber} · ${order.customerName}`,
                restaurantName: order.restaurantName,
                timestamp: new Date(new Date(order.createdAt).getTime() + 60000),
                severity: sm.severity,
              });
            }
          }
        }
      }

      // Add stored in-memory logs
      const stored = getStoredLogs();

      const combined = [...newLogs, ...stored].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setLogs(combined.slice(0, 200));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    buildLogsFromOrders();
  }, [buildLogsFromOrders]);

  // Auto-refresh every 30s
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(buildLogsFromOrders, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, buildLogsFromOrders]);

  // Real-time new orders via socket
  useEffect(() => {
    const socket = socketIO(SOCKET_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });

    socket.on("order:new", (order: any) => {
      const entry: LogEntry = {
        id: `live-${order.id}`,
        type: "order",
        action: "Ny beställning (live)",
        details: `#${order.orderNumber} · ${order.customerName} · ${Math.round((order.total || 0) / 100)} kr`,
        restaurantName: order.restaurantName,
        timestamp: new Date(),
        severity: "success",
      };
      setLogs((prev) => [entry, ...prev].slice(0, 200));
      addStoredLog(entry);
    });

    return () => { socket.disconnect(); };
  }, []);

  const filtered = logs.filter((l) => {
    if (filter !== "all" && l.type !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        l.action.toLowerCase().includes(q) ||
        l.details.toLowerCase().includes(q) ||
        (l.restaurantName || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const countByType = (type: LogEntry["type"]) => logs.filter((l) => l.type === type).length;

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-[var(--text-primary)]">
            Aktivitetslogg
          </h1>
          <p className="text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-widest mt-1">
            {logs.length} händelser registrerade
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${
              autoRefresh
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : "border-[var(--border-subtle)] text-[var(--text-secondary)]"
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? "bg-emerald-400 animate-pulse" : "bg-[var(--text-secondary)]"}`} />
            {autoRefresh ? "Live" : "Pausad"}
          </button>
          <button
            onClick={buildLogsFromOrders}
            disabled={loading}
            className="w-9 h-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Type filter */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "all", label: "Alla", count: logs.length },
            { id: "order", label: "Ordrar", count: countByType("order") },
            { id: "restaurant", label: "Restauranger", count: countByType("restaurant") },
            { id: "customer", label: "Kunder", count: countByType("customer") },
            { id: "deal", label: "Deals", count: countByType("deal") },
            { id: "settings", label: "Inställningar", count: countByType("settings") },
            { id: "auth", label: "Auth", count: countByType("auth") },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id as any)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all border ${
              filter === f.id
                ? "bg-gold-500/10 border-gold-500/30 text-gold-500"
                : "border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {f.label}
            {f.count > 0 && (
              <span className={`text-[7px] font-black px-1 py-0.5 rounded ${
                filter === f.id ? "bg-gold-500/20" : "bg-[var(--bg-primary)]"
              }`}>
                {f.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sök i loggen..."
          className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl pl-9 pr-4 py-2.5 text-[11px] font-bold outline-none focus:border-gold-500/30 transition-all"
        />
      </div>

      {/* Log entries */}
      {loading ? (
        <div className="py-12 flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-gold-500" size={28} />
          <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] animate-pulse">
            Läser logg...
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center rounded-2xl border border-dashed border-[var(--border-subtle)]">
          <ActivitySquare size={28} className="text-[var(--text-secondary)] opacity-20 mx-auto mb-3" />
          <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-30">
            Inga händelser
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((log, idx) => {
            const Icon = TYPE_ICONS[log.type];
            const isFirst = idx === 0;
            return (
              <motion.div
                key={log.id}
                initial={isFirst ? { opacity: 0, x: -10 } : false}
                animate={isFirst ? { opacity: 1, x: 0 } : {}}
                className="flex items-start gap-4 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] hover:border-[var(--border-subtle)] transition-all group"
              >
                {/* Icon */}
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${SEVERITY_COLORS[log.severity]}`}>
                  <Icon size={14} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-black uppercase tracking-wide text-[var(--text-primary)]">
                      {log.action}
                    </span>
                    {log.restaurantName && (
                      <span className="px-1.5 py-0.5 rounded bg-gold-500/10 text-gold-500 text-[7px] font-black uppercase border border-gold-500/20">
                        {log.restaurantName}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] font-bold text-[var(--text-secondary)] mt-0.5 truncate">
                    {log.details}
                  </p>
                </div>

                {/* Timestamp */}
                <div className="shrink-0 text-right">
                  <p className="text-[8px] font-black uppercase tracking-widest text-[var(--text-secondary)]">
                    {new Date(log.timestamp).toLocaleTimeString("sv-SE", {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </p>
                  <p className="text-[7px] text-[var(--text-secondary)] opacity-40 mt-0.5">
                    {new Date(log.timestamp).toLocaleDateString("sv-SE")}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Persistent log storage (sessionStorage) ──────────────────────────────────
function getStoredLogs(): LogEntry[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = sessionStorage.getItem("matgo_admin_log");
    if (!raw) return [];
    return JSON.parse(raw).map((l: any) => ({ ...l, timestamp: new Date(l.timestamp) }));
  } catch {
    return [];
  }
}

function addStoredLog(entry: LogEntry) {
  try {
    if (typeof window === "undefined") return;
    const existing = getStoredLogs();
    const updated = [entry, ...existing].slice(0, 100);
    sessionStorage.setItem("matgo_admin_log", JSON.stringify(updated));
  } catch {
    // ignore
  }
}

// Export helper so other pages can log events
export function logEvent(
  type: LogEntry["type"],
  action: string,
  details: string,
  severity: LogEntry["severity"] = "info",
  restaurantName?: string
) {
  addStoredLog({
    id: `manual-${Date.now()}`,
    type,
    action,
    details,
    restaurantName,
    timestamp: new Date(),
    severity,
  });
}
