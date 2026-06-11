"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Badge, Button, ErrorPanel, PageHeader, Surface } from "@/shared/components/ui";
import { apiHealthQueryKey, getApiHealth, type ApiServiceStatus, type CapacityMetric } from "./api";

const SEV_COLOR: Record<string, string> = {
  ok: "var(--success)",
  warning: "var(--warning)",
  critical: "var(--danger)",
  info: "var(--text-secondary)",
};

function MetricRow({ m }: { m: CapacityMetric }) {
  const color = SEV_COLOR[m.severity] ?? "var(--text-secondary)";
  return (
    <div className="py-2 border-b last:border-0" style={{ borderColor: "var(--border-subtle)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{m.label}</span>
        <span className="text-sm font-bold" style={{ color }}>{m.value}</span>
      </div>
      {m.pct != null && (
        <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border-subtle)" }}>
          <div className="h-full" style={{ width: `${Math.min(100, m.pct)}%`, backgroundColor: color }} />
        </div>
      )}
      {m.hint && <p className="mt-1 text-[11px]" style={{ color }}>{m.hint}</p>}
    </div>
  );
}

function StatusBadge({ s }: { s: ApiServiceStatus }) {
  switch (s.status) {
    case "ok":
      return <Badge tone="success">OK</Badge>;
    case "error":
      return <Badge tone="danger">Fel</Badge>;
    case "configured":
      return <Badge tone="info">Konfigurerad</Badge>;
    default:
      return <Badge tone="neutral">Ej konfigurerad</Badge>;
  }
}

export function ApiHealthPage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: apiHealthQueryKey,
    queryFn: getApiHealth,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="page-stack">
      <PageHeader
        title="API-status"
        actions={
          <Button onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={16} /> Uppdatera
          </Button>
        }
      />

      {data?.capacity && (
        <div className="space-y-4">
          {data.capacity.alerts.length > 0 && (
            <Surface className="p-4">
              <p className="text-sm font-black" style={{ color: data.capacity.worst === "critical" ? "var(--danger)" : "var(--warning)" }}>
                ⚠ {data.capacity.alerts.length} sak(er) att hålla koll på
              </p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs" style={{ color: "var(--text-secondary)" }}>
                {data.capacity.alerts.map((a) => (
                  <li key={a.key}>
                    <strong>{a.label}:</strong> {a.value}
                    {a.hint ? ` — ${a.hint}` : ""}
                  </li>
                ))}
              </ul>
            </Surface>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <Surface className="p-5">
              <h3 className="font-black text-[var(--text-primary)]">Supabase — kapacitet</h3>
              <div className="mt-2">
                {data.capacity.supabase.metrics.length === 0 ? (
                  <p className="text-xs text-[var(--text-secondary)]">Kunde inte läsa Postgres-metrik (rättigheter?).</p>
                ) : (
                  data.capacity.supabase.metrics.map((m) => <MetricRow key={m.key} m={m} />)
                )}
              </div>
              <p className="mt-2 text-[11px] text-[var(--text-muted)]">{data.capacity.supabase.note}</p>
            </Surface>
            <Surface className="p-5">
              <h3 className="font-black text-[var(--text-primary)]">API-server (Railway)</h3>
              <div className="mt-2">
                {data.capacity.host.metrics.map((m) => <MetricRow key={m.key} m={m} />)}
              </div>
              <p className="mt-2 text-[11px] text-[var(--text-muted)]">{data.capacity.host.note}</p>
            </Surface>
          </div>
        </div>
      )}

      {isError && <ErrorPanel title="Kunde inte hämta API-status" />}

      {isLoading ? (
        <Surface className="p-6 text-sm text-[var(--text-secondary)]">Kontrollerar tjänster…</Surface>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data?.services.map((s) => {
            const pct =
              s.usage.limit && s.usage.limit > 0 ? Math.min(100, Math.round((s.usage.used / s.usage.limit) * 100)) : null;
            const near = pct != null && pct >= 80;
            return (
              <Surface key={s.key} className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-secondary)]">{s.category}</p>
                    <h3 className="font-black text-[var(--text-primary)]">{s.name}</h3>
                  </div>
                  <StatusBadge s={s} />
                </div>

                {s.detail && (
                  <p className="text-xs text-[var(--text-secondary)]">
                    {s.detail}
                    {s.latencyMs != null ? ` · ${s.latencyMs} ms` : ""}
                  </p>
                )}

                {s.usage.limit != null ? (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-[var(--text-secondary)]">Användning ({s.usage.period})</span>
                      <span className="font-bold" style={{ color: near ? "var(--danger)" : "var(--text-primary)" }}>
                        {s.usage.used.toLocaleString("sv-SE")} / {s.usage.limit.toLocaleString("sv-SE")}
                      </span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border-subtle)" }}>
                      <div className="h-full" style={{ width: `${pct}%`, backgroundColor: near ? "var(--danger)" : "var(--accent-strong)" }} />
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)]">
                      {s.usage.remaining?.toLocaleString("sv-SE")} kvar tills gräns
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-secondary)]">
                    Använt denna månad: <strong>{s.usage.used.toLocaleString("sv-SE")}</strong>
                  </p>
                )}

                {s.limitNote && <p className="text-[11px] italic text-[var(--text-secondary)]">{s.limitNote}</p>}
                <p className="text-[10px] text-[var(--text-muted)] break-words">Nycklar (namn): {s.envVars.join(", ")}</p>
              </Surface>
            );
          })}
        </div>
      )}

      {data?.generatedAt && (
        <p className="text-[11px] text-[var(--text-muted)]">Kontrollerad {new Date(data.generatedAt).toLocaleString("sv-SE")}</p>
      )}
    </div>
  );
}
