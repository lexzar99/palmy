"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { BarChart3, List, Save, Users } from "lucide-react";
import { getWelcomeDealSettings, updateWelcomeDealSettings, welcomeDealQueryKey } from "@/modules/marketing-referrals/api";
import { Badge, Button, ErrorPanel, Field, Input, LoadingPanel, PageHeader, Select, Surface } from "@/shared/components/ui";

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full transition-transform ${on ? "translate-x-[22px] bg-[var(--accent-fg)]" : "translate-x-0.5 bg-[var(--bg-panel)]"}`} />
    </button>
  );
}

export function ReferralPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: welcomeDealQueryKey, queryFn: getWelcomeDealSettings });

  const [enabled, setEnabled] = useState(false);
  const [dealId, setDealId] = useState<string | null>(null);
  const [couponsPerSide, setCouponsPerSide] = useState(1);
  const [maxPerInviter, setMaxPerInviter] = useState(20);

  useEffect(() => {
    if (!q.data) return;
    setEnabled(!!q.data.referralEnabled);
    setDealId(q.data.referralDealId ?? null);
    setCouponsPerSide(q.data.referralCouponsPerSide ?? 1);
    setMaxPerInviter(q.data.referralMaxRewardsPerInviter ?? 20);
  }, [q.data]);

  const save = useMutation({
    mutationFn: () =>
      updateWelcomeDealSettings({
        referralEnabled: enabled,
        referralDealId: dealId,
        referralCouponsPerSide: couponsPerSide,
        referralMaxRewardsPerInviter: maxPerInviter,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: welcomeDealQueryKey }),
  });

  if (q.isLoading) return <LoadingPanel label="Laddar referral…" />;
  if (q.isError || !q.data) return <ErrorPanel title="Kunde inte ladda referral" action={<Button onClick={() => void q.refetch()}>Försök igen</Button>} />;

  const deals = q.data.availableDeals ?? [];

  return (
    <div className="page-stack">
      <PageHeader
        title="Värva vän"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/marketing-referrals/list" className="button-secondary"><List size={15} /> Värvningar</Link>
            <Link href="/marketing-referrals/stats" className="button-secondary"><BarChart3 size={15} /> Statistik</Link>
            <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
              <Save size={15} /> {save.isPending ? "Sparar…" : "Spara"}
            </Button>
          </div>
        }
      />
      <p className="-mt-2 text-sm text-[var(--text-secondary)]">
        Befintliga kunder delar en kod → både värvaren och vännen får en belöning. Avstängd som standard.
      </p>

      <Surface className="px-6 py-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><Users size={17} /></span>
            <div>
              <h2 className="text-lg font-bold tracking-[-0.01em]">Värva vän</h2>
              <p className="text-sm text-[var(--text-secondary)]">{enabled ? "Aktiverad" : "Avstängd"}</p>
            </div>
          </div>
          <Toggle on={enabled} onChange={setEnabled} />
        </div>

        {enabled && (
          <div className="mt-6 grid gap-5 border-t border-[var(--border-subtle)] pt-6 sm:grid-cols-2">
            <Field label="Belöning (Personlig deal)">
              <Select value={dealId ?? ""} onChange={(e) => setDealId(e.target.value || null)}>
                <option value="">Välj mall…</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                    {d.discountType === "PERCENTAGE" ? ` · ${d.discountValue}%` : d.discountType === "FIXED" ? ` · ${d.discountValue} kr` : ""}
                    {d.freeDelivery ? " + fri leverans" : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Kuponger per part">
              <Input type="number" min={1} max={10} value={couponsPerSide} onChange={(e) => setCouponsPerSide(e.target.value ? Number(e.target.value) : 1)} />
            </Field>
            <Field label="Max värvningar per person (30 dgr)">
              <Input type="number" min={0} max={1000} value={maxPerInviter} onChange={(e) => setMaxPerInviter(e.target.value ? Number(e.target.value) : 0)} />
            </Field>
          </div>
        )}
      </Surface>

      <div className="flex items-center gap-3">
        <Badge tone={enabled ? "success" : "neutral"}>{enabled ? "Aktiverad" : "Avstängd"}</Badge>
        {save.isError && <span className="text-sm text-[var(--danger)]">Kunde inte spara</span>}
        {save.isSuccess && <span className="text-sm text-[var(--success)]">Sparat</span>}
      </div>
    </div>
  );
}
