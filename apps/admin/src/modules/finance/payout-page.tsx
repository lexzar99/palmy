"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  payoutPrintDailyRows,
  payoutPrintOrderStateLabel,
  payoutPrintOrderTypeLabel,
  payoutPrintOrders,
  payoutPrintSettlementAmount,
  payoutPrintSummary,
  printPayoutSpec,
  type PayoutPrintMode,
} from "@/modules/finance/spec-print";
import { DeliveryModeBadge } from "@/shared/components/delivery-mode";
import { Badge, Button, Field, Input, MoneyInput, PageHeader, Select, Surface } from "@/shared/components/ui";
import { formatCurrencyExact as formatCurrency, formatDate, formatDateTime, orderStatusLabel, paymentStatusLabel } from "@/shared/utils/format";

const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const vatLabel = (value: number | null | undefined) =>
  value == null ? "blandad moms" : `${Number(value).toLocaleString("sv-SE")}%`;
const financeOrderStatusLabel = (order: { type?: string | null; status?: string | null }) => {
  const type = String(order.type || "").toUpperCase();
  const status = String(order.status || "").toUpperCase();
  if ((type === "PICKUP" || type === "TAKEAWAY") && (status === "DELIVERED" || status === "COMPLETED")) {
    return "Avhämtad";
  }
  return orderStatusLabel(order.status);
};

/** KPI card matching the design handoff. `accent` tints the last (Bonus) card orange. */
function Kpi({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <article
      className="rounded-[14px] border p-[15px]"
      style={
        accent
          ? { background: "var(--brand-navy-soft)", borderColor: "color-mix(in srgb, var(--brand-navy-bar) 30%, transparent)" }
          : { background: "var(--bg-panel, #fff)", borderColor: "var(--border-subtle)" }
      }
    >
      <p className="text-[12px] font-semibold" style={{ color: accent ? "var(--brand-navy-ink)" : "var(--text-secondary)" }}>
        {label}
      </p>
      <p
        className="mt-[7px] text-[24px] font-extrabold tracking-[-0.7px] tabular-nums"
        style={{ color: accent ? "var(--brand-navy-ink)" : "var(--text-primary)" }}
      >
        {value}
      </p>
    </article>
  );
}

function CalcRow({ label, value, strong, sub, sign }: { label: string; value: number | null; strong?: boolean; sub?: boolean; sign?: "−" | "+" }) {
  return (
    <div className={`flex items-center justify-between py-2 ${sub ? "pl-4 text-[var(--text-secondary)]" : ""} ${strong ? "border-t border-[var(--border-strong,rgba(0,0,0,0.15))] font-black" : "border-b border-[var(--border,rgba(0,0,0,0.06))]"}`}>
      <span>{label}</span>
      <span className="tabular-nums" style={{ fontFamily: mono }}>
        {value == null ? "Inväntar Mollie" : <>{sign ? `${sign} ` : ""}{formatCurrency(value)}</>}
      </span>
    </div>
  );
}

type AdjustmentDirection = "deduction" | "addition";

export function FinancePayoutPage({ restaurantId, from, to, period }: { restaurantId: string; from?: string; to?: string; period?: string }) {
  const now = new Date();
  const periodFrom = from || isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const periodTo = to || isoDate(now);
  const backParams = new URLSearchParams({ from: periodFrom, to: periodTo });
  if (["month", "lastMonth", "7", "30"].includes(String(period || ""))) backParams.set("period", String(period));
  const restaurantFinanceHref = `/finance/restauranger?${backParams.toString()}`;

  const router = useRouter();
  const queryClient = useQueryClient();
  const [manualAdjustmentAmount, setManualAdjustmentAmount] = useState("");
  const [adjustmentDirection, setAdjustmentDirection] = useState<AdjustmentDirection>("deduction");
  const [notes, setNotes] = useState("");
  const [payoutReference, setPayoutReference] = useState("");
  const [selfDelivery, setSelfDelivery] = useState(false);
  const [override, setOverride] = useState<string>("");
  const [goldPrice, setGoldPrice] = useState("");
  const [silverPrice, setSilverPrice] = useState("");
  const [standardPrice, setStandardPrice] = useState("");
  const [printMode, setPrintMode] = useState<PayoutPrintMode>("orders");
  const [showReferenceOrders, setShowReferenceOrders] = useState(false);
  const [showPaymentState, setShowPaymentState] = useState(true);

  const spec = useQuery({
    queryKey: payoutSpecQueryKey(restaurantId, periodFrom, periodTo),
    queryFn: () => getPayoutSpec(restaurantId, periodFrom, periodTo),
  });
  const economy = useQuery({ queryKey: economyQueryKey, queryFn: getEconomy });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const p = spec.data?.persisted;
    const persistedAdjustment = Number(p?.manualAdjustmentAmount || 0);
    setManualAdjustmentAmount(persistedAdjustment === 0 ? "" : String(Math.abs(persistedAdjustment)));
    setAdjustmentDirection(persistedAdjustment < 0 ? "addition" : "deduction");
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
  const parsedAdjustmentAmount = Number(manualAdjustmentAmount.replace(",", "."));
  const manualAdjustmentIsValid = manualAdjustmentAmount.trim() === "" || Number.isFinite(parsedAdjustmentAmount);
  const adjustmentMagnitude = manualAdjustmentIsValid ? Math.abs(parsedAdjustmentAmount || 0) : 0;
  const manualAdjustment = adjustmentDirection === "deduction" ? adjustmentMagnitude : -adjustmentMagnitude;
  const usesFrozenSnapshot = persisted?.status === "PAID";
  const automaticRecovery = spec.data?.persisted?.status === "APPROVED" || spec.data?.persisted?.status === "PAID"
    ? (spec.data.persisted.lateRefundAdjustmentAmount || 0)
    : (spec.data?.lateRefundRecovery.reserved || 0);
  const frozenFeeVat = usesFrozenSnapshot && persisted
    ? ((persisted.commissionAmount + persisted.subscriptionAmount) * Number(persisted.feeVatPctSnapshot || 0)) / 100
    : 0;
  const settlementPosition = usesFrozenSnapshot && persisted
    ? persisted.payoutAmount - persisted.owedAmount
    : (b?.payout ?? 0) - (b?.owed ?? 0) - manualAdjustment - automaticRecovery;
  const isOwed = settlementPosition < 0;
  const net = Math.abs(settlementPosition);
  const restaurantGross = usesFrozenSnapshot && persisted ? persisted.grossSales : (b?.restaurantGross ?? 0);
  const orderSales = usesFrozenSnapshot && persisted
    ? (persisted.originalGrossTotal ?? persisted.grossSales)
    : (b?.originalGrossTotal ?? 0);
  const refunds = usesFrozenSnapshot && persisted ? (persisted.refunds ?? 0) : (b?.refunds ?? 0);
  const salesAfterRefunds = Math.max(0, orderSales - refunds);
  const displayedOrderCount = usesFrozenSnapshot && persisted
    ? (persisted.periodOrderCount ?? persisted.orderCount)
    : (b?.periodOrderCount ?? b?.orderCount ?? 0);
  const restaurantMollieFee = usesFrozenSnapshot && persisted
    ? persisted.mollieFeeAmount
    : (b?.mollieFees ?? null);
  const mollieFeeIsFinal = usesFrozenSnapshot || b?.mollieFeeStatus === "available";
  const commission = usesFrozenSnapshot && persisted ? persisted.commissionAmount : (b?.commission ?? 0);
  const subscription = usesFrozenSnapshot && persisted ? persisted.subscriptionAmount : (b?.subscription ?? 0);
  const viaEatsVat = usesFrozenSnapshot && persisted ? frozenFeeVat : (b?.feeVat ?? 0);
  const viaEatsChargeInclVat = commission + subscription + viaEatsVat;
  const orderDeductions = restaurantMollieFee == null ? null : refunds + restaurantMollieFee;
  const foodVat = usesFrozenSnapshot && persisted ? (persisted.foodVatAmount || 0) : (b?.foodVat ?? 0);
  const salesExVat = Math.max(0, restaurantGross - foodVat);
  const persistedStatus = spec.data?.persisted?.status || "NEW";
  const refundWindowClosed = spec.data?.refundWindow.closed ?? false;
  const payoutStatusLabel: Record<string, string> = {
    DRAFT: "Upplåst utkast",
    APPROVED: "Låst rapport",
    PAID: "Betald",
    HOLD: "Upplåst för ändring",
  };

  const savePayout = useMutation({
    mutationFn: async (saveMode: "DRAFT" | "OVERRIDE" | "PAID") => {
      if (!spec.data) return;
      await upsertPayout({
        restaurantId,
        periodStart: spec.data.period.from,
        periodEnd: spec.data.period.to,
        manualAdjustmentAmount: manualAdjustment,
        saveMode,
        notes: notes || null,
        payoutReference: payoutReference || null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
      router.push(restaurantFinanceHref);
    },
  });
  const payoutError = (savePayout.error as { response?: { data?: { error?: string } }; message?: string } | null)
    ?.response?.data?.error || (savePayout.error as Error | null)?.message;
  const nullableNonNegativeNumber = (value: string) => {
    const trimmed = value.trim();
    const parsed = Number(trimmed);
    return trimmed === "" || !Number.isFinite(parsed) ? null : Math.max(0, parsed);
  };
  const payoutSpec = spec.data;
  const printOptions = useMemo(
    () => ({
      mode: printMode,
      showReferenceOrders,
      showPaymentState,
      adjustmentNote: notes,
    }),
    [notes, printMode, showPaymentState, showReferenceOrders],
  );
  const previewOrders = useMemo(
    () => payoutSpec ? payoutPrintOrders(payoutSpec, printOptions) : [],
    [payoutSpec, printOptions],
  );
  const previewSummary = useMemo(() => payoutPrintSummary(previewOrders), [previewOrders]);
  const previewDailyRows = useMemo(() => payoutPrintDailyRows(previewOrders), [previewOrders]);

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
            <Link href={restaurantFinanceHref}>Plattform / Restaurangekonomi</Link>
            {spec.data?.restaurant.name ? ` / ${spec.data.restaurant.name}` : ""}
          </>
        }
        title="Utbetalning"
        onBack={() => router.push(restaurantFinanceHref)}
        actions={
          <>
            <span className="inline-flex items-center rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-page)] px-3 py-2 text-[13px] font-semibold text-[var(--text-secondary)]">
              {formatDate(periodFrom)} – {formatDate(periodTo)}
            </span>
            <Button onClick={() => spec.data && printPayoutSpec(spec.data, manualAdjustment, automaticRecovery, printOptions)}>
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
          <div className="grid gap-[13px] sm:grid-cols-3">
            <Kpi label={`Försäljning · ${displayedOrderCount} order`} value={formatCurrency(orderSales)} />
            <Kpi label="Orderavdrag" value={orderDeductions == null ? "Inväntar Mollie" : formatCurrency(orderDeductions)} />
            <Kpi label="ViaEats-avdrag inkl moms" value={formatCurrency(viaEatsChargeInclVat)} />
          </div>

          <Surface className="px-6 py-6">
            {usesFrozenSnapshot ? (
              <p className="mb-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-page)] px-4 py-3 text-xs font-semibold text-[var(--text-secondary)]">
                Låst rapport · alla belopp och Mollieavgifter är frysta på exakta ören.
              </p>
            ) : null}
            <p className="eyebrow mb-1 mt-1">Försäljning och order</p>
            <CalcRow label={`Försäljning inkl moms · ${displayedOrderCount} order`} value={orderSales} />
            <CalcRow label="Återbetalningar" value={refunds} sign="−" />
            <CalcRow label="Försäljning efter återbetalningar" value={salesAfterRefunds} strong />
            {!spec.data.restaurant.selfDelivery && b.deliveryFee > 0 ? <CalcRow label="Leveransavgift till ViaEats" value={b.deliveryFee} sign="−" /> : null}
            {!spec.data.restaurant.selfDelivery && b.tip > 0 ? <CalcRow label="Dricks till bud/plattform" value={b.tip} sign="−" /> : null}

            <p className="eyebrow mb-1 mt-5">Avgift för alla order</p>
            <CalcRow label={`Transaktionsavgift · ${mollieFeeIsFinal ? "exakt" : "beräknad från korttyp"}`} value={restaurantMollieFee} sign="−" strong />

            <p className="eyebrow mb-1 mt-5">Moms och försäljning exklusive moms</p>
            <CalcRow label={`Moms i restaurangens försäljning (${vatLabel(usesFrozenSnapshot ? persisted?.foodVatPctSnapshot : b.foodVatPct)})`} value={foodVat} />
            <CalcRow label="Restaurangens försäljning exklusive moms" value={salesExVat} strong />

            <p className="eyebrow mb-1 mt-5">ViaEats-avdrag</p>
            <CalcRow label={`Provision exkl moms (${usesFrozenSnapshot ? persisted?.commissionPctSnapshot ?? "—" : b.commissionPct}%)`} value={commission} sign="−" />
            <CalcRow label={`Abonnemang exkl moms · ${b.tierLabel}`} value={subscription} sign="−" />
            <CalcRow label={`Moms på ViaEats (${usesFrozenSnapshot ? persisted?.feeVatPctSnapshot ?? "—" : b.feeVatPct}%)`} value={viaEatsVat} sign="−" />
            <CalcRow label="ViaEats-avdrag totalt inkl moms" value={viaEatsChargeInclVat} strong />

            <p className="eyebrow mb-1 mt-5">Manuell justering</p>
            {manualAdjustment !== 0 ? (
              <CalcRow
                label={manualAdjustment > 0 ? "Avdrag från utbetalning" : "Tillägg till utbetalning"}
                value={Math.abs(manualAdjustment)}
                sign={manualAdjustment > 0 ? "−" : "+"}
              />
            ) : <CalcRow label="Ingen manuell justering" value={0} />}
            {automaticRecovery > 0 ? <CalcRow label="Sena återbetalningar" value={automaticRecovery} sign="−" /> : null}
            <div className={`mt-3 flex items-center justify-between rounded-xl px-4 py-3 text-white ${isOwed ? "bg-[#B45309]" : "bg-[var(--brand-navy)]"}`}>
              <span className="font-bold">{isOwed ? "Att fakturera restaurangen" : "Att överföra till restaurangen"}</span>
              <span className="text-xl font-black tabular-nums">{mollieFeeIsFinal ? formatCurrency(net) : `≈ ${formatCurrency(net)}`}</span>
            </div>
            {isOwed ? (
              <p className="mt-3 text-xs text-[var(--text-secondary)]">
                Avgifterna översteg restaurangens intäkt denna period (typiskt abonnemang vid få ordrar) → ingen utbetalning, beloppet faktureras istället.
              </p>
            ) : null}
            <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">
              Vid återbetalning ligger den ursprungliga betalavgiften kvar. Mollies eventuella refundavgift läggs till. Rapporten kan bara låsas när båda är bokförda och matchade mot payment-id.
            </p>
            <div className="mt-4 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-page)] px-4 py-4">
              <p className="text-sm font-extrabold text-[var(--text-primary)]">Manuell justering för denna restaurang</p>
              <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                − minskar restaurangens saldo: utbetalningen minskar eller fakturan ökar. + ökar saldot: utbetalningen ökar eller fakturan minskar. Vid flytt mellan restauranger väljer du samma belopp med motsatt tecken.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-[190px_130px_minmax(220px,1fr)]">
                <Field label="Plus eller minus">
                  <Select
                    value={adjustmentDirection}
                    disabled={usesFrozenSnapshot}
                    onChange={(event) => setAdjustmentDirection(event.target.value as AdjustmentDirection)}
                  >
                    <option value="deduction">− Avdrag</option>
                    <option value="addition">+ Tillägg</option>
                  </Select>
                </Field>
                <Field label="Belopp">
                  <MoneyInput
                    step="0.01"
                    min={0}
                    value={manualAdjustmentAmount}
                    disabled={usesFrozenSnapshot}
                    placeholder="0,00"
                    onValueChange={setManualAdjustmentAmount}
                  />
                </Field>
                <Field label="Orsak till justering">
                  <Input
                    value={notes}
                    disabled={usesFrozenSnapshot}
                    placeholder="Exempel: Flytt av Burger King-testavgifter"
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </Field>
              </div>
              {manualAdjustment !== 0 ? (
                <p className="mt-3 text-xs font-bold text-[var(--brand-navy-ink)]">
                  {manualAdjustment > 0 ? "− Avdrag" : "+ Tillägg"} {formatCurrency(Math.abs(manualAdjustment))}. Resultat: {isOwed ? `${formatCurrency(net)} att fakturera` : `${formatCurrency(net)} att betala ut`}.
                </p>
              ) : null}
            </div>
          </Surface>

          <details className="surface group/settings overflow-hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4 hover:bg-[var(--bg-hover)]">
              <span className="font-extrabold text-[var(--text-primary)]">Inställningar för provision och abonnemang</span>
              <DeliveryModeBadge selfDelivery={selfDelivery} />
            </summary>
            <div className="grid gap-4 border-t border-[var(--border-subtle)] px-6 py-5 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
              <Field label="Modell">
                <Select value={selfDelivery ? "self" : "platform"} onChange={(e) => setSelfDelivery(e.target.value === "self")}>
                  <option value="platform">Vi levererar</option>
                  <option value="self">Levererar själv</option>
                </Select>
              </Field>
              <Field label="Provisions-override (%, tomt = global)">
                <Input type="number" value={override} placeholder="–" onChange={(e) => setOverride(e.target.value)} />
              </Field>
              <Field label="Restaurangmoms">
                <Input value={vatLabel(spec.data.restaurant.vatPercent ?? b.foodVatPct)} disabled />
              </Field>
              <Button onClick={() => saveDelivery.mutate()}>
                {saveDelivery.isPending ? <Loader2 size={16} className="animate-spin" /> : "Uppdatera ekonomi"}
              </Button>
            </div>
            <div className="grid gap-4 px-6 pb-6 md:grid-cols-3">
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
          </details>

          <Surface className="px-6 py-6">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Status">
                <div className="flex min-h-11 items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-page)] px-3">
                  <Badge tone={persistedStatus === "PAID" ? "success" : persistedStatus === "APPROVED" ? "info" : "neutral"}>
                    {payoutStatusLabel[persistedStatus] || "Inte sparad"}
                  </Badge>
                </div>
              </Field>
              <Field label="Betalningsreferens"><Input value={payoutReference} onChange={(e) => setPayoutReference(e.target.value)} /></Field>
            </div>
            <div className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-page)] px-4 py-3 text-xs leading-5 text-[var(--text-secondary)]">
              {!refundWindowClosed ? (
                <p>
                  Underlaget kan godkännas först {formatDateTime(spec.data.refundWindow.closesAt)} efter refundfönstret på {spec.data.refundWindow.hours} timmar.
                </p>
              ) : (
                <p>Refundfönstret är stängt och rapporten kan låsas.</p>
              )}
              <p>Spara utkast för ett redigerbart underlag. Spara och ersätt original skriver den nya månadsberäkningen som aktiv version, medan den tidigare versionen ligger kvar i revisionshistoriken.</p>
              <p>Efter låsning måste en annan superadmin logga in, ange betalningsreferens och markera utbetalningen som betald.</p>
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

          {persisted?.revisions?.length ? (
            <Surface className="overflow-hidden p-0">
              <div className="border-b border-[var(--row-divider)] px-[18px] py-[13px] text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                Låsta snapshots
              </div>
              <div className="overflow-x-auto">
                <table className="data-table min-w-[760px]">
                  <thead>
                    <tr>
                      <th>Version</th>
                      <th>Låst</th>
                      <th>Provision</th>
                      <th className="text-right">Provision ex moms</th>
                      <th className="text-right">Moms</th>
                      <th className="text-right">Utbetalning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {persisted.revisions.map((revision) => (
                      <tr key={revision.id}>
                        <td className="font-bold">
                          <span className="mr-2">Version {revision.revision}</span>
                          {revision.original ? <Badge tone="info">Original</Badge> : null}
                          {revision.reason === "OVERRIDE" ? <Badge tone="warning">Ersatte original</Badge> : null}
                        </td>
                        <td>
                          {formatDateTime(revision.createdAt)}
                          {revision.createdBy ? <span className="block text-[11px] text-[var(--text-muted)]">{revision.createdBy}</span> : null}
                        </td>
                        <td>{revision.commissionPct == null ? "—" : `${revision.commissionPct}%`}</td>
                        <td className="text-right font-semibold tabular-nums">{formatCurrency(revision.commissionExVat)}</td>
                        <td className="text-right font-semibold tabular-nums">{formatCurrency(revision.vat)}</td>
                        <td className="text-right font-black tabular-nums">{formatCurrency(revision.payout)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Surface>
          ) : null}

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
                      <th>Ekonomi</th>
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
                        <td>{financeOrderStatusLabel(o)}</td>
                        <td>{paymentStatusLabel(o.paymentStatus)}</td>
                        <td>
                          <Badge tone={o.includedInPayout ? "success" : "neutral"}>
                            {o.includedInPayout ? "Betald order" : "Referens"}
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

          <Surface className="overflow-hidden p-0">
            <div className="border-b border-[var(--row-divider)] px-[18px] py-[13px] text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              PDF-förhandsgranskning
            </div>
            <div className="grid gap-4 px-5 py-5 lg:grid-cols-[280px_1fr]">
              <div className="space-y-3">
                <Field label="PDF-innehåll">
                  <Select value={printMode} onChange={(event) => setPrintMode(event.target.value as PayoutPrintMode)}>
                    <option value="summary">Totalt antal order och belopp</option>
                    <option value="orders">Varje order med ordernummer och belopp</option>
                    <option value="daily">Per dag med antal order och belopp</option>
                  </Select>
                </Field>
                <label className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)]">
                  <input type="checkbox" checked={showPaymentState} onChange={(event) => setShowPaymentState(event.target.checked)} />
                  Visa betalningsstatus
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)]">
                  <input type="checkbox" checked={showReferenceOrders} onChange={(event) => setShowReferenceOrders(event.target.checked)} />
                  Visa avbrutna/återbetalda referensorder
                </label>
              </div>
              <div className="min-w-0">
                <div className="mb-3 grid gap-3 sm:grid-cols-3">
                  <Kpi label="Betalda order" value={previewSummary.paidOrderCount} />
                  <Kpi label="Belopp" value={formatCurrency(previewSummary.paidTotal)} accent />
                  <Kpi label="Referensorder" value={previewSummary.referenceOrderCount} />
                </div>
                {printMode === "summary" ? (
                  <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-page)] px-4 py-4 text-sm font-semibold text-[var(--text-secondary)]">
                    Kompakt summering
                  </div>
                ) : printMode === "daily" ? (
                  <div className="max-h-72 overflow-auto rounded-xl border border-[var(--border-subtle)]">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Datum</th>
                          <th className="text-right">Betalda order</th>
                          <th className="text-right">Belopp</th>
                          {showReferenceOrders ? <th className="text-right">Referensorder</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {previewDailyRows.length ? previewDailyRows.map((row) => (
                          <tr key={row.key}>
                            <td>{formatDate(row.key)}</td>
                            <td className="text-right tabular-nums" style={{ fontFamily: mono }}>{row.paidCount}</td>
                            <td className="text-right font-semibold tabular-nums" style={{ fontFamily: mono }}>{formatCurrency(row.paidTotal)}</td>
                            {showReferenceOrders ? <td className="text-right tabular-nums" style={{ fontFamily: mono }}>{row.referenceCount}</td> : null}
                          </tr>
                        )) : (
                          <tr><td colSpan={showReferenceOrders ? 4 : 3} className="text-[var(--text-secondary)]">Inga order matchar PDF-valet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="max-h-72 overflow-auto rounded-xl border border-[var(--border-subtle)]">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Order</th>
                          <th>Datum</th>
                          <th>Typ</th>
                          {showPaymentState ? <th>Status</th> : null}
                          <th className="text-right">Belopp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewOrders.length ? previewOrders.map((order) => (
                          <tr key={order.orderNumber}>
                            <td className="font-semibold">#{order.orderNumber}</td>
                            <td>{formatDate(order.createdAt)}</td>
                            <td>{payoutPrintOrderTypeLabel(order)}</td>
                            {showPaymentState ? <td>{payoutPrintOrderStateLabel(order)}</td> : null}
                            <td className="text-right font-semibold tabular-nums" style={{ fontFamily: mono }}>
                              {formatCurrency(payoutPrintSettlementAmount(order))}
                            </td>
                          </tr>
                        )) : (
                          <tr><td colSpan={showPaymentState ? 5 : 4} className="text-[var(--text-secondary)]">Inga order matchar PDF-valet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </Surface>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button onClick={() => spec.data && printPayoutSpec(spec.data, manualAdjustment, automaticRecovery, printOptions)}>
              <Printer size={16} /> Skriv ut / PDF
            </Button>
            <Link href={restaurantFinanceHref} className="inline-flex items-center rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              Avbryt
            </Link>
            <Button
              disabled={
                persistedStatus === "PAID" ||
                savePayout.isPending ||
                !manualAdjustmentIsValid ||
                (manualAdjustment !== 0 && !notes.trim())
              }
              onClick={() => savePayout.mutate("DRAFT")}
            >
              {savePayout.isPending && savePayout.variables === "DRAFT"
                ? <Loader2 size={16} className="animate-spin" />
                : "Spara utkast"}
            </Button>
            <Button
              variant="primary"
              disabled={
                persistedStatus === "PAID" ||
                savePayout.isPending ||
                !refundWindowClosed ||
                spec.data.lateRefundRecovery.blocked ||
                !manualAdjustmentIsValid ||
                (manualAdjustment !== 0 && !notes.trim())
              }
              onClick={() => savePayout.mutate("OVERRIDE")}
            >
              {savePayout.isPending && savePayout.variables === "OVERRIDE"
                ? <Loader2 size={16} className="animate-spin" />
                : "Spara och ersätt original"}
            </Button>
            {persistedStatus === "APPROVED" ? (
              <Button
                disabled={savePayout.isPending || !payoutReference.trim()}
                onClick={() => savePayout.mutate("PAID")}
              >
                {savePayout.isPending && savePayout.variables === "PAID"
                  ? <Loader2 size={16} className="animate-spin" />
                  : "Markera som betald"}
              </Button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
