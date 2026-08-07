"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  FileText,
  Loader2,
  Pencil,
  Printer,
  ShieldCheck,
} from "lucide-react";
import {
  getPayoutSpec,
  payoutSpecQueryKey,
  upsertPayout,
  type PayoutSpec,
} from "@/modules/finance/api";
import {
  financeQuery,
  FinanceWorkspace,
  monthRange as financeMonthRange,
} from "@/modules/finance/finance-workspace";
import styles from "@/modules/finance/finance-workspace.module.css";
import {
  RestaurantFinanceNav,
  type RestaurantFinanceView,
} from "@/modules/finance/restaurant-finance-nav";
import {
  payoutPrintOrders,
  payoutPrintSummary,
  printPayoutSpec,
  type PayoutPrintMode,
} from "@/modules/finance/spec-print";
import { invalidateEconomyDomain } from "@/shared/api/invalidate-economy-domain";
import {
  Badge,
  Button,
  ErrorPanel,
  Field,
  Input,
  Modal,
  MoneyInput,
  Select,
} from "@/shared/components/ui";
import {
  formatCurrencyExact as formatCurrency,
  formatDate,
  formatDateTime,
  orderStatusLabel,
  paymentStatusLabel,
} from "@/shared/utils/format";

type AdjustmentDirection = "deduction" | "addition";
type ReportVersion = "live" | "saved";
type SaveMode = "DRAFT" | "OVERRIDE" | "PAID";
type BadgeTone = "neutral" | "success" | "danger" | "warning" | "info";
type PayoutView = Exclude<RestaurantFinanceView, "agreement">;

const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";

function selectedMonth(from?: string, to?: string, requestedMonth?: string) {
  if (requestedMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth)) return requestedMonth;
  const match = (from || to)?.match(/^(\d{4})-(\d{2})/);
  const now = new Date();
  return match
    ? `${match[1]}-${match[2]}`
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

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

function MoneyRow({
  label,
  value,
  effect,
  detail,
  subtotal = false,
  nested = false,
}: {
  label: string;
  value: number | null;
  effect?: "subtract" | "add";
  detail?: ReactNode;
  subtotal?: boolean;
  nested?: boolean;
}) {
  const sign = effect === "subtract" ? "−" : effect === "add" ? "+" : "";
  return (
    <div className={`${styles.waterfallRow} ${nested ? styles.waterfallSub : ""} ${subtotal ? "font-black" : ""}`}>
      <span className="min-w-0">
        <span className={subtotal ? "text-[var(--text-primary)]" : undefined}>{label}</span>
        {detail ? <span className="mt-0.5 block text-[10px] font-semibold text-[var(--text-muted)]">{detail}</span> : null}
      </span>
      <strong>
        {value == null ? "Inväntar Mollie" : `${sign ? `${sign} ` : ""}${formatCurrency(Math.abs(value))}`}
      </strong>
    </div>
  );
}

function WorkflowItem({
  ready,
  warning = false,
  name,
  detail,
}: {
  ready: boolean;
  warning?: boolean;
  name: string;
  detail: string;
}) {
  return (
    <div className={styles.workflowItem}>
      <span
        className={`${styles.workflowIcon} ${
          ready ? styles.workflowIconReady : styles.workflowIconWaiting
        } ${warning ? "text-[var(--danger-text)]" : ""}`}
        aria-hidden
      >
        {ready ? <Check size={12} strokeWidth={3} /> : <CircleAlert size={12} />}
      </span>
      <div>
        <p className={styles.workflowName}>{name}</p>
        <p className={styles.workflowDetail}>{detail}</p>
      </div>
    </div>
  );
}

function PanelHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className={styles.panelHeader}>
      <div className="min-w-0">
        <h2 className={styles.panelTitle}>{title}</h2>
        {subtitle ? <p className={styles.panelSubtitle}>{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

function ReportVersionSwitch({
  value,
  onChange,
}: {
  value: ReportVersion;
  onChange: (value: ReportVersion) => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-1 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-page)] p-1"
      role="group"
      aria-label="Välj rapportversion"
    >
      {(["live", "saved"] as ReportVersion[]).map((version) => {
        const active = value === version;
        return (
          <button
            key={version}
            type="button"
            aria-pressed={active}
            className={`min-h-7 rounded-md px-2.5 text-[11px] font-extrabold transition-colors ${
              active
                ? "bg-[var(--brand-navy)] text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
            onClick={() => onChange(version)}
          >
            {version === "live" ? "Live" : "Sparad"}
          </button>
        );
      })}
    </div>
  );
}

const statusLabels: Record<string, string> = {
  NEW: "Ny",
  DRAFT: "Utkast",
  HOLD: "Väntar",
  APPROVED: "Låst",
  PAID: "Betald",
};

function statusTone(status: string): BadgeTone {
  if (status === "PAID") return "success";
  if (status === "HOLD") return "warning";
  if (status === "APPROVED") return "info";
  return "neutral";
}

export function FinancePayoutPage({
  restaurantId,
  from,
  to,
  month: requestedMonth,
  period,
  view = "settlement",
}: {
  restaurantId: string;
  from?: string;
  to?: string;
  month?: string;
  period?: string;
  view?: PayoutView;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const month = selectedMonth(from, to, requestedMonth);
  const range = financeMonthRange(month);
  const rangeWasNormalized = Boolean((from && from !== range.from) || (to && to !== range.to));
  const periodFrom = range.from;
  const periodTo = range.to;
  const backParams = new URLSearchParams(financeQuery(month));
  if (period) backParams.set("period", period);
  const restaurantFinanceHref = `/finance?${backParams.toString()}`;
  const viewPath = view === "settlement"
    ? `/finance/${restaurantId}`
    : view === "orders"
      ? `/finance/${restaurantId}/order`
      : view === "versions"
        ? `/finance/${restaurantId}/versioner`
        : `/finance/${restaurantId}/dokument`;
  const changeMonth = (nextMonth: string) => {
    const params = new URLSearchParams(financeQuery(nextMonth));
    if (period) params.set("period", period);
    router.push(`${viewPath}?${params.toString()}`);
  };

  const [reportVersion, setReportVersion] = useState<ReportVersion>("live");
  const [manualAdjustmentAmount, setManualAdjustmentAmount] = useState("");
  const [adjustmentDirection, setAdjustmentDirection] = useState<AdjustmentDirection>("deduction");
  const [notes, setNotes] = useState("");
  const [payoutReference, setPayoutReference] = useState("");
  const [formDirty, setFormDirty] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [draftAdjustmentAmount, setDraftAdjustmentAmount] = useState("");
  const [draftAdjustmentDirection, setDraftAdjustmentDirection] = useState<AdjustmentDirection>("deduction");
  const [draftAdjustmentReason, setDraftAdjustmentReason] = useState("");
  const [draftAdjustmentError, setDraftAdjustmentError] = useState<string | null>(null);
  const [printMode, setPrintMode] = useState<PayoutPrintMode>("summary");
  const [showReferenceOrders, setShowReferenceOrders] = useState(false);
  const [showPaymentState, setShowPaymentState] = useState(true);
  const syncedFormRef = useRef<string | null>(null);
  const initializedVersionRef = useRef<string | null>(null);

  const spec = useQuery({
    queryKey: payoutSpecQueryKey(restaurantId, periodFrom, periodTo),
    queryFn: () => getPayoutSpec(restaurantId, periodFrom, periodTo),
  });
  const data = spec.data;
  const b = data?.breakdown;
  const persisted = data?.persisted;
  const persistedStatus = String(persisted?.status || "NEW").toUpperCase();
  const isPaid = persistedStatus === "PAID";
  const hasSavedVersion = Boolean(persisted && ["APPROVED", "HOLD", "PAID"].includes(persistedStatus));
  const hasLockedVersion = hasSavedVersion;
  const readiness = data?.settlementReadiness;
  const preliminaryVersionAllowed = Boolean(
    readiness &&
    readiness.periodIsCalendarMonth &&
    readiness.providerAuditReady &&
    !readiness.recoveryBlocked && [
      "PAYOUT_REFUND_WINDOW_OPEN",
      "PAYOUT_MOLLIE_FEES_NOT_RECONCILED",
    ].includes(readiness.code || ""),
  );
  const versionActionBlocked = Boolean(
    readiness && !readiness.canLock && !preliminaryVersionAllowed && persistedStatus !== "PAID",
  );

  const sourceSignature = data
    ? `${restaurantId}:${periodFrom}:${periodTo}:${data.persisted?.updatedAt || "new"}`
    : null;

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!data || !sourceSignature) return;
    const periodKey = `${restaurantId}:${periodFrom}:${periodTo}`;
    const periodChanged = !syncedFormRef.current?.startsWith(`${periodKey}:`);
    if (syncedFormRef.current !== sourceSignature && (periodChanged || !formDirty)) {
      const savedAdjustment = Number(data.persisted?.manualAdjustmentAmount || 0);
      setManualAdjustmentAmount(savedAdjustment === 0 ? "" : String(Math.abs(savedAdjustment)));
      setAdjustmentDirection(savedAdjustment < 0 ? "addition" : "deduction");
      setNotes(data.persisted?.notes || "");
      setPayoutReference(data.persisted?.payoutReference || "");
      syncedFormRef.current = sourceSignature;
    }
    if (initializedVersionRef.current !== periodKey) {
      initializedVersionRef.current = periodKey;
      setReportVersion(
        data.persisted && ["APPROVED", "HOLD", "PAID"].includes(String(data.persisted.status).toUpperCase())
          ? "saved"
          : "live",
      );
    }
  }, [data, formDirty, periodFrom, periodTo, restaurantId, sourceSignature]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const parsedAdjustmentAmount = parseInputNumber(manualAdjustmentAmount);
  const manualAdjustmentIsValid = manualAdjustmentAmount.trim() === "" || (
    Number.isFinite(parsedAdjustmentAmount) && parsedAdjustmentAmount >= 0
  );
  const adjustmentMagnitude = manualAdjustmentIsValid ? Math.abs(parsedAdjustmentAmount || 0) : 0;
  const manualAdjustment = adjustmentDirection === "deduction" ? adjustmentMagnitude : -adjustmentMagnitude;
  const payoutInputError = !manualAdjustmentIsValid
    ? "Justeringen har ett ogiltigt belopp."
    : manualAdjustment !== 0 && !notes.trim()
      ? "En orsak krävs för den manuella justeringen."
      : null;

  const liveRecovery = isPaid ? 0 : Number(data?.lateRefundRecovery.reserved || 0);
  const liveSettlementPosition = (b?.payout ?? 0) - (b?.owed ?? 0) - manualAdjustment - liveRecovery;
  const liveRefundFee = b?.refundProcessingFees ?? null;
  const liveCardFee = b?.paymentFees ?? (
    b?.mollieFees == null || liveRefundFee == null ? null : Math.max(0, b.mollieFees - liveRefundFee)
  );
  const liveSalesAfterRefunds = Math.max(
    0,
    Number(b?.originalGrossTotal || 0) - Number(b?.refunds || 0),
  );
  const livePlatformFundedDiscount = Math.max(0, Number(b?.platformFundedDiscount || 0));
  const liveOutsideRestaurant = Math.max(
    0,
    liveSalesAfterRefunds + livePlatformFundedDiscount - Number(b?.restaurantGross || 0),
  );

  const savedFeeVat = persisted
    ? ((persisted.commissionAmount + persisted.subscriptionAmount) * Number(persisted.feeVatPctSnapshot || 0)) / 100
    : 0;
  const savedOrderSales = persisted ? (persisted.originalGrossTotal ?? persisted.grossSales) : 0;
  const savedRefunds = persisted?.refunds ?? 0;
  const savedSalesAfterRefunds = Math.max(0, savedOrderSales - savedRefunds);
  const savedPlatformFundedDiscount = Math.max(0, Number(persisted?.platformFundedDiscountAmount || 0));
  const savedOutsideRestaurant = persisted
    ? Math.max(0, savedSalesAfterRefunds + savedPlatformFundedDiscount - persisted.grossSales)
    : 0;
  const savedFeesReady = persisted?.mollieFeeStatus === "available";
  const savedFeeTotal = Math.max(0, Number(persisted?.mollieFeeAmount || 0));
  const savedRefundFee = Math.min(
    savedFeeTotal,
    Math.max(0, Number(persisted?.refundProcessingFeeAmount || 0)),
  );
  const savedCardFee = Math.max(0, savedFeeTotal - savedRefundFee);
  const savedSettlementPosition = persisted ? persisted.payoutAmount - persisted.owedAmount : 0;
  const liveDifference = persisted ? liveSettlementPosition - savedSettlementPosition : 0;

  const showingSaved = reportVersion === "saved" && Boolean(persisted);
  const settlement = showingSaved && persisted
    ? {
        orderSales: savedOrderSales,
        refunds: savedRefunds,
        platformFundedDiscount: savedPlatformFundedDiscount,
        outsideRestaurant: savedOutsideRestaurant,
        restaurantGross: persisted.grossSales,
        commissionPct: persisted.commissionPctSnapshot,
        commission: persisted.commissionAmount,
        subscription: persisted.subscriptionAmount,
        feeVatPct: persisted.feeVatPctSnapshot,
        feeVat: savedFeeVat,
        viaEatsTotal: persisted.commissionAmount + persisted.subscriptionAmount + savedFeeVat,
        cardFee: savedCardFee,
        refundFee: savedRefundFee,
        adjustment: persisted.manualAdjustmentAmount,
        adjustmentNote: persisted.notes,
        recovery: persisted.lateRefundAdjustmentAmount,
        position: savedSettlementPosition,
        feesReady: savedFeesReady,
        feesPreliminary: !savedFeesReady,
        orderCount: persisted.periodOrderCount ?? persisted.orderCount,
        tierLabel: b?.tierLabel || "Abonnemang",
      }
    : {
        orderSales: b?.originalGrossTotal ?? 0,
        refunds: b?.refunds ?? 0,
        platformFundedDiscount: livePlatformFundedDiscount,
        outsideRestaurant: liveOutsideRestaurant,
        restaurantGross: b?.restaurantGross ?? 0,
        commissionPct: b?.commissionPct ?? null,
        commission: b?.commission ?? 0,
        subscription: b?.subscription ?? 0,
        feeVatPct: b?.feeVatPct ?? null,
        feeVat: b?.feeVat ?? 0,
        viaEatsTotal: (b?.commission ?? 0) + (b?.subscription ?? 0) + (b?.feeVat ?? 0),
        cardFee: liveCardFee,
        refundFee: liveRefundFee,
        adjustment: manualAdjustment,
        adjustmentNote: notes,
        recovery: liveRecovery,
        position: liveSettlementPosition,
        feesReady: b?.mollieFeeStatus === "available",
        feesPreliminary: b?.mollieFeeStatus !== "available",
        orderCount: b?.periodOrderCount ?? b?.orderCount ?? 0,
        tierLabel: b?.tierLabel || "Abonnemang",
      };

  const printableSpec = useMemo<PayoutSpec | null>(() => {
    if (!data) return null;
    return showingSaved ? data : { ...data, persisted: null };
  }, [data, showingSaved]);
  const effectivePrintMode: PayoutPrintMode = showingSaved ? "summary" : printMode;
  const printOptions = useMemo(
    () => ({
      mode: effectivePrintMode,
      showReferenceOrders,
      showPaymentState,
      adjustmentNote: showingSaved ? persisted?.notes || "" : notes,
    }),
    [effectivePrintMode, notes, persisted?.notes, showPaymentState, showReferenceOrders, showingSaved],
  );
  const previewOrders = useMemo(
    () => printableSpec ? payoutPrintOrders(printableSpec, printOptions) : [],
    [printOptions, printableSpec],
  );
  const calculatedPreviewSummary = useMemo(() => payoutPrintSummary(previewOrders), [previewOrders]);
  const previewSummary = showingSaved && persisted
    ? {
        ...calculatedPreviewSummary,
        paidOrderCount: persisted.periodOrderCount ?? persisted.orderCount,
        paidTotal: persisted.originalGrossTotal ?? persisted.grossSales,
        referenceOrderCount: 0,
      }
    : calculatedPreviewSummary;
  const printAdjustment = showingSaved ? Number(persisted?.manualAdjustmentAmount || 0) : manualAdjustment;
  const printRecovery = showingSaved ? Number(persisted?.lateRefundAdjustmentAmount || 0) : liveRecovery;
  const openPrint = () => {
    if (printableSpec) printPayoutSpec(printableSpec, printAdjustment, printRecovery, printOptions);
  };

  const savePayout = useMutation({
    mutationFn: async (saveMode: SaveMode) => {
      if (!data) throw new Error("Avräkningsunderlaget har inte laddats.");
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
    onMutate: () => setFeedback(null),
    onSuccess: async (_record, saveMode) => {
      setFormDirty(false);
      await invalidateEconomyDomain(queryClient);
      await queryClient.refetchQueries({ queryKey: payoutSpecQueryKey(restaurantId, periodFrom, periodTo) });
      setReportVersion("saved");
      setFeedback(
        saveMode === "DRAFT"
          ? "Utkastet är sparat."
          : saveMode === "PAID"
            ? "Avräkningen är markerad som betald."
            : "En ny avräkningsversion är sparad.",
      );
    },
  });

  const markEdited = () => {
    setFormDirty(true);
    setFeedback(null);
    if (savePayout.isError || savePayout.isSuccess) savePayout.reset();
  };

  const openAdjustment = () => {
    if (isPaid) return;
    setReportVersion("live");
    setDraftAdjustmentAmount(manualAdjustmentAmount);
    setDraftAdjustmentDirection(adjustmentDirection);
    setDraftAdjustmentReason(notes);
    setDraftAdjustmentError(null);
    setAdjustmentOpen(true);
  };

  const applyAdjustment = () => {
    const amount = parseInputNumber(draftAdjustmentAmount);
    if (!draftAdjustmentAmount.trim() || !Number.isFinite(amount) || amount <= 0) {
      setDraftAdjustmentError("Ange ett belopp större än 0 kr.");
      return;
    }
    if (!draftAdjustmentReason.trim()) {
      setDraftAdjustmentError("Ange varför justeringen görs.");
      return;
    }
    markEdited();
    setManualAdjustmentAmount(String(Math.abs(amount)));
    setAdjustmentDirection(draftAdjustmentDirection);
    setNotes(draftAdjustmentReason.trim());
    setAdjustmentOpen(false);
  };

  const clearAdjustment = () => {
    markEdited();
    setManualAdjustmentAmount("");
    setAdjustmentDirection("deduction");
    setNotes("");
    setAdjustmentOpen(false);
  };

  const payoutError = mutationError(savePayout.error);
  const isOwed = settlement.position < 0;
  const agreementLabel = data?.restaurant.commissionPctOverride == null
    ? `Standardavtal${b ? ` · ${b.commissionPct}%` : ""}`
    : data.restaurant.commissionPctOverride === 0
      ? "Eget avtal · 0 % provisionsfri"
      : `Eget avtal · ${data.restaurant.commissionPctOverride}%`;
  const viewDescription: Record<PayoutView, string> = {
    settlement: "Avräkning och arbetsflöde",
    orders: "Order och återbetalningar",
    versions: "Låsta avräkningsversioner",
    documents: "Avräkningsbesked och PDF",
  };

  const headerActions = (
    <>
      <Badge tone={statusTone(persistedStatus)}>{statusLabels[persistedStatus] || persistedStatus}</Badge>
      {view === "settlement" ? (
        <Button variant="primary" onClick={openPrint} disabled={!printableSpec}>
          <Printer size={14} /> Utbetalningsbesked PDF
        </Button>
      ) : null}
    </>
  );

  return (
    <FinanceWorkspace
      title={data?.restaurant.name || "Avräkning"}
      description={data
        ? [data.restaurant.legalName, data.restaurant.organizationNumber, agreementLabel]
          .filter(Boolean)
          .join(" · ")
        : viewDescription[view]}
      month={month}
      onMonthChange={changeMonth}
      onRefresh={() => {
        setFeedback(null);
        void spec.refetch();
      }}
      refreshing={spec.isFetching}
      actions={headerActions}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={restaurantFinanceHref}
          className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={14} /> Alla avräkningar
        </Link>
        {rangeWasNormalized ? (
          <p className="rounded-lg bg-[var(--brand-navy-soft)] px-3 py-2 text-[11px] font-bold text-[var(--brand-navy-ink)]">
            Avräkningar följer hela kalendermånader.
          </p>
        ) : null}
      </div>

      <RestaurantFinanceNav
        restaurantId={restaurantId}
        active={view}
        month={month}
        from={periodFrom}
        to={periodTo}
        period={period}
      />

      {spec.isError && !data ? (
        <ErrorPanel
          title="Avräkningen kunde inte laddas"
          description="Inga belopp visas innan underlaget har hämtats."
          action={<Button onClick={() => void spec.refetch()}>Försök igen</Button>}
        />
      ) : spec.isLoading || !data || !b ? (
        <div className={`${styles.panel} flex min-h-[320px] items-center justify-center gap-2 text-sm font-bold text-[var(--text-secondary)]`}>
          <Loader2 size={16} className="animate-spin" /> Beräknar avräkning…
        </div>
      ) : (
        <>
          {spec.isError ? (
            <div className="rounded-xl border border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-3 text-xs font-bold text-[var(--warning-text)]">
              Uppdateringen misslyckades. Senast hämtade underlag visas.
            </div>
          ) : null}

          {view === "settlement" ? (
            <div className={styles.detailGrid}>
            <section className={styles.panel}>
              <PanelHeader
                title="Avräkning"
                subtitle={showingSaved ? `Sparad ${formatDateTime(persisted?.updatedAt)}` : "Aktuell beräkning"}
                actions={
                  <>
                    {hasSavedVersion ? (
                      <ReportVersionSwitch value={reportVersion} onChange={setReportVersion} />
                    ) : null}
                    {!isPaid && !showingSaved ? (
                      <Button onClick={openAdjustment} className="min-h-9 px-3 text-xs">
                        <Pencil size={13} /> Justering
                      </Button>
                    ) : null}
                  </>
                }
              />

              <div className={styles.waterfall}>
                <div className={styles.waterfallGroup}>
                  <MoneyRow label="Bruttoförsäljning" value={settlement.orderSales} />
                  <MoneyRow label="Återbetalningar" value={settlement.refunds} effect="subtract" />
                  {settlement.platformFundedDiscount > 0 ? (
                    <MoneyRow
                      label="ViaEats-finansierad rabatt"
                      value={settlement.platformFundedDiscount}
                      effect="add"
                    />
                  ) : null}
                  {settlement.outsideRestaurant > 0 ? (
                    <MoneyRow
                      label="Leverans och dricks utanför restaurang"
                      value={settlement.outsideRestaurant}
                      effect="subtract"
                    />
                  ) : null}
                  <MoneyRow label="Netto / avräkningsgrund" value={settlement.restaurantGross} subtotal />
                </div>

                <div className={styles.waterfallGroup}>
                  <MoneyRow
                    label={`Provision exkl. moms${settlement.commissionPct == null ? "" : ` · ${settlement.commissionPct}%`}`}
                    value={settlement.commission}
                    effect="subtract"
                    nested
                  />
                  <MoneyRow
                    label={`Abonnemang exkl. moms · ${settlement.tierLabel}`}
                    value={settlement.subscription}
                    effect="subtract"
                    nested
                  />
                  <MoneyRow
                    label={`Moms på ViaEats-avgifter${settlement.feeVatPct == null ? "" : ` · ${settlement.feeVatPct}%`}`}
                    value={settlement.feeVat}
                    effect="subtract"
                    nested
                  />
                  <MoneyRow label="ViaEats totalt inkl. moms" value={settlement.viaEatsTotal} subtotal />
                </div>

                <div className={styles.waterfallGroup}>
                  <MoneyRow
                    label={`Korttransaktionsavgift${settlement.feesPreliminary ? " · preliminär" : ""}`}
                    value={settlement.cardFee}
                    effect="subtract"
                    nested
                  />
                  <MoneyRow
                    label={`Återbetalningstransaktionsavgift${settlement.feesPreliminary ? " · preliminär" : ""}`}
                    value={settlement.refundFee}
                    effect="subtract"
                    nested
                  />
                </div>

                {settlement.adjustment !== 0 || settlement.recovery > 0 ? (
                  <div className={styles.waterfallGroup}>
                    {settlement.adjustment !== 0 ? (
                      <MoneyRow
                        label="Manuell justering"
                        value={Math.abs(settlement.adjustment)}
                        effect={settlement.adjustment > 0 ? "subtract" : "add"}
                      />
                    ) : null}
                    {settlement.recovery > 0 ? (
                      <MoneyRow
                        label="Sen återbetalningsrecovery"
                        value={settlement.recovery}
                        effect="subtract"
                      />
                    ) : null}
                  </div>
                ) : null}

                <div className={styles.waterfallTotal}>
                  <p className={styles.waterfallTotalLabel}>
                    {isOwed ? "Fakturabelopp" : "Utbetalning"}
                  </p>
                  <p className={styles.waterfallTotalValue}>{formatCurrency(Math.abs(settlement.position))}</p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10.5px] font-semibold text-white/60">
                    <span>{!settlement.feesReady ? "Preliminärt · " : ""}{showingSaved ? "Sparad version" : "Liveversion"}</span>
                    {!showingSaved && hasSavedVersion && liveDifference !== 0 ? (
                      <span>{liveDifference > 0 ? "+" : "−"}{formatCurrency(Math.abs(liveDifference))} mot sparad</span>
                    ) : null}
                  </div>
                </div>
              </div>
            </section>

            <aside className={`${styles.sticky} space-y-3`}>
              <section className={styles.panel}>
                <PanelHeader
                  title="Arbetsflöde"
                  subtitle="Kontroller före låsning och betalning"
                  actions={<Badge tone={statusTone(persistedStatus)}>{statusLabels[persistedStatus] || persistedStatus}</Badge>}
                />
                <div className={styles.workflowList}>
                  <WorkflowItem
                    ready={Boolean(readiness && readiness.blockingOrderCount === 0 && readiness.immatureOrderCount === 0)}
                    warning={Boolean(readiness && (readiness.blockingOrderCount > 0 || readiness.immatureOrderCount > 0))}
                    name="Orderunderlag"
                    detail={!readiness
                      ? `${b.periodOrderCount ?? b.orderCount} betalningar kontrollerade`
                      : readiness.blockingOrderCount > 0
                        ? `${readiness.blockingOrderCount} order är inte slutligt avstämda`
                        : readiness.immatureOrderCount > 0
                          ? `${readiness.immatureOrderCount} order har öppet återbetalningsfönster`
                          : `${b.periodOrderCount ?? b.orderCount} betalningar är slutligt avstämda`}
                  />
                  <WorkflowItem
                    ready={readiness?.exactFeesReady ?? b.mollieFeeStatus === "available"}
                    name="Mollieavgifter"
                    detail={(readiness?.exactFeesReady ?? b.mollieFeeStatus === "available") ? "Kort- och återbetalningsavgifter är bekräftade" : "Väntar på exakta transaktionsavgifter"}
                  />
                  <WorkflowItem
                    ready={readiness?.refundWindowClosed ?? data.refundWindow.closed}
                    name="Återbetalningsfönster"
                    detail={(readiness?.refundWindowClosed ?? data.refundWindow.closed) ? "Periodfönstret är stängt" : `Stänger ${formatDateTime(data.refundWindow.closesAt)}`}
                  />
                  <WorkflowItem
                    ready={!data.lateRefundRecovery.blocked}
                    warning={data.lateRefundRecovery.blocked}
                    name="Sen recovery"
                    detail={data.lateRefundRecovery.blocked
                      ? data.lateRefundRecovery.error || "Recovery kunde inte beräknas"
                      : data.lateRefundRecovery.reserved > 0
                        ? `${formatCurrency(data.lateRefundRecovery.reserved)} reserverat${data.lateRefundRecovery.remaining > 0 ? ` · ${formatCurrency(data.lateRefundRecovery.remaining)} förs vidare` : ""}`
                        : "Ingen recovery blockerar perioden"}
                  />
                  <WorkflowItem
                    ready={persistedStatus === "PAID" || persistedStatus === "APPROVED"}
                    name="Avräkningsstatus"
                    detail={persistedStatus === "PAID"
                      ? `Betald${persisted?.paidAt ? ` ${formatDateTime(persisted.paidAt)}` : ""}`
                      : persistedStatus === "APPROVED"
                        ? `Låst${persisted?.approvedAt ? ` ${formatDateTime(persisted.approvedAt)}` : ""}`
                        : statusLabels[persistedStatus] || persistedStatus}
                  />
                </div>
              </section>

              <section className={styles.panel}>
                <PanelHeader title="Nästa åtgärd" subtitle="Alla åtgärder stannar på denna sida" />
                <div className="space-y-3 p-4">
                  <div className="rounded-xl bg-[var(--bg-page)] px-3.5 py-3">
                    <p className={styles.microLabel}>Aktivt avtal</p>
                    <p className="mt-1.5 text-xs font-extrabold text-[var(--text-primary)]">{agreementLabel}</p>
                    <p className="mt-1 text-[10.5px] font-semibold text-[var(--text-muted)]">
                      {data.restaurant.selfDelivery ? "Restaurangen levererar" : "ViaEats levererar"} · {b.tierLabel}
                    </p>
                  </div>

                  {(persistedStatus === "APPROVED" || persistedStatus === "PAID") ? (
                    <Field
                      label="Betalningsreferens"
                      hint={persistedStatus === "APPROVED" ? "Krävs för att markera avräkningen betald." : undefined}
                    >
                      <Input
                        value={payoutReference}
                        disabled={isPaid}
                        placeholder="Bank- eller utbetalningsreferens"
                        onChange={(event) => {
                          markEdited();
                          setPayoutReference(event.target.value);
                        }}
                      />
                    </Field>
                  ) : null}

                  {payoutInputError || payoutError ? (
                    <p className="rounded-xl bg-[var(--danger-soft)] px-3 py-2.5 text-xs font-bold text-[var(--danger-text)]" role="alert">
                      {payoutInputError || payoutError}
                    </p>
                  ) : null}
                  {feedback ? (
                    <p className="rounded-xl bg-[var(--success-soft)] px-3 py-2.5 text-xs font-bold text-[var(--success-text)]" role="status">
                      {feedback}
                    </p>
                  ) : null}

                  <div className="grid gap-2">
                    {!isPaid && !hasLockedVersion ? (
                      <Button
                        disabled={savePayout.isPending || Boolean(payoutInputError)}
                        onClick={() => savePayout.mutate("DRAFT")}
                      >
                        {savePayout.isPending && savePayout.variables === "DRAFT" ? <Loader2 size={14} className="animate-spin" /> : null}
                        Spara utkast
                      </Button>
                    ) : null}
                    {!isPaid ? (
                      <Button
                        variant="primary"
                        disabled={savePayout.isPending || Boolean(payoutInputError) || data.lateRefundRecovery.blocked || versionActionBlocked}
                        onClick={() => savePayout.mutate("OVERRIDE")}
                      >
                        {savePayout.isPending && savePayout.variables === "OVERRIDE" ? <Loader2 size={14} className="animate-spin" /> : null}
                        {hasLockedVersion
                          ? "Spara ny version"
                          : readiness?.canLock
                            ? "Lås avräkning"
                            : "Spara preliminär version"}
                      </Button>
                    ) : null}
                    {persistedStatus === "APPROVED" ? (
                      <Button
                        disabled={savePayout.isPending || !payoutReference.trim()}
                        onClick={() => savePayout.mutate("PAID")}
                      >
                        {savePayout.isPending && savePayout.variables === "PAID" ? <Loader2 size={14} className="animate-spin" /> : null}
                        Markera betald
                      </Button>
                    ) : null}
                  </div>

                  {versionActionBlocked && readiness?.reason ? (
                    <p className="rounded-xl bg-[var(--warning-soft)] px-3 py-2.5 text-xs font-bold text-[var(--warning-text)]">
                      {readiness.reason}
                    </p>
                  ) : null}

                  {isPaid ? (
                    <div className="flex items-start gap-2 rounded-xl bg-[var(--success-soft)] px-3 py-3 text-xs font-bold text-[var(--success-text)]">
                      <ShieldCheck size={15} className="mt-0.5 shrink-0" /> Avräkningen är slutreglerad och kan inte ändras.
                    </div>
                  ) : null}
                </div>
              </section>
            </aside>
            </div>
          ) : null}

          {view === "orders" ? (
            <section className={styles.panel}>
              <PanelHeader
                title="Order & återbetalningar"
                subtitle={`${data.orders.length} order i perioden · återbetalningar påverkar både försäljning och transaktionsavgift`}
              />
              {data.orders.length ? (
                <div className={styles.ledger}>
                  <table className={styles.ledgerTable}>
                    <thead>
                      <tr>
                        <th>Order</th>
                        <th>Datum</th>
                        <th>Typ</th>
                        <th>Status</th>
                        <th>Ekonomi</th>
                        <th className={styles.numeric}>Original</th>
                        <th className={styles.numeric}>Återbetalt</th>
                        <th className={styles.numeric}>Netto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.orders.map((order) => {
                        const original = Math.max(0, Number(order.originalTotal || 0));
                        const refunded = Math.min(original, Math.max(0, Number(order.refundAmount || 0)));
                        const net = order.includedInPayout
                          ? Math.max(0, Number(order.total || 0))
                          : Math.max(0, original - refunded);
                        return (
                          <tr key={order.orderNumber}>
                            <td className="font-extrabold text-[var(--text-primary)]">#{order.orderNumber}</td>
                            <td data-mobile-label="Datum">{formatDate(order.createdAt)}</td>
                            <td data-mobile-hidden="true">{String(order.type).toUpperCase() === "PICKUP" ? "Avhämtning" : "Leverans"}</td>
                            <td data-mobile-label="Status">
                              <span className="block">{financeOrderStatusLabel(order)}</span>
                              <span className="mt-0.5 block text-[10px] text-[var(--text-muted)]">{paymentStatusLabel(order.paymentStatus)}</span>
                            </td>
                            <td data-mobile-hidden="true">
                              <Badge tone={order.includedInPayout ? "success" : "neutral"}>{order.includedInPayout ? "Ingår" : "Referens"}</Badge>
                            </td>
                            <td className={styles.numeric} data-mobile-label="Brutto" style={{ fontFamily: mono }}>{formatCurrency(original)}</td>
                            <td className={styles.numeric} data-mobile-label="Återbetalt" style={{ fontFamily: mono }}>{formatCurrency(refunded)}</td>
                            <td className={`${styles.numeric} font-extrabold text-[var(--text-primary)]`} data-mobile-label="Netto" style={{ fontFamily: mono }}>{formatCurrency(net)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-5 py-10 text-center text-sm font-semibold text-[var(--text-secondary)]">Inga order i perioden.</p>
              )}
            </section>
          ) : null}

          {view === "versions" ? (
            <section className={styles.panel}>
              <PanelHeader
                title="Versioner"
                subtitle="Låsta belopp ändras aldrig när avtal eller orderdata uppdateras"
              />
              {persisted?.revisions?.length ? (
                <div className={styles.ledger}>
                  <table className={styles.ledgerTable}>
                    <thead>
                      <tr>
                        <th>Version</th>
                        <th>Sparad</th>
                        <th>Provision</th>
                        <th className={styles.numeric}>ViaEats exkl. moms</th>
                        <th className={styles.numeric}>Moms</th>
                        <th className={styles.numeric}>Utbetalning</th>
                      </tr>
                    </thead>
                    <tbody>
                      {persisted.revisions.map((revision) => (
                        <tr key={revision.id}>
                          <td className="font-extrabold text-[var(--text-primary)]">
                            Version {revision.revision}{" "}
                            {revision.original ? <Badge tone="info">Original</Badge> : null}{" "}
                            {revision.reason === "OVERRIDE" ? <Badge tone="warning">Ersatte</Badge> : null}
                          </td>
                          <td data-mobile-label="Sparad">
                            {formatDateTime(revision.createdAt)}
                            {revision.createdBy ? <span className="mt-0.5 block text-[10px] text-[var(--text-muted)]">{revision.createdBy}</span> : null}
                          </td>
                          <td data-mobile-label="Provision">{revision.commissionPct == null ? "—" : `${revision.commissionPct}%`}</td>
                          <td className={styles.numeric} data-mobile-hidden="true">{formatCurrency(revision.viaEatsExVat ?? revision.commissionExVat)}</td>
                          <td className={styles.numeric} data-mobile-hidden="true">{formatCurrency(revision.vat)}</td>
                          <td className={`${styles.numeric} font-extrabold text-[var(--text-primary)]`} data-mobile-label="Utbetalning">{formatCurrency(revision.payout)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-5 py-10 text-center text-sm font-semibold text-[var(--text-secondary)]">Ingen låst version ännu.</p>
              )}
            </section>
          ) : null}

          {view === "documents" ? (
            <section className={styles.panel}>
              <PanelHeader
                title="Dokument"
                subtitle={`PDF skapas från ${showingSaved ? "den sparade versionen" : "liveversionen"}`}
                actions={
                  <>
                    <FileText size={17} className="text-[var(--text-muted)]" />
                    {hasSavedVersion ? (
                      <ReportVersionSwitch value={reportVersion} onChange={setReportVersion} />
                    ) : null}
                  </>
                }
              />
              <div className="grid gap-5 p-5 lg:grid-cols-[minmax(240px,360px)_1fr]">
                <div className="space-y-3">
                  {showingSaved ? (
                    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-page)] px-4 py-3 text-xs font-semibold leading-relaxed text-[var(--text-secondary)]">
                      Den sparade versionen är ett fryst besked på 1 sida. Orderlista och dagsummering finns i liveversionen.
                    </div>
                  ) : (
                    <>
                      <Field label="PDF-innehåll">
                        <Select value={printMode} onChange={(event) => setPrintMode(event.target.value as PayoutPrintMode)}>
                          <option value="summary">Enkelt besked · 1 sida</option>
                          <option value="orders">Besked + orderlista</option>
                          <option value="daily">Besked + dagsummering</option>
                        </Select>
                      </Field>
                      {printMode === "orders" ? (
                        <label className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] px-3 py-2.5 text-xs font-bold text-[var(--text-secondary)]">
                          <input type="checkbox" checked={showPaymentState} onChange={(event) => setShowPaymentState(event.target.checked)} />
                          Visa betalningsstatus
                        </label>
                      ) : null}
                      {printMode !== "summary" ? (
                        <label className="flex items-center gap-2 rounded-xl border border-[var(--border-subtle)] px-3 py-2.5 text-xs font-bold text-[var(--text-secondary)]">
                          <input type="checkbox" checked={showReferenceOrders} onChange={(event) => setShowReferenceOrders(event.target.checked)} />
                          Ta med avbrutna order
                        </label>
                      ) : null}
                    </>
                  )}
                </div>
                <div className="grid content-start gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-[var(--bg-page)] px-4 py-3">
                    <p className={styles.microLabel}>Order i PDF</p>
                    <p className="mt-1.5 text-xl font-black text-[var(--text-primary)]">{previewSummary.paidOrderCount}</p>
                  </div>
                  <div className="rounded-xl bg-[var(--bg-page)] px-4 py-3">
                    <p className={styles.microLabel}>Ordervärde</p>
                    <p className="mt-1.5 text-xl font-black text-[var(--text-primary)]">{formatCurrency(previewSummary.paidTotal)}</p>
                  </div>
                  <div className="rounded-xl bg-[var(--bg-page)] px-4 py-3">
                    <p className={styles.microLabel}>Referensorder</p>
                    <p className="mt-1.5 text-xl font-black text-[var(--text-primary)]">{previewSummary.referenceOrderCount}</p>
                  </div>
                  <div className="sm:col-span-3 sm:justify-self-end">
                    <Button variant="primary" onClick={openPrint} disabled={!printableSpec}>
                      <Printer size={15} /> Öppna PDF
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          ) : null}
        </>
      )}

      <Modal
        open={adjustmentOpen}
        size="sm"
        title="Manuell justering"
        description="Justeringen gäller bara denna avräkningsversion och kräver en tydlig orsak."
        onClose={() => setAdjustmentOpen(false)}
        footer={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button onClick={clearAdjustment} disabled={manualAdjustment === 0}>Ta bort justering</Button>
            <div className="flex gap-2">
              <Button onClick={() => setAdjustmentOpen(false)}>Avbryt</Button>
              <Button variant="primary" onClick={applyAdjustment}>Använd justering</Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Typ" required>
            <Select
              value={draftAdjustmentDirection}
              onChange={(event) => {
                setDraftAdjustmentError(null);
                setDraftAdjustmentDirection(event.target.value as AdjustmentDirection);
              }}
            >
              <option value="deduction">Avdrag från restaurangen</option>
              <option value="addition">Kreditering till restaurangen</option>
            </Select>
          </Field>
          <Field label="Belopp" required>
            <MoneyInput
              min={0.01}
              step="0.01"
              value={draftAdjustmentAmount}
              placeholder="0,00"
              onValueChange={(value) => {
                setDraftAdjustmentError(null);
                setDraftAdjustmentAmount(value);
              }}
            />
          </Field>
          <Field label="Orsak" required>
            <Input
              value={draftAdjustmentReason}
              placeholder="Exempel: kreditering enligt supportärende"
              onChange={(event) => {
                setDraftAdjustmentError(null);
                setDraftAdjustmentReason(event.target.value);
              }}
            />
          </Field>
          {draftAdjustmentError ? (
            <p
              className="rounded-xl bg-[var(--danger-soft)] px-3 py-2.5 text-xs font-bold text-[var(--danger-text)]"
              role="alert"
            >
              {draftAdjustmentError}
            </p>
          ) : null}
        </div>
      </Modal>
    </FinanceWorkspace>
  );
}
