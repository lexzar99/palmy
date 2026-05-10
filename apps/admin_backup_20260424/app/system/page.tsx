"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  Loader2,
  RefreshCw,
  Server,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-storage";
import { useToast } from "@/components/Toast";
import { useControlCenter } from "@/lib/use-control-center";

type HealthData = {
  status: string;
  uptime: number;
  dbPingMs: number;
  memory: { rss: number; heapTotal: number; heapUsed: number };
  operations?: {
    restaurantCount: number;
    openRestaurantCount: number;
    userCount: number;
    pendingOrders: number;
    liveOrders: number;
    payoutInReview: number;
  };
  services?: {
    auth: boolean;
    realtime: boolean;
    uploads: boolean;
  };
  alerts?: Array<{ level: "info" | "warning"; message: string }>;
  timestamp: string;
};

const formatUptime = (seconds: number) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
};

const formatBytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export default function SystemHealthPage() {
  const { error: toastError } = useToast();
  const { data: controlData } = useControlCenter();
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const response = await axios.get(`${API_URL}/api/admin/system/health`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(response.data);
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte hämta systemhälsan.");
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    void fetchHealth();
    const interval = setInterval(() => {
      void fetchHealth();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const metrics = useMemo(() => {
    if (!data) return [];
    return [
      { label: "API status", value: data.status, sub: data.dbPingMs < 350 ? "Stabil" : "Behöver koll", icon: Server },
      { label: "DB latency", value: `${data.dbPingMs} ms`, sub: "Prisma query ping", icon: Database },
      { label: "Uptime", value: formatUptime(data.uptime), sub: "Nuvarande process", icon: Clock },
      { label: "Memory RSS", value: formatBytes(data.memory.rss), sub: `Heap ${formatBytes(data.memory.heapUsed)}`, icon: Activity },
      { label: "Live orders", value: data.operations?.liveOrders || 0, sub: `${data.operations?.pendingOrders || 0} väntar`, icon: AlertTriangle },
      { label: "Uploads", value: data.services?.uploads ? "Redo" : "Saknas", sub: data.services?.uploads ? "Cloudinary konfigurerad" : "Kräver miljövariabler", icon: Upload },
    ];
  }, [data]);

  if (loading && !data) {
    return (
      <div className="panel flex min-h-[360px] items-center justify-center rounded-[32px] px-6 py-12">
        <div className="flex items-center gap-3 text-[var(--text-secondary)]">
          <Loader2 className="animate-spin text-amber-200" size={18} />
          <span className="text-sm font-bold">Laddar systemhälsa…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-16">
      <section className="panel rounded-[32px] px-6 py-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <span className="control-chip">Operations health</span>
            <div>
              <h2 className="text-3xl font-black tracking-[-0.06em] text-[var(--text-primary)] sm:text-4xl">Systemläge för admin, drift och tjänster</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
                Den gamla systemsidan var tunn. Nu får du processhälsa, driftvolym, upload-status och en snabb sammanfattning av vad som behöver uppmärksamhet.
              </p>
            </div>
          </div>

          <button type="button" onClick={() => void fetchHealth()} className="control-chip">
            <RefreshCw size={13} /> Uppdatera nu
          </button>
        </div>
      </section>

      {data ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <article key={metric.label} className="metric-card panel-muted">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">{metric.label}</p>
                      <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{metric.value}</p>
                    </div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[rgba(245,191,91,0.12)] text-amber-200">
                      <Icon size={18} />
                    </div>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">{metric.sub}</p>
                </article>
              );
            })}
          </section>

          <section className="grid gap-5 2xl:grid-cols-[1.1fr_0.9fr]">
            <div className="panel rounded-[32px] px-6 py-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Service map</p>
                <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Kärntjänster och driftvolym</h3>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-4">
                  <div className="flex items-center gap-2 text-emerald-100">
                    <ShieldCheck size={16} /> Auth & realtime
                  </div>
                  <div className="mt-3 grid gap-2 text-sm leading-6 text-[var(--text-secondary)]">
                    <p>Auth: {data.services?.auth ? "online" : "problem"}</p>
                    <p>Realtime: {data.services?.realtime ? "online" : "problem"}</p>
                    <p>Uploads: {data.services?.uploads ? "konfigurerat" : "saknas"}</p>
                  </div>
                </div>

                <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-4">
                  <div className="flex items-center gap-2 text-sky-100">
                    <Users size={16} /> Volym just nu
                  </div>
                  <div className="mt-3 grid gap-2 text-sm leading-6 text-[var(--text-secondary)]">
                    <p>{data.operations?.restaurantCount || 0} restauranger totalt</p>
                    <p>{data.operations?.openRestaurantCount || 0} öppna restauranger</p>
                    <p>{data.operations?.userCount || 0} registrerade kunder</p>
                  </div>
                </div>

                <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-4">
                  <div className="flex items-center gap-2 text-amber-100">
                    <AlertTriangle size={16} /> Ordertryck
                  </div>
                  <div className="mt-3 grid gap-2 text-sm leading-6 text-[var(--text-secondary)]">
                    <p>{data.operations?.pendingOrders || 0} väntande ordrar</p>
                    <p>{data.operations?.liveOrders || 0} ordrar i liveflöde</p>
                    <p>{data.operations?.payoutInReview || 0} payouts i workflow</p>
                  </div>
                </div>

                <div className="rounded-[24px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-4">
                  <div className="flex items-center gap-2 text-violet-100">
                    <Clock size={16} /> Tidsstämplar
                  </div>
                  <div className="mt-3 grid gap-2 text-sm leading-6 text-[var(--text-secondary)]">
                    <p>Senast uppdaterad {new Date(data.timestamp).toLocaleTimeString("sv-SE")}</p>
                    <p>Process uptime {formatUptime(data.uptime)}</p>
                    <p>Heap total {formatBytes(data.memory.heapTotal)}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-5">
              <div className="panel rounded-[32px] px-6 py-6">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Alerts</p>
                <div className="mt-4 grid gap-3">
                  {(data.alerts || []).map((alert, index) => (
                    <div key={`${alert.message}-${index}`} className={`rounded-[24px] border px-5 py-4 ${alert.level === "warning" ? "border-rose-300/18 bg-rose-300/10" : "border-emerald-300/18 bg-emerald-300/10"}`}>
                      <div className="flex items-center gap-2">
                        {alert.level === "warning" ? <AlertTriangle size={16} className="text-rose-200" /> : <CheckCircle2 size={16} className="text-emerald-200" />}
                        <p className="text-sm font-black text-[var(--text-primary)]">{alert.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="panel rounded-[32px] px-6 py-6">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Security & control</p>
                <div className="mt-4 grid gap-3 text-sm leading-7 text-[var(--text-secondary)]">
                  {(controlData?.security.notes || []).map((note) => (
                    <div key={note} className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4">
                      {note}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
