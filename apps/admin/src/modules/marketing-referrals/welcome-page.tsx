"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Coins, Gift, Percent, Save, Truck } from "lucide-react";
import {
  getWelcomeDealSettings,
  updateWelcomeDealSettings,
  welcomeDealQueryKey,
  type WelcomeAudience,
} from "@/modules/marketing-referrals/api";
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
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full transition-transform ${on ? "translate-x-[22px] bg-[var(--accent-fg)]" : "translate-x-0.5 bg-[var(--bg-panel)]"}`}
      />
    </button>
  );
}

const AUDIENCE_LABEL: Record<WelcomeAudience, string> = {
  FIRST_ORDER: "Alla nya (per telefon)",
  LOGGED_IN: "Endast inloggade konton",
  ALL: "Alla kunder (även återkommande)",
};

export function WelcomeCampaignPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: welcomeDealQueryKey, queryFn: getWelcomeDealSettings });

  // Rabatt
  const [discountActive, setDiscountActive] = useState(false);
  const [dealId, setDealId] = useState<string | null>(null);
  const [audience, setAudience] = useState<WelcomeAudience>("FIRST_ORDER");
  const [maxOrders, setMaxOrders] = useState(1);
  // Poäng
  const [pointsActive, setPointsActive] = useState(false);
  const [pointsAmount, setPointsAmount] = useState(100);
  const [sponsorOn, setSponsorOn] = useState(false);
  const [sponsorCardId, setSponsorCardId] = useState<string | null>(null);

  useEffect(() => {
    if (!q.data) return;
    setDiscountActive(!!q.data.welcomeDealActive);
    setDealId(q.data.welcomeDealId ?? null);
    setAudience((q.data.welcomeAudience as WelcomeAudience) ?? "FIRST_ORDER");
    setMaxOrders(q.data.welcomeMaxOrders ?? 1);
    setPointsActive(!!q.data.welcomePointsActive);
    setPointsAmount(q.data.welcomePointsAmount ?? 100);
    setSponsorOn(!!q.data.welcomePointsSponsorCardId);
    setSponsorCardId(q.data.welcomePointsSponsorCardId ?? null);
  }, [q.data]);

  const save = useMutation({
    mutationFn: () =>
      updateWelcomeDealSettings({
        welcomeDealActive: discountActive,
        welcomeDealId: discountActive ? dealId : dealId, // behåll vald mall även när av
        welcomeAudience: audience,
        welcomeMaxOrders: maxOrders,
        welcomePointsActive: pointsActive,
        welcomePointsAmount: pointsAmount,
        welcomePointsSponsorCardId: sponsorOn ? sponsorCardId : null,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: welcomeDealQueryKey }),
  });

  if (q.isLoading) return <LoadingPanel label="Laddar välkomstkampanj…" />;
  if (q.isError || !q.data) return <ErrorPanel title="Kunde inte ladda välkomstkampanj" action={<Button onClick={() => void q.refetch()}>Försök igen</Button>} />;

  const deals = q.data.availableDeals ?? [];
  const sponsors = q.data.sponsorCards ?? [];

  return (
    <div className="page-stack">
      <PageHeader
        title="Välkomstkampanj"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/marketing-referrals/referral" className="button-secondary">Värva vän</Link>
            <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
              <Save size={15} /> {save.isPending ? "Sparar…" : "Spara"}
            </Button>
          </div>
        }
      />
      <p className="-mt-2 text-sm text-[var(--text-secondary)]">
        Belöning till nya kunder. Rabatt och poäng kan vara på samtidigt — eller bara den ena.
      </p>

      {/* ── Rabatt-belöning ── */}
      <Surface className="px-6 py-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><Percent size={17} /></span>
            <div>
              <h2 className="text-lg font-bold tracking-[-0.01em]">Rabatt på första beställningarna</h2>
              <p className="text-sm text-[var(--text-secondary)]">Auto i kassan, ingen kod. Stödjer % + fri leverans.</p>
            </div>
          </div>
          <Toggle on={discountActive} onChange={setDiscountActive} />
        </div>

        {discountActive && (
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
              <p className="mt-1.5 text-xs text-[var(--text-muted)]">
                Skapa mallar (t.ex. 20% + fri leverans) under <Link href="/deals" className="underline">Deals → Personliga</Link>.
              </p>
            </Field>
            <Field label="Vilka kunder">
              <Select value={audience} onChange={(e) => setAudience(e.target.value as WelcomeAudience)}>
                {(["FIRST_ORDER", "LOGGED_IN", "ALL"] as WelcomeAudience[]).map((a) => (
                  <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>
                ))}
              </Select>
            </Field>
            <div>
              <p className="field-label mb-2">Gäller kundens första … beställningar</p>
              <div className="flex gap-2">
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMaxOrders(n)}
                    className={`h-10 w-12 rounded-lg border text-sm font-bold transition-colors ${maxOrders === n ? "border-transparent bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Surface>

      {/* ── Poäng-belöning ── */}
      <Surface className="px-6 py-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><Coins size={17} /></span>
            <div>
              <h2 className="text-lg font-bold tracking-[-0.01em]">Poäng vid registrering</h2>
              <p className="text-sm text-[var(--text-secondary)]">Nya kunder claimar bonusen efter registrering.</p>
            </div>
          </div>
          <Toggle on={pointsActive} onChange={setPointsActive} />
        </div>

        {pointsActive && (
          <div className="mt-6 space-y-5 border-t border-[var(--border-subtle)] pt-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Antal poäng">
                <Input type="number" min={0} value={pointsAmount} onChange={(e) => setPointsAmount(e.target.value ? Number(e.target.value) : 0)} />
              </Field>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl bg-[var(--bg-panel-muted)] px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Sponsor-brandad bonus</p>
                <p className="text-xs text-[var(--text-secondary)]">Av = ren plattform-bonus. På = visa en sponsors namn/logo.</p>
              </div>
              <Toggle on={sponsorOn} onChange={(v) => { setSponsorOn(v); if (!v) setSponsorCardId(null); }} />
            </div>
            {sponsorOn && (
              <Field label="Sponsor">
                {sponsors.length === 0 ? (
                  <p className="text-sm text-[var(--text-secondary)]">Inga aktiva sponsor-kort. Skapa ett under <Link href="/sponsors" className="underline">Sponsorer</Link>.</p>
                ) : (
                  <Select value={sponsorCardId ?? ""} onChange={(e) => setSponsorCardId(e.target.value || null)}>
                    <option value="">Välj sponsor…</option>
                    {sponsors.map((s) => (
                      <option key={s.id} value={s.id}>{s.sponsorName || s.title || "Sponsor"}</option>
                    ))}
                  </Select>
                )}
              </Field>
            )}
          </div>
        )}
      </Surface>

      <div className="flex items-center gap-3">
        <Badge tone={discountActive || pointsActive ? "success" : "neutral"}>
          {discountActive && pointsActive ? "Rabatt + poäng aktiva" : discountActive ? "Rabatt aktiv" : pointsActive ? "Poäng aktiv" : "Inget aktivt"}
        </Badge>
        {save.isError && <span className="text-sm text-[var(--danger)]">Kunde inte spara</span>}
        {save.isSuccess && <span className="text-sm text-[var(--success)]">Sparat</span>}
      </div>
    </div>
  );
}
