"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Printer } from "lucide-react";
import {
  economyQueryKey,
  financeSummaryQueryKey,
  getEconomy,
  getPayoutSpec,
  payoutSpecQueryKey,
  setRestaurantDelivery,
  upsertPayout,
} from "@/modules/finance/api";
import { printPayoutSpec } from "@/modules/finance/spec-print";
import { DeliveryModeBadge } from "@/shared/components/delivery-mode";
import { Badge, Button, Field, Input, PageHeader, Select, Surface, Textarea } from "@/shared/components/ui";
import { formatCurrency, formatDate, formatDateTime, orderStatusLabel, paymentStatusLabel } from "@/shared/utils/format";

const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** KPI card matching the design handoff. `accent` tints the last (Bonus) card orange. */
function Kpi({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <article
      className="rounded-[14px] border p-[15px]"
      style={
        accent
          ? { background: "#fff7f3", borderColor: "color-mix(in srgb, var(--accent) 25%, transparent)" }
          : { background: "var(--bg-panel, #fff)", borderColor: "var(--border-subtle)" }
      }
    >
      <p className="text-[12px] font-semibold" style={{ color: accent ? "var(--accent-ink)" : "var(--text-secondary)" }}>
        {label}
      </p>
      <p
        className="mt-[7px] text-[24px] font-extrabold tracking-[-0.7px] tabular-nums"
        style={{ color: accent ? "var(--accent-ink)" : "var(--text-primary)" }}
      >
        {value}
      </p>
    </article>
  );
}

function CalcRow({ label, value, strong, sub, minus }: { label: string; value: number; strong?: boolean; sub?: boolean; minus?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2 ${sub ? "pl-4 text-[var(--text-secondary)]" : ""} ${strong ? "border-t border-[var(--border-strong,rgba(0,0,0,0.15))] font-black" : "border-b border-[var(--border,rgba(0,0,0,0.06))]"}`}>
      <span>{minus ? "− " : ""}{label}</span>
      <span className="tabular-nums" style={{ fontFamily: mono }}>{formatCurrency(value)}</span>
    </div>
  );
}

export function FinancePayoutPage({ restaurantId, from, to }: { restaurantId: string; from?: string; to?: string }) {
  const now = new Date();
  const periodFrom = from || isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const periodTo = to || isoDate(now);

  const router = useRouter();
  const queryClient = useQueryClient();
  const [manualAdjustment, setManualAdjustment] = useState(0);
  const [status, setStatus] = useState("DRAFT");
  const [notes, setNotes] = useState("");
  const [payoutReference, setPayoutReference] = useState("");
  const [selfDelivery, setSelfDelivery] = useState(false);
  const [override, setOverride] = useState<string>("");
  const [goldPrice, setGoldPrice] = useState("");
  const [silverPrice, setSilverPrice] = useState("");
  const [standardPrice, setStandardPrice] = useState("");

  const spec = useQuery({
    queryKey: payoutSpecQueryKey(restaurantId, periodFrom, periodTo),
    queryFn: () => getPayoutSpec(restaurantId, periodFrom, periodTo),
  });
  const economy = useQuery({ queryKey: economyQueryKey, queryFn: getEconomy });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const p = spec.data?.persisted;
    setManualAdjustment(p?.manualAdjustmentAmount || 0);
    setStatus(p?.status || "DRAFT");
    setNotes(p?.notes || "");
    setPayoutReference(p?.payoutReference || "");
    if (spec.data?.restaurant) {
      setSelfDelivery(spec.data.restaurant.selfDelivery);
      setOverride(spec.data.restaurant.commissionPctOverride == null ? "" : String(spec.data.restaurant.commissionPctOverride));
      setGoldPrice(spec.data.restaurant.tierGoldFeeOverride == null ? "" : String(spec.data.restaurant.tierGoldFeeOverride));
      setSilverPrice(spec.data.restaurant.tierSilverFeeOverride == null ? "" : String(spec.data.restaurant.tierSilverFeeOverride));
      setStandardPrice(spec.data.restaurant.tierStandardFeeOverride == null ? "" : String(spec.data.restaurant.tierStandardFeeOverride));
    }
  }, [spec.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const b = spec.data?.breakdown;
  const persisted = spec.data?.persisted;
  const usesFrozenSnapshot = persisted?.status === "APPROVED" || persisted?.status === "PAID";
  const isOwed = !usesFrozenSnapshot && (b?.owed ?? 0) > 0;
  const automaticRecovery = spec.data?.persisted?.status === "APPROVED" || spec.data?.persisted?.status === "PAID"
    ? (spec.data.persisted.lateRefundAdjustmentAmount || 0)
    : (spec.data?.lateRefundRecovery.reserved || 0);
  const frozenFeeVat = usesFrozenSnapshot && persisted
    ? ((persisted.commissionAmount + persisted.subscriptionAmount) * Number(persisted.feeVatPctSnapshot || 0)) / 100
    : 0;
  const net = usesFrozenSnapshot && persisted
    ? persisted.payoutAmount
    : isOwed
      ? (b?.owed ?? 0)
      : Math.max(0, (b?.payout ?? 0) - manualAdjustment - automaticRecovery);
  const restaurantGross = usesFrozenSnapshot && persisted ? persisted.grossSales : (b?.restaurantGross ?? 0);
  const displayedOrderCount = usesFrozenSnapshot && persisted ? persisted.orderCount : (b?.orderCount ?? 0);
  const platformDeductions = usesFrozenSnapshot && persisted
    ? persisted.commissionAmount + persisted.subscriptionAmount + frozenFeeVat
    : (b?.commission ?? 0) + (b?.subscription ?? 0) + (b?.feeVat ?? 0);
  const persistedStatus = spec.data?.persisted?.status || "NEW";
  const refundWindowClosed = spec.data?.refundWindow.closed ?? false;
  const allowedStatuses = persistedStatus === "PAID"
    ? ["PAID"]
    : persistedStatus === "APPROVED"
      ? ["APPROVED", "HOLD", "PAID"]
      : persistedStatus === "HOLD"
        ? ["HOLD", "DRAFT", "APPROVED"]
        : ["DRAFT", "HOLD", "APPROVED"];
  const payoutStatusLabel: Record<string, string> = {
    DRAFT: "Utkast",
    APPROVED: "Godkänd",
    PAID: "Betald",
    HOLD: "Pausad",
  };

  const savePayout = useMutation({
    mutationFn: async () => {
      if (!spec.data) return;
      await upsertPayout({
        restaurantId,
        periodStart: spec.data.period.from,
        periodEnd: spec.data.period.to,
        manualAdjustmentAmount: manualAdjustment,
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
  const payoutError = (savePayout.error as { response?: { data?: { error?: string } }; message?: string } | null)
    ?.response?.data?.error || (savePayout.error as Error | null)?.message;
  const nullableNonNegativeNumber = (value: string) => {
    const trimmed = value.trim();
    const parsed = Number(trimmed);
    return trimmed === "" || !Number.isFinite(parsed) ? null : Math.max(0, parsed);
  };

  const saveDelivery = useMutation({
    mutationFn: () =>
      setRestaurantDelivery(restaurantId, {
        selfDelivery,
        commissionPctOverride: nullableNonNegativeNumber(override),
        tierGoldFeeOverride: nullableNonNegativeNumber(goldPrice),
        tierSilverFeeOverride: nullableNonNegativeNumber(silverPrice),
        tierStandardFeeOverride: nullableNonNegativeNumber(standardPrice),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: financeSummaryQueryKey(periodFrom, periodTo) });
      await queryClient.invalidateQueries({ queryKey: payoutSpecQueryKey(restaurantId, periodFrom, periodTo) });
    },
  });

  return (
    <div className="page-stack">
      <PageHeader
        breadcrumb={
          <>
            <Link href="/finance">Plattform / Ekonomi</Link>
            {spec.data?.restaurant.name ? ` / ${spec.data.restaurant.name}` : ""}
          </>
        }
        title="Utbetalning"
        onBack={() => router.push("/finance")}
        actions={
          <>
            <span className="inline-flex items-center rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-page)] px-3 py-2 text-[13px] font-semibold text-[var(--text-secondary)]">
              {formatDate(periodFrom)} – {formatDate(periodTo)}
            </span>
            <Button onClick={() => spec.data && printPayoutSpec(spec.data, manualAdjustment, automaticRecovery)}>
              <Printer size={15} /> Exportera
            </Button>
          </>
        }
      />

      {spec.isLoading || !spec.data || !b ? (
        <Surface className="flex items-center gap-2 px-6 py-12 text-sm text-[var(--text-secondary)]">
          <Loader2 size={16} className="animate-spin" /> Beräknar specen…
        </Surface>
      ) : (
        <>
          <div className="grid gap-[13px] md:grid-cols-4">
            <Kpi label="Restaurangens intäkt" value={formatCurrency(restaurantGross)} />
            <Kpi label="Leveranser" value={displayedOrderCount} />
            <Kpi label={isOwed ? "Att fakturera" : "Netto att betala ut"} value={formatCurrency(net)} />
            <Kpi label="Plattformens avdrag" value={formatCurrency(platformDeductions)} accent />
          </div>

          <Surface className="px-6 py-6">
            {usesFrozenSnapshot && persisted ? (
              <>
                <p className="mb-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-page)] px-4 py-3 text-xs font-semibold text-[var(--text-secondary)]">
                  Fryst ekonomisnapshot från godkännandet. Detta är det enda belopp som får överföras; dagens provision eller orderdata ändrar inte underlaget.
                </p>
                <CalcRow label={`Fryst restaurangintäkt (${persisted.orderCount} ordrar)`} value={persisted.grossSales} strong />
                <CalcRow label={`Provision (${persisted.commissionPctSnapshot ?? "—"}%)`} value={persisted.commissionAmount} minus />
                <CalcRow label="Abonnemang" value={persisted.subscriptionAmount} minus />
                <CalcRow label={`Moms på avgifter (${persisted.feeVatPctSnapshot ?? "—"}%)`} value={frozenFeeVat} minus />
                {persisted.manualAdjustmentAmount !== 0 ? <CalcRow label="Manuell justering" value={persisted.manualAdjustmentAmount} minus /> : null}
                {persisted.lateRefundAdjustmentAmount > 0 ? <CalcRow label="Automatisk recovery för sena refunds" value={persisted.lateRefundAdjustmentAmount} minus /> : null}
              </>
            ) : (
              <>
                <CalcRow label={`Bruttoförsäljning (${b.orderCount} ordrar)`} value={b.grossTotal} />
                <CalcRow label="varav matvärde (provisionsbas)" value={b.foodBase} sub />
                <CalcRow label="varav leveransavgift" value={b.deliveryFee} sub />
                <CalcRow label="varav dricks" value={b.tip} sub />
                <CalcRow label="Restaurangens intäkt" value={b.restaurantGross} strong />
                <CalcRow label={`Provision (${b.commissionPct}%)`} value={b.commission} minus />
                <CalcRow label={`Abonnemang (${b.tierLabel})`} value={b.subscription} minus />
                <CalcRow label={`Moms på avgifter (${b.feeVatPct}%)`} value={b.feeVat} minus />
                {manualAdjustment !== 0 ? <CalcRow label="Manuell justering" value={manualAdjustment} minus /> : null}
                {automaticRecovery > 0 ? <CalcRow label="Automatisk recovery för sena refunds" value={automaticRecovery} minus /> : null}
              </>
            )}
            <div className={`mt-3 flex items-center justify-between rounded-xl px-4 py-3 text-white ${isOwed ? "bg-[#B45309]" : "bg-[var(--accent-strong,#111)]"}`}>
              <span className="font-bold">{isOwed ? "Att fakturera restaurangen" : "Netto att betala ut"}</span>
              <span className="text-xl font-black tabular-nums">{formatCurrency(net)}</span>
            </div>
            {isOwed ? (
              <p className="mt-3 text-xs text-[var(--text-secondary)]">
                Avgifterna översteg restaurangens intäkt denna period (typiskt abonnemang vid få ordrar) → ingen utbetalning, beloppet faktureras istället.
              </p>
            ) : null}
            {!usesFrozenSnapshot ? <p className="mt-2 text-xs text-[var(--text-secondary)]">
              Matmoms ({b.foodVatPct}%) i försäljningen: {formatCurrency(b.foodVat)} — informativ, restaurangens egen redovisning.
            </p> : null}
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
                {saveDelivery.isPending ? <Loader2 size={16} className="animate-spin" /> : "Uppdatera ekonomi"}
              </Button>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <Field label="Guldpris">
                <Input
                  type="number"
                  min={0}
                  value={goldPrice}
                  placeholder={economy.data ? `Globalt ${formatCurrency(economy.data.tierGoldFee)}` : "Globalt"}
                  onChange={(e) => setGoldPrice(e.target.value)}
                />
              </Field>
              <Field label="Silverpris">
                <Input
                  type="number"
                  min={0}
                  value={silverPrice}
                  placeholder={economy.data ? `Globalt ${formatCurrency(economy.data.tierSilverFee)}` : "Globalt"}
                  onChange={(e) => setSilverPrice(e.target.value)}
                />
              </Field>
              <Field label="Standardpris">
                <Input
                  type="number"
                  min={0}
                  value={standardPrice}
                  placeholder={economy.data ? `Globalt ${formatCurrency(economy.data.tierStandardFee)}` : "Globalt"}
                  onChange={(e) => setStandardPrice(e.target.value)}
                />
              </Field>
            </div>
          </Surface>

          <Surface className="px-6 py-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Status">
                <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                  {allowedStatuses.map((value) => (
                    <option key={value} value={value} disabled={value === "APPROVED" && !refundWindowClosed}>
                      {payoutStatusLabel[value]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Manuell justering (kr)"><Input type="number" value={manualAdjustment} disabled={usesFrozenSnapshot} onChange={(e) => setManualAdjustment(Number(e.target.value))} /></Field>
              <Field label="Betalningsreferens"><Input value={payoutReference} onChange={(e) => setPayoutReference(e.target.value)} /></Field>
              <div className="md:col-span-1" />
              <div className="md:col-span-2"><Field label="Anteckning"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
            </div>
            <div className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-page)] px-4 py-3 text-xs leading-5 text-[var(--text-secondary)]">
              {!refundWindowClosed ? (
                <p>
                  Underlaget kan godkännas först {formatDateTime(spec.data.refundWindow.closesAt)} efter refundfönstret på {spec.data.refundWindow.hours} timmar.
                </p>
              ) : (
                <p>Refundfönstret är stängt och underlaget kan godkännas.</p>
              )}
              <p>Efter godkännande måste en annan superadmin logga in, ange betalningsreferens och markera utbetalningen som betald.</p>
              {spec.data.lateRefundRecovery.blocked ? (
                <p className="font-semibold text-[var(--danger-text)]">{spec.data.lateRefundRecovery.error}</p>
              ) : automaticRecovery > 0 || spec.data.lateRefundRecovery.remaining > 0 ? (
                <p>
                  Automatisk sen-refund recovery: {formatCurrency(automaticRecovery)} i denna payout
                  {spec.data.lateRefundRecovery.remaining > 0
                    ? ` · ${formatCurrency(spec.data.lateRefundRecovery.remaining)} bärs vidare till nästa payout`
                    : ""}.
                </p>
              ) : (
                <p>Ingen obetald recovery från sena refunds.</p>
              )}
              {spec.data.persisted?.approvedAt ? (
                <p>Godkänd {formatDateTime(spec.data.persisted.approvedAt)} · godkännare {spec.data.persisted.approvedBy || "saknas"}</p>
              ) : null}
            </div>
            {payoutError ? (
              <p className="mt-3 rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm font-semibold text-[var(--danger-text)]">
                {payoutError}
              </p>
            ) : null}
          </Surface>

          <Surface className="overflow-hidden p-0">
            <div className="border-b border-[var(--row-divider)] px-[18px] py-[13px] text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              Ordrar i perioden
            </div>
            {usesFrozenSnapshot ? <p className="border-b border-[var(--row-divider)] bg-[var(--bg-page)] px-[18px] py-2 text-xs text-[var(--text-secondary)]">Listan är aktuell referensdata. Betalningen ovan använder den frysta snapshoten.</p> : null}
            {spec.data?.orders.length ? (
              <div className="max-h-80 overflow-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Datum</th>
                      <th>Typ</th>
                      <th>Status</th>
                      <th>Betalning</th>
                      <th>Underlag</th>
                      <th className="text-right">Summa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spec.data.orders.map((o) => (
                      <tr key={o.orderNumber}>
                        <td className="font-semibold">#{o.orderNumber}</td>
                        <td>{formatDate(o.createdAt)}</td>
                        <td>
                          <Badge tone={o.type === "PICKUP" ? "neutral" : "info"}>
                            {o.type === "PICKUP" ? "Avhämtning" : "Leverans"}
                          </Badge>
                        </td>
                        <td>{orderStatusLabel(o.status)}</td>
                        <td>{paymentStatusLabel(o.paymentStatus)}</td>
                        <td>
                          <Badge tone={o.includedInPayout ? "success" : "neutral"}>
                            {o.includedInPayout ? "Räknas" : "Ej med"}
                          </Badge>
                        </td>
                        <td className="text-right font-semibold tabular-nums" style={{ fontFamily: mono }}>
                          {formatCurrency(o.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-[18px] py-6 text-sm text-[var(--text-secondary)]">Inga ordrar i perioden.</p>
            )}
          </Surface>

          <div className="flex items-center justify-between gap-2">
            <Button onClick={() => spec.data && printPayoutSpec(spec.data, manualAdjustment, automaticRecovery)}>
              <Printer size={16} /> Skriv ut / PDF
            </Button>
            <div className="flex gap-2">
              <Link href="/finance" className="inline-flex items-center rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                Avbryt
              </Link>
              <Button
                variant="primary"
                disabled={
                  (status === "APPROVED" && (!refundWindowClosed || spec.data.lateRefundRecovery.blocked)) ||
                  (status === "PAID" && !payoutReference.trim())
                }
                onClick={() => savePayout.mutate()}
              >
                {savePayout.isPending ? <Loader2 size={16} className="animate-spin" /> : "Spara utbetalning"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
