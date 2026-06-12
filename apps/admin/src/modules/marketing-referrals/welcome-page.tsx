"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Coins, Gift, Percent, Save, Truck } from "lucide-react";
import {
  getWelcomeDealSettings,
  updateWelcomeDealSettings,
  welcomeDealQueryKey,
  type WelcomeOffer,
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

const DEFAULT_OFFER: WelcomeOffer = { discountKind: "PERCENT", discountValue: 20, freeDelivery: true, minOrderKr: 0 };

export function WelcomeCampaignPage() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: welcomeDealQueryKey, queryFn: getWelcomeDealSettings });

  // Rabatt — definieras INLINE (ingen mall-dropdown längre).
  const [discountActive, setDiscountActive] = useState(false);
  const [offer, setOffer] = useState<WelcomeOffer>(DEFAULT_OFFER);
  // Poäng
  const [pointsActive, setPointsActive] = useState(false);
  const [pointsAmount, setPointsAmount] = useState(100);
  const [sponsorOn, setSponsorOn] = useState(false);
  const [sponsorCardId, setSponsorCardId] = useState<string | null>(null);

  useEffect(() => {
    if (!q.data) return;
    setDiscountActive(!!q.data.welcomeDealActive);
    setOffer(q.data.welcomeOffer ?? DEFAULT_OFFER);
    setPointsActive(!!q.data.welcomePointsActive);
    setPointsAmount(q.data.welcomePointsAmount ?? 100);
    setSponsorOn(!!q.data.welcomePointsSponsorCardId);
    setSponsorCardId(q.data.welcomePointsSponsorCardId ?? null);
  }, [q.data]);

  const save = useMutation({
    mutationFn: () =>
      updateWelcomeDealSettings({
        welcomeDealActive: discountActive,
        // Inline-erbjudandet — backend skapar/uppdaterar mallen automatiskt.
        // Skickas bara när rabatten är på (annars rörs inte mallen).
        ...(discountActive ? { welcomeOffer: offer } : {}),
        // Endast inloggade konton, en kupong per konto (UserDeal per userId).
        welcomeAudience: "LOGGED_IN",
        welcomeMaxOrders: 1,
        welcomePointsActive: pointsActive,
        welcomePointsAmount: pointsAmount,
        welcomePointsSponsorCardId: sponsorOn ? sponsorCardId : null,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: welcomeDealQueryKey }),
  });

  // Rabatt på utan att något faktiskt ges (0% / 0 kr och ingen fri leverans).
  const offerEmpty = discountActive
    && (offer.discountKind === "NONE" || offer.discountValue <= 0)
    && !offer.freeDelivery;

  if (q.isLoading) return <LoadingPanel label="Laddar välkomstkampanj…" />;
  if (q.isError || !q.data) return <ErrorPanel title="Kunde inte ladda välkomstkampanj" action={<Button onClick={() => void q.refetch()}>Försök igen</Button>} />;

  const sponsors = q.data.sponsorCards ?? [];
  const setOfferField = <K extends keyof WelcomeOffer>(k: K, v: WelcomeOffer[K]) => setOffer((o) => ({ ...o, [k]: v }));

  return (
    <div className="page-stack">
      <PageHeader
        title="Välkomstkampanj"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/marketing-referrals/referral" className="button-secondary">Värva vän</Link>
            <Button variant="primary" disabled={save.isPending || offerEmpty} onClick={() => save.mutate()}>
              <Save size={15} /> {save.isPending ? "Sparar…" : "Spara"}
            </Button>
          </div>
        }
      />
      <p className="-mt-2 text-sm text-[var(--text-secondary)]">
        Belöning till nya, inloggade kunder — en kupong per konto. Rabatt och poäng kan vara på samtidigt, eller bara den ena. Landar i kundens &ldquo;Mina deals&rdquo; direkt efter registrering.
      </p>

      {/* ── Rabatt-belöning (definieras inline) ── */}
      <Surface className="px-6 py-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><Percent size={17} /></span>
            <div>
              <h2 className="text-lg font-bold tracking-[-0.01em]">Rabatt för nya konton</h2>
              <p className="text-sm text-[var(--text-secondary)]">Auto i kassan, ingen kod. Rabatt + fri leverans kan kombineras.</p>
            </div>
          </div>
          <Toggle on={discountActive} onChange={setDiscountActive} />
        </div>

        {discountActive && (
          <div className="mt-6 space-y-5 border-t border-[var(--border-subtle)] pt-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Typ av rabatt">
                <Select value={offer.discountKind} onChange={(e) => setOfferField("discountKind", e.target.value as WelcomeOffer["discountKind"])}>
                  <option value="PERCENT">Procent av ordern</option>
                  <option value="FIXED">Fast belopp (kr)</option>
                  <option value="NONE">Endast fri leverans</option>
                </Select>
              </Field>
              {offer.discountKind !== "NONE" && (
                <Field label={offer.discountKind === "PERCENT" ? "Rabatt (%)" : "Rabatt (kr)"}>
                  <Input
                    type="number" min={0} max={offer.discountKind === "PERCENT" ? 100 : undefined}
                    value={offer.discountValue}
                    onChange={(e) => setOfferField("discountValue", e.target.value ? Number(e.target.value) : 0)}
                  />
                </Field>
              )}
              <Field label="Minsta ordervärde (kr)">
                <Input type="number" min={0} value={offer.minOrderKr} onChange={(e) => setOfferField("minOrderKr", e.target.value ? Number(e.target.value) : 0)} />
              </Field>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl bg-[var(--bg-panel-muted)] px-4 py-3">
              <div className="flex items-center gap-2.5">
                <Truck size={16} className="text-[var(--text-secondary)]" />
                <div>
                  <p className="text-sm font-semibold">Fri leverans ingår</p>
                  <p className="text-xs text-[var(--text-secondary)]">Stackbar — kan kombineras med rabatten ovan.</p>
                </div>
              </div>
              <Toggle on={offer.freeDelivery} onChange={(v) => setOfferField("freeDelivery", v)} />
            </div>
            {offerEmpty ? (
              <p className="text-xs text-[var(--warning)]">Sätt en rabatt eller slå på fri leverans — annars ger erbjudandet ingenting.</p>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">
                Förhandsvisning: nya konton får {offer.discountKind === "PERCENT" && offer.discountValue > 0 ? `${offer.discountValue}% rabatt` : offer.discountKind === "FIXED" && offer.discountValue > 0 ? `${offer.discountValue} kr rabatt` : ""}
                {(offer.discountKind !== "NONE" && offer.discountValue > 0 && offer.freeDelivery) ? " + " : ""}
                {offer.freeDelivery ? "fri leverans" : ""}
                {offer.minOrderKr > 0 ? ` (vid order ≥ ${offer.minOrderKr} kr)` : ""}.
              </p>
            )}
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
