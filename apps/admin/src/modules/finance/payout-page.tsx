"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, Printer, RefreshCw } from "lucide-react";
import {
  economyQueryKey,
  getEconomy,
  getPayoutSpec,
  payoutSpecQueryKey,
  setRestaurantDelivery,
  upsertPayout,
  type PayoutSpec,
} from "@/modules/finance/api";
import {
  payoutPrintOrders,
  payoutPrintSummary,
  printPayoutSpec,
  type PayoutPrintMode,
} from "@/modules/finance/spec-print";
import { invalidateEconomyDomain } from "@/shared/api/invalidate-economy-domain";
import { DeliveryModeBadge } from "@/shared/components/delivery-mode";
import { Badge, Button, ErrorPanel, Field, Input, MoneyInput, PageHeader, Select, Surface } from "@/shared/components/ui";
import { formatCurrencyExact as formatCurrency, formatDate, formatDateTime, orderStatusLabel, paymentStatusLabel } from "@/shared/utils/format";

const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const isoParts = (value: string | undefined) => {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month: month - 1, day };
};

function calendarMonthRange(from?: string, to?: string) {
  const requested = isoParts(from) || isoParts(to);
  const now = new Date();
  const year = requested?.year ?? now.getFullYear();
  const month = requested?.month ?? now.getMonth();
  return {
    from: isoDate(new Date(year, month, 1)),
    to: isoDate(new Date(year, month + 1, 0)),
    label: new Intl.DateTimeFormat("sv-SE", { month: "long", year: "numeric" }).format(new Date(year, month, 1)),
  };
}

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

const mutationError = (error: unknown) => {
  const value = error as { response?: { data?: { error?: string } }; message?: string } | null;
  return value?.response?.data?.error || value?.message || null;
};

const parseInputNumber = (value: string) => Number(value.trim().replace(",", "."));

function Metric({ label, value, emphasis = false }: { label: string; value: React.ReactNode; emphasis?: boolean }) {
  return (
    <div className={`rounded-xl px-4 py-3 ${emphasis ? "bg-[var(--brand-navy)] text-white" : "bg-[var(--bg-page)]"}`}>
      <p className={`text-[11px] font-bold ${emphasis ? "text-white/70" : "text-[var(--text-muted)]"}`}>{label}</p>
      <p className={`mt-1 text-lg font-black tabular-nums ${emphasis ? "text-white" : "text-[var(--text-primary)]"}`}>{value}</p>
    </div>
  );
}

function MoneyRow({
  label,
  value,
  sign,
  strong = false,
}: {
  label: string;
  value: number | null;
  sign?: "−" | "+";
  strong?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 py-2 text-sm ${strong ? "border-t border-[var(--border-strong)] font-black" : "border-b border-[var(--border-subtle)]"}`}>
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="shrink-0 tabular-nums text-[var(--text-primary)]" style={{ fontFamily: mono }}>
        {value == null ? "Inväntar Mollie" : <>{sign ? `${sign} ` : ""}{formatCurrency(value)}</>}
      </span>
    </div>
  );
}

function AdvancedSection({ title, meta, children }: { title: string; meta?: React.ReactNode; children: React.ReactNode }) {
  return (
    <details className="surface group/details overflow-hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 hover:bg-[var(--bg-hover)]">
        <span className="min-w-0">
          <span className="block text-sm font-black text-[var(--text-primary)]">{title}</span>
          {meta ? <span className="mt-0.5 block text-xs text-[var(--text-muted)]">{meta}</span> : null}
        </span>
        <ChevronDown size={16} className="shrink-0 text-[var(--text-muted)] transition-transform group-open/details:rotate-180" />
      </summary>
      <div className="border-t border-[var(--border-subtle)]">{children}</div>
    </details>
  );
}

type AdjustmentDirection = "deduction" | "addition";
type CommissionMode = "global" | "custom";
type PrintVersion = "saved" | "live";

export function FinancePayoutPage({ restaurantId, from, to, period }: { restaurantId: string; from?: string; to?: string; period?: string }) {
  const month = calendarMonthRange(from, to);
  const periodFrom = month.from;
  const periodTo = month.to;
  const rangeWasNormalized = Boolean((from && from !== periodFrom) || (to && to !== periodTo));
  const backParams = new URLSearchParams({ from: periodFrom, to: periodTo });
  if (period === "month" || period === "lastMonth") backParams.set("period", period);
  const restaurantFinanceHref = `/finance/restauranger?${backParams.toString()}`;

  const router = useRouter();
  const queryClient = useQueryClient();
  const [manualAdjustmentAmount, setManualAdjustmentAmount] = useState("");
  const [adjustmentDirection, setAdjustmentDirection] = useState<AdjustmentDirection>("deduction");
  const [notes, setNotes] = useState("");
  const [payoutReference, setPayoutReference] = useState("");
  const [selfDelivery, setSelfDelivery] = useState(false);
  const [commissionMode, setCommissionMode] = useState<CommissionMode>("global");
  const [customCommission, setCustomCommission] = useState("");
  const [goldPrice, setGoldPrice] = useState("");
  const [silverPrice, setSilverPrice] = useState("");
  const [standardPrice, setStandardPrice] = useState("");
  const [printVersion, setPrintVersion] = useState<PrintVersion>("live");
  const [printMode, setPrintMode] = useState<PayoutPrintMode>("orders");
  const [showReferenceOrders, setShowReferenceOrders] = useState(false);
  const [showPaymentState, setShowPaymentState] = useState(true);
  const [payoutFormDirty, setPayoutFormDirty] = useState(false);
  const [agreementFormDirty, setAgreementFormDirty] = useState(false);
  const initializedFormPeriod = useRef<string | null>(null);
  const initializedPrintPeriod = useRef<string | null>(null);

  const spec = useQuery({
    queryKey: payoutSpecQueryKey(restaurantId, periodFrom, periodTo),
    queryFn: () => getPayoutSpec(restaurantId, periodFrom, periodTo),
  });
  const economy = useQuery({ queryKey: economyQueryKey, queryFn: getEconomy });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const data = spec.data;
    if (!data) return;
    const formPeriodKey = `${restaurantId}:${periodFrom}:${periodTo}`;
    const periodChanged = initializedFormPeriod.current !== formPeriodKey;
    if (periodChanged) initializedFormPeriod.current = formPeriodKey;
    if (periodChanged || !payoutFormDirty) {
      const persistedAdjustment = Number(data.persisted?.manualAdjustmentAmount || 0);
      setManualAdjustmentAmount(persistedAdjustment === 0 ? "" : String(Math.abs(persistedAdjustment)));
      setAdjustmentDirection(persistedAdjustment < 0 ? "addition" : "deduction");
      setNotes(data.persisted?.notes || "");
      setPayoutReference(data.persisted?.payoutReference || "");
    }
    if (periodChanged || !agreementFormDirty) {
      setSelfDelivery(data.restaurant.selfDelivery);
      const override = Number(data.restaurant.commissionPctOverride || 0);
      setCommissionMode(override > 0 ? "custom" : "global");
      setCustomCommission(override > 0 ? String(override) : "");
      setGoldPrice(data.restaurant.tierGoldFeeOverride == null ? "" : String(data.restaurant.tierGoldFeeOverride));
      setSilverPrice(data.restaurant.tierSilverFeeOverride == null ? "" : String(data.restaurant.tierSilverFeeOverride));
      setStandardPrice(data.restaurant.tierStandardFeeOverride == null ? "" : String(data.restaurant.tierStandardFeeOverride));
    }
    if (periodChanged) {
      setPayoutFormDirty(false);
      setAgreementFormDirty(false);
    }
    if (initializedPrintPeriod.current !== formPeriodKey) {
      initializedPrintPeriod.current = formPeriodKey;
      setPrintVersion(["APPROVED", "HOLD", "PAID"].includes(String(data.persisted?.status || "")) ? "saved" : "live");
    }
  }, [agreementFormDirty, payoutFormDirty, periodFrom, periodTo, restaurantId, spec.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const data = spec.data;
  const b = data?.breakdown;
  const persisted = data?.persisted;
  const persistedStatus = String(persisted?.status || "NEW").toUpperCase();
  const hasSavedReport = Boolean(persisted && ["APPROVED", "HOLD", "PAID"].includes(persistedStatus));
  const isPaid = persistedStatus === "PAID";
  const waitingForMollie = persistedStatus === "HOLD" && persisted?.mollieFeeStatus !== "available";

  const parsedAdjustmentAmount = parseInputNumber(manualAdjustmentAmount);
  const manualAdjustmentIsValid = manualAdjustmentAmount.trim() === "" || (
    Number.isFinite(parsedAdjustmentAmount) && parsedAdjustmentAmount >= 0
  );
  const adjustmentMagnitude = manualAdjustmentIsValid ? Math.abs(parsedAdjustmentAmount || 0) : 0;
  const manualAdjustment = adjustmentDirection === "deduction" ? adjustmentMagnitude : -adjustmentMagnitude;
  const liveRecovery = isPaid ? 0 : Number(data?.lateRefundRecovery.reserved || 0);
  const liveSettlementPosition = (b?.payout ?? 0) - (b?.owed ?? 0) - manualAdjustment - liveRecovery;
  const liveIsOwed = liveSettlementPosition < 0;
  const liveNet = Math.abs(liveSettlementPosition);
  const liveOrderSales = b?.originalGrossTotal ?? 0;
  const liveRefunds = b?.refunds ?? 0;
  const liveSalesAfterRefunds = Math.max(0, liveOrderSales - liveRefunds);
  const liveMollieFee = b?.mollieFees ?? null;
  const liveMollieFeeFinal = b?.mollieFeeStatus === "available";
  const liveRefundFee = b?.refundProcessingFees ?? null;
  const liveCardFee = b?.paymentFees ?? (
    liveMollieFee == null || liveRefundFee == null ? null : Math.max(0, liveMollieFee - liveRefundFee)
  );
  const liveViaEats = (b?.commission ?? 0) + (b?.subscription ?? 0) + (b?.feeVat ?? 0);

  const savedFeeVat = persisted
    ? ((persisted.commissionAmount + persisted.subscriptionAmount) * Number(persisted.feeVatPctSnapshot || 0)) / 100
    : 0;
  const savedViaEats = persisted ? persisted.commissionAmount + persisted.subscriptionAmount + savedFeeVat : 0;
  const savedOrderSales = persisted ? (persisted.originalGrossTotal ?? persisted.grossSales) : 0;
  const savedRefunds = persisted?.refunds ?? 0;
  const savedSalesAfterRefunds = Math.max(0, savedOrderSales - savedRefunds);
  const savedRefundFee = persisted?.refundProcessingFeeAmount ?? 0;
  const savedCardFee = persisted?.paymentFeeAmount ?? Math.max(0, Number(persisted?.mollieFeeAmount || 0) - savedRefundFee);
  const savedSettlementPosition = persisted ? persisted.payoutAmount - persisted.owedAmount : 0;
  const savedIsOwed = savedSettlementPosition < 0;
  const savedNet = Math.abs(savedSettlementPosition);
  const liveDifference = hasSavedReport ? liveSettlementPosition - savedSettlementPosition : 0;

  const payoutInputError = !manualAdjustmentIsValid
    ? "Justeringen måste vara ett giltigt positivt belopp."
    : manualAdjustment !== 0 && !notes.trim()
      ? "Ange en orsak till justeringen."
      : null;

  const globalCommission = economy.data
    ? (selfDelivery ? economy.data.commissionSelfPct : economy.data.commissionPlatformPct)
    : null;
  const customCommissionNumber = parseInputNumber(customCommission);
  const customCommissionError = commissionMode === "custom" && (
    customCommission.trim() === "" ||
    !Number.isFinite(customCommissionNumber) ||
    customCommissionNumber < 0 ||
    customCommissionNumber > 100
  )
    ? "Egen provision måste vara 0–100 %. 0 återgår till global sats."
    : null;
  const tierInputError = [
    [goldPrice, "Guld"],
    [silverPrice, "Silver"],
    [standardPrice, "Standard"],
  ].find(([value]) => value.trim() !== "" && (!Number.isFinite(parseInputNumber(value)) || parseInputNumber(value) < 0));
  const agreementInputError = customCommissionError || (tierInputError ? `${tierInputError[1]} måste vara 0 kr eller mer.` : null);

  const optionalTierPrice = (value: string) => value.trim() === "" ? null : parseInputNumber(value);
  const commissionOverride = commissionMode === "global" || customCommissionNumber <= 0 ? null : customCommissionNumber;

  const savePayout = useMutation({
    mutationFn: async (saveMode: "DRAFT" | "OVERRIDE" | "PAID") => {
      if (!data) throw new Error("Utbetalningsunderlaget har inte laddats.");
      if (payoutInputError) throw new Error(payoutInputError);
      return upsertPayout({
        restaurantId,
        periodStart: data.period.from,
        periodEnd: data.period.to,
        manualAdjustmentAmount: manualAdjustment,
        saveMode,
        notes: notes.trim() || null,
        payoutReference: payoutReference.trim() || null,
      });
    },
    onSuccess: () => {
      void invalidateEconomyDomain(queryClient);
      router.push(restaurantFinanceHref);
    },
  });

  const saveAgreement = useMutation({
    mutationFn: async () => {
      if (!economy.data) throw new Error("De globala satserna måste laddas innan avtalet kan sparas.");
      if (agreementInputError) throw new Error(agreementInputError);
      return setRestaurantDelivery(restaurantId, {
        selfDelivery,
        commissionPctOverride: commissionOverride,
        tierGoldFeeOverride: optionalTierPrice(goldPrice),
        tierSilverFeeOverride: optionalTierPrice(silverPrice),
        tierStandardFeeOverride: optionalTierPrice(standardPrice),
      });
    },
    onSuccess: async () => {
      await invalidateEconomyDomain(queryClient);
      setAgreementFormDirty(false);
    },
  });

  const printableSpec = useMemo<PayoutSpec | null>(() => {
    if (!data) return null;
    if (printVersion === "live") return { ...data, persisted: null };
    if (hasSavedReport && data.persisted) return data;
    return data;
  }, [data, hasSavedReport, printVersion]);
  const printOptions = useMemo(
    () => ({
      mode: printMode,
      showReferenceOrders,
      showPaymentState,
      adjustmentNote: printVersion === "saved" ? persisted?.notes || "" : notes,
    }),
    [notes, persisted?.notes, printMode, printVersion, showPaymentState, showReferenceOrders],
  );
  const previewOrders = useMemo(
    () => printableSpec ? payoutPrintOrders(printableSpec, printOptions) : [],
    [printableSpec, printOptions],
  );
  const currentPreviewSummary = useMemo(() => payoutPrintSummary(previewOrders), [previewOrders]);
  const previewSummary = printVersion === "saved" && persisted
    ? {
        ...currentPreviewSummary,
        paidOrderCount: persisted.periodOrderCount ?? persisted.orderCount,
        paidTotal: persisted.originalGrossTotal ?? persisted.grossSales,
      }
    : currentPreviewSummary;
  const printRecovery = printVersion === "saved" ? Number(persisted?.lateRefundAdjustmentAmount || 0) : liveRecovery;
  const openPrint = () => {
    if (printableSpec) printPayoutSpec(printableSpec, manualAdjustment, printRecovery, printOptions);
  };

  const payoutStatusLabel: Record<string, string> = {
    NEW: "Inte sparad",
    DRAFT: "Utkast",
    APPROVED: "Låst",
    HOLD: "Sparad · ej låst",
    PAID: "Betald",
  };
  const statusTone = persistedStatus === "PAID" ? "success" : persistedStatus === "HOLD" ? "warning" : persistedStatus === "APPROVED" ? "info" : "neutral";
  const payoutError = mutationError(savePayout.error);
  const agreementError = mutationError(saveAgreement.error);

  return (
    <div className="page-stack">
      <PageHeader
        breadcrumb={<Link href={restaurantFinanceHref}>Restaurangekonomi</Link>}
        title={data?.restaurant.name || "Utbetalning"}
        onBack={() => router.push(restaurantFinanceHref)}
        actions={
          <>
            <span className="inline-flex items-center rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-page)] px-3 py-2 text-[13px] font-semibold capitalize text-[var(--text-secondary)]">
              {month.label}
            </span>
            <Button onClick={() => void spec.refetch()} disabled={spec.isFetching} aria-label="Uppdatera underlag">
              <RefreshCw size={14} className={spec.isFetching ? "animate-spin" : undefined} /> Uppdatera
            </Button>
            <Button onClick={openPrint} disabled={!printableSpec}>
              <Printer size={15} /> PDF
            </Button>
          </>
        }
      />

      {rangeWasNormalized ? (
        <p className="rounded-xl bg-[var(--brand-navy-soft)] px-4 py-3 text-xs font-semibold text-[var(--brand-navy-ink)]">
          Utbetalningar görs per kalendermånad. Perioden har därför satts till {formatDate(periodFrom)}–{formatDate(periodTo)}.
        </p>
      ) : null}

      {spec.isError ? (
        <ErrorPanel
          title="Utbetalningen kunde inte laddas"
          description="Inga belopp visas förrän det riktiga underlaget har hämtats."
          action={<Button onClick={() => void spec.refetch()}><RefreshCw size={15} /> Försök igen</Button>}
        />
      ) : spec.isLoading || !data || !b ? (
        <Surface className="flex items-center gap-2 px-6 py-12 text-sm text-[var(--text-secondary)]">
          <Loader2 size={16} className="animate-spin" /> Beräknar månaden…
        </Surface>
      ) : (
        <>
          {hasSavedReport && persisted ? (
            <Surface className="overflow-hidden border-t-[3px] border-t-[var(--brand-navy)] p-0">
              <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">Sparad rapport</p>
                    <Badge tone={statusTone}>{payoutStatusLabel[persistedStatus]}</Badge>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-[var(--text-secondary)]">
                    Beloppen kommer från den sparade versionen. Nya villkor syns bara i liveversionen.
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-[var(--text-muted)]">{savedIsOwed ? "Att fakturera" : "Att betala ut"}</p>
                  <p className="mt-1 text-3xl font-black tabular-nums text-[var(--text-primary)]">{formatCurrency(savedNet)}</p>
                </div>
              </div>
              <div className="grid gap-2 border-t border-[var(--border-subtle)] px-5 py-4 sm:grid-cols-3">
                <Metric label="Efter återbetalningar" value={formatCurrency(savedSalesAfterRefunds)} />
                <Metric label="ViaEats inkl. moms" value={`− ${formatCurrency(savedViaEats)}`} />
                <Metric label="Kort- och återbetalningsavgifter" value={`− ${formatCurrency(persisted.mollieFeeAmount)}`} />
              </div>
              <details className="group/saved border-t border-[var(--border-subtle)]">
                <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-xs font-black text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
                  Visa sparad beräkning
                  <ChevronDown size={15} className="transition-transform group-open/saved:rotate-180" />
                </summary>
                <div className="border-t border-[var(--border-subtle)] px-5 py-4">
                  <MoneyRow label={`Orderförsäljning · ${persisted.periodOrderCount ?? persisted.orderCount} order`} value={savedOrderSales} />
                  <MoneyRow label="Återbetalningar" value={savedRefunds} sign="−" />
                  <MoneyRow label="Restaurangens utbetalningsgrund" value={persisted.grossSales} />
                  <MoneyRow label={`Provision exkl. moms (${persisted.commissionPctSnapshot ?? "—"}%)`} value={persisted.commissionAmount} sign="−" />
                  <MoneyRow label="Abonnemang exkl. moms" value={persisted.subscriptionAmount} sign="−" />
                  <MoneyRow label={`Moms på ViaEats (${persisted.feeVatPctSnapshot ?? "—"}%)`} value={savedFeeVat} sign="−" />
                  <MoneyRow label="Korttransaktionsavgifter" value={savedCardFee} sign="−" />
                  <MoneyRow label="Avgifter för återbetalningar" value={savedRefundFee} sign="−" />
                  {persisted.manualAdjustmentAmount !== 0 ? <MoneyRow label="Manuell justering" value={Math.abs(persisted.manualAdjustmentAmount)} sign={persisted.manualAdjustmentAmount > 0 ? "−" : "+"} /> : null}
                  {persisted.lateRefundAdjustmentAmount > 0 ? <MoneyRow label="Sena återbetalningar och avgifter" value={persisted.lateRefundAdjustmentAmount} sign="−" /> : null}
                  <MoneyRow label={savedIsOwed ? "Att fakturera" : "Att betala ut"} value={savedNet} strong />
                </div>
              </details>
            </Surface>
          ) : null}

          <Surface className={`overflow-hidden p-0 ${hasSavedReport ? "border-t-[3px] border-t-[var(--brand-orange)]" : "border-t-[3px] border-t-[var(--brand-navy)]"}`}>
            <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--text-muted)]">
                    {hasSavedReport ? "Nästa version · live" : persistedStatus === "DRAFT" ? "Sparat utkast · live" : "Aktuellt underlag"}
                  </p>
                  {!hasSavedReport ? <Badge tone={statusTone}>{payoutStatusLabel[persistedStatus]}</Badge> : null}
                </div>
                <p className="mt-2 text-sm font-semibold text-[var(--text-secondary)]">
                  {hasSavedReport
                    ? "Visar dagens orderunderlag och avtal. Sparas först när du skapar en ny version."
                    : "Beloppen räknas från månadens aktuella order och avtal."}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-[var(--text-muted)]">{liveIsOwed ? "Att fakturera" : "Att betala ut"}</p>
                <p className="mt-1 text-3xl font-black tabular-nums text-[var(--text-primary)]">
                  {liveMollieFeeFinal ? formatCurrency(liveNet) : `≈ ${formatCurrency(liveNet)}`}
                </p>
                {hasSavedReport && liveDifference !== 0 ? (
                  <p className={`mt-1 text-xs font-black ${liveDifference > 0 ? "text-[var(--success)]" : "text-[var(--warning)]"}`}>
                    {liveDifference > 0 ? "+" : "−"}{formatCurrency(Math.abs(liveDifference))} mot sparad rapport
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-2 border-t border-[var(--border-subtle)] px-5 py-4 sm:grid-cols-3">
              <Metric label="Efter återbetalningar" value={formatCurrency(liveSalesAfterRefunds)} />
              <Metric label="ViaEats inkl. moms" value={`− ${formatCurrency(liveViaEats)}`} />
              <Metric label={liveMollieFeeFinal ? "Betalavgifter · exakta" : "Betalavgifter · preliminära"} value={liveMollieFee == null ? "Inväntar" : `− ${formatCurrency(liveMollieFee)}`} />
            </div>

            {!isPaid ? (
              <div className="border-t border-[var(--border-subtle)] px-5 py-5">
                <p className="text-sm font-black text-[var(--text-primary)]">Justering</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-[170px_140px_minmax(220px,1fr)]">
                  <Field label="Typ">
                    <Select value={adjustmentDirection} onChange={(event) => {
                      setPayoutFormDirty(true);
                      setAdjustmentDirection(event.target.value as AdjustmentDirection);
                    }}>
                      <option value="deduction">Avdrag</option>
                      <option value="addition">Tillägg</option>
                    </Select>
                  </Field>
                  <Field label="Belopp">
                    <MoneyInput min={0} step="0.01" value={manualAdjustmentAmount} placeholder="0,00" onValueChange={(value) => {
                      setPayoutFormDirty(true);
                      setManualAdjustmentAmount(value);
                    }} />
                  </Field>
                  <Field label="Orsak / notering">
                    <Input value={notes} placeholder="Krävs vid justering" onChange={(event) => {
                      setPayoutFormDirty(true);
                      setNotes(event.target.value);
                    }} />
                  </Field>
                </div>
                {payoutInputError ? <p className="mt-2 text-xs font-semibold text-[var(--danger)]">{payoutInputError}</p> : null}
              </div>
            ) : null}

            <details className="group/live border-t border-[var(--border-subtle)]">
              <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-xs font-black text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]">
                Visa full liveberäkning
                <ChevronDown size={15} className="transition-transform group-open/live:rotate-180" />
              </summary>
              <div className="border-t border-[var(--border-subtle)] px-5 py-4">
                <MoneyRow label={`Orderförsäljning · ${b.periodOrderCount ?? b.orderCount} order`} value={liveOrderSales} />
                <MoneyRow label="Återbetalningar" value={liveRefunds} sign="−" />
                {!data.restaurant.selfDelivery && b.deliveryFee > 0 ? <MoneyRow label="Leveransavgift till ViaEats" value={b.deliveryFee} sign="−" /> : null}
                {!data.restaurant.selfDelivery && b.tip > 0 ? <MoneyRow label="Dricks till bud/plattform" value={b.tip} sign="−" /> : null}
                <MoneyRow label={`Moms i restaurangens försäljning (${vatLabel(b.foodVatPct)})`} value={b.foodVat} />
                <MoneyRow label="Restaurangens utbetalningsgrund" value={b.restaurantGross} />
                <MoneyRow label={`Provision exkl. moms (${b.commissionPct}%)`} value={b.commission} sign="−" />
                <MoneyRow label={`Abonnemang exkl. moms · ${b.tierLabel}`} value={b.subscription} sign="−" />
                <MoneyRow label={`Moms på ViaEats (${b.feeVatPct}%)`} value={b.feeVat} sign="−" />
                <MoneyRow label="Korttransaktionsavgifter" value={liveCardFee} sign="−" />
                <MoneyRow label="Avgifter för återbetalningar" value={liveRefundFee} sign="−" />
                {manualAdjustment !== 0 ? <MoneyRow label="Manuell justering" value={Math.abs(manualAdjustment)} sign={manualAdjustment > 0 ? "−" : "+"} /> : null}
                {liveRecovery > 0 ? <MoneyRow label="Sena återbetalningar och avgifter" value={liveRecovery} sign="−" /> : null}
                <MoneyRow label={liveIsOwed ? "Att fakturera" : "Att betala ut"} value={liveNet} strong />
              </div>
            </details>
          </Surface>

          <AdvancedSection
            title="Avtal för nästa version"
            meta={<span className="inline-flex items-center gap-2"><DeliveryModeBadge selfDelivery={data.restaurant.selfDelivery} /> {b.commissionPct}% provision · {b.tierLabel}</span>}
          >
            <div className="px-5 py-5">
              <p className="mb-4 text-xs font-semibold text-[var(--text-muted)]">Ändringar påverkar liveberäkningen efter sparning. Den sparade rapporten ovan ändras aldrig.</p>
              {economy.isError ? (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--warning-soft)] px-4 py-3 text-xs font-semibold text-[var(--text-secondary)]">
                  Globala satser kunde inte laddas. Avtalet kan inte sparas förrän de har hämtats.
                  <Button onClick={() => void economy.refetch()} disabled={economy.isFetching}>Försök igen</Button>
                </div>
              ) : null}
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Leverans">
                  <Select value={selfDelivery ? "self" : "platform"} onChange={(event) => {
                    setAgreementFormDirty(true);
                    setSelfDelivery(event.target.value === "self");
                  }}>
                    <option value="platform">ViaEats levererar</option>
                    <option value="self">Restaurangen levererar</option>
                  </Select>
                </Field>
                <Field label="Provision">
                  <Select value={commissionMode} onChange={(event) => {
                    setAgreementFormDirty(true);
                    setCommissionMode(event.target.value as CommissionMode);
                  }}>
                    <option value="global">Global sats{globalCommission == null ? "" : ` · ${globalCommission}%`}</option>
                    <option value="custom">Egen sats</option>
                  </Select>
                </Field>
                <Field label="Egen provision">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    disabled={commissionMode === "global"}
                    value={commissionMode === "global" ? "" : customCommission}
                    placeholder={commissionMode === "global" ? "Använder global" : "0 = global"}
                    onChange={(event) => {
                      setAgreementFormDirty(true);
                      setCustomCommission(event.target.value);
                    }}
                  />
                </Field>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <Field label="Guld · kr/mån">
                  <Input type="number" min={0} step="0.01" value={goldPrice} placeholder={economy.data ? `Globalt ${formatCurrency(economy.data.tierGoldFee)}` : ""} onChange={(event) => {
                    setAgreementFormDirty(true);
                    setGoldPrice(event.target.value);
                  }} />
                </Field>
                <Field label="Silver · kr/mån">
                  <Input type="number" min={0} step="0.01" value={silverPrice} placeholder={economy.data ? `Globalt ${formatCurrency(economy.data.tierSilverFee)}` : ""} onChange={(event) => {
                    setAgreementFormDirty(true);
                    setSilverPrice(event.target.value);
                  }} />
                </Field>
                <Field label="Standard · kr/mån">
                  <Input type="number" min={0} step="0.01" value={standardPrice} placeholder={economy.data ? `Globalt ${formatCurrency(economy.data.tierStandardFee)}` : ""} onChange={(event) => {
                    setAgreementFormDirty(true);
                    setStandardPrice(event.target.value);
                  }} />
                </Field>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className={`text-xs font-semibold ${agreementInputError || agreementError ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`}>
                  {agreementInputError || agreementError || "Tomt pris använder global nivå. Egen provision 0 normaliseras till global sats."}
                </p>
                <Button
                  variant="primary"
                  disabled={Boolean(agreementInputError) || !economy.data || economy.isError || saveAgreement.isPending}
                  onClick={() => saveAgreement.mutate()}
                >
                  {saveAgreement.isPending ? <Loader2 size={15} className="animate-spin" /> : null}
                  Spara avtal
                </Button>
              </div>
            </div>
          </AdvancedSection>

          <Surface className="px-5 py-5">
            <div className="grid gap-4 md:grid-cols-[180px_1fr] md:items-end">
              <Field label="Status">
                <div className="flex min-h-11 items-center rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-page)] px-3">
                  <Badge tone={statusTone}>{payoutStatusLabel[persistedStatus]}</Badge>
                </div>
              </Field>
              <Field label="Betalningsreferens">
                <Input value={payoutReference} disabled={isPaid} placeholder="Krävs när rapporten markeras betald" onChange={(event) => {
                  setPayoutFormDirty(true);
                  setPayoutReference(event.target.value);
                }} />
              </Field>
            </div>
            <div className="mt-4 rounded-xl bg-[var(--bg-page)] px-4 py-3 text-xs font-semibold leading-5 text-[var(--text-secondary)]">
              {waitingForMollie
                ? "Den sparade versionen väntar på exakta Mollieavgifter. Kontrollera liveversionen och spara en ny version när avgifterna är klara."
                : isPaid
                  ? "Rapporten är betald och kan inte ändras. Nya villkor påverkar bara kommande versioner."
                  : persistedStatus === "APPROVED"
                    ? "Rapporten är låst. En annan superadmin måste markera den som betald."
                    : !data.refundWindow.closed
                      ? `Månaden kan låsas permanent efter ${formatDateTime(data.refundWindow.closesAt)}.`
                      : "Underlaget kan nu låsas. En annan superadmin måste markera den låsta rapporten som betald."}
              {data.lateRefundRecovery.blocked ? <p className="mt-1 text-[var(--danger)]">{data.lateRefundRecovery.error}</p> : null}
              {!data.lateRefundRecovery.blocked && (data.lateRefundRecovery.reserved > 0 || data.lateRefundRecovery.remaining > 0) ? (
                <p className="mt-1">Sen återbetalning: {formatCurrency(data.lateRefundRecovery.reserved)} i denna månad{data.lateRefundRecovery.remaining > 0 ? ` · ${formatCurrency(data.lateRefundRecovery.remaining)} förs vidare` : ""}.</p>
              ) : null}
              {persisted?.approvedAt ? <p className="mt-1">Godkänd {formatDateTime(persisted.approvedAt)} · {persisted.approvedBy || "okänd admin"}</p> : null}
            </div>
            {payoutError ? <p className="mt-3 rounded-xl bg-[var(--danger-soft)] px-4 py-3 text-sm font-semibold text-[var(--danger-text)]">{payoutError}</p> : null}
          </Surface>

          {persisted?.revisions?.length ? (
            <AdvancedSection title="Versionshistorik" meta={`${persisted.revisions.length} sparade versioner`}>
              <div className="overflow-x-auto">
                <table className="data-table min-w-[720px]">
                  <thead>
                    <tr>
                      <th>Version</th>
                      <th>Sparad</th>
                      <th>Provision</th>
                      <th className="text-right">ViaEats exkl. moms</th>
                      <th className="text-right">Moms</th>
                      <th className="text-right">Utbetalning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {persisted.revisions.map((revision) => (
                      <tr key={revision.id}>
                        <td className="font-bold">
                          Version {revision.revision}{" "}
                          {revision.original ? <Badge tone="info">Original</Badge> : null}
                          {revision.reason === "OVERRIDE" ? <Badge tone="warning">Ersatte</Badge> : null}
                        </td>
                        <td>{formatDateTime(revision.createdAt)}{revision.createdBy ? <span className="block text-[11px] text-[var(--text-muted)]">{revision.createdBy}</span> : null}</td>
                        <td>{revision.commissionPct == null ? "—" : `${revision.commissionPct}%`}</td>
                        <td className="text-right font-semibold tabular-nums">{formatCurrency(revision.viaEatsExVat ?? revision.commissionExVat)}</td>
                        <td className="text-right font-semibold tabular-nums">{formatCurrency(revision.vat)}</td>
                        <td className="text-right font-black tabular-nums">{formatCurrency(revision.payout)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </AdvancedSection>
          ) : null}

          <AdvancedSection title="Orderunderlag" meta={`${data.orders.length} order i kalendermånaden`}>
            {data.orders.length ? (
              <div className="max-h-[440px] overflow-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Datum</th>
                      <th>Typ</th>
                      <th>Status</th>
                      <th>Ekonomi</th>
                      <th className="text-right">Original</th>
                      <th className="text-right">Återbetalt</th>
                      <th className="text-right">Netto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.orders.map((order) => {
                      const original = Math.max(0, Number(order.originalTotal || 0));
                      const refunded = Math.min(original, Math.max(0, Number(order.refundAmount || 0)));
                      const net = order.includedInPayout ? Math.max(0, Number(order.total || 0)) : Math.max(0, original - refunded);
                      return (
                        <tr key={order.orderNumber}>
                          <td className="font-semibold">#{order.orderNumber}</td>
                          <td>{formatDate(order.createdAt)}</td>
                          <td>{String(order.type).toUpperCase() === "PICKUP" ? "Avhämtning" : "Leverans"}</td>
                          <td>
                            <span className="block">{financeOrderStatusLabel(order)}</span>
                            <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">{paymentStatusLabel(order.paymentStatus)}</span>
                          </td>
                          <td><Badge tone={order.includedInPayout ? "success" : "neutral"}>{order.includedInPayout ? "Ingår" : "Referens"}</Badge></td>
                          <td className="text-right font-semibold tabular-nums" style={{ fontFamily: mono }}>{formatCurrency(original)}</td>
                          <td className="text-right font-semibold tabular-nums" style={{ fontFamily: mono }}>{refunded > 0 ? `− ${formatCurrency(refunded)}` : formatCurrency(0)}</td>
                          <td className="text-right font-black tabular-nums" style={{ fontFamily: mono }}>{formatCurrency(net)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <p className="px-5 py-6 text-sm text-[var(--text-secondary)]">Inga order i månaden.</p>}
          </AdvancedSection>

          <AdvancedSection title="PDF och export" meta="Välj sparad rapport eller liveversion och hur order ska grupperas">
            <div className="grid gap-5 px-5 py-5 lg:grid-cols-[minmax(260px,420px)_1fr]">
              <div className="space-y-3">
                {hasSavedReport ? (
                  <Field label="Version">
                    <Select value={printVersion} onChange={(event) => setPrintVersion(event.target.value as PrintVersion)}>
                      <option value="saved">Sparad rapport</option>
                      <option value="live">Nästa version · live</option>
                    </Select>
                  </Field>
                ) : null}
                <Field label="Innehåll">
                  <Select value={printMode} onChange={(event) => setPrintMode(event.target.value as PayoutPrintMode)}>
                    <option value="summary">Summering</option>
                    <option value="orders">Varje order</option>
                    <option value="daily">Per dag</option>
                  </Select>
                </Field>
                <label className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)]">
                  <input type="checkbox" checked={showPaymentState} onChange={(event) => setShowPaymentState(event.target.checked)} />
                  Visa betalningsstatus
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] px-3 py-2 text-sm font-semibold text-[var(--text-secondary)]">
                  <input type="checkbox" checked={showReferenceOrders} onChange={(event) => setShowReferenceOrders(event.target.checked)} />
                  Ta med övriga avbrutna order
                </label>
                {printVersion === "saved" ? (
                  <p className="text-xs font-semibold leading-5 text-[var(--text-muted)]">
                    Beloppen hämtas från den sparade rapporten. Orderlistan är aktuell referensdata och kan ha ändrats efter att rapporten sparades.
                  </p>
                ) : null}
              </div>
              <div className="grid content-start gap-3 sm:grid-cols-3">
                <Metric label="Order som ingår" value={previewSummary.paidOrderCount} />
                <Metric label="Netto i orderlistan" value={formatCurrency(previewSummary.paidTotal)} emphasis />
                <Metric label="Återbetalda / referens" value={previewSummary.referenceOrderCount} />
                <div className="sm:col-span-3 sm:justify-self-end">
                  <Button variant="primary" onClick={openPrint}><Printer size={15} /> Öppna PDF</Button>
                </div>
              </div>
            </div>
          </AdvancedSection>

          <Surface className="sticky bottom-3 z-10 flex flex-wrap items-center justify-end gap-2 border-[var(--border-strong)] px-4 py-3 shadow-lg">
            <Link href={restaurantFinanceHref} className="inline-flex items-center rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              Tillbaka
            </Link>
            {!isPaid && !hasSavedReport ? (
              <Button
                disabled={savePayout.isPending || Boolean(payoutInputError)}
                onClick={() => savePayout.mutate("DRAFT")}
              >
                {savePayout.isPending && savePayout.variables === "DRAFT" ? <Loader2 size={15} className="animate-spin" /> : null}
                Spara utkast
              </Button>
            ) : null}
            {!isPaid ? (
              <Button
                variant="primary"
                disabled={savePayout.isPending || Boolean(payoutInputError) || data.lateRefundRecovery.blocked}
                onClick={() => savePayout.mutate("OVERRIDE")}
              >
                {savePayout.isPending && savePayout.variables === "OVERRIDE" ? <Loader2 size={15} className="animate-spin" /> : null}
                {hasSavedReport ? "Spara ny version" : data.refundWindow.closed ? "Lås rapport" : "Spara version"}
              </Button>
            ) : null}
            {persistedStatus === "APPROVED" ? (
              <Button
                disabled={savePayout.isPending || !payoutReference.trim()}
                onClick={() => savePayout.mutate("PAID")}
              >
                {savePayout.isPending && savePayout.variables === "PAID" ? <Loader2 size={15} className="animate-spin" /> : null}
                Markera sparad rapport betald
              </Button>
            ) : null}
          </Surface>
        </>
      )}
    </div>
  );
}
