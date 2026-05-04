"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, GripVertical, Loader2, Plus, Printer, Save, Trash2 } from "lucide-react";
import {
  createPrinter,
  deletePrinter,
  getPreviewOrders,
  getPrintingConfig,
  getReceiptPreview,
  printingConfigQueryKey,
  receiptPreviewDataQueryKey,
  receiptPreviewOrdersQueryKey,
  updatePrinter,
  updateReceiptTemplate,
  type PrinterRecord,
  type ReceiptElement,
  type ReceiptPreviewData,
  type ReceiptTemplate,
} from "@/modules/receipts/api";
import { getRestaurantOverview } from "@/modules/restaurants/api";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, MetricCard, Modal, SectionHeader, Select, Surface, Textarea } from "@/shared/components/ui";
import { formatDateTime, formatNumber } from "@/shared/utils/format";

const defaultElements: ReceiptElement[] = [
  { key: "restaurantName",       label: "Restaurangnamn",        visible: true,  size: 14, weight: "black",  align: "center", uppercase: true  },
  { key: "platformName",         label: "Plattform",             visible: true,  size: 8,  weight: "normal", align: "center", uppercase: true  },
  { key: "address",              label: "Adress",                visible: true,  size: 8,  weight: "normal", align: "center"                   },
  { key: "phone",                label: "Telefon",               visible: true,  size: 8,  weight: "normal", align: "center"                   },
  { key: "divider1",             label: "Avdelare 1",            visible: true,  size: 8,  weight: "normal", align: "center"                   },
  { key: "headerMsg",            label: "Rubrikmeddelande",      visible: false, size: 9,  weight: "bold",   align: "center", content: ""       },
  { key: "divider2",             label: "Avdelare 2",            visible: false, size: 8,  weight: "normal", align: "center"                   },
  { key: "orderNumber",          label: "Ordernummer",           visible: true,  size: 12, weight: "black",  align: "center"                   },
  { key: "timestamp",            label: "Datum/tid",             visible: true,  size: 8,  weight: "normal", align: "center"                   },
  { key: "orderType",            label: "Ordertyp",              visible: true,  size: 11, weight: "black",  align: "center", uppercase: true  },
  { key: "scheduledFor",         label: "Förbeställd tid",       visible: true,  size: 10, weight: "black",  align: "center"                   },
  { key: "estimatedTime",        label: "Utlovad tid (ETA)",     visible: true,  size: 9,  weight: "bold",   align: "center"                   },
  { key: "divider3",             label: "Avdelare 3",            visible: true,  size: 8,  weight: "normal", align: "center"                   },
  { key: "customerName",         label: "Kundnamn",              visible: true,  size: 10, weight: "bold",   align: "center"                   },
  { key: "customerPhone",        label: "Kundtelefon",           visible: true,  size: 8,  weight: "normal", align: "center"                   },
  { key: "customerAddress",      label: "Leveransadress",        visible: true,  size: 8,  weight: "normal", align: "center"                   },
  { key: "deliveryInstructions", label: "Leveransinstruktion",   visible: true,  size: 9,  weight: "bold",   align: "center"                   },
  { key: "note",                 label: "Ordernotering",         visible: true,  size: 9,  weight: "bold",   align: "center"                   },
  { key: "allergens",            label: "Allergener",            visible: true,  size: 9,  weight: "bold",   align: "center"                   },
  { key: "divider4",             label: "Avdelare 4",            visible: true,  size: 8,  weight: "normal", align: "center"                   },
  { key: "items",                label: "Artiklar",              visible: true,  size: 10, weight: "bold",   align: "center"                   },
  { key: "extras",               label: "Tillval",               visible: true,  size: 8,  weight: "normal", align: "center"                   },
  { key: "divider5",             label: "Avdelare 5",            visible: true,  size: 8,  weight: "normal", align: "center"                   },
  { key: "deliveryFee",          label: "Leveransavgift",        visible: true,  size: 9,  weight: "normal", align: "center"                   },
  { key: "discount",             label: "Rabatt",                visible: true,  size: 9,  weight: "normal", align: "center"                   },
  { key: "total",                label: "Totalt",                visible: true,  size: 14, weight: "black",  align: "center"                   },
  { key: "paymentMethod",        label: "Betalmetod",            visible: true,  size: 8,  weight: "normal", align: "center"                   },
  { key: "divider6",             label: "Avdelare 6",            visible: true,  size: 8,  weight: "normal", align: "center"                   },
  { key: "thankYou",             label: "Tackhälsning",          visible: true,  size: 9,  weight: "bold",   align: "center", content: "Tack för din beställning!" },
  { key: "footerMsg",            label: "Sidfot",                visible: true,  size: 8,  weight: "normal", align: "center", content: "Välkommen åter!"            },
];

const sizeOptions = [7, 8, 9, 10, 11, 12, 14, 16, 18];

const mergeTemplateElements = (template: ReceiptTemplate): ReceiptTemplate => {
  const map = new Map(template.elements.map((element) => [element.key, element]));
  return {
    ...template,
    elements: defaultElements.map((element) => map.get(element.key) || element),
  };
};

function PrinterModal({ open, printer, restaurants, onClose }: { open: boolean; printer: PrinterRecord | null; restaurants: Array<{ id: string; name: string }>; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ restaurantId: "", name: "", connectionType: "NETWORK", address: "", paperWidth: "80mm", copies: 1, autoPrint: false, isDefault: true, isActive: true, receiptMode: "STANDARD", notes: "" });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setForm(printer ? { restaurantId: printer.restaurantId, name: printer.name, connectionType: printer.connectionType, address: printer.address, paperWidth: printer.paperWidth, copies: printer.copies, autoPrint: printer.autoPrint, isDefault: printer.isDefault, isActive: printer.isActive, receiptMode: printer.receiptMode, notes: printer.notes || "" } : { restaurantId: restaurants[0]?.id || "", name: "", connectionType: "NETWORK", address: "", paperWidth: "80mm", copies: 1, autoPrint: false, isDefault: true, isActive: true, receiptMode: "STANDARD", notes: "" });
  }, [open, printer, restaurants]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({
    mutationFn: () => printer ? updatePrinter(printer.id, form) : createPrinter(form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: printingConfigQueryKey });
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!printer) return { success: true };
      return deletePrinter(printer.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: printingConfigQueryKey });
      onClose();
    },
  });

  return (
    <Modal open={open} onClose={onClose} title={printer ? printer.name : "New printer"} footer={<div className="flex items-center justify-between gap-2"><div>{printer ? <Button variant="danger" onClick={() => deleteMutation.mutate()}>Delete</Button> : null}</div><div className="flex gap-2"><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={() => saveMutation.mutate()}>Save</Button></div></div>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Restaurant"><Select value={form.restaurantId} onChange={(event) => setForm((current) => ({ ...current, restaurantId: event.target.value }))}>{restaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>)}</Select></Field>
        <Field label="Name"><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></Field>
        <Field label="Connection"><Select value={form.connectionType} onChange={(event) => setForm((current) => ({ ...current, connectionType: event.target.value }))}><option value="NETWORK">NETWORK</option><option value="BLUETOOTH">BLUETOOTH</option></Select></Field>
        <Field label="Address"><Input value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} /></Field>
        <Field label="Paper width (sätts globalt i template)"><Input value={form.paperWidth} disabled /></Field>
        <Field label="Copies"><Input type="number" value={form.copies} onChange={(event) => setForm((current) => ({ ...current, copies: Number(event.target.value) }))} /></Field>
        <Field label="Auto print"><Select value={form.autoPrint ? "yes" : "no"} onChange={(event) => setForm((current) => ({ ...current, autoPrint: event.target.value === "yes" }))}><option value="yes">Yes</option><option value="no">No</option></Select></Field>
        <Field label="Default"><Select value={form.isDefault ? "yes" : "no"} onChange={(event) => setForm((current) => ({ ...current, isDefault: event.target.value === "yes" }))}><option value="yes">Yes</option><option value="no">No</option></Select></Field>
        <Field label="Active"><Select value={form.isActive ? "yes" : "no"} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.value === "yes" }))}><option value="yes">Yes</option><option value="no">No</option></Select></Field>
        <Field label="Receipt mode"><Select value={form.receiptMode} onChange={(event) => setForm((current) => ({ ...current, receiptMode: event.target.value }))}><option value="STANDARD">STANDARD</option><option value="COMPACT">COMPACT</option><option value="DETAILED">DETAILED</option></Select></Field>
        <div className="md:col-span-2"><Field label="Notes"><Textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></Field></div>
      </div>
    </Modal>
  );
}

function TemplateModal({ open, template, onClose }: { open: boolean; template: ReceiptTemplate | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<ReceiptTemplate | null>(template ? mergeTemplateElements(template) : null);
  const [selectedKey, setSelectedKey] = useState<string | null>(template?.elements[0]?.key || "restaurantName");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    if (template) {
      const next = mergeTemplateElements(template);
      setDraft(next);
      setSelectedKey(next.elements[0]?.key || "restaurantName");
    }
  }, [open, template]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft) {
        return { paperWidth: "80mm" as const, platformName: "MatGo", elements: defaultElements };
      }
      return updateReceiptTemplate(draft);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: printingConfigQueryKey });
      onClose();
    },
  });

  const updateElement = <K extends keyof ReceiptElement>(key: string, field: K, value: ReceiptElement[K]) => {
    setDraft((current) => current ? { ...current, elements: current.elements.map((element) => element.key === key ? { ...element, [field]: value } : element) } : current);
  };

  const selected = draft?.elements.find((element) => element.key === selectedKey) || null;

  const onDragStart = (index: number) => setDragIndex(index);
  const onDragOver = (event: React.DragEvent, index: number) => {
    event.preventDefault();
    if (!draft || dragIndex == null || dragIndex === index) return;
    setDraft((current) => {
      if (!current) return current;
      const nextElements = [...current.elements];
      const [moved] = nextElements.splice(dragIndex, 1);
      nextElements.splice(index, 0, moved);
      setDragIndex(index);
      return { ...current, elements: nextElements };
    });
  };
  const onDragEnd = () => setDragIndex(null);

  return (
    <Modal open={open} onClose={onClose} title="Receipt template" widthClassName="max-w-[1300px]" footer={<div className="flex justify-end gap-2"><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={() => saveMutation.mutate()}>{saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save template</Button></div>}>
      {draft ? (
        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          <div className="surface-muted p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Order and visibility</p>
              <Field label="Paper"><Select value={draft.paperWidth} onChange={(event) => setDraft((current) => current ? { ...current, paperWidth: event.target.value as ReceiptTemplate["paperWidth"] } : current)}><option value="58mm">58mm</option><option value="80mm">80mm</option><option value="A4">A4</option></Select></Field>
            </div>
            <div className="mt-4"><Field label="Platform name"><Input value={draft.platformName} onChange={(event) => setDraft((current) => current ? { ...current, platformName: event.target.value } : current)} /></Field></div>
            <div className="mt-4 grid gap-1">
              {draft.elements.map((element, index) => (
                <div key={element.key} draggable onDragStart={() => onDragStart(index)} onDragOver={(event) => onDragOver(event, index)} onDragEnd={onDragEnd} onClick={() => setSelectedKey(element.key)} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 transition-all ${selectedKey === element.key ? "border-[rgba(243,191,87,0.24)] bg-[rgba(243,191,87,0.08)]" : "border-transparent hover:bg-[rgba(255,255,255,0.04)]"} ${dragIndex === index ? "opacity-50" : ""}`}>
                  <GripVertical size={12} className="text-[var(--text-secondary)]/50" />
                  <span className="flex-1 truncate text-[11px] font-bold">{element.label}</span>
                  <button type="button" onClick={(event) => { event.stopPropagation(); updateElement(element.key, "visible", !element.visible); }} className="text-[var(--text-secondary)]">{element.visible ? <Eye size={12} /> : <EyeOff size={12} />}</button>
                </div>
              ))}
            </div>
          </div>

          <div className="surface-muted p-4">
            {selected ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Label"><Input value={selected.label} disabled /></Field>
                <Field label="Visible"><Select value={selected.visible ? "yes" : "no"} onChange={(event) => updateElement(selected.key, "visible", event.target.value === "yes")}><option value="yes">Yes</option><option value="no">No</option></Select></Field>
                <Field label="Size"><Select value={String(selected.size)} onChange={(event) => updateElement(selected.key, "size", Number(event.target.value))}>{sizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}</Select></Field>
                <Field label="Weight"><Select value={selected.weight} onChange={(event) => updateElement(selected.key, "weight", event.target.value as ReceiptElement["weight"])}><option value="normal">Normal</option><option value="bold">Bold</option><option value="black">Black</option></Select></Field>
                <Field label="Align"><Select value={selected.align} onChange={(event) => updateElement(selected.key, "align", event.target.value as ReceiptElement["align"])}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></Select></Field>
                <Field label="Uppercase"><Select value={selected.uppercase ? "yes" : "no"} onChange={(event) => updateElement(selected.key, "uppercase", event.target.value === "yes")}><option value="yes">Yes</option><option value="no">No</option></Select></Field>
                {selected.content !== undefined ? <div className="md:col-span-2"><Field label="Custom content"><Textarea value={selected.content || ""} onChange={(event) => updateElement(selected.key, "content", event.target.value)} /></Field></div> : null}
              </div>
            ) : <EmptyState title="Select a template element" />}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function ReceiptPreviewContent({ data, platformName }: { data: ReceiptPreviewData; platformName: string }) {
  const h = (data.header ?? {}) as Record<string, unknown>;
  const o = (data.orderInfo ?? {}) as Record<string, unknown>;
  const c = (data.customer ?? {}) as Record<string, unknown>;
  const items = (data.items ?? []) as Array<Record<string, unknown>>;
  const t = (data.totals ?? {}) as Record<string, unknown>;

  const s = (v: unknown) => (v != null && v !== "" ? String(v) : "");
  const n = (v: unknown) => { const x = parseFloat(String(v ?? 0)); return isNaN(x) ? 0 : x; };

  const restaurantAddr = [s(h.address), [s(h.zip), s(h.city)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const customerAddr   = [s(c.street),  [s(c.zip), s(c.city)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const isDelivery     = s(o.type) === "DELIVERY";
  const Divider        = () => <div className="border-t border-dashed border-[#bbb] my-2" />;
  const StatusBox      = ({ children }: { children: React.ReactNode }) => (
    <div className="inline-block border border-black px-4 py-0.5 my-0.5">
      <span className="font-black text-[11px] tracking-wide uppercase">{children}</span>
    </div>
  );

  return (
    <div className="text-[10.5px] leading-[1.45]" style={{ fontFamily: "'Courier New', Courier, monospace" }}>
      {/* ── Header ── */}
      <div className="text-center mb-2">
        <p className="text-[14px] font-black tracking-wide uppercase">{s(h.restaurantName) || "MatGo"}</p>
        <p className="text-[8px] tracking-[0.18em] text-[#666] uppercase mt-0.5">{platformName}</p>
        {restaurantAddr && <p className="text-[8px] text-[#666] mt-0.5">{restaurantAddr}</p>}
        {s(h.phone) && <p className="text-[8px] text-[#666]">Tel: {s(h.phone)}</p>}
      </div>

      <Divider />

      {/* ── Order ── */}
      <div className="text-center mb-1.5">
        <p className="font-black text-[13px]">#{s(o.number) || "—"}</p>
        <p className="text-[8px] text-[#666]">{s(o.date)} {s(o.time)}</p>
        <div className="flex flex-col items-center gap-0.5 mt-1">
          <StatusBox>{isDelivery ? "Utkörning" : "Avhämtning"}</StatusBox>
          {!!o.isPreorder && <StatusBox>Förbeställd {s(o.scheduledDate)} {s(o.scheduledTime)}</StatusBox>}
          {s(o.paymentMethod) && <StatusBox>{s(o.paymentMethod)}</StatusBox>}
        </div>
        {!o.isPreorder && n(o.estimatedTime) > 0 && (
          <p className="text-[8px] text-[#666] mt-1">Leveranstid: {s(o.estimatedTime)} min</p>
        )}
      </div>

      <Divider />

      {/* ── Kund ── */}
      <div className="text-center mb-1.5">
        {s(c.name)         && <p className="font-bold">{s(c.name)}</p>}
        {s(c.phone)        && <p className="text-[8px] text-[#555]">{s(c.phone)}</p>}
        {customerAddr      && <p className="text-[8px] text-[#555]">{customerAddr}</p>}
        {s(c.instructions) && <p className="text-[9px] mt-0.5">{s(c.instructions)}</p>}
        {s(c.note)         && <p className="font-bold text-[9px] mt-0.5">{s(c.note)}</p>}
        {s(c.allergens)    && <p className="font-bold text-[9px] text-red-700 mt-0.5">! {s(c.allergens)}</p>}
      </div>

      <Divider />

      {/* ── Artiklar ── */}
      <div className="mb-1.5">
        <p className="text-[8px] text-[#666] text-center mb-1">{items.length} artikel{items.length !== 1 ? "ar" : ""}</p>
        <div className="space-y-1.5">
          {items.map((item, i) => (
            <div key={i} className="text-center">
              <p className="font-bold">{s(item.qty)}x {s(item.name)}   {s(item.subtotal)} kr</p>
              {(item.extras as Array<unknown> ?? []).map((extra, ei) => (
                <p key={ei} className="text-[8px] text-[#666]">
                  + {typeof extra === "string" ? extra : s((extra as Record<string, unknown>).name)}
                </p>
              ))}
              {s(item.note) && <p className="text-[8px] font-bold">! {s(item.note)}</p>}
            </div>
          ))}
        </div>
      </div>

      <Divider />

      {/* ── Totalt ── */}
      <div className="mb-1.5 text-center">
        {n(t.deliveryFee) > 0 && (
          <p className="text-[8px] text-[#555]">Leverans: {s(t.deliveryFee)} kr</p>
        )}
        {n(t.discount) > 0 && (
          <p className="text-[8px] text-[#555]">Rabatt{s(t.discountCode) ? ` (${s(t.discountCode)})` : ""}: −{s(t.discount)} kr</p>
        )}
        <div className="border-t border-black pt-1 mt-1">
          <p className="font-black text-[14px]">TOTALT: {s(t.total)} kr</p>
        </div>
      </div>

      <Divider />

      {/* ── Sidfot ── */}
      <div className="text-center text-[8px] text-[#777] space-y-0.5">
        <p className="font-bold">Tack för din beställning!</p>
        <p>Välkommen åter!</p>
      </div>
    </div>
  );
}

export function ReceiptsPage() {
  const [templateOpen, setTemplateOpen] = useState(false);
  const [printerOpen, setPrinterOpen] = useState(false);
  const [activePrinter, setActivePrinter] = useState<PrinterRecord | null>(null);
  const [previewOrderId, setPreviewOrderId] = useState<string | null>(null);

  const config = useQuery({ queryKey: printingConfigQueryKey, queryFn: getPrintingConfig });
  const restaurants = useQuery({ queryKey: ["receipts", "restaurants"], queryFn: getRestaurantOverview });
  const previewOrders = useQuery({ queryKey: receiptPreviewOrdersQueryKey, queryFn: getPreviewOrders });
  const preview = useQuery({ queryKey: receiptPreviewDataQueryKey(previewOrderId), queryFn: () => getReceiptPreview(previewOrderId!), enabled: Boolean(previewOrderId) });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!previewOrderId && previewOrders.data?.[0]?.id) {
      setPreviewOrderId(previewOrders.data[0].id);
    }
  }, [previewOrderId, previewOrders.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (config.isLoading || restaurants.isLoading || previewOrders.isLoading) {
    return <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Loading receipt control...</Surface>;
  }

  if (config.isError || restaurants.isError || previewOrders.isError || !config.data || !restaurants.data || !previewOrders.data) {
    return <ErrorPanel title="Receipts could not be loaded" description="Printing config, restaurants or preview orders failed to load." action={<Button onClick={() => { void config.refetch(); void restaurants.refetch(); void previewOrders.refetch(); }}>Retry</Button>} />;
  }

  const visibleElementCount = config.data.template.elements.filter((element) => element.visible).length;

  return (
    <div className="page-stack">
      <Surface className="px-6 py-6">
        <SectionHeader
          eyebrow="Receipts"
          title="Receipt template and printer registry"
          description="Template rules and printer profiles stay backed by the existing printing APIs and explicit receipt data payloads."
          actions={<><Button variant="secondary" onClick={() => setTemplateOpen(true)}>Edit template</Button><Button variant="primary" onClick={() => { setActivePrinter(null); setPrinterOpen(true); }}><Plus size={16} /> New printer</Button></>}
        />
      </Surface>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Printers" value={formatNumber(config.data.printers.length)} />
        <MetricCard label="Default printers" value={formatNumber(config.data.printers.filter((printer) => printer.isDefault).length)} />
        <MetricCard label="Auto print" value={formatNumber(config.data.printers.filter((printer) => printer.autoPrint && printer.isActive).length)} />
        <MetricCard label="Visible template blocks" value={formatNumber(visibleElementCount)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
        <Surface className="px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Printer registry</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">Central printer profiles</h2>
            </div>
            <Badge tone="info">{config.data.template.paperWidth}</Badge>
          </div>

          {config.data.printers.length === 0 ? (
            <div className="mt-6"><EmptyState title="No printers configured" /></div>
          ) : (
            <div className="mt-6 grid gap-3">
              {config.data.printers.map((printer) => (
                <button key={printer.id} type="button" onClick={() => { setActivePrinter(printer); setPrinterOpen(true); }} className="surface-muted w-full px-5 py-5 text-left">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-black tracking-[-0.02em]">{printer.name}</p>
                        <Badge tone={printer.isActive ? "success" : "danger"}>{printer.isActive ? "Active" : "Inactive"}</Badge>
                        {printer.isDefault ? <Badge tone="info">Default</Badge> : null}
                        <Badge tone={printer.status === "ONLINE" ? "success" : printer.status === "STALE" ? "warning" : "neutral"}>{printer.status}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">{printer.restaurantName || "No restaurant"} • {printer.address}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge tone="neutral">{printer.paperWidth}</Badge>
                        <Badge tone="neutral">{printer.copies} copies</Badge>
                        <Badge tone="neutral">{printer.receiptMode}</Badge>
                        <Badge tone="neutral">Auto print {printer.autoPrint ? "on" : "off"}</Badge>
                      </div>
                      {printer.notes ? <p className="mt-3 text-sm text-[var(--text-secondary)]">{printer.notes}</p> : null}
                    </div>
                    <div className="text-sm text-[var(--text-secondary)]">{printer.lastSeenAt ? `Seen ${formatDateTime(printer.lastSeenAt)}` : "Never seen"}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Surface>

        <Surface className="px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Receipt preview</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">Template payload preview</h2>
            </div>
            <Printer size={18} className="text-[var(--accent-strong)]" />
          </div>

          <div className="mt-5 grid gap-4">
            <Field label="Preview order">
              <Select value={previewOrderId || ""} onChange={(event) => setPreviewOrderId(event.target.value)}>
                {previewOrders.data.map((order) => <option key={order.id} value={order.id}>{order.orderNumber} • {order.customerName}</option>)}
              </Select>
            </Field>

            <div className="surface-muted flex justify-center px-4 py-6">
              {/* 80 mm-rulle simulerad bredd: 1 mm ≈ 3.78 px → 80 mm ≈ 302 px */}
              <div className="w-[302px] bg-white px-5 py-4 text-black shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
                {!previewOrderId ? (
                  <p className="py-10 text-center text-xs text-[#888]">Välj en order ovan</p>
                ) : preview.isLoading ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-xs text-[#888]">
                    <Loader2 size={14} className="animate-spin" /> Laddar...
                  </div>
                ) : preview.isError || !preview.data ? (
                  <p className="py-10 text-center text-xs text-red-500">
                    Kunde inte hämta förhandsgranskning.<br />Kontrollera att ordern finns och försök igen.
                  </p>
                ) : (
                  <ReceiptPreviewContent data={preview.data} platformName={config.data.template.platformName} />
                )}
              </div>
            </div>
          </div>
        </Surface>
      </div>

      <TemplateModal open={templateOpen} template={config.data.template} onClose={() => setTemplateOpen(false)} />
      <PrinterModal open={printerOpen} printer={activePrinter} restaurants={restaurants.data.map((restaurant) => ({ id: restaurant.id, name: restaurant.name }))} onClose={() => { setPrinterOpen(false); setActivePrinter(null); }} />
    </div>
  );
}
