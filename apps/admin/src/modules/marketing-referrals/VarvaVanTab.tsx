"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Loader2, Save, Truck, UserPlus } from "lucide-react";
import { Surface, Button, Badge, Field, Input, LoadingPanel, EmptyState, MetricCard, Modal, Select, Toggle, ErrorPanel } from "@/shared/components/ui";
import {
  getWelcomeDealSettings,
  getReferralStats,
  referralStatsQueryKey,
  getReferrals,
  referralsListQueryKey,
  revertReferral,
  updateWelcomeDealSettings,
  welcomeDealQueryKey,
  type ReferralOffer,
} from "./api";

const DEFAULT_OFFER: ReferralOffer = {
  discountKind: "PERCENT",
  discountValue: 20,
  freeDelivery: false,
  minOrderKr: 150,
};

function offerIsEmpty(offer: ReferralOffer) {
  return (offer.discountKind === "NONE" || offer.discountValue <= 0) && !offer.freeDelivery;
}

function OfferEditor({
  title,
  description,
  icon,
  offer,
  onChange,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  offer: ReferralOffer;
  onChange: (next: ReferralOffer) => void;
}) {
  const set = <K extends keyof ReferralOffer>(key: K, value: ReferralOffer[K]) => onChange({ ...offer, [key]: value });
  return (
    <Surface className="px-6 py-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">{icon}</span>
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-sm text-[var(--text-secondary)]">{description}</p>
        </div>
      </div>
      <div className="mt-5 grid gap-4 border-t border-[var(--border-subtle)] pt-5 sm:grid-cols-2">
        <Field label="Rabattmodell">
          <Select value={offer.discountKind} onChange={(e) => set("discountKind", e.target.value as ReferralOffer["discountKind"])}>
            <option value="PERCENT">Procent av ordern</option>
            <option value="FIXED">Fast belopp (kr)</option>
            <option value="NONE">Ingen varurabatt</option>
          </Select>
        </Field>
        {offer.discountKind !== "NONE" && (
          <Field label={offer.discountKind === "PERCENT" ? "Rabatt (%)" : "Rabatt (kr)"}>
            <Input
              type="number"
              min={0}
              max={offer.discountKind === "PERCENT" ? 100 : undefined}
              value={offer.discountValue}
              onChange={(e) => set("discountValue", e.target.value ? Number(e.target.value) : 0)}
            />
          </Field>
        )}
        <Field label="Minsta ordervärde (kr)">
          <Input type="number" min={0} value={offer.minOrderKr} onChange={(e) => set("minOrderKr", e.target.value ? Number(e.target.value) : 0)} />
        </Field>
      </div>
      <div className="mt-4 flex items-center justify-between rounded-xl bg-[var(--bg-panel-muted)] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <Truck size={17} />
          <div>
            <p className="text-sm font-semibold">Kombinera med fri leverans</p>
            <p className="text-xs text-[var(--text-secondary)]">Kan användas tillsammans med procent eller fast rabatt.</p>
          </div>
        </div>
        <Toggle checked={offer.freeDelivery} onChange={(value) => set("freeDelivery", value)} />
      </div>
      {offerIsEmpty(offer) && <p className="mt-3 text-xs text-[var(--danger)]">Välj en rabatt eller fri leverans.</p>}
    </Surface>
  );
}

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
  const [page, setPage] = useState(1);
  const [revertId, setRevertId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [inviteeOffer, setInviteeOffer] = useState<ReferralOffer>(DEFAULT_OFFER);
  const [inviterOffer, setInviterOffer] = useState<ReferralOffer>(DEFAULT_OFFER);

  const settings = useQuery({ queryKey: welcomeDealQueryKey, queryFn: getWelcomeDealSettings });
  const stats = useQuery({ queryKey: referralStatsQueryKey, queryFn: getReferralStats });
  const list = useQuery({ queryKey: referralsListQueryKey({ search: query, page }), queryFn: () => getReferrals({ search: query, page }) });
  const revert = useMutation({
    mutationFn: () => revertReferral(revertId as string, reason.trim() || "Admin"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing-referrals"] });
      setRevertId(null);
      setReason("");
    },
  });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!settings.data) return;
    setEnabled(!!settings.data.referralEnabled);
    setInviteeOffer(settings.data.referralInviteeOffer ?? DEFAULT_OFFER);
    setInviterOffer(settings.data.referralInviterOffer ?? DEFAULT_OFFER);
  }, [settings.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const save = useMutation({
    mutationFn: () => updateWelcomeDealSettings({
      referralEnabled: enabled,
      ...(enabled ? { referralInviteeOffer: inviteeOffer, referralInviterOffer: inviterOffer } : {}),
      referralCouponsPerSide: 1,
      referralMaxRewardsPerInviter: 0,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: welcomeDealQueryKey }),
  });

  const rows = list.data?.data ?? [];
  const pageSize = Math.max(1, list.data?.pageSize ?? 1);
  const totalPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / pageSize));

  const applySearch = () => {
    setPage(1);
    setQuery(search.trim());
  };

  if (settings.isLoading) return <LoadingPanel label="Laddar referral-inställningar..." />;
  if (settings.isError || !settings.data) return <ErrorPanel title="Kunde inte ladda referral-inställningar" action={<Button onClick={() => void settings.refetch()}>Försök igen</Button>} />;
  const invalid = enabled && (offerIsEmpty(inviteeOffer) || offerIsEmpty(inviterOffer));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Telefonbaserad värvning</h2>
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">Koden låses upp efter första betalda ordern. Den inbjudna får sin rabatt utan konto; värvaren får en ny personlig engångskod efter slutförd order.</p>
        </div>
        <div className="flex items-center gap-3">
          <Toggle checked={enabled} onChange={setEnabled} />
          <Button variant="primary" disabled={save.isPending || invalid} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="animate-spin" size={15} /> : <Save size={15} />} Spara
          </Button>
        </div>
      </div>

      {enabled && (
        <div className="grid gap-4 lg:grid-cols-2">
          <OfferEditor title="Den inbjudna får" description="Gäller på telefonnumrets första lyckade beställning." icon={<UserPlus size={18} />} offer={inviteeOffer} onChange={setInviteeOffer} />
          <OfferEditor title="Värvaren får" description="En ny unik engångskod för varje slutförd referral-order." icon={<Gift size={18} />} offer={inviterOffer} onChange={setInviterOffer} />
        </div>
      )}

      <div className="flex items-center gap-3">
        <Badge tone={enabled ? "success" : "neutral"}>{enabled ? "Referral aktiv" : "Referral avstängd"}</Badge>
        {save.isSuccess && <span className="text-sm text-[var(--success)]">Sparat</span>}
        {save.isError && <span className="text-sm text-[var(--danger)]">Kunde inte spara inställningarna</span>}
      </div>

      {stats.isLoading ? (
        <LoadingPanel label="Laddar referral-statistik..." />
      ) : stats.isError || !stats.data ? (
        <ErrorPanel
          title="Kunde inte ladda referral-statistik"
          description="Statistiken är tillfälligt otillgänglig; nollvärden visas inte som ersättning."
          action={<Button onClick={() => void stats.refetch()}>Försök igen</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Inbjudna" value={stats.data.funnel.invited.toLocaleString("sv-SE")} />
          <MetricCard label="Registrerade" value={stats.data.funnel.registered.toLocaleString("sv-SE")} />
          <MetricCard label="Lade order" value={stats.data.funnel.ordered.toLocaleString("sv-SE")} />
          <MetricCard label="Belönade" value={stats.data.funnel.rewarded.toLocaleString("sv-SE")} />
        </div>
      )}

      <Surface>
        <div className="flex flex-col gap-4 p-6">
          <h2 className="text-lg font-semibold">Värvningar</h2>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Sök inbjudare eller inbjuden"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applySearch()}
            />
            <Button onClick={applySearch}>Sök</Button>
          </div>

          {list.isLoading ? (
            <LoadingPanel />
          ) : list.isError || !list.data ? (
            <ErrorPanel
              title="Kunde inte ladda värvningar"
              description="Listan är tillfälligt otillgänglig. Inga resultat har ersatts med en tom lista."
              action={<Button onClick={() => void list.refetch()}>Försök igen</Button>}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              title={query ? "Inga matchande värvningar" : "Inga värvningar än"}
              description={query ? "Ändra sökningen och försök igen." : "Här syns vem som värvat vem och status."}
            />
          ) : (
            <>
              <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)]">
                {rows.map((r, i) => (
                  <div key={r.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-[var(--border-subtle)]" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {r.inviterName || r.inviterEmail || r.inviterPhone || "Okänd"}
                        <span className="px-1.5 text-[var(--text-muted)]">till</span>
                        {r.inviteeName || r.inviteeEmail || r.inviteePhone || "Väntar"}
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
              <div className="flex flex-col gap-3 text-sm text-[var(--text-secondary)] sm:flex-row sm:items-center sm:justify-between">
                <span>{list.data.total} värvningar · sida {list.data.page} av {totalPages}</span>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>‹ Föregående</Button>
                  <Button variant="secondary" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages}>Nästa ›</Button>
                </div>
              </div>
            </>
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
