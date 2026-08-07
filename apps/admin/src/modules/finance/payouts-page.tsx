"use client";

import { useMemo, useState } from "react";
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
  count,
  kr,
  negativeFeeKr,
  num,
  signed,
  statusCode,
  statusLabel,
  type StatusLabel,
} from "@/modules/finance/format";
import { FinanceTabs } from "@/modules/finance/finance-tabs";
import styles from "@/modules/finance/payouts.module.css";
import { EmptyState, ErrorPanel, Surface } from "@/shared/components/ui";
import { invalidateEconomyDomain } from "@/shared/api/invalidate-economy-domain";
import { formatDateTime } from "@/shared/utils/format";

const STATUS_STYLE: Record<StatusLabel, string> = {
  Utkast: styles.statusDraft,
  Godkänd: styles.statusApproved,
  Betald: styles.statusPaid,
};

const adjustTone = (value: number) =>
  value === 0 ? styles.adjustZero : value > 0 ? styles.adjustPlus : styles.adjustMinus;

type Tab = "Alla" | StatusLabel;
const TABS: Array<{ value: Tab; label: string }> = [
  { value: "Alla", label: "Alla" },
  { value: "Utkast", label: "Utkast" },
  { value: "Godkänd", label: "Godkända" },
  { value: "Betald", label: "Betalda" },
];

/** Referensen identifierar posten i banken. VE-2607-PAL. */
const reference = (row: FinanceRow, month: string) =>
  row.payoutReference ||
  `VE-${month.slice(2).replace("-", "")}-${row.restaurantId.slice(0, 3).toUpperCase()}`;

/** Justeringen lagras med motsatt tecken mot vad modellen och gränssnittet använder. */
const toStoredAdjustment = (value: number) => -value;

/** Heltal ur ett fritextfält. "−200 kr" → -200 */
const parseAmount = (value: string) =>
  parseInt(String(value).replace(/−/g, "-").replace(/[^\-0-9]/g, ""), 10) || 0;

/* ── Listan ─────────────────────────────────────────────────────────────── */

function PayoutList({
  summary,
  month,
  months,
  onMonth,
  onOpen,
  onApproveAll,
  approving,
}: {
  summary: FinanceSummary;
  month: string;
  months: string[];
  onMonth: (month: string) => void;
  onOpen: (row: FinanceRow) => void;
  onApproveAll: () => void;
  approving: boolean;
}) {
  const [tab, setTab] = useState<Tab>("Alla");
  const rows = summary.rows.map((row) => ({ row, status: statusLabel(row.status) }));
  const visible = tab === "Alla" ? rows : rows.filter((item) => item.status === tab);
  const group = (status: StatusLabel) => rows.filter((item) => item.status === status);
  const sum = (list: typeof rows) => list.reduce((total, item) => total + item.row.settlement.payout, 0);
  const drafts = group("Utkast");
  const s = summary.settlement;

  return (
    <>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Sparade utbetalningar</p>
          <h1 className={styles.title}>Utbetalningar</h1>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.segment}>
            {months.map((value) => (
              <button
                type="button"
                key={value}
                className={`${styles.segmentButton} ${value === month ? styles.segmentButtonActive : ""}`}
                onClick={() => onMonth(value)}
              >
                {monthLabel(value)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={onApproveAll}
            disabled={approving || drafts.length === 0}
          >
            {approving ? "Godkänner…" : "Godkänn alla utkast"}
          </button>
        </div>
      </div>

      <div className={styles.cards}>
        <article className={styles.card}>
          <p className={styles.cardLabel}>Utkast</p>
          <p className={styles.cardValue}>{kr(sum(drafts))}</p>
          <p className={styles.cardMeta}>{drafts.length} väntar på godkännande</p>
        </article>
        <article className={styles.card}>
          <p className={styles.cardLabel}>Godkända</p>
          <p className={styles.cardValue}>{kr(sum(group("Godkänd")))}</p>
          <p className={styles.cardMeta}>{group("Godkänd").length} klara att betala</p>
        </article>
        <article className={styles.card}>
          <p className={styles.cardLabel}>Betalda</p>
          <p className={styles.cardValue}>{kr(sum(group("Betald")))}</p>
          <p className={styles.cardMeta}>{group("Betald").length} utbetalda</p>
        </article>
        <article className={`${styles.card} ${styles.cardNavy}`}>
          <p className={styles.cardLabel}>Vår provision</p>
          <p className={styles.cardValue}>{kr(s.ourRevenue)}</p>
          <p className={styles.cardMeta}>ex moms, efter justeringar</p>
        </article>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <div className={`${styles.segment} ${styles.segmentInset}`}>
            {TABS.map((item) => (
              <button
                type="button"
                key={item.value}
                className={`${styles.segmentButton} ${tab === item.value ? styles.segmentButtonActive : ""}`}
                onClick={() => setTab(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <span className={styles.panelCount}>{visible.length} poster</span>
        </div>

        <div className={`${styles.grid} ${styles.columnHeaders}`}>
          <span className={styles.columnHeader}>Restaurang</span>
          <span className={styles.columnHeader}>Period</span>
          <span className={`${styles.columnHeader} ${styles.numeric}`}>Netto</span>
          <span className={`${styles.columnHeader} ${styles.numeric}`}>Provision</span>
          <span className={`${styles.columnHeader} ${styles.numeric}`}>Justering</span>
          <span className={`${styles.columnHeader} ${styles.numeric}`}>Belopp</span>
          <span className={`${styles.columnHeader} ${styles.numeric}`}>Status</span>
        </div>

        {visible.length === 0 ? (
          <div className={styles.empty}>
            <EmptyState title="Inga poster i den här vyn" description="Byt flik eller period." />
          </div>
        ) : (
          visible.map(({ row, status }) => (
            <button
              type="button"
              key={row.restaurantId}
              className={`${styles.grid} ${styles.row}`}
              onClick={() => onOpen(row)}
            >
              <span>
                <span className={styles.rowName}>{row.name}</span>
                <span className={styles.rowMeta}>{reference(row, month)}</span>
              </span>
              <span className={styles.rowPeriod}>{monthLabel(month)}</span>
              <span className={`${styles.numeric} ${styles.cellSoft}`}>{num(row.settlement.netSales)}</span>
              <span className={`${styles.numeric} ${styles.cellSoft}`}>{num(row.settlement.commission)}</span>
              <span className={`${styles.numeric} ${styles.cellAdjust} ${adjustTone(row.settlement.adjustment)}`}>
                {signed(row.settlement.adjustment)}
              </span>
              <span className={`${styles.numeric} ${styles.cellAmount}`}>{num(row.settlement.payout)}</span>
              <span className={styles.statusCell}>
                <span className={`${styles.status} ${STATUS_STYLE[status]}`}>{status}</span>
                <span className={styles.chevron}>›</span>
              </span>
            </button>
          ))
        )}

        <div className={`${styles.grid} ${styles.totalsRow}`}>
          <span className={styles.totalsCell}>Totalt</span>
          <span />
          <span className={`${styles.numeric} ${styles.totalsCell}`}>{num(s.netSales)}</span>
          <span className={`${styles.numeric} ${styles.totalsCell}`}>{num(s.commission)}</span>
          <span className={`${styles.numeric} ${styles.totalsCell}`}>{signed(s.adjustment)}</span>
          <span className={`${styles.numeric} ${styles.totalsAmount}`}>{num(s.payout)}</span>
          <span />
        </div>
      </section>
    </>
  );
}

/* ── Detaljvyn ──────────────────────────────────────────────────────────── */

function PayoutDetail({
  row,
  month,
  spec,
  onBack,
  onStatus,
  onSaveAdjustment,
  onOpenRestaurant,
  saving,
  error,
}: {
  row: FinanceRow;
  month: string;
  spec: PayoutSpec | undefined;
  onBack: () => void;
  onStatus: (status: StatusLabel) => void;
  onSaveAdjustment: (amount: number, note: string) => void;
  onOpenRestaurant: () => void;
  saving: boolean;
  error: string | null;
}) {
  const s = row.settlement;
  const status = statusLabel(row.status);
  const [draftAdjustment, setDraftAdjustment] = useState(String(s.adjustment));
  const [note, setNote] = useState(row.adjustmentNote || "");

  // När servern svarat med ett nytt sparat värde ska rutan visa det, inte den
  // gamla inmatningen. Justeras under render i stället för i en effekt, så
  // fältet aldrig hinner visa fel belopp för en bildruta.
  const serverState = `${row.restaurantId}:${s.adjustment}:${row.adjustmentNote || ""}`;
  const [lastServerState, setLastServerState] = useState(serverState);
  if (lastServerState !== serverState) {
    setLastServerState(serverState);
    setDraftAdjustment(String(s.adjustment));
    setNote(row.adjustmentNote || "");
  }

  const draftValue = parseAmount(draftAdjustment);
  // Förhandsvisningen byter bara ut justeringen i den redan beräknade raden.
  const preview = s.payout - s.adjustment + draftValue;
  const dirty = draftValue !== s.adjustment || (note || "") !== (row.adjustmentNote || "");

  // Alla övergångar är tillåtna. Knapparna visar bara de lägen posten inte
  // redan står i, i den ordning arbetet normalt går.
  const actions: Array<{ label: string; status: StatusLabel; primary: boolean }> = [];
  if (status !== "Utkast") actions.push({ label: "Tillbaka till utkast", status: "Utkast", primary: false });
  if (status !== "Godkänd") {
    actions.push({
      label: status === "Betald" ? "Markera som godkänd" : "Godkänn utbetalning",
      status: "Godkänd",
      primary: status !== "Betald",
    });
  }
  if (status !== "Betald") {
    actions.push({ label: "Markera som betald", status: "Betald", primary: status === "Godkänd" });
  }

  const restaurant = spec?.restaurant;
  const revisions = spec?.persisted?.revisions || [];

  return (
    <>
      <button type="button" className={styles.back} onClick={onBack}>
        ‹ Alla utbetalningar
      </button>

      <div className={styles.detailHeader}>
        <div className={styles.detailHeaderRow}>
          <div>
            <div className={styles.detailBadges}>
              <span className={`${styles.status} ${STATUS_STYLE[status]}`}>{status}</span>
              <span className={styles.detailReference}>{reference(row, month)}</span>
            </div>
            <h1 className={styles.detailName}>{row.name}</h1>
            <p className={styles.detailMeta}>
              {monthLabel(month)} · {count(row.orderCount)} ordrar · {s.commissionPct} % provision
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p className={styles.detailAmountLabel}>Utbetalningsbelopp</p>
            <p className={styles.detailAmount}>{kr(s.payout)}</p>
            <div className={styles.detailActions}>
              {actions.map((action) => (
                <button
                  type="button"
                  key={action.status}
                  disabled={saving}
                  className={`${styles.actionButton} ${action.primary ? styles.actionButtonPrimary : ""}`}
                  onClick={() => onStatus(action.status)}
                >
                  {action.label}
                </button>
              ))}
            </div>
            {error ? <p className={styles.error}>{error}</p> : null}
          </div>
        </div>
      </div>

      <div className={styles.detailColumns}>
        <div className={styles.detailColumn}>
          <section className={`${styles.block} ${styles.blockGrow}`}>
            <h2 className={styles.blockTitle}>Specifikation</h2>
            <div className={styles.spec}>
              <div className={styles.specRow}>
                <span className={styles.specLabel}>Kundbetalningar brutto · {count(row.orderCount)} ordrar</span>
                <span className={styles.specValue}>{kr(row.grossTotal)}</span>
              </div>
              <div className={`${styles.specRow} ${styles.specRowUnderlined}`}>
                <span className={`${styles.specLabel} ${styles.specRefund}`}>Återbetalningar</span>
                <span className={`${styles.specValue} ${styles.specRefund}`}>{kr(-row.refunds)}</span>
              </div>
              <div className={styles.specNetRow}>
                <span className={styles.specNetLabel}>Nettoförsäljning</span>
                <span className={styles.specNetValue}>{kr(s.netSales)}</span>
              </div>
              <div className={`${styles.specRow} ${styles.specRowTop}`}>
                <span className={styles.specLabel}>Provision ex moms · {s.commissionPct} %</span>
                <span className={styles.specValue}>{kr(-s.commission)}</span>
              </div>
              <div className={`${styles.specRow} ${styles.specRowTop}`}>
                <span className={styles.specLabel}>Moms på provision {s.vatPct} %</span>
                <span className={styles.specValue}>{kr(-s.commissionVat)}</span>
              </div>
              <div className={`${styles.specRow} ${styles.specRowTop}`}>
                <span className={styles.specLabel}>Kortavgifter · återbetalda ordrar inräknade</span>
                <span className={styles.specValue}>{negativeFeeKr(s.cardFees)}</span>
              </div>
              <div className={`${styles.specRow} ${styles.specRowTop}`}>
                <span className={styles.specLabel}>Manuell justering</span>
                <span className={`${styles.specValue} ${adjustTone(s.adjustment)}`}>{signed(s.adjustment)}</span>
              </div>
              <div className={styles.specTotal}>
                <span className={styles.specTotalLabel}>Att betala ut</span>
                <span className={styles.specTotalValue}>{kr(s.payout)}</span>
              </div>
            </div>
          </section>

          <section className={styles.block}>
            <div className={styles.adjustHead}>
              <div>
                <h2 className={styles.blockTitle}>Manuell justering</h2>
                <p className={styles.blockSubtitle}>
                  Plus = restaurangen får extra. Minus = vi drar av. Går att ändra när som helst.
                </p>
              </div>
              <div className={styles.adjustStepper}>
                <button
                  type="button"
                  className={styles.stepButton}
                  aria-label="Minska med 200"
                  onClick={() => setDraftAdjustment(String(parseAmount(draftAdjustment) - 200))}
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
                  onClick={() => setDraftAdjustment(String(parseAmount(draftAdjustment) + 200))}
                >
                  +
                </button>
              </div>
            </div>
            <div className={styles.adjustSave}>
              <input
                type="text"
                className={styles.noteInput}
                value={note}
                placeholder="Varför? Syns på specen och i historiken"
                onChange={(event) => setNote(event.target.value)}
              />
              <button
                type="button"
                className={styles.saveButton}
                // En justering utan orsak avvisas av API:t. Blockera i knappen
                // i stället för att skicka och visa ett fel.
                disabled={saving || !dirty || (draftValue !== 0 && !note.trim())}
                onClick={() => onSaveAdjustment(draftValue, note.trim())}
              >
                {saving ? "Sparar…" : "Spara version"}
              </button>
            </div>
            <div className={styles.preview}>
              <span className={styles.previewLabel}>Nytt belopp</span>
              <span className={styles.previewValue}>{kr(preview)}</span>
            </div>
          </section>
        </div>

        <div className={styles.detailColumn}>
          <section className={styles.keepPanel}>
            <p className={styles.keepLabel}>Vi behåller</p>
            <p className={styles.keepValue}>{kr(s.ourRevenue)}</p>
            <div className={styles.keepLines}>
              <span className={styles.keepLine}>
                <span className={styles.keepLineLabel}>Provision ex moms</span>
                <span className={styles.keepLineValue}>{num(s.commission)}</span>
              </span>
              <span className={styles.keepLine}>
                <span className={styles.keepLineLabel}>Justering</span>
                <span className={styles.keepLineValue}>{signed(-s.adjustment)}</span>
              </span>
              <span className={styles.keepLine}>
                <span className={styles.keepLineLabel}>Moms att redovisa</span>
                <span className={styles.keepLineValue}>{num(s.commissionVat)}</span>
              </span>
            </div>
          </section>

          <section className={`${styles.block} ${styles.blockGrow}`}>
            <h3 className={styles.sideTitle}>Versionshistorik</h3>
            <div className={styles.revisions}>
              {revisions.length === 0 ? (
                <p className={styles.blockSubtitle}>Ingen sparad version ännu.</p>
              ) : (
                revisions.map((revision) => (
                  <div className={styles.revision} key={revision.id}>
                    <span style={{ minWidth: 0 }}>
                      <span className={styles.revisionTitle}>
                        {revision.original ? "Underlag skapat" : revision.reason || `Version ${revision.revision}`}
                      </span>
                      <span className={styles.revisionMeta}>
                        {formatDateTime(revision.createdAt)}
                        {revision.createdBy ? ` · ${revision.createdBy}` : ""}
                      </span>
                    </span>
                    <span className={styles.revisionAmount}>{kr(revision.payout)}</span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className={styles.block}>
            <h3 className={styles.sideTitle}>Mottagare</h3>
            <p className={styles.recipientName}>{restaurant?.legalName || row.name}</p>
            <p className={styles.recipientLine}>
              {[restaurant?.organizationNumber, restaurant?.city || row.city].filter(Boolean).join(" · ") ||
                "Uppgifter saknas"}
            </p>
            <p className={`${styles.recipientLine} ${styles.recipientLineSpaced}`}>
              {row.payoutReference
                ? `Referens ${row.payoutReference}`
                : "Bankuppgifter finns inte i systemet ännu"}
            </p>
            <button type="button" className={styles.recipientLink} onClick={onOpenRestaurant}>
              Öppna restaurangens ekonomi →
            </button>
          </section>
        </div>
      </div>
    </>
  );
}

/* ── Sidan ──────────────────────────────────────────────────────────────── */

export function PayoutsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const requestedMonth = searchParams.get("month");
  const month = isMonthParam(requestedMonth) ? requestedMonth : monthId(new Date());
  const selectedId = searchParams.get("post");
  const { from, to } = monthRange(month);

  const months = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 3 }, (_, index) =>
      monthId(new Date(today.getFullYear(), today.getMonth() - index, 1)),
    );
  }, []);

  const summary = useQuery({
    queryKey: financeSummaryQueryKey(from, to),
    queryFn: () => getFinanceSummary(from, to),
  });
  const row = summary.data?.rows.find((item) => item.restaurantId === selectedId) || null;

  const spec = useQuery({
    queryKey: payoutSpecQueryKey(selectedId, from, to),
    queryFn: () => getPayoutSpec(String(selectedId), from, to),
    enabled: Boolean(selectedId && row),
  });

  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (input: { restaurantId: string; status: StatusLabel; adjustment: number; note: string }) =>
      upsertPayout({
        restaurantId: input.restaurantId,
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
      if (selectedId) {
        await queryClient.refetchQueries({ queryKey: payoutSpecQueryKey(selectedId, from, to) });
      }
    },
    onError: (mutationError: unknown) => {
      const response = (mutationError as { response?: { data?: { error?: string } } })?.response;
      setError(response?.data?.error || "Ändringen kunde inte sparas.");
    },
  });

  const approveAll = useMutation({
    mutationFn: async (rows: FinanceRow[]) => {
      // Massgodkännande är en rad i taget så en post som avvisas inte tar de
      // andra med sig. Fel samlas och rapporteras efteråt.
      const failed: string[] = [];
      for (const item of rows) {
        try {
          await upsertPayout({
            restaurantId: item.restaurantId,
            periodStart: from,
            periodEnd: to,
            manualAdjustmentAmount: toStoredAdjustment(item.settlement.adjustment),
            status: "APPROVED",
            notes: item.adjustmentNote || null,
          });
        } catch {
          failed.push(item.name);
        }
      }
      return failed;
    },
    onMutate: () => setError(null),
    onSuccess: async (failed) => {
      await invalidateEconomyDomain(queryClient);
      await queryClient.refetchQueries({ queryKey: financeSummaryQueryKey(from, to) });
      if (failed.length) setError(`Kunde inte godkänna: ${failed.join(", ")}`);
    },
  });

  const setParams = (next: { month?: string; post?: string | null }) => {
    const query = new URLSearchParams();
    query.set("month", next.month ?? month);
    const post = next.post === undefined ? selectedId : next.post;
    if (post) query.set("post", post);
    router.replace(`/finance/payouts?${query.toString()}`, { scroll: false });
  };

  return (
    <div className={styles.page}>
      <FinanceTabs month={month} />
      {summary.isError ? (
        <ErrorPanel
          title="Utbetalningarna kunde inte laddas"
          description="Inga reservbelopp visas. Försök hämta det riktiga underlaget igen."
          action={<button type="button" className={styles.primaryButton} onClick={() => void summary.refetch()}>Försök igen</button>}
        />
      ) : !summary.data ? (
        <Surface className="flex items-center gap-2 px-6 py-14 text-sm text-[var(--text-secondary)]">
          <Loader2 size={16} className="animate-spin" /> Hämtar periodens utbetalningar…
        </Surface>
      ) : row ? (
        <PayoutDetail
          row={row}
          month={month}
          spec={spec.data}
          saving={save.isPending}
          error={error}
          onBack={() => setParams({ post: null })}
          onStatus={(status) =>
            save.mutate({
              restaurantId: row.restaurantId,
              status,
              adjustment: row.settlement.adjustment,
              note: row.adjustmentNote || "",
            })
          }
          onSaveAdjustment={(adjustment, note) =>
            save.mutate({
              restaurantId: row.restaurantId,
              status: statusLabel(row.status),
              adjustment,
              note,
            })
          }
          onOpenRestaurant={() => router.push(`/finance/${row.restaurantId}?month=${month}&from=${from}&to=${to}`)}
        />
      ) : (
        <PayoutList
          summary={summary.data}
          month={month}
          months={months}
          approving={approveAll.isPending}
          onMonth={(next) => setParams({ month: next, post: null })}
          onOpen={(item) => setParams({ post: item.restaurantId })}
          onApproveAll={() =>
            approveAll.mutate(
              summary.data.rows.filter((item) => statusLabel(item.status) === "Utkast"),
            )
          }
        />
      )}
      {!row && error ? <p className={styles.error}>{error}</p> : null}
    </div>
  );
}
