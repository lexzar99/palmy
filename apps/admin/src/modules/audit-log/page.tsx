"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, RefreshCw, Loader2 } from "lucide-react";
import { apiGet } from "@/shared/api/client";
import { Badge, Button, EmptyState, PageHeader, Surface } from "@/shared/components/ui";

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

export function AuditLogPage() {
  const [page, setPage] = useState(1);

  const logs = useQuery({
    queryKey: ["audit-log", page],
    queryFn: () => apiGet<{ logs: AuditEntry[]; total: number }>(`/admin/audit-log?limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}`),
    refetchInterval: 30000,
  });

  const totalPages = logs.data ? Math.max(1, Math.ceil(logs.data.total / PAGE_SIZE)) : 1;

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

      <Surface className="px-6 py-5">
        {logs.isLoading ? (
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            <Loader2 size={14} className="animate-spin" /> Laddar...
          </div>
        ) : !logs.data?.logs.length ? (
          <EmptyState title="Inga audit-loggar än" description="När admins gör mutations dyker de upp här." />
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
