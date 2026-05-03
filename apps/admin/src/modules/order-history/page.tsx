"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Download, FileText, Loader2, RefreshCw, Trash2 } from "lucide-react";
import {
  getOrderHistory,
  orderHistoryQueryKey,
  wipeOrders,
  type OrderHistoryFilters,
} from "@/modules/order-history/api";
import { getRestaurantOverview } from "@/modules/restaurants/api";
import {
  Badge,
  Button,
  EmptyState,
  ErrorPanel,
  Field,
  Input,
  MetricCard,
  Modal,
  SectionHeader,
  Select,
  Surface,
} from "@/shared/components/ui";
import { formatCurrency, formatDateTime, formatNumber, orderStatusLabel, orderStatusTone } from "@/shared/utils/format";

const statusOptions = ["ALL", "PENDING", "ACCEPTED", "PREPARING", "READY", "DELIVERING", "DELIVERED", "CANCELLED", "REJECTED"] as const;

const today = () => new Date().toISOString().slice(0, 10);
const aMonthAgo = () => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
};

type ExportField = "orderNumber" | "createdAt" | "status" | "type" | "restaurantName" | "customerName" | "customerPhone" | "total" | "deliveryFee" | "discountAmount" | "refundAmount" | "paymentMethod" | "items";

const allFields: { key: ExportField; label: string }[] = [
  { key: "orderNumber", label: "Ordernummer" },
  { key: "createdAt", label: "Datum/tid" },
  { key: "status", label: "Status" },
  { key: "type", label: "Typ" },
  { key: "restaurantName", label: "Restaurang" },
  { key: "customerName", label: "Kund" },
  { key: "customerPhone", label: "Telefon" },
  { key: "total", label: "Totalt (kr)" },
  { key: "deliveryFee", label: "Leveransavgift (kr)" },
  { key: "discountAmount", label: "Rabatt (kr)" },
  { key: "refundAmount", label: "Återbetalt (kr)" },
  { key: "paymentMethod", label: "Betalmetod" },
  { key: "items", label: "Artiklar" },
];

const quickFields: ExportField[] = ["orderNumber", "createdAt", "restaurantName", "customerName", "total"];

function buildIsoBoundary(date: string, time: string, end: boolean) {
  if (!date) return undefined;
  const t = (time || (end ? "23:59" : "00:00")).padEnd(5, "0");
  // Local time zone (Stockholm). new Date() tolkar redan ISO-utan-Z lokalt,
  // vilket är vad vi vill — kunden valde tider i sin tidszon.
  const iso = `${date}T${t}:${end ? "59" : "00"}`;
  return new Date(iso).toISOString();
}

function summarizeItems(items: { quantity: number; productName: string }[]): string {
  return items.map((item) => `${item.quantity}x ${item.productName}`).join(" | ");
}

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function OrderHistoryPage() {
  const queryClient = useQueryClient();

  const [restaurantId, setRestaurantId] = useState<string>("ALL");
  const [fromDate, setFromDate] = useState(aMonthAgo());
  const [fromTime, setFromTime] = useState("00:00");
  const [toDate, setToDate] = useState(today());
  const [toTime, setToTime] = useState("23:59");
  const [status, setStatus] = useState<(typeof statusOptions)[number]>("ALL");
  const [includeRefunded, setIncludeRefunded] = useState(true);

  const [exportOpen, setExportOpen] = useState(false);
  const [exportFields, setExportFields] = useState<ExportField[]>(quickFields);
  const [exportFormat, setExportFormat] = useState<"csv" | "pdf">("csv");

  const [wipeOpen, setWipeOpen] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState("");
  const [wipeRestaurant, setWipeRestaurant] = useState<string>("ALL");
  const [wipeResult, setWipeResult] = useState<string | null>(null);

  const restaurants = useQuery({ queryKey: ["restaurants", "overview"], queryFn: getRestaurantOverview });

  const filters: OrderHistoryFilters = useMemo(() => ({
    restaurantId: restaurantId === "ALL" ? undefined : restaurantId,
    from: buildIsoBoundary(fromDate, fromTime, false),
    to: buildIsoBoundary(toDate, toTime, true),
    status,
  }), [restaurantId, fromDate, fromTime, toDate, toTime, status]);

  const orders = useQuery({
    queryKey: orderHistoryQueryKey(filters),
    queryFn: () => getOrderHistory(filters),
  });

  const wipeMutation = useMutation({
    mutationFn: () => wipeOrders(wipeRestaurant === "ALL" ? undefined : wipeRestaurant),
    onSuccess: async (data) => {
      setWipeResult(`Rensade ${data.deleted} ordrar (${data.scope}). Före: ${data.before}, efter: ${data.after}.`);
      setWipeConfirm("");
      await queryClient.invalidateQueries({ queryKey: ["order-history"] });
      await queryClient.invalidateQueries({ queryKey: ["orders"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (e: any) => {
      setWipeResult(`FEL: ${e?.response?.data?.error || e?.message || "Okänt fel"}`);
    },
  });

  // Filtrera bort återbetalda om checkbox är av. Vi gör det klient-side så
  // räknaren och totalen syns korrekt mot serverresponsen och summeringarna.
  const visibleOrders = useMemo(() => {
    const list = orders.data?.orders || [];
    if (includeRefunded) return list;
    return list.filter((order) => !order.refundedAt);
  }, [orders.data?.orders, includeRefunded]);

  const stats = useMemo(() => {
    const list = visibleOrders;
    const grossSales = list
      .filter((order) => !["CANCELLED", "REJECTED"].includes(order.status))
      .reduce((sum, order) => sum + (order.total || 0), 0);
    const refundedTotal = list.reduce((sum, order) => sum + ((order.refundAmount || 0) / 100), 0);
    const netSales = grossSales - refundedTotal;
    return {
      count: list.length,
      grossSales,
      refundedTotal,
      netSales,
    };
  }, [visibleOrders]);

  const exportCsv = () => {
    const headers = allFields
      .filter((field) => exportFields.includes(field.key))
      .map((field) => field.label);
    const rows = visibleOrders.map((order) =>
      exportFields.map((field) => {
        switch (field) {
          case "orderNumber": return order.orderNumber;
          case "createdAt": return new Date(order.createdAt).toLocaleString("sv-SE");
          case "status": return orderStatusLabel(order.status);
          case "type": return order.type;
          case "restaurantName": return order.restaurantName || "";
          case "customerName": return order.customerName;
          case "customerPhone": return order.customerPhone;
          case "total": return (order.total || 0).toFixed(2);
          case "deliveryFee": return ((order.deliveryFee || 0) as number).toFixed(2);
          case "discountAmount": return ((order.discountAmount || 0) as number).toFixed(2);
          case "refundAmount": return order.refundAmount ? (order.refundAmount / 100).toFixed(2) : "";
          case "paymentMethod": return order.paymentMethod || "";
          case "items": return summarizeItems(order.items || []);
          default: return "";
        }
      }),
    );
    const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
    // BOM för Excel så svenska tecken renderar rätt.
    downloadFile("﻿" + csv, `order-historik-${Date.now()}.csv`, "text/csv;charset=utf-8");
  };

  const exportPdf = () => {
    // Enkel PDF-export via browser-print. Öppnar utskrift på en formaterad
    // sida — användaren väljer "Spara som PDF" i print-dialogen. Fungerar
    // utan extern dependency och respekterar samma kolumner som CSV.
    const headerLabels = allFields
      .filter((field) => exportFields.includes(field.key))
      .map((field) => field.label);
    const rows = visibleOrders.map((order) =>
      exportFields.map((field) => {
        switch (field) {
          case "orderNumber": return order.orderNumber;
          case "createdAt": return new Date(order.createdAt).toLocaleString("sv-SE");
          case "status": return orderStatusLabel(order.status);
          case "type": return order.type;
          case "restaurantName": return order.restaurantName || "";
          case "customerName": return order.customerName;
          case "customerPhone": return order.customerPhone;
          case "total": return `${(order.total || 0).toFixed(2)} kr`;
          case "deliveryFee": return `${((order.deliveryFee || 0) as number).toFixed(2)} kr`;
          case "discountAmount": return `${((order.discountAmount || 0) as number).toFixed(2)} kr`;
          case "refundAmount": return order.refundAmount ? `${(order.refundAmount / 100).toFixed(2)} kr` : "";
          case "paymentMethod": return order.paymentMethod || "";
          case "items": return summarizeItems(order.items || []);
          default: return "";
        }
      }),
    );

    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Order-historik</title>
      <style>
        body { font-family: -apple-system, sans-serif; padding: 24px; color: #111; }
        h1 { font-size: 18px; margin: 0 0 8px; }
        .meta { color: #555; font-size: 12px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th { text-align: left; background: #f3f3f3; padding: 6px; border-bottom: 1px solid #ccc; }
        td { padding: 6px; border-bottom: 1px solid #eee; vertical-align: top; }
        tr:nth-child(even) td { background: #fafafa; }
        .totals { margin-top: 16px; font-size: 12px; }
      </style></head><body>
      <h1>Order-historik</h1>
      <div class="meta">
        ${restaurantId === "ALL" ? "Alla restauranger" : restaurants.data?.find((r) => r.id === restaurantId)?.name || ""} •
        ${fromDate} ${fromTime} → ${toDate} ${toTime} •
        ${status === "ALL" ? "Alla statusar" : status}
      </div>
      <table>
        <thead><tr>${headerLabels.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>${rows
          .map((row) => `<tr>${row.map((cell) => `<td>${String(cell).replace(/</g, "&lt;")}</td>`).join("")}</tr>`)
          .join("")}</tbody>
      </table>
      <div class="totals">
        <strong>Antal ordrar:</strong> ${stats.count} •
        <strong>Brutto:</strong> ${formatCurrency(stats.grossSales)} •
        <strong>Återbetalt:</strong> ${formatCurrency(stats.refundedTotal)} •
        <strong>Netto:</strong> ${formatCurrency(stats.netSales)}
      </div>
      <script>window.onload = () => { window.print(); };</script>
      </body></html>`;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
  };

  const toggleField = (key: ExportField) => {
    setExportFields((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
    );
  };

  if (orders.isError) {
    return <ErrorPanel title="Order-historik kunde inte hämtas" description={(orders.error as any)?.message} action={<Button onClick={() => void orders.refetch()}>Försök igen</Button>} />;
  }

  return (
    <div className="page-stack">
      <Surface className="px-6 py-6">
        <SectionHeader
          eyebrow="Order-historik"
          title="Avancerad order-rapport"
          description="Filtrera per restaurang, period och klockslag. Exportera till CSV (Excel) eller PDF för bokföring och uppföljning."
          actions={
            <>
              <Button variant="secondary" onClick={() => void orders.refetch()}>
                <RefreshCw size={16} /> Uppdatera
              </Button>
              <Button variant="primary" onClick={() => setExportOpen(true)}>
                <Download size={16} /> Exportera
              </Button>
              <Button variant="danger" onClick={() => { setWipeOpen(true); setWipeResult(null); }}>
                <AlertTriangle size={16} /> Rensa ordrar
              </Button>
            </>
          }
        />
      </Surface>

      <Surface className="px-6 py-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Restaurang">
            <Select value={restaurantId} onChange={(event) => setRestaurantId(event.target.value)}>
              <option value="ALL">Alla restauranger</option>
              {(restaurants.data || []).map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(event) => setStatus(event.target.value as (typeof statusOptions)[number])}>
              {statusOptions.map((option) => (
                <option key={option} value={option}>{option === "ALL" ? "Alla" : orderStatusLabel(option)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Från (datum + tid)">
            <div className="flex gap-2">
              <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
              <Input type="time" value={fromTime} onChange={(event) => setFromTime(event.target.value)} className="w-28" />
            </div>
          </Field>
          <Field label="Till (datum + tid)">
            <div className="flex gap-2">
              <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
              <Input type="time" value={toTime} onChange={(event) => setToTime(event.target.value)} className="w-28" />
            </div>
          </Field>
        </div>
        <div className="mt-4">
          <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            <input type="checkbox" checked={includeRefunded} onChange={(event) => setIncludeRefunded(event.target.checked)} />
            Inkludera återbetalda ordrar i listan och summeringen
          </label>
        </div>
      </Surface>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Antal ordrar" value={formatNumber(stats.count)} />
        <MetricCard label="Brutto" value={formatCurrency(stats.grossSales)} detail="Exkl. cancelled/rejected" />
        <MetricCard label="Återbetalt" value={formatCurrency(stats.refundedTotal)} />
        <MetricCard label="Netto" value={formatCurrency(stats.netSales)} detail="Brutto − återbetalt" />
      </div>

      <Surface className="px-6 py-6">
        {orders.isLoading ? (
          <div className="surface-muted px-5 py-12 text-center text-sm text-[var(--text-secondary)]">Hämtar ordrar...</div>
        ) : visibleOrders.length === 0 ? (
          <EmptyState title="Inga ordrar i den här perioden" description="Justera filtren ovan eller välj en bredare period." />
        ) : (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ordernummer</th>
                  <th>Datum/tid</th>
                  <th>Restaurang</th>
                  <th>Kund</th>
                  <th>Status</th>
                  <th>Totalt</th>
                  <th>Återbetalt</th>
                </tr>
              </thead>
              <tbody>
                {visibleOrders.map((order) => (
                  <tr key={order.id}>
                    <td className="font-black">{order.orderNumber}</td>
                    <td>{formatDateTime(order.createdAt)}</td>
                    <td>{order.restaurantName}</td>
                    <td>
                      <div>{order.customerName}</div>
                      <div className="text-xs text-[var(--text-secondary)]">{order.customerPhone}</div>
                    </td>
                    <td>
                      <Badge tone={orderStatusTone(order.status) as "success" | "danger" | "warning" | "info" | "neutral"}>
                        {orderStatusLabel(order.status)}
                      </Badge>
                    </td>
                    <td>{formatCurrency(order.total)}</td>
                    <td>{order.refundAmount ? formatCurrency(order.refundAmount / 100) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>

      <Modal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Exportera order-historik"
        description="Välj fält och format. Snabb-exporten innehåller bara grunderna; markera fler för avancerad export."
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setExportFields(quickFields)}>Snabb (5 fält)</Button>
              <Button variant="secondary" onClick={() => setExportFields(allFields.map((f) => f.key))}>Alla fält</Button>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setExportOpen(false)}>Stäng</Button>
              <Button variant="primary" onClick={() => { exportFormat === "pdf" ? exportPdf() : exportCsv(); setExportOpen(false); }}>
                {exportFormat === "pdf" ? <FileText size={16} /> : <Download size={16} />} Exportera {exportFormat.toUpperCase()}
              </Button>
            </div>
          </div>
        }
      >
        <div className="grid gap-4">
          <Field label="Format">
            <Select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as "csv" | "pdf")}>
              <option value="csv">CSV (öppnas i Excel)</option>
              <option value="pdf">PDF (utskriftsklart)</option>
            </Select>
          </Field>
          <div>
            <p className="field-label mb-2">Fält att inkludera</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {allFields.map((field) => (
                <label key={field.key} className="flex items-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm">
                  <input type="checkbox" checked={exportFields.includes(field.key)} onChange={() => toggleField(field.key)} />
                  {field.label}
                </label>
              ))}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={wipeOpen}
        onClose={() => { setWipeOpen(false); setWipeResult(null); }}
        title="Rensa ordrar (TESTNING)"
        description="Tar permanent bort ordrar från databasen. Detta kan inte ångras. Använd ENDAST under testning."
        footer={
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button onClick={() => { setWipeOpen(false); setWipeResult(null); }}>Avbryt</Button>
            <Button
              variant="danger"
              disabled={wipeConfirm !== "RENSA" || wipeMutation.isPending}
              onClick={() => wipeMutation.mutate()}
            >
              {wipeMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Rensa permanent
            </Button>
          </div>
        }
      >
        <div className="grid gap-4">
          <div className="rounded-2xl border border-[rgba(239,107,115,0.2)] bg-[rgba(239,107,115,0.08)] px-4 py-3 text-sm text-[#ffd2d5]">
            <p><strong>Varning:</strong> Detta tar bort alla ordrar (eller alla för en specifik restaurang) ur databasen. OrderItem och kvittohistorik försvinner också.</p>
          </div>
          <Field label="Omfattning">
            <Select value={wipeRestaurant} onChange={(event) => setWipeRestaurant(event.target.value)}>
              <option value="ALL">ALLA RESTAURANGER (rensa hela ordertabellen)</option>
              {(restaurants.data || []).map((r) => (
                <option key={r.id} value={r.id}>Endast {r.name}</option>
              ))}
            </Select>
          </Field>
          <Field label='Skriv "RENSA" för att aktivera knappen'>
            <Input value={wipeConfirm} onChange={(event) => setWipeConfirm(event.target.value)} placeholder="RENSA" />
          </Field>
          {wipeResult ? (
            <div className={`rounded-2xl border px-4 py-3 text-sm ${wipeResult.startsWith("FEL") ? "border-rose-500/30 bg-rose-500/10 text-rose-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>
              {wipeResult}
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
