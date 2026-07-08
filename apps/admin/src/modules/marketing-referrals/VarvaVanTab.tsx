"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Surface, Button, Badge, Field, Input, LoadingPanel, EmptyState, MetricCard, Modal } from "@/shared/components/ui";
import {
  getReferralStats,
  referralStatsQueryKey,
  getReferrals,
  referralsListQueryKey,
  revertReferral,
} from "./api";

// Värva vän = den nya invite-attributionen (samma Referral-modell, nya tokens).
// Visar tratten + värvningarna med möjlighet att återta en belöning.
const STATUS_LABEL: Record<string, string> = {
  PENDING: "Väntar",
  REGISTERED: "Registrerad",
  ORDERED: "Belönad",
  REWARDED: "Belönad",
  REVERTED: "Återtagen",
  EXPIRED: "Utgången",
};
const STATUS_TONE: Record<string, "neutral" | "info" | "success" | "danger" | "warning"> = {
  PENDING: "neutral",
  REGISTERED: "info",
  ORDERED: "success",
  REWARDED: "success",
  REVERTED: "danger",
  EXPIRED: "neutral",
};

export default function VarvaVanTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [revertId, setRevertId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const stats = useQuery({ queryKey: referralStatsQueryKey, queryFn: getReferralStats });
  const list = useQuery({ queryKey: referralsListQueryKey({ search: query }), queryFn: () => getReferrals({ search: query }) });
  const revert = useMutation({
    mutationFn: () => revertReferral(revertId as string, reason.trim() || "Admin"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing-referrals"] });
      setRevertId(null);
      setReason("");
    },
  });

  const f = stats.data?.funnel;
  const rows = list.data?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Inbjudna" value={(f?.invited ?? 0).toLocaleString("sv-SE")} />
        <MetricCard label="Registrerade" value={(f?.registered ?? 0).toLocaleString("sv-SE")} />
        <MetricCard label="Lade order" value={(f?.ordered ?? 0).toLocaleString("sv-SE")} />
        <MetricCard label="Belönade" value={(f?.rewarded ?? 0).toLocaleString("sv-SE")} />
      </div>

      <Surface>
        <div className="flex flex-col gap-4 p-6">
          <h2 className="text-lg font-semibold">Värvningar</h2>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Sök inbjudare eller inbjuden"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setQuery(search.trim())}
            />
            <Button onClick={() => setQuery(search.trim())}>Sök</Button>
          </div>

          {list.isLoading ? (
            <LoadingPanel />
          ) : rows.length === 0 ? (
            <EmptyState title="Inga värvningar än" description="Här syns vem som värvat vem och status." />
          ) : (
            <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)]">
              {rows.map((r, i) => (
                <div key={r.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-[var(--border-subtle)]" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {r.inviterName || r.inviterEmail || "Okänd"}
                      <span className="px-1.5 text-[var(--text-muted)]">till</span>
                      {r.inviteeName || r.inviteeEmail || "Väntar"}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)]">
                      {new Date(r.createdAt).toLocaleDateString("sv-SE")}
                      {r.fraudFlags?.length ? ` · ${r.fraudFlags.length} flaggor` : ""}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                  {r.status !== "REVERTED" && (
                    <Button variant="danger" onClick={() => { setRevertId(r.id); setReason(""); }}>Återta</Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Surface>

      <Modal
        open={!!revertId}
        title="Återta värvning"
        onClose={() => setRevertId(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setRevertId(null)}>Avbryt</Button>
            <Button variant="danger" disabled={revert.isPending} onClick={() => revert.mutate()}>
              {revert.isPending ? <Loader2 className="animate-spin" size={16} /> : "Återta"}
            </Button>
          </div>
        }
      >
        <Field label="Anledning">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="t.ex. misstänkt fusk" />
        </Field>
      </Modal>
    </div>
  );
}
