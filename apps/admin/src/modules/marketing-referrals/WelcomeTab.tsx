"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Percent, Save, Truck, Loader2 } from "lucide-react";
import {
  getWelcomeDealSettings,
  updateWelcomeDealSettings,
  welcomeDealQueryKey,
  type WelcomeOffer,
} from "./api";
import { Badge, Button, ErrorPanel, Field, Input, LoadingPanel, Select, Surface, Toggle } from "@/shared/components/ui";

const DEFAULT_OFFER: WelcomeOffer = { discountKind: "PERCENT", discountValue: 20, freeDelivery: true, minOrderKr: 0 };

// Välkomstkampanj = rabatt till nya, inloggade kunder.
export default function WelcomeTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: welcomeDealQueryKey, queryFn: getWelcomeDealSettings });

  const [discountActive, setDiscountActive] = useState(false);
  const [offer, setOffer] = useState<WelcomeOffer>(DEFAULT_OFFER);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!q.data) return;
    setDiscountActive(!!q.data.welcomeDealActive);
    setOffer(q.data.welcomeOffer ?? DEFAULT_OFFER);
  }, [q.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const save = useMutation({
    mutationFn: () =>
      updateWelcomeDealSettings({
        welcomeDealActive: discountActive,
        ...(discountActive ? { welcomeOffer: offer } : {}),
        welcomeAudience: "LOGGED_IN",
        welcomeMaxOrders: 1,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: welcomeDealQueryKey }),
  });

  const offerEmpty = discountActive
    && (offer.discountKind === "NONE" || offer.discountValue <= 0)
    && !offer.freeDelivery;

  if (q.isLoading) return <LoadingPanel label="Laddar välkomstkampanj..." />;
  if (q.isError || !q.data) return <ErrorPanel title="Kunde inte ladda välkomstkampanj" action={<Button onClick={() => void q.refetch()}>Försök igen</Button>} />;

  const setOfferField = <K extends keyof WelcomeOffer>(k: K, v: WelcomeOffer[K]) => setOffer((o) => ({ ...o, [k]: v }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <p className="max-w-2xl text-sm text-[var(--text-secondary)]">
          Rabatt till nya, inloggade kunder. En kupong per konto. Landar i kundens &quot;Mina deals&quot; direkt efter registrering.
        </p>
        <Button variant="primary" disabled={save.isPending || offerEmpty} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />} Spara
        </Button>
      </div>

      <Surface className="px-6 py-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><Percent size={17} /></span>
            <div>
              <h2 className="text-lg font-semibold">Rabatt för nya konton</h2>
              <p className="text-sm text-[var(--text-secondary)]">Auto i kassan, ingen kod. Rabatt och fri leverans kan kombineras.</p>
            </div>
          </div>
          <Toggle checked={discountActive} onChange={setDiscountActive} />
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
                  <p className="text-xs text-[var(--text-secondary)]">Stackbar, kan kombineras med rabatten ovan.</p>
                </div>
              </div>
              <Toggle checked={offer.freeDelivery} onChange={(v) => setOfferField("freeDelivery", v)} />
            </div>
            {offerEmpty ? (
              <p className="text-xs text-[var(--warning)]">Sätt en rabatt eller slå på fri leverans, annars ger erbjudandet ingenting.</p>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">
                Förhandsvisning: nya konton får {offer.discountKind === "PERCENT" && offer.discountValue > 0 ? `${offer.discountValue}% rabatt` : offer.discountKind === "FIXED" && offer.discountValue > 0 ? `${offer.discountValue} kr rabatt` : ""}
                {(offer.discountKind !== "NONE" && offer.discountValue > 0 && offer.freeDelivery) ? " + " : ""}
                {offer.freeDelivery ? "fri leverans" : ""}
                {offer.minOrderKr > 0 ? ` (vid order minst ${offer.minOrderKr} kr)` : ""}.
              </p>
            )}
          </div>
        )}
      </Surface>

      <div className="flex items-center gap-3">
        <Badge tone={discountActive ? "success" : "neutral"}>{discountActive ? "Rabatt aktiv" : "Inget aktivt"}</Badge>
        {save.isError && <span className="text-sm text-[var(--danger)]">Kunde inte spara</span>}
        {save.isSuccess && <span className="text-sm text-[var(--success)]">Sparat</span>}
      </div>
    </div>
  );
}
