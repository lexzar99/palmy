"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Badge, Button, ErrorPanel, PageHeader, Surface } from "@/shared/components/ui";
import { apiHealthQueryKey, getApiHealth, type ApiServiceStatus } from "./api";

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
    <div className="space-y-6">
      <PageHeader
        title="API-status"
        actions={
          <Button onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={16} /> Uppdatera
          </Button>
        }
      />
      <p className="text-sm text-[var(--text-secondary)]">
        Live-status, konfiguration och vår användning per extern tjänst. Är något trasigt ser du direkt om
        det är ett API-/kvotfel (status &quot;Fel&quot; med detalj) eller om tjänsten svarar OK (då ligger felet i koden).
        Inga nyckel- eller secret-värden visas — bara namnen.
      </p>

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
                      <span className="font-bold" style={{ color: near ? "#f43f5e" : "var(--text-primary)" }}>
                        {s.usage.used.toLocaleString("sv-SE")} / {s.usage.limit.toLocaleString("sv-SE")}
                      </span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border-muted)" }}>
                      <div className="h-full" style={{ width: `${pct}%`, backgroundColor: near ? "#f43f5e" : "var(--accent-strong)" }} />
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
