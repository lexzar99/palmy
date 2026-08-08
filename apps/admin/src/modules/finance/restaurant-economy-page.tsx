"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  financeSummaryQueryKey,
  getFinanceSummary,
  getPayoutSpec,
  payoutSpecQueryKey,
  upsertPayout,
  type FinanceRow,
  type FinanceSummary,
  type PayoutSpec,
} from "@/modules/finance/api";
import { isMonthParam, monthId, monthLabel, monthRange } from "@/modules/finance/finance-workspace";
import {
  amountInputValue,
  count,
  feeKr,
  kr,
  negativeFee,
  num,
  parseAmount,
  signed,
  statusCode,
  statusLabel,
  type StatusLabel,
} from "@/modules/finance/format";
import { FinanceTabs } from "@/modules/finance/finance-tabs";
import {
  isWholeMonth,
  PeriodPicker,
  periodLabel,
  periodQuery,
  readPeriod,
  RestaurantPicker,
  type Period,
} from "@/modules/finance/finance-pickers";
import styles from "@/modules/finance/restaurant-economy.module.css";
import { ErrorPanel, Surface } from "@/shared/components/ui";
import { invalidateEconomyDomain } from "@/shared/api/invalidate-economy-domain";
import { formatDateTime } from "@/shared/utils/format";

type Tone = "ok" | "warn" | "muted";

const TONE_STYLE: Record<Tone, string> = {
  ok: styles.toneOk,
  warn: styles.toneWarn,
  muted: styles.toneMuted,
};

const STATUS_TONE: Record<StatusLabel, Tone> = {
  Utkast: "warn",
  Godkänd: "ok",
  Betald: "muted",
};

/** Samma förklaring på knapparna och i notisen — bara skriven en gång. */
const NOT_A_MONTH =
  "Perioden är inte en hel kalendermånad. Underlaget går att granska, men utbetalningen sparas bara per månad — välj en månad för att godkänna, betala eller justera.";

const adjustTone = (value: number) =>
  value === 0 ? styles.adjustZero : value > 0 ? styles.adjustPlus : styles.adjustMinus;

/** Justeringen lagras med motsatt tecken mot vad modellen och gränssnittet använder. */
const toStoredAdjustment = (value: number) => -value;

const percent = (part: number, whole: number, decimals: number) =>
  whole === 0 ? "—" : `${((part / whole) * 100).toFixed(decimals).replace(".", ",")} %`;

const orderDate = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("sv-SE", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

/* ── Kontrollerna ───────────────────────────────────────────────────────── */

type CheckRow = { a: string; b: string; c: string; d: string; e: string; tone: Tone };

type Check = {
  key: string;
  title: string;
  summary: string;
  badge: string;
  tone: Tone;
  mark: string;
  body: string;
  stats: Array<{ label: string; value: string; detail: string }>;
  columns: string[];
  rows: CheckRow[];
  /** Visas när raderna bakom siffran inte finns i API:t ännu. */
  emptyNote?: string;
  fix?: { text: string; amount: number; note: string };
  /** Vägen vidare när själva ändringen görs på en annan sida. */
  link?: { href: string; label: string };
};

/**
 * Kontrollerna byggs ur riktig data. Där API:t inte har raderna bakom siffran
 * visas en förklaring i stället för en tom eller påhittad tabell.
 */
function buildChecks(
  row: FinanceRow,
  summary: FinanceSummary,
  spec: PayoutSpec | undefined,
  periodText: string,
): Check[] {
  const s = row.settlement;
  // Avvikelselistan är information, inte underlag. Saknas den i svaret ska
  // sidan visa siffrorna ändå i stället för att blanka ut.
  const deviations = (summary.reconciliation?.deviations || []).filter(
    (item) => item.restaurantId === row.restaurantId && item.severity !== "info",
  );
  const unmatchedAmount = deviations.reduce((sum, item) => sum + Math.max(0, Number(item.amount || 0)), 0);
  const unmatchedOrders = deviations.reduce((sum, item) => sum + Math.max(1, item.affectedOrderCount || 0), 0);
  const matched = Math.max(0, row.orderCount - unmatchedOrders);
  const refundedOrders = (spec?.orders || []).filter((order) => order.refundAmount > 0);
  const revisions = spec?.persisted?.revisions || [];

  return [
    {
      key: "match",
      title: "Ordermatchning",
      summary: `${matched} av ${row.orderCount} matchar`,
      badge: deviations.length ? `${deviations.length} anmärkning${deviations.length === 1 ? "" : "ar"}` : "Komplett",
      tone: deviations.length ? "warn" : "ok",
      mark: deviations.length ? "!" : "✓",
      body:
        "Varje levererad order ska ha en betalning som gått igenom. Ordrar utan matchad betalning ingår inte i utbetalningsunderlaget.",
      stats: [
        { label: "Matchade", value: count(matched), detail: `av ${count(row.orderCount)} ordrar` },
        {
          label: "Saknar betalning",
          value: count(unmatchedOrders),
          detail: unmatchedOrders ? "granskas manuellt" : "inget att göra",
        },
        { label: "Belopp i fråga", value: kr(unmatchedAmount), detail: "ingår ej i underlaget" },
      ],
      columns: ["Order", "Avvikelse", "Belopp", "Betal-id", "Status"],
      rows: deviations.map((item) => ({
        a: item.orderNumber ? `#${item.orderNumber}` : "—",
        b: item.title,
        c: item.amount == null ? "—" : kr(item.amount),
        d: item.paymentId || "saknas",
        e: item.severity === "critical" ? "Kritisk" : "Anmärkning",
        tone: item.severity === "critical" ? "warn" : "muted",
      })),
      emptyNote: deviations.length ? undefined : "Alla ordrar i perioden matchar en genomförd betalning.",
      fix: unmatchedAmount > 0
        ? {
            text: `Vill du hålla restaurangen skadeslös lägger du ${kr(unmatchedAmount)} som justering.`,
            // Exakt belopp — justeringar har ören.
            amount: Math.round(unmatchedAmount * 100) / 100,
            note: "Kompensation för ordrar utan matchad betalning",
          }
        : undefined,
    },
    {
      key: "fees",
      title: "Kortavgifter",
      summary: s.cardFees == null ? "hämtas" : `${kr(s.cardFees)} totalt`,
      badge: s.cardFees == null ? "Inväntar" : "Komplett",
      tone: s.cardFees == null ? "warn" : "ok",
      mark: s.cardFees == null ? "!" : "✓",
      body:
        "Kortavgiften dras av betalleverantören när kunden betalar. En enda post för hela perioden: avgiften på alla restaurangens ordrar, inklusive de som återbetalats. Hela beloppet belastar restaurangen.",
      stats: [
        { label: "Kortavgifter", value: feeKr(s.cardFees), detail: "hela perioden" },
        {
          label: "Andel av brutto",
          value: s.cardFees == null ? "—" : percent(s.cardFees, row.grossTotal, 2),
          detail: "belastar restaurangen",
        },
        { label: "Betalningar", value: count(row.orderCount), detail: `varav ${count(refundedOrders.length)} återbetalda` },
      ],
      columns: [],
      rows: [],
      emptyNote:
        "Avgiften per betalning finns hos betalleverantören och exponeras inte per order i API:t. Summan ovan är hämtad och avstämd mot perioden.",
    },
    {
      key: "refunds",
      title: "Återbetalningar",
      summary: `${count(refundedOrders.length)} st · ${kr(row.refunds)}`,
      badge: "Belastar restaurangen",
      tone: "muted",
      mark: "i",
      body:
        "Återbetalda ordrar dras från nettoförsäljningen. Kortavgiften på dessa ordrar var redan dragen när pengarna gick tillbaka och kommer inte tillbaka — den ingår i periodens kortavgift.",
      stats: [
        { label: "Återbetalt", value: kr(row.refunds), detail: `${percent(row.refunds, row.grossTotal, 1)} av brutto` },
        { label: "Antal", value: count(refundedOrders.length), detail: "hela och delvisa" },
        { label: "Andel av brutto", value: percent(row.refunds, row.grossTotal, 2), detail: "belastar restaurangen" },
      ],
      columns: ["Order", "Datum", "Original", "Återbetalt", "Typ"],
      rows: refundedOrders.map((order) => ({
        a: `#${order.orderNumber}`,
        b: orderDate(order.createdAt),
        c: kr(order.originalTotal),
        d: kr(-order.refundAmount),
        e: order.refundAmount >= order.originalTotal ? "Hel" : "Delvis",
        tone: order.refundAmount >= order.originalTotal ? "muted" : "warn",
      })),
      emptyNote: refundedOrders.length ? undefined : "Inga återbetalningar i perioden.",
    },
    {
      key: "rate",
      title: "Provisionssats",
      summary: `${s.commissionPct} % · avtal ${row.tierLabel}`,
      badge: row.rateSource === "override" ? "Eget avtal" : row.rateSource === "snapshot" ? "Låst" : "Enligt avtal",
      tone: "ok",
      mark: "✓",
      body:
        "Satsen som använts i perioden kommer från avtalet. Ändrar du satsen slår den igenom på hela perioden direkt — beloppet räknas om.",
      stats: [
        { label: "Sats", value: `${s.commissionPct} %`, detail: row.tierLabel },
        { label: "Provision", value: kr(s.commission), detail: "ex moms" },
        { label: "Moms", value: kr(s.commissionVat), detail: `${s.vatPct} %` },
      ],
      link: {
        href: `/finance/${row.restaurantId}/avtal`,
        label: "Ändra provisionssats i avtalet →",
      },
      columns: ["Period", "Sats", "Netto", "Provision", "Källa"],
      rows: [
        {
          a: periodText,
          b: `${s.commissionPct} %`,
          c: kr(s.netSales),
          d: kr(s.commission),
          e:
            row.rateSource === "override"
              ? "Eget avtal"
              : row.rateSource === "snapshot"
                ? "Låst version"
                : "Avtal",
          tone: "ok",
        },
      ],
    },
    {
      key: "adjust",
      title: "Justeringar",
      summary: s.adjustment === 0 ? "Ingen justering" : `${signed(s.adjustment)} kr`,
      badge: s.adjustment === 0 ? "Ingen" : "Manuell",
      tone: s.adjustment === 0 ? "muted" : "warn",
      mark: s.adjustment === 0 ? "–" : "±",
      body:
        "Manuella justeringar går att lägga till, ändra eller ta bort när som helst, även efter att utbetalningen markerats som betald. Varje ändring sparas som en ny version.",
      stats: [
        {
          label: "Nuvarande",
          value: `${signed(s.adjustment)} kr`,
          detail: s.adjustment > 0 ? "extra till restaurangen" : s.adjustment < 0 ? "avdrag" : "ingen",
        },
        { label: "Effekt på oss", value: `${signed(-s.adjustment)} kr`, detail: "på vår provision" },
        { label: "Versioner", value: count(revisions.length), detail: "sparade ändringar" },
      ],
      columns: ["Version", "Händelse", "Belopp", "Av", "Status"],
      rows: revisions.map((revision) => ({
        a: `v${revision.revision}`,
        b: revision.original ? "Underlag skapat" : revision.reason || "Ändring",
        c: kr(revision.payout),
        d: revision.createdBy || "—",
        e: "Sparad",
        tone: "muted" as Tone,
      })),
      emptyNote: revisions.length ? undefined : "Ingen sparad version ännu.",
    },
  ];
}

/* ── Sidan ──────────────────────────────────────────────────────────────── */

/**
 * `restaurantId` är valfritt: landningssidan /finance/restaurangekonomi har
 * ingen restaurang i adressen och visar då den första i perioden. Väljaren
 * högst upp byter restaurang och skriver in id:t i adressen.
 */
export function RestaurantEconomyPage({ restaurantId = null }: { restaurantId?: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const period = useMemo(() => readPeriod(searchParams), [searchParams]);
  const { from, to } = period;
  // Utbetalningar sparas bara på hela kalendermånader — API:t avvisar allt
  // annat. En egen period går att granska, men inte att spara på.
  const canSave = isWholeMonth(period);

  const summary = useQuery({
    queryKey: financeSummaryQueryKey(from, to),
    queryFn: () => getFinanceSummary(from, to),
  });
  // Utan id i adressen faller vi tillbaka på periodens första restaurang.
  const resolvedId = restaurantId || summary.data?.rows[0]?.restaurantId || null;

  const spec = useQuery({
    queryKey: payoutSpecQueryKey(resolvedId, from, to),
    queryFn: () => getPayoutSpec(String(resolvedId), from, to),
    enabled: Boolean(resolvedId),
  });

  const [activeCheck, setActiveCheck] = useState<string | null>(null);
  const [draftAdjustment, setDraftAdjustment] = useState("0");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const row = summary.data?.rows.find((item) => item.restaurantId === resolvedId) || null;
  const s = row?.settlement;

  // Servern äger värdet. Justeras under render så fältet aldrig visar ett
  // gammalt belopp efter att en version sparats.
  const serverState = `${resolvedId}:${s?.adjustment ?? 0}:${row?.adjustmentNote || ""}`;
  const [lastServerState, setLastServerState] = useState(serverState);
  if (lastServerState !== serverState) {
    setLastServerState(serverState);
    setDraftAdjustment(amountInputValue(s?.adjustment ?? 0));
    setNote(row?.adjustmentNote || "");
  }

  const save = useMutation({
    mutationFn: (input: { status: StatusLabel; adjustment: number; note: string }) =>
      upsertPayout({
        restaurantId: String(resolvedId),
        periodStart: from,
        periodEnd: to,
        manualAdjustmentAmount: toStoredAdjustment(input.adjustment),
        status: statusCode(input.status),
        notes: input.note || null,
      }),
    onMutate: () => setError(null),
    onSuccess: async () => {
      await invalidateEconomyDomain(queryClient);
      await queryClient.refetchQueries({ queryKey: financeSummaryQueryKey(from, to) });
      await queryClient.refetchQueries({ queryKey: payoutSpecQueryKey(resolvedId, from, to) });
    },
    onError: (mutationError: unknown) => {
      const response = (mutationError as { response?: { data?: { error?: string } } })?.response;
      setError(response?.data?.error || "Ändringen kunde inte sparas.");
    },
  });

  const goTo = (nextRestaurant: string, next: Period) =>
    router.push(`/finance/${nextRestaurant}?${periodQuery(next)}`);
  const changePeriod = (next: Period) =>
    router.replace(`/finance/${resolvedId ?? ""}?${periodQuery(next)}`, { scroll: false });

  if (summary.isError) {
    return (
      <div className={styles.page}>
        <FinanceTabs month={period.month ?? undefined} />
        <ErrorPanel
          title="Restaurangens ekonomi kunde inte laddas"
          description="Inga reservbelopp visas. Försök hämta det riktiga underlaget igen."
          action={<button type="button" className={styles.actionButton} onClick={() => void summary.refetch()}>Försök igen</button>}
        />
      </div>
    );
  }

  if (!summary.data || !row || !s) {
    return (
      <div className={styles.page}>
        <FinanceTabs month={period.month ?? undefined} />
        <Surface className="flex items-center gap-2 px-6 py-14 text-sm text-[var(--text-secondary)]">
          <Loader2 size={16} className="animate-spin" />
          {summary.data ? "Restaurangen har ingen aktivitet i perioden." : "Hämtar periodens ekonomi…"}
        </Surface>
      </div>
    );
  }

  const status = statusLabel(row.status);
  const checks = buildChecks(row, summary.data, spec.data, periodLabel(period));
  const active = checks.find((check) => check.key === activeCheck) || null;
  const attention = checks.filter((check) => check.tone === "warn").length;
  const restaurant = spec.data?.restaurant;
  const revisions = spec.data?.persisted?.revisions || [];
  const reference = row.payoutReference || `VE-${(period.month ?? from.slice(0, 7)).slice(2).replace("-", "")}-${String(resolvedId).slice(0, 3).toUpperCase()}`;
  const legalName = restaurant?.legalName || row.name;

  // null = fältet går inte att tolka. Då sparar vi ingenting.
  const draftValue = parseAmount(draftAdjustment);
  const validAmount = draftValue != null;
  const preview = s.payout - s.adjustment + (draftValue ?? s.adjustment);
  const dirty = (validAmount && draftValue !== s.adjustment) || (note || "") !== (row.adjustmentNote || "");

  // Alla övergångar är tillåtna. Knapparna visar de lägen posten inte står i.
  const statusActions: Array<{ label: string; next: StatusLabel; primary: boolean }> = [];
  if (status !== "Godkänd") {
    statusActions.push({
      label: status === "Betald" ? "Markera som godkänd" : "Godkänn",
      next: "Godkänd",
      primary: status !== "Betald",
    });
  }
  if (status !== "Betald") {
    statusActions.push({ label: "Markera som betald", next: "Betald", primary: status === "Godkänd" });
  }
  if (status !== "Utkast") {
    statusActions.push({ label: "Tillbaka till utkast", next: "Utkast", primary: false });
  }

  return (
    <div className={styles.page}>
      <FinanceTabs month={period.month ?? undefined} />
      <div className={styles.header}>
        <div>
          <p className={styles.crumbs}>
            <Link className={styles.crumbLink} href={`/finance?${periodQuery(period)}`}>
              Ekonomi
            </Link>{" "}
            ▸ {row.name} ▸ {periodLabel(period)}
          </p>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{row.name}</h1>
            <span className={`${styles.status} ${TONE_STYLE[STATUS_TONE[status]]}`}>{status}</span>
          </div>
          <p className={styles.subtitle}>
            {row.tierLabel} · {s.commissionPct} % provision · {count(row.orderCount)} ordrar · {row.city || "Stad saknas"}
          </p>
        </div>
        <div className={styles.headerActions}>
          <RestaurantPicker
            restaurants={summary.data.rows.map((item) => ({
              id: item.restaurantId,
              name: item.name,
              amount: item.settlement.payout,
            }))}
            selectedId={resolvedId}
            onSelect={(id) => goTo(id, period)}
          />
          <PeriodPicker period={period} onChange={changePeriod} />
          {statusActions.map((action) => (
            <button
              type="button"
              key={action.next}
              disabled={save.isPending || !canSave}
              title={canSave ? undefined : NOT_A_MONTH}
              className={`${styles.actionButton} ${action.primary ? styles.actionButtonPrimary : ""}`}
              onClick={() => save.mutate({ status: action.next, adjustment: s.adjustment, note: row.adjustmentNote || "" })}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {canSave ? null : <p className={styles.notice}>{NOT_A_MONTH}</p>}

      <div className={styles.kpis}>
        <article className={styles.kpi}>
          <p className={styles.kpiLabel}>Brutto</p>
          <p className={styles.kpiValue}>{kr(row.grossTotal)}</p>
          <p className={styles.kpiMeta}>{count(row.orderCount)} ordrar</p>
        </article>
        <article className={styles.kpi}>
          <p className={styles.kpiLabel}>Nettoförsäljning</p>
          <p className={styles.kpiValue}>{kr(s.netSales)}</p>
          <p className={styles.kpiMeta}>efter {kr(row.refunds)} återbetalningar</p>
        </article>
        <article className={styles.kpi}>
          <p className={styles.kpiLabel}>Vår provision</p>
          <p className={styles.kpiValue}>{kr(s.ourRevenue)}</p>
          <p className={styles.kpiMeta}>{percent(s.ourRevenue, s.netSales, 1)} av nettot</p>
        </article>
        <article className={`${styles.kpi} ${styles.kpiNavy}`}>
          <p className={styles.kpiLabel}>Att betala ut</p>
          <p className={styles.kpiValue}>{kr(s.payout)}</p>
          <p className={styles.kpiMeta}>{reference}</p>
        </article>
      </div>

      <div className={styles.columns}>
        <div className={styles.mainColumn}>
          {active ? (
            <section className={styles.panel}>
              <button type="button" className={styles.checkBack} onClick={() => setActiveCheck(null)}>
                ‹ Tillbaka till specifikationen
              </button>
              <div className={styles.checkHead}>
                <div>
                  <h2 className={styles.checkTitle}>{active.title}</h2>
                  <p className={styles.checkBody}>{active.body}</p>
                </div>
                <span className={`${styles.badge} ${TONE_STYLE[active.tone]}`}>{active.badge}</span>
              </div>

              <div className={styles.checkStats}>
                {active.stats.map((stat) => (
                  <div className={styles.checkStat} key={stat.label}>
                    <p className={styles.checkStatLabel}>{stat.label}</p>
                    <p className={styles.checkStatValue}>{stat.value}</p>
                    <p className={styles.checkStatDetail}>{stat.detail}</p>
                  </div>
                ))}
              </div>

              {active.rows.length > 0 ? (
                <div className={styles.checkTable}>
                  <div className={`${styles.checkGrid} ${styles.checkColumns}`}>
                    {active.columns.map((column) => (
                      <span className={styles.checkColumn} key={column}>
                        {column}
                      </span>
                    ))}
                  </div>
                  {active.rows.map((item, index) => (
                    <div className={`${styles.checkGrid} ${styles.checkRow}`} key={`${item.a}-${index}`}>
                      <span className={styles.checkCellStrong}>{item.a}</span>
                      <span className={styles.checkCell}>{item.b}</span>
                      <span className={styles.checkCell}>{item.c}</span>
                      <span className={styles.checkCellStrong}>{item.d}</span>
                      <span>
                        <span className={`${styles.pill} ${TONE_STYLE[item.tone]}`}>{item.e}</span>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.checkEmpty}>{active.emptyNote}</p>
              )}

              {active.link ? (
                <Link className={styles.checkLink} href={active.link.href}>
                  {active.link.label}
                </Link>
              ) : null}

              {active.fix ? (
                <div className={styles.checkFix}>
                  <span className={styles.checkFixText}>{active.fix.text}</span>
                  <span className={styles.checkFixActions}>
                    <button type="button" className={styles.smallButton} onClick={() => setActiveCheck(null)}>
                      Stäng
                    </button>
                    <button
                      type="button"
                      className={`${styles.smallButton} ${styles.smallButtonPrimary}`}
                      onClick={() => {
                        setDraftAdjustment(amountInputValue(active.fix!.amount));
                        setNote(active.fix!.note);
                        setActiveCheck(null);
                      }}
                    >
                      Lägg som justering
                    </button>
                  </span>
                </div>
              ) : null}
            </section>
          ) : (
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>Specifikation</h2>
              <div className={styles.specGrid}>
                <div className={styles.specColumn}>
                  <p className={styles.specLabel}>Restaurangens pengar</p>
                  <div className={styles.specBody}>
                    <div className={styles.line}>
                      <span className={styles.lineName}>Brutto</span>
                      <span className={styles.lineValue}>{num(row.grossTotal)}</span>
                    </div>
                    <div className={`${styles.line} ${styles.lineUnderlined}`}>
                      <span className={`${styles.lineName} ${styles.lineRefund}`}>Återbetalt</span>
                      <span className={`${styles.lineValue} ${styles.lineRefund}`}>{num(-row.refunds)}</span>
                    </div>
                    <div className={styles.totalLine}>
                      <span className={styles.totalName}>Nettoförsäljning</span>
                      <span className={styles.totalValue}>{num(s.netSales)}</span>
                    </div>
                    <div className={`${styles.line} ${styles.lineTop}`}>
                      <span className={styles.lineName}>Provision {s.commissionPct} % ex moms</span>
                      <span className={styles.lineValue}>{num(-s.commission)}</span>
                    </div>
                    <div className={styles.line}>
                      <span className={styles.lineName}>Moms på provision {s.vatPct} %</span>
                      <span className={styles.lineValue}>{num(-s.commissionVat)}</span>
                    </div>
                    <div className={styles.line}>
                      <span className={styles.lineName}>Kortavgifter · återbetalda ordrar inräknade</span>
                      <span className={styles.lineValue}>{negativeFee(s.cardFees)}</span>
                    </div>
                    <div className={`${styles.line} ${styles.lineTop}`}>
                      <span className={styles.lineName}>Manuell justering</span>
                      <span className={`${styles.lineValue} ${adjustTone(s.adjustment)}`}>{signed(s.adjustment)}</span>
                    </div>
                  </div>
                </div>

                <div className={styles.specColumn}>
                  <p className={styles.specLabel}>Våra pengar</p>
                  <div className={styles.specBody}>
                    <div className={styles.line}>
                      <span className={styles.lineName}>Provision ex moms</span>
                      <span className={styles.lineValue}>{num(s.commission)}</span>
                    </div>
                    <div className={`${styles.line} ${styles.lineUnderlined}`}>
                      <span className={styles.lineName}>Manuell justering</span>
                      <span className={`${styles.lineValue} ${adjustTone(-s.adjustment)}`}>{signed(-s.adjustment)}</span>
                    </div>
                    <div className={styles.totalLine}>
                      <span className={styles.totalName}>Kvar hos oss ex moms</span>
                      <span className={styles.totalValue}>{num(s.ourRevenue)}</span>
                    </div>
                    <div className={`${styles.line} ${styles.lineTop}`}>
                      <span className={`${styles.lineName} ${styles.lineDim}`}>Moms att redovisa</span>
                      <span className={`${styles.lineValue} ${styles.lineDim}`}>{num(s.commissionVat)}</span>
                    </div>
                  </div>
                  <div className={styles.historyBlock}>
                    <p className={styles.historyLabel}>Historik</p>
                    {revisions.length === 0 ? (
                      <p className={styles.historyMeta}>Ingen sparad version ännu.</p>
                    ) : (
                      revisions.map((revision) => (
                        <div className={styles.historyRow} key={revision.id}>
                          <span style={{ minWidth: 0 }}>
                            <span className={styles.historyTitle}>
                              {revision.original ? "Underlag skapat" : revision.reason || `Version ${revision.revision}`}
                            </span>
                            <span className={styles.historyMeta}>
                              {formatDateTime(revision.createdAt)}
                              {revision.createdBy ? ` · ${revision.createdBy}` : ""}
                            </span>
                          </span>
                          <span className={styles.historyAmount}>{kr(revision.payout)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className={styles.payoutFoot}>
                <span>
                  <span className={styles.payoutFootLabel}>Att betala ut till {legalName}</span>
                  <span className={styles.payoutFootValue}>{kr(s.payout)}</span>
                  <span className={styles.payoutFootMeta}>{reference}</span>
                </span>
                <button
                  type="button"
                  className={styles.payoutFootButton}
                  onClick={() => router.push(`/finance/payouts?month=${period.month ?? from.slice(0, 7)}&post=${resolvedId}`)}
                >
                  Visa i utbetalningar →
                </button>
              </div>
            </section>
          )}
        </div>

        <div className={styles.sideColumn}>
          <section className={styles.sidePanel}>
            <div className={styles.sideHead}>
              <h2 className={styles.sideTitle}>Kontroller</h2>
              <span className={styles.sideSummary}>
                {attention === 0 ? "Allt stämmer" : `${attention} att titta på`}
              </span>
            </div>
            <div className={styles.checkList}>
              {checks.map((check) => (
                <button
                  type="button"
                  key={check.key}
                  className={`${styles.checkItem} ${activeCheck === check.key ? styles.checkItemActive : ""}`}
                  onClick={() => setActiveCheck(activeCheck === check.key ? null : check.key)}
                >
                  <span className={`${styles.checkMark} ${TONE_STYLE[check.tone]}`}>{check.mark}</span>
                  <span className={styles.checkItemBody}>
                    <span className={styles.checkItemTitle}>{check.title}</span>
                    <span className={styles.checkItemSummary}>{check.summary}</span>
                  </span>
                  <span className={styles.chevron}>›</span>
                </button>
              ))}
            </div>
          </section>

          <section className={`${styles.sidePanel} ${styles.sidePanelGrow}`}>
            <h2 className={styles.sideTitle}>Manuell justering</h2>
            <p className={styles.adjustNote}>
              Plus = restaurangen får extra. Minus = vi drar av. Går att ändra när som helst, även efter utbetalning.
            </p>
            <div className={styles.adjustRow}>
              <button
                type="button"
                className={styles.stepButton}
                aria-label="Minska med 200"
                onClick={() => setDraftAdjustment(amountInputValue((parseAmount(draftAdjustment) ?? 0) - 200))}
              >
                −
              </button>
              <input
                type="text"
                className={styles.adjustInput}
                value={draftAdjustment}
                aria-label="Justering i kronor"
                onChange={(event) => setDraftAdjustment(event.target.value)}
              />
              <button
                type="button"
                className={styles.stepButton}
                aria-label="Öka med 200"
                onClick={() => setDraftAdjustment(amountInputValue((parseAmount(draftAdjustment) ?? 0) + 200))}
              >
                +
              </button>
            </div>
            <input
              type="text"
              className={styles.noteInput}
              value={note}
              placeholder="Anteckning · syns på specen"
              onChange={(event) => setNote(event.target.value)}
            />
            <div className={styles.preview}>
              <span className={styles.previewLabel}>Nytt belopp</span>
              <span className={styles.previewValue}>{kr(preview)}</span>
            </div>
            <button
              type="button"
              className={styles.saveButton}
              // En justering utan orsak avvisas av API:t.
              disabled={save.isPending || !canSave || !validAmount || !dirty || (draftValue !== 0 && !note.trim())}
              onClick={() => validAmount && save.mutate({ status, adjustment: draftValue, note: note.trim() })}
            >
              {save.isPending ? "Sparar…" : "Spara justering"}
            </button>
            {error ? <p className={styles.error}>{error}</p> : null}
            <div className={styles.recipient}>
              <p className={styles.recipientLabel}>Mottagare</p>
              <p className={styles.recipientName}>{legalName}</p>
              <p className={styles.recipientLine}>
                {[restaurant?.organizationNumber, restaurant?.city || row.city].filter(Boolean).join(" · ") ||
                  "Uppgifter saknas"}
              </p>
              <p className={styles.recipientLine}>
                {row.payoutReference ? `Referens ${row.payoutReference}` : "Bankuppgifter finns inte i systemet ännu"}
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
