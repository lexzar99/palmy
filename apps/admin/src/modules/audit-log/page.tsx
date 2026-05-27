"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, RefreshCw, Loader2, Filter, X } from "lucide-react";
import { apiGet } from "@/shared/api/client";
import { Badge, Button, EmptyState, Input, PageHeader, Select, Surface } from "@/shared/components/ui";

interface AuditEntry {
  id: string;
  adminId?: string | null;
  adminEmail?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  changes?: unknown;
  ipAddress?: string | null;
  createdAt: string;
}

const PAGE_SIZE = 100;

// De vanligaste action-prefixen för dropdown. Använder * som suffix så
// backend matchar alla varianter (ex. ORDER_* matchar ORDER_REFUND,
// ORDER_BULK_REFUND, ORDER_UPDATE etc.). Lista är öppen — admin kan
// skriva exakt action i fritext-fältet om vald kategori inte räcker.
const ACTION_PRESETS: Array<{ value: string; label: string }> = [
  { value: "", label: "Alla händelser" },
  { value: "LOGIN*", label: "Inloggning" },
  { value: "ORDER_*", label: "Ordrar" },
  { value: "PRODUCT_*", label: "Produkter" },
  { value: "CATEGORY_*", label: "Kategorier" },
  { value: "MAIN_CATEGORY_*", label: "Huvudkategorier" },
  { value: "RESTAURANT_*", label: "Restauranger" },
  { value: "PAYOUT_*", label: "Utbetalningar" },
  { value: "REFUND*", label: "Refunds" },
  { value: "USER_*", label: "Användare" },
  { value: "DEAL_*", label: "Deals & rabatter" },
  { value: "EMERGENCY*", label: "Kriskommando" },
];

export function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [actionPreset, setActionPreset] = useState("");
  const [actorInput, setActorInput] = useState("");
  const [qInput, setQInput] = useState("");
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");

  // De input-värden vi faktiskt skickar till API:n. Vi separerar så att
  // användaren kan skriva färdigt utan att varje knapptryck triggar request.
  const [applied, setApplied] = useState({ action: "", actor: "", q: "", from: "", to: "" });

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String((page - 1) * PAGE_SIZE));
    if (applied.action) params.set("action", applied.action);
    if (applied.actor) params.set("actor", applied.actor);
    if (applied.q) params.set("q", applied.q);
    if (applied.from) params.set("from", applied.from);
    if (applied.to) params.set("to", applied.to);
    return params.toString();
  }, [page, applied]);

  const logs = useQuery({
    queryKey: ["audit-log", queryString],
    queryFn: () => apiGet<{ logs: AuditEntry[]; total: number }>(`/admin/audit-log?${queryString}`),
    refetchInterval: 30000,
  });

  const totalPages = logs.data ? Math.max(1, Math.ceil(logs.data.total / PAGE_SIZE)) : 1;
  const hasActiveFilter =
    applied.action || applied.actor || applied.q || applied.from || applied.to;

  const applyFilters = () => {
    setApplied({
      action: actionPreset,
      actor: actorInput.trim(),
      q: qInput.trim(),
      from: fromInput,
      to: toInput,
    });
    setPage(1);
  };

  const clearFilters = () => {
    setActionPreset("");
    setActorInput("");
    setQInput("");
    setFromInput("");
    setToInput("");
    setApplied({ action: "", actor: "", q: "", from: "", to: "" });
    setPage(1);
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="Audit-log"
        actions={
          <Button variant="secondary" onClick={() => logs.refetch()}>
            <RefreshCw size={14} /> Uppdatera
          </Button>
        }
      />

      <Surface className="px-6 py-5">
        <div className="flex items-center gap-3">
          <History size={18} className="text-[var(--accent)]" />
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Visar alla mutations från admin-panelen. Refund, deactivate, emergency-close, GDPR-export osv. Senaste 30 dagarna lagras.
          </p>
        </div>
      </Surface>

      {/* Filter-panel — incident-blocker utan denna enligt A13 Markus. */}
      <Surface className="px-6 py-5">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={16} className="text-[var(--accent)]" />
          <p className="text-sm font-bold uppercase tracking-widest" style={{ color: "var(--text-primary)" }}>
            Filter
          </p>
          {hasActiveFilter ? (
            <Button variant="secondary" onClick={clearFilters}>
              <X size={12} /> Rensa
            </Button>
          ) : null}
        </div>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <Select
            value={actionPreset}
            onChange={(e) => setActionPreset(e.target.value)}
          >
            {ACTION_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </Select>
          <Input
            placeholder="Admin-email (substring)"
            value={actorInput}
            onChange={(e) => setActorInput(e.target.value)}
          />
          <Input
            placeholder="Sök i resurs/ID/action"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") applyFilters(); }}
          />
          <Input
            type="date"
            value={fromInput}
            onChange={(e) => setFromInput(e.target.value)}
            placeholder="Från"
          />
          <Input
            type="date"
            value={toInput}
            onChange={(e) => setToInput(e.target.value)}
            placeholder="Till"
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="primary" onClick={applyFilters} disabled={logs.isFetching}>
            <Filter size={14} /> Filtrera
          </Button>
        </div>
      </Surface>

      <Surface className="px-6 py-5">
        {logs.isLoading ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            <Loader2 size={14} className="animate-spin" /> Laddar...
          </div>
        ) : !logs.data?.logs.length ? (
          <EmptyState
            title={hasActiveFilter ? "Inga loggar matchar filtret" : "Inga audit-loggar än"}
            description={hasActiveFilter ? "Justera filtret eller rensa det." : "När admins gör mutations dyker de upp här."}
          />
        ) : (
          <>
            <div className="grid gap-2">
              {logs.data.logs.map((l) => (
                <div key={l.id} className="surface-muted px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge tone={l.action.includes("REFUND") || l.action.includes("DEACTIVATE") || l.action.includes("EMERGENCY") ? "danger" : "info"}>
                        {l.action}
                      </Badge>
                      <span className="font-bold" style={{ color: "var(--text-primary)" }}>
                        {l.resourceType}
                      </span>
                      {l.resourceId && (
                        <code className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--bg-deep)", color: "var(--text-secondary)" }}>
                          {l.resourceId.slice(-12)}
                        </code>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "var(--text-secondary)" }}>
                      <span>{l.adminEmail || "system"}</span>
                      {l.ipAddress && <span>· {l.ipAddress}</span>}
                      <span>· {new Date(l.createdAt).toLocaleString("sv-SE")}</span>
                    </div>
                    {l.changes ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
                          Visa ändringar
                        </summary>
                        <pre className="mt-2 text-[10px] p-2 rounded overflow-x-auto" style={{ backgroundColor: "var(--bg-deep)", color: "var(--text-primary)" }}>
                          {JSON.stringify(l.changes, null, 2)}
                        </pre>
                      </details>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                  Sida <strong>{page}</strong> av <strong>{totalPages}</strong> ({logs.data.total} loggar totalt)
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Föregående</Button>
                  <Button variant="secondary" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Nästa</Button>
                </div>
              </div>
            )}
          </>
        )}
      </Surface>
    </div>
  );
}
