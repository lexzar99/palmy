"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { API_URL } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { Activity, Database, Server, Clock, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

export default function SystemHealthPage() {
  const { error: toastError } = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    try {
      const token = localStorage.getItem("matgo_token");
      const res = await axios.get(`${API_URL}/api/admin/system/health`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(res.data);
    } catch (e) {
      toastError("Kunde inte hämta hälsoinformation");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const iv = setInterval(fetchHealth, 10000);
    return () => clearInterval(iv);
  }, []);

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  };

  const formatBytes = (bytes: number) => {
    return (bytes / 1024 / 1024).toFixed(2) + " MB";
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="animate-spin text-gold-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-[var(--text-primary)]">
            Systemhälsa
          </h1>
          <p className="text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-widest mt-1">
            Realtidsövervakning av API, Databas & Resurser
          </p>
        </div>
        <div className="text-[9px] font-bold text-[var(--text-secondary)]">
          Senast uppdaterad: {new Date().toLocaleTimeString('sv-SE')}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] flex items-center gap-2">
              <Server size={14} className="text-sky-400" /> API Status
            </span>
            {data?.status === "ONLINE" ? (
              <CheckCircle2 size={16} className="text-emerald-400" />
            ) : (
              <AlertTriangle size={16} className="text-rose-400" />
            )}
          </div>
          <div className="text-2xl font-black text-[var(--text-primary)]">
            {data?.status || "OKÄND"}
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] flex items-center gap-2">
              <Database size={14} className="text-purple-400" /> Databas Ping
            </span>
          </div>
          <div className="text-2xl font-black text-[var(--text-primary)]">
            {data?.dbPingMs} <span className="text-sm">ms</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] flex items-center gap-2">
              <Clock size={14} className="text-emerald-400" /> Uptime
            </span>
          </div>
          <div className="text-2xl font-black text-[var(--text-primary)]">
            {data ? formatUptime(data.uptime) : "-"}
          </div>
        </div>

        <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] flex items-center gap-2">
              <Activity size={14} className="text-gold-500" /> Minnesanvändning
            </span>
          </div>
          <div className="text-2xl font-black text-[var(--text-primary)]">
            {data ? formatBytes(data.memory.rss) : "-"}
          </div>
          <div className="text-[9px] font-bold text-[var(--text-secondary)]">
            Heap: {data ? formatBytes(data.memory.heapUsed) : "-"} / {data ? formatBytes(data.memory.heapTotal) : "-"}
          </div>
        </div>
      </div>

      {data?.alerts && data.alerts.length > 0 && (
        <div className="p-5 rounded-2xl border border-rose-500/20 bg-rose-500/5 space-y-4">
          <h2 className="text-[11px] font-black uppercase tracking-widest text-rose-400 flex items-center gap-2">
            <AlertTriangle size={14} /> Aktiva Driftstörningar
          </h2>
          <div className="space-y-2">
            {data.alerts.map((alert: any, i: number) => (
              <div key={i} className="p-3 bg-[var(--bg-primary)] rounded-xl border border-[var(--border-subtle)] text-[11px] font-bold">
                {alert.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
