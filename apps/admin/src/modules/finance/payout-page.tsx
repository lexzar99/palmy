"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import {
  financeSummaryQueryKey,
  getPayoutSpec,
  payoutSpecQueryKey,
  setRestaurantDelivery,
  upsertPayout,
} from "@/modules/finance/api";
import { printPayoutSpec } from "@/modules/finance/spec-print";
import { DeliveryModeBadge } from "@/shared/components/delivery-mode";
import { Button, Field, Input, MetricCard, PageHeader, Select, Surface, Textarea } from "@/shared/components/ui";
import { formatCurrency, formatDate } from "@/shared/utils/format";

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function CalcRow({ label, value, strong, sub, minus }: { label: string; value: number; strong?: boolean; sub?: boolean; minus?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2 ${sub ? "pl-4 text-[var(--text-secondary)]" : ""} ${strong ? "border-t border-[var(--border-strong,rgba(0,0,0,0.15))] font-black" : "border-b border-[var(--border,rgba(0,0,0,0.06))]"}`}>
      <span>{minus ? "− " : ""}{label}</span>
      <span className="tabular-nums">{formatCurrency(value)}</span>
    </div>
  );
}

export function FinancePayoutPage({ restaurantId, from, to }: { restaurantId: string; from?: string; to?: string }) {
  const now = new Date();
  const periodFrom = from || isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const periodTo = to || isoDate(now);

  const router = useRouter();
  const queryClient = useQueryClient();
  const [adjustment, setAdjustment] = useState(0);
  const [status, setStatus] = useState("DRAFT");
  const [notes, setNotes] = useState("");
  const [payoutReference, setPayoutReference] = useState("");
  const [selfDelivery, setSelfDelivery] = useState(false);
  const [override, setOverride] = useState<string>("");

  const spec = useQuery({
    queryKey: payoutSpecQueryKey(restaurantId, periodFrom, periodTo),
    queryFn: () => getPayoutSpec(restaurantId, periodFrom, periodTo),
  });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const p = spec.data?.persisted;
    setAdjustment(p?.adjustmentAmount || 0);
    setStatus(p?.status || "DRAFT");
    setNotes(p?.notes || "");
    setPayoutReference(p?.payoutReference || "");
    if (spec.data?.restaurant) {
      setSelfDelivery(spec.data.restaurant.selfDelivery);
      setOverride(spec.data.restaurant.commissionPctOverride == null ? "" : String(spec.data.restaurant.commissionPctOverride));
    }
  }, [spec.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const b = spec.data?.breakdown;
  const isOwed = (b?.owed ?? 0) > 0;
  const net = isOwed ? (b?.owed ?? 0) : Math.max(0, (b?.payout ?? 0) - adjustment);

  const savePayout = useMutation({
    mutationFn: async () => {
      if (!spec.data) return;
      await upsertPayout({
        restaurantId,
        periodStart: spec.data.period.from,
        periodEnd: spec.data.period.to,
        grossSales: spec.data.breakdown.restaurantGross,
        orderCount: spec.data.breakdown.orderCount,
        commissionAmount: spec.data.breakdown.commission,
        subscriptionAmount: spec.data.breakdown.subscription,
        adjustmentAmount: adjustment,
        payoutAmount: isOwed ? 0 : net,
        status,
        notes: notes || null,
        payoutReference: payoutReference || null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
      router.push("/finance");
    },
  });

  const saveDelivery = useMutation({
    mutationFn: () =>
      setRestaurantDelivery(restaurantId, {
        selfDelivery,
        commissionPctOverride: override.trim() === "" ? null : Number(override),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: financeSummaryQueryKey(periodFrom, periodTo) });
      await queryClient.invalidateQueries({ queryKey: payoutSpecQueryKey(restaurantId, periodFrom, periodTo) });
    },
  });

  return (
    <div className="page-stack">
      <PageHeader
        title={spec.data?.restaurant.name || "Utbetalning"}
        actions={
          <Link href="/finance" className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-3.5 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            <ArrowLeft size={15} /> Tillbaka
          </Link>
        }
      />
      <p className="-mt-3 text-sm text-[var(--text-secondary)]">{formatDate(periodFrom)} – {formatDate(periodTo)}</p>

      {spec.isLoading || !b ? (
        <Surface className="flex items-center gap-2 px-6 py-12 text-sm text-[var(--text-secondary)]">
          <Loader2 size={16} className="animate-spin" /> Beräknar specen…
        </Surface>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="Restaurangens intäkt" value={formatCurrency(b.restaurantGross)} />
            <MetricCard label="Plattformens avdrag" value={formatCurrency(b.commission + b.subscription + b.feeVat)} />
            <MetricCard label={isOwed ? "Att fakturera" : "Netto att betala ut"} value={formatCurrency(net)} />
          </div>

          <Surface className="px-6 py-6">
            <CalcRow label={`Bruttoförsäljning (${b.orderCount} ordrar)`} value={b.grossTotal} />
            <CalcRow label="varav matvärde (provisionsbas)" value={b.foodBase} sub />
            <CalcRow label="varav leveransavgift" value={b.deliveryFee} sub />
            <CalcRow label="varav dricks" value={b.tip} sub />
            <CalcRow label="Restaurangens intäkt" value={b.restaurantGross} strong />
            <CalcRow label={`Provision (${b.commissionPct}%)`} value={b.commission} minus />
            <CalcRow label={`Abonnemang (${b.tierLabel})`} value={b.subscription} minus />
            <CalcRow label={`Moms på avgifter (${b.feeVatPct}%)`} value={b.feeVat} minus />
            <div className={`mt-3 flex items-center justify-between rounded-xl px-4 py-3 text-white ${isOwed ? "bg-[#B45309]" : "bg-[var(--accent-strong,#111)]"}`}>
              <span className="font-bold">{isOwed ? "Att fakturera restaurangen" : "Netto att betala ut"}</span>
              <span className="text-xl font-black tabular-nums">{formatCurrency(net)}</span>
            </div>
            {isOwed ? (
              <p className="mt-3 text-xs text-[var(--text-secondary)]">
                Avgifterna översteg restaurangens intäkt denna period (typiskt abonnemang vid få ordrar) → ingen utbetalning, beloppet faktureras istället.
              </p>
            ) : null}
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              Matmoms ({b.foodVatPct}%) i försäljningen: {formatCurrency(b.foodVat)} — informativ, restaurangens egen redovisning.
            </p>
          </Surface>

          <Surface className="px-6 py-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Leveransmodell & provision</p>
              <DeliveryModeBadge selfDelivery={selfDelivery} />
            </div>
            <div className="mt-3 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <Field label="Modell">
                <Select value={selfDelivery ? "self" : "platform"} onChange={(e) => setSelfDelivery(e.target.value === "self")}>
                  <option value="platform">Vi levererar (20%)</option>
                  <option value="self">Levererar själv (10%)</option>
                </Select>
              </Field>
              <Field label="Provisions-override (%, tomt = global)">
                <Input type="number" value={override} placeholder="–" onChange={(e) => setOverride(e.target.value)} />
              </Field>
              <Button onClick={() => saveDelivery.mutate()}>
                {saveDelivery.isPending ? <Loader2 size={16} className="animate-spin" /> : "Uppdatera modell"}
              </Button>
            </div>
          </Surface>

          <Surface className="px-6 py-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Status">
                <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="DRAFT">Utkast</option>
                  <option value="APPROVED">Godkänd</option>
                  <option value="PAID">Betald</option>
                  <option value="HOLD">Pausad</option>
                </Select>
              </Field>
              <Field label="Justering (kr)"><Input type="number" value={adjustment} onChange={(e) => setAdjustment(Number(e.target.value))} /></Field>
              <Field label="Betalningsreferens"><Input value={payoutReference} onChange={(e) => setPayoutReference(e.target.value)} /></Field>
              <div className="md:col-span-1" />
              <div className="md:col-span-2"><Field label="Anteckning"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
            </div>
          </Surface>

          <Surface className="px-6 py-6">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Ordrar i perioden</p>
            <div className="mt-3 max-h-80 overflow-auto">
              {spec.data?.orders.length ? (
                <table className="data-table">
                  <thead><tr><th>Order</th><th>Datum</th><th>Typ</th><th>Summa</th></tr></thead>
                  <tbody>
                    {spec.data.orders.map((o) => (
                      <tr key={o.orderNumber}>
                        <td>#{o.orderNumber}</td>
                        <td>{formatDate(o.createdAt)}</td>
                        <td>{o.type === "PICKUP" ? "Avhämtning" : "Leverans"}</td>
                        <td className="tabular-nums">{formatCurrency(o.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-[var(--text-secondary)]">Inga ordrar i perioden.</p>
              )}
            </div>
          </Surface>

          <div className="flex items-center justify-between gap-2">
            <Button onClick={() => spec.data && printPayoutSpec(spec.data, adjustment)}>
              <Printer size={16} /> Skriv ut / PDF
            </Button>
            <div className="flex gap-2">
              <Link href="/finance" className="inline-flex items-center rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Avbryt</Link>
              <Button variant="primary" onClick={() => savePayout.mutate()}>
                {savePayout.isPending ? <Loader2 size={16} className="animate-spin" /> : "Spara utbetalning"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
