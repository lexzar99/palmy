"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Wallet } from "lucide-react";
import { financePayoutsQueryKey, financeQueueQueryKey, financeReportQueryKey, getFinanceQueue, getPayouts, getRestaurantReport, upsertPayout, type FinanceQueueRow, type PayoutRecord } from "@/modules/finance/api";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, MetricCard, Modal, PageHeader, Select, Surface, Textarea } from "@/shared/components/ui";
import { formatCurrency, formatDate, formatNumber } from "@/shared/utils/format";

type ActiveFinanceRow = FinanceQueueRow & { persisted?: PayoutRecord | null };

function FinanceModal({ row, periodStart, periodEnd, open, onClose }: { row: ActiveFinanceRow | null; periodStart: string; periodEnd: string; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [status, setStatus] = useState("DRAFT");
  const [notes, setNotes] = useState("");
  const [payoutReference, setPayoutReference] = useState("");

  const report = useQuery({
    queryKey: financeReportQueryKey(row?.restaurantId || null, periodStart, periodEnd),
    queryFn: () => getRestaurantReport(row!.restaurantId, periodStart, periodEnd),
    enabled: open && Boolean(row?.restaurantId),
  });

  const persisted = row?.persisted;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!row) return;
      await upsertPayout({
        restaurantId: row.restaurantId,
        periodStart,
        periodEnd,
        grossSales: row.grossSales,
        orderCount: row.orderCount,
        commissionAmount: row.commission,
        subscriptionAmount: row.subscription,
        adjustmentAmount,
        payoutAmount: row.payout - adjustmentAmount,
        status,
        notes: notes || null,
        payoutReference: payoutReference || null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
      onClose();
    },
  });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    if (persisted) {
      setAdjustmentAmount(persisted.adjustmentAmount || 0);
      setStatus(persisted.status || "DRAFT");
      setNotes(persisted.notes || "");
      setPayoutReference(persisted.payoutReference || "");
      return;
    }

    setAdjustmentAmount(0);
    setStatus("DRAFT");
    setNotes("");
    setPayoutReference("");
  }, [open, persisted]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={row ? `${row.name} payout` : "Payout details"}
      description={row ? `${formatDate(periodStart)} to ${formatDate(periodEnd)}` : undefined}
      footer={<div className="flex justify-end gap-2"><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={() => saveMutation.mutate()}>{saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : "Save payout"}</Button></div>}
    >
      {row ? (
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard label="Gross sales" value={formatCurrency(row.grossSales)} />
            <MetricCard label="Commission" value={formatCurrency(row.commission)} />
            <MetricCard label="Subscription" value={formatCurrency(row.subscription)} />
            <MetricCard label="Net payout" value={formatCurrency(row.payout - adjustmentAmount)} />
          </div>

          <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-4">
              <Surface className="px-5 py-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Status"><Select value={status} onChange={(event) => setStatus(event.target.value)}><option value="DRAFT">Draft</option><option value="APPROVED">Approved</option><option value="PAID">Paid</option><option value="HOLD">Hold</option></Select></Field>
                  <Field label="Adjustment amount"><Input type="number" value={adjustmentAmount} onChange={(event) => setAdjustmentAmount(Number(event.target.value))} /></Field>
                  <Field label="Payout reference"><Input value={payoutReference} onChange={(event) => setPayoutReference(event.target.value)} /></Field>
                  <Field label="Order count"><Input value={String(row.orderCount)} disabled /></Field>
                  <div className="md:col-span-2"><Field label="Notes"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} /></Field></div>
                </div>
              </Surface>

              {persisted ? (
                <Surface className="px-5 py-5">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Saved record</p>
                  <div className="mt-3 grid gap-2 text-sm text-[var(--text-secondary)]">
                    <div>Updated {formatDate(persisted.updatedAt)}</div>
                    {persisted.approvedAt ? <div>Approved {formatDate(persisted.approvedAt)}</div> : null}
                    {persisted.paidAt ? <div>Paid {formatDate(persisted.paidAt)}</div> : null}
                  </div>
                </Surface>
              ) : null}
            </div>

            <div className="space-y-4">
              <Surface className="px-5 py-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Report summary</p>
                    <h3 className="mt-2 text-xl font-black tracking-[-0.03em]">Sales breakdown</h3>
                  </div>
                  {report.isLoading ? <Loader2 size={18} className="animate-spin text-[var(--accent-strong)]" /> : <Badge tone="info">{row.featuredLabel}</Badge>}
                </div>
                {report.data ? (
                  <div className="mt-4 grid gap-3">
                    <div className="surface-muted px-4 py-4 text-sm text-[var(--text-secondary)]">{report.data.summary.totalOrders} orders • {formatCurrency(report.data.summary.totalRevenue)} revenue • avg {formatCurrency(report.data.summary.avgOrderValue)}</div>
                    {report.data.topProducts.slice(0, 5).map((product, index) => (
                      <div key={`${product.name}-${index}`} className="surface-muted flex items-center justify-between px-4 py-4 text-sm">
                        <div>
                          <p className="font-black">{product.name}</p>
                          <p className="text-[var(--text-secondary)]">{product.count} sold</p>
                        </div>
                        <p className="font-black">{formatCurrency(product.revenue)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 text-sm text-[var(--text-secondary)]">No report data for this period.</div>
                )}
              </Surface>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

export function FinancePage() {
  const [query, setQuery] = useState("");
  const [periodStart, setPeriodStart] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [activeRow, setActiveRow] = useState<ActiveFinanceRow | null>(null);

  const queue = useQuery({ queryKey: financeQueueQueryKey, queryFn: getFinanceQueue });
  const payouts = useQuery({ queryKey: financePayoutsQueryKey, queryFn: getPayouts });

  const rows = useMemo(() => {
    const persistedMap = new Map((payouts.data || []).map((record) => [record.restaurantId, record]));
    return (queue.data || []).map((row) => ({ ...row, persisted: persistedMap.get(row.restaurantId) || null }));
  }, [payouts.data, queue.data]);

  const filteredRows = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    return rows.filter((row) => !lowerQuery || `${row.name} ${row.city || ""}`.toLowerCase().includes(lowerQuery));
  }, [query, rows]);

  if (queue.isLoading || payouts.isLoading) {
    return <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Loading finance control...</Surface>;
  }

  if (queue.isError || payouts.isError) {
    return <ErrorPanel title="Finance module could not be loaded" description="Payout queue or payout records failed to load." action={<Button onClick={() => { void queue.refetch(); void payouts.refetch(); }}><RefreshCw size={16} /> Retry</Button>} />;
  }

  const totals = {
    grossSales: rows.reduce((sum, row) => sum + row.grossSales, 0),
    payouts: rows.reduce((sum, row) => sum + row.payout, 0),
    commission: rows.reduce((sum, row) => sum + row.commission, 0),
    inReview: (payouts.data || []).filter((record) => ["DRAFT", "APPROVED", "HOLD"].includes(record.status)).length,
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="Finance"
        actions={<Badge tone="info">{rows.length} payout rows</Badge>}
      />

      <Surface className="px-6 py-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_160px_160px] lg:items-end">
          <Field label="Search"><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search restaurant or city" /></Field>
          <Field label="Period start"><Input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></Field>
          <Field label="Period end"><Input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></Field>
        </div>

        {filteredRows.length === 0 ? (
          <div className="mt-6"><EmptyState title="No payout rows found" /></div>
        ) : (
          <div className="mt-6 table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Restaurant</th>
                  <th>Sales</th>
                  <th>Commission</th>
                  <th>Subscription</th>
                  <th>Payout</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.restaurantId}>
                    <td>
                      <div>
                        <p className="font-black">{row.name}</p>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">{row.city || "No city"} • {row.featuredLabel}</p>
                      </div>
                    </td>
                    <td>{formatCurrency(row.grossSales)}</td>
                    <td>{formatCurrency(row.commission)}</td>
                    <td>{formatCurrency(row.subscription)}</td>
                    <td className="font-black">{formatCurrency(row.payout)}</td>
                    <td>
                      <Badge tone={row.persisted?.status === "PAID" ? "success" : row.persisted?.status === "APPROVED" ? "info" : row.persisted?.status === "HOLD" ? "warning" : "neutral"}>{row.persisted?.status || row.readiness.toUpperCase()}</Badge>
                    </td>
                    <td>
                      <div className="flex justify-end"><Button variant="secondary" onClick={() => setActiveRow(row)}><Wallet size={16} /> Open</Button></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>

      <FinanceModal row={activeRow} periodStart={periodStart} periodEnd={periodEnd} open={Boolean(activeRow)} onClose={() => setActiveRow(null)} />
    </div>
  );
}
