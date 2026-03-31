"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Bike, GripVertical, Loader2, MapPin, Phone, Settings, CheckCircle2, XCircle, Clock3 } from "lucide-react";
import { API_URL } from "@/lib/api";

export default function CourierPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"QUEUE" | "SETTINGS">("QUEUE");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    compactMode: true,
    autoCallPrompt: true,
  });

  const getToken = () => typeof window !== "undefined" ? localStorage.getItem("palmyra_token") || "" : "";

  useEffect(() => {
    const saved = localStorage.getItem("palmyra_courier_settings");
    if (saved) {
      setSettings(JSON.parse(saved));
    }
  }, []);

  const fetchOrders = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/admin/orders?limit=100`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setOrders(res.data.orders || []);
    } catch (error) {
      console.error("Failed to fetch courier orders", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    const interval = window.setInterval(fetchOrders, 8000);
    return () => window.clearInterval(interval);
  }, []);

  const saveSort = (nextOrders: any[]) => {
    const queuedIds = nextOrders.map((order) => order.id);
    localStorage.setItem("palmyra_courier_sort", JSON.stringify(queuedIds));

    setOrders((prev) => {
      const queueMap = new Map(nextOrders.map((order) => [order.id, order]));
      const rest = prev.filter((order) => !queueMap.has(order.id));
      return [...nextOrders, ...rest];
    });
  };

  const updateCourierStatus = async (orderId: string, status: "DELIVERED" | "DELIVERY_FAILED") => {
    await axios.patch(
      `${API_URL}/api/admin/orders/${orderId}/status`,
      { status },
      { headers: { Authorization: `Bearer ${getToken()}` } },
    );
    await fetchOrders();
  };

  const parseExtras = (extras: any) => {
    if (typeof extras === "string") {
      try {
        return JSON.parse(extras);
      } catch {
        return [];
      }
    }
    return Array.isArray(extras) ? extras : [];
  };

  const activeOrders = useMemo(() => {
    const deliveryOrders = orders.filter((order: any) =>
      order.type === "DELIVERY" && ["PREPARING", "DELIVERING"].includes(order.status),
    );

    const savedOrder = JSON.parse(localStorage.getItem("palmyra_courier_sort") || "[]") as string[];

    return [...deliveryOrders].sort((a, b) => {
      const indexA = savedOrder.indexOf(a.id);
      const indexB = savedOrder.indexOf(b.id);
      if (indexA === -1 && indexB === -1) return a.orderNumber - b.orderNumber;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }, [orders]);

  const historyOrders = useMemo(() => {
    const today = new Date().toLocaleDateString("sv-SE");

    return orders
      .filter((order: any) =>
        order.type === "DELIVERY" &&
        ["DELIVERED", "DELIVERY_FAILED"].includes(order.status) &&
        new Date(order.createdAt).toLocaleDateString("sv-SE") === today,
      )
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
  }, [orders]);

  const orderedStops = useMemo(() => activeOrders.length, [activeOrders]);

  return (
    <div className="space-y-6 pb-24">
      <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.35em] text-gold-500 mb-2">Budvy</div>
            <h1 className="text-3xl font-black uppercase tracking-tight">Leveranskö</h1>
            <p className="mt-2 text-sm text-white/40">Mobilvänlig vy för budet. Dra korten för att välja körordning.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-dark-500 px-4 py-3 text-right">
            <div className="text-[10px] uppercase tracking-[0.3em] text-white/20">Aktiva stopp</div>
            <div className="text-2xl font-black text-gold-500">{orderedStops}</div>
          </div>
        </div>

        <div className="mt-5 flex gap-2 rounded-2xl bg-dark-500 p-1 border border-white/5 w-fit">
          <button onClick={() => setActiveTab("QUEUE")} className={`rounded-xl px-5 py-3 text-xs font-black uppercase tracking-[0.2em] ${activeTab === "QUEUE" ? "bg-gold-500 text-dark-500" : "text-white/50"}`}>Kö</button>
          <button onClick={() => setActiveTab("SETTINGS")} className={`rounded-xl px-5 py-3 text-xs font-black uppercase tracking-[0.2em] ${activeTab === "SETTINGS" ? "bg-gold-500 text-dark-500" : "text-white/50"}`}>Inställningar</button>
        </div>
      </div>

      {activeTab === "SETTINGS" ? (
        <div className="rounded-[2rem] border border-white/10 bg-white/5 p-6 space-y-4">
          <div className="flex items-center gap-3 text-gold-500">
            <Settings size={18} />
            <div className="text-sm font-black uppercase tracking-[0.2em]">Budinställningar</div>
          </div>
          <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-dark-500 px-4 py-4">
            <span className="font-bold">Kompakt kortvy</span>
            <input
              type="checkbox"
              checked={settings.compactMode}
              onChange={(e) => {
                const next = { ...settings, compactMode: e.target.checked };
                setSettings(next);
                localStorage.setItem("palmyra_courier_settings", JSON.stringify(next));
              }}
            />
          </label>
          <label className="flex items-center justify-between rounded-2xl border border-white/10 bg-dark-500 px-4 py-4">
            <span className="font-bold">Visa ring-knapp tydligt</span>
            <input
              type="checkbox"
              checked={settings.autoCallPrompt}
              onChange={(e) => {
                const next = { ...settings, autoCallPrompt: e.target.checked };
                setSettings(next);
                localStorage.setItem("palmyra_courier_settings", JSON.stringify(next));
              }}
            />
          </label>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="animate-spin text-gold-500" size={36} />
        </div>
      ) : (
        <div className="space-y-4">
          {activeOrders.map((order, index) => (
            <div
              key={order.id}
              draggable
              onDragStart={() => setDraggedId(order.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (!draggedId || draggedId === order.id) return;
                const nextOrders = [...activeOrders];
                const draggedIndex = nextOrders.findIndex((item) => item.id === draggedId);
                const dropIndex = nextOrders.findIndex((item) => item.id === order.id);
                const [draggedOrder] = nextOrders.splice(draggedIndex, 1);
                nextOrders.splice(dropIndex, 0, draggedOrder);
                saveSort(nextOrders);
                setDraggedId(null);
              }}
              className={`rounded-[1.75rem] border border-white/10 bg-white/5 ${settings.compactMode ? "p-4" : "p-6"}`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-1 text-white/20">
                  <GripVertical size={20} />
                </div>
                <div className="flex-1 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] font-black uppercase tracking-[0.25em] text-gold-500">Stopp {index + 1}</div>
                      <div className="mt-1 truncate text-lg font-black uppercase">{order.deliveryStreet || `Order #${order.orderNumber}`}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-white/50">
                        <span className="rounded-full bg-white/5 px-3 py-1">{order.deliveryZip} {order.deliveryCity}</span>
                        <span className="rounded-full bg-white/5 px-3 py-1">{order.total.toFixed(0)} kr</span>
                        <span className={`rounded-full px-3 py-1 ${order.status === "DELIVERING" ? "bg-indigo-500/10 text-indigo-300" : "bg-orange-500/10 text-orange-300"}`}>
                          {order.status === "DELIVERING" ? "På väg" : "Packas"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <a href={`tel:${order.customerPhone}`} className="rounded-2xl border border-white/10 bg-dark-500 px-4 py-3">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/20"><Phone size={14} /> Telefon</div>
                      <div className="mt-1 text-base font-black">{order.customerPhone}</div>
                    </a>
                    <div className="rounded-2xl border border-white/10 bg-dark-500 px-4 py-3">
                      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/20"><MapPin size={14} /> Adress</div>
                      <div className="mt-1 text-base font-black">{order.deliveryStreet}</div>
                      <div className="text-sm text-white/50">{order.deliveryZip} {order.deliveryCity}</div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-dark-500 px-4 py-3">
                    <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/20">
                      <Bike size={14} />
                      Packlista
                    </div>
                    <div className="space-y-2">
                      {order.items.map((item: any) => {
                        const extras = parseExtras(item.selectedExtras);
                        return (
                          <div key={item.id} className="rounded-2xl bg-white/5 px-3 py-3">
                            <div className="text-sm font-black uppercase">{item.quantity}x {item.productName}</div>
                            {extras.length > 0 && (
                              <div className="mt-1 space-y-1">
                                {extras.map((extra: any, idx: number) => (
                                  <div key={`${item.id}-extra-${idx}`} className="text-[11px] font-bold uppercase text-red-400">
                                    {extra.groupName}: {extra.extraName || extra.name}
                                  </div>
                                ))}
                              </div>
                            )}
                            {item.note && <div className="mt-1 text-[11px] font-bold uppercase text-yellow-300">OBS: {item.note}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => updateCourierStatus(order.id, "DELIVERY_FAILED")}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-red-300"
                    >
                      <XCircle size={16} />
                      Ej levererad
                    </button>
                    <button
                      onClick={() => updateCourierStatus(order.id, "DELIVERED")}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-green-500 px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-dark-500"
                    >
                      <CheckCircle2 size={16} />
                      Levererad
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {activeOrders.length === 0 && (
            <div className="rounded-[2rem] border border-white/10 bg-white/5 p-10 text-center text-white/30">
              Inga leveransordrar hos budet just nu.
            </div>
          )}

          <div className="rounded-[2rem] border border-white/10 bg-white/5 p-5">
            <div className="mb-4 flex items-center gap-2 text-gold-500">
              <Clock3 size={16} />
              <div className="text-sm font-black uppercase tracking-[0.2em]">Historik idag</div>
            </div>
            <div className="space-y-2">
              {historyOrders.length === 0 ? (
                <div className="rounded-2xl bg-dark-500 px-4 py-5 text-sm text-white/30">
                  Inga avslutade leveranser ännu idag.
                </div>
              ) : (
                historyOrders.map((order: any) => (
                  <div key={`history-${order.id}`} className="rounded-2xl border border-white/10 bg-dark-500 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <button
                        onClick={() => setExpandedHistoryId((prev) => prev === order.id ? null : order.id)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="truncate text-sm font-black uppercase">{order.deliveryStreet || `Order #${order.orderNumber}`}</div>
                        <div className="mt-1 text-[11px] text-white/45">{order.customerPhone} • #{order.orderNumber}</div>
                      </button>
                      <div className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${
                        order.status === "DELIVERED"
                          ? "bg-green-500/10 text-green-300"
                          : "bg-red-500/10 text-red-300"
                      }`}>
                        {order.status === "DELIVERED" ? "Levererad" : "Ej levererad"}
                      </div>
                    </div>
                    {expandedHistoryId === order.id && (
                      <div className="mt-3 rounded-2xl bg-white/5 px-4 py-3 text-[11px] text-white/60 space-y-2">
                        <div><span className="font-black text-white/35">Adress:</span> {order.deliveryStreet}, {order.deliveryZip} {order.deliveryCity}</div>
                        <div><span className="font-black text-white/35">Telefon:</span> {order.customerPhone}</div>
                        <div><span className="font-black text-white/35">Tid:</span> {new Date(order.updatedAt || order.createdAt).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}</div>
                        {order.items?.length > 0 && (
                          <div>
                            <div className="mb-1 font-black text-white/35">Packlista:</div>
                            <div className="space-y-1">
                              {order.items.map((item: any) => (
                                <div key={`${order.id}-${item.id}`}>{item.quantity}x {item.productName}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
