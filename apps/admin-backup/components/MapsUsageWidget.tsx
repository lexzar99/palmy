"use client";

import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import {
  Activity, AlertTriangle, CheckCircle2, RefreshCw,
  ShieldAlert, Loader2, Map, TrendingUp, X,
} from "lucide-react";
import { API_URL } from "@/lib/api";

interface DayStats {
  autocomplete: number;
  geocode: number;
  total: number;
  date: string;
}

interface Alert {
  ts: number;
  message: string;
  ip?: string;
}

interface UsageData {
  today: DayStats;
  yesterday: DayStats | null;
  alerts: Alert[];
  flaggedIPs: string[];
  limits: { dailyWarn: number; dailyBlock: number };
  warnActive: boolean;
  blockActive: boolean;
}

export default function MapsUsageWidget() {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [showAlerts, setShowAlerts] = useState(false);

  const token = () =>
    typeof window !== "undefined" ? localStorage.getItem("matgo_token") || "" : "";

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/maps-stats`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      setData(res.data);
      setLastFetch(new Date());
    } catch {
      // Silently fail — not critical
    } finally {
      setLoading(false);
    }
  }, []);

  const unflagIP = async (ip: string) => {
    try {
      await axios.delete(`${API_URL}/api/maps-stats/flag?ip=${encodeURIComponent(ip)}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      fetchStats();
    } catch {}
  };

  useEffect(() => {
    fetchStats();
    // Auto-refresh every 2 minutes
    const id = setInterval(fetchStats, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchStats]);

  if (!data && !loading) return null;

  const warn = data?.warnActive;
  const block = data?.blockActive;
  const today = data?.today;
  const pct = today ? Math.min((today.total / (data?.limits.dailyWarn || 500)) * 100, 100) : 0;

  const statusColor = block
    ? "border-red-500/40 bg-red-500/5"
    : warn
    ? "border-amber-500/40 bg-amber-500/5"
    : "border-emerald-500/20 bg-emerald-500/5";

  const statusIcon = block ? (
    <ShieldAlert className="text-red-400" size={18} />
  ) : warn ? (
    <AlertTriangle className="text-amber-400" size={18} />
  ) : (
    <CheckCircle2 className="text-emerald-400" size={18} />
  );

  return (
    <div className={`rounded-[2rem] border p-6 space-y-5 ${statusColor}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Map size={18} className={block ? "text-red-400" : warn ? "text-amber-400" : "text-emerald-400"} />
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest">
              Google Maps API
            </h3>
            <p className="text-[10px] text-[var(--text-primary)]/30 font-bold uppercase tracking-widest mt-0.5">
              Daglig användning & säkerhet
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data?.alerts.length ? (
            <button
              onClick={() => setShowAlerts(!showAlerts)}
              className="relative flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-amber-500/20 transition-all"
            >
              <AlertTriangle size={10} />
              {data.alerts.length} alert{data.alerts.length !== 1 ? "s" : ""}
              {data.alerts.length > 0 && !showAlerts && (
                <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-amber-500 rounded-full text-[10px] flex items-center justify-center font-black text-white">
                  {data.alerts.length > 9 ? "9+" : data.alerts.length}
                </span>
              )}
            </button>
          ) : null}
          <button
            onClick={fetchStats}
            disabled={loading}
            className="p-2 rounded-xl bg-[var(--bg-primary)]/50 border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
          >
            {loading ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
          </button>
        </div>
      </div>

      {/* Status Banner */}
      {(warn || block) && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${
          block ? "bg-red-500/10 border-red-500/30" : "bg-amber-500/10 border-amber-500/30"
        }`}>
          {statusIcon}
          <p className={`text-xs font-black ${block ? "text-red-400" : "text-amber-400"}`}>
            {block
              ? `STOPP: Daglig gräns (${data?.limits.dailyBlock}) nådd! Kontrollera Google Cloud Console.`
              : `VARNING: Daglig användning överstiger ${data?.limits.dailyWarn} anrop.`}
          </p>
        </div>
      )}

      {/* Stats Row */}
      {loading && !data ? (
        <div className="flex justify-center py-4">
          <Loader2 size={20} className="animate-spin text-[var(--text-secondary)]" />
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Autocomplete", value: today?.autocomplete ?? 0, icon: Activity, color: "text-sky-400" },
            { label: "Geocode", value: today?.geocode ?? 0, icon: TrendingUp, color: "text-emerald-400" },
            { label: "Totalt idag", value: today?.total ?? 0, icon: Map, color: warn || block ? (block ? "text-red-400" : "text-amber-400") : "text-[var(--text-primary)]" },
          ].map((s) => (
            <div key={s.label} className="p-4 bg-[var(--bg-primary)]/60 rounded-2xl border border-[var(--border-subtle)] text-center">
              <s.icon size={16} className={`${s.color} mx-auto mb-2`} />
              <div className={`text-2xl font-black tabular-nums ${s.color}`}>{s.value}</div>
              <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/30 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Progress bar */}
      {data && (
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)]/30">
              Användning mot varningsgräns ({data.limits.dailyWarn})
            </span>
            <span className={`text-[10px] font-black ${warn || block ? "text-amber-400" : "text-emerald-400"}`}>
              {pct.toFixed(0)}%
            </span>
          </div>
          <div className="w-full h-2 bg-[var(--bg-primary)] rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                block ? "bg-red-500" : warn ? "bg-amber-500" : "bg-emerald-500"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}

      {/* Flagged IPs */}
      {data?.flaggedIPs.length ? (
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-red-400">
            Misstänkta IP-adresser ({data.flaggedIPs.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {data.flaggedIPs.map((ip) => (
              <div
                key={ip}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-xl"
              >
                <span className="text-[10px] font-black text-red-400 font-mono">{ip}</span>
                <button
                  onClick={() => unflagIP(ip)}
                  className="text-red-400/60 hover:text-red-400 transition-colors"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Alerts panel */}
      {showAlerts && data?.alerts.length ? (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">
            Senaste varningar
          </p>
          {data.alerts.map((a) => (
            <div
              key={a.ts}
              className="flex items-start gap-2 px-3 py-2.5 bg-[var(--bg-primary)]/60 border border-amber-500/20 rounded-xl"
            >
              <AlertTriangle size={11} className="text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-amber-300 leading-relaxed">{a.message}</p>
                <p className="text-[10px] text-[var(--text-primary)]/20 font-bold mt-0.5">
                  {new Date(a.ts).toLocaleTimeString("sv-SE")}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Footer */}
      <p className="text-[10px] text-[var(--text-primary)]/20 font-bold uppercase tracking-widest">
        Uppdateras var 2:e minut ·{" "}
        {lastFetch
          ? `Senast: ${lastFetch.toLocaleTimeString("sv-SE")}`
          : "Aldrig hämtad"}{" "}
        · Kolla{" "}
        <a
          href="https://console.cloud.google.com/apis/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-[var(--text-primary)]/50"
        >
          Google Cloud Console
        </a>{" "}
        för exakta siffror
      </p>
    </div>
  );
}
