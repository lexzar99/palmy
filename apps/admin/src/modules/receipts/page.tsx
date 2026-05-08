"use client";

import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Loader2, Plus, Printer, Save } from "lucide-react";
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
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, Modal, PageHeader, Select, Surface, Textarea } from "@/shared/components/ui";
import { formatDateTime, formatNumber } from "@/shared/utils/format";

const defaultElements: ReceiptElement[] = [
  // ── Header (all centered) ──────────────────────────────────────────────────
  { key: "restaurantName",       label: "Restaurangnamn",        visible: true,  size: 15, weight: "black",  align: "center", uppercase: true  },
  { key: "platformName",         label: "Plattform",             visible: true,  size: 8,  weight: "normal", align: "center", uppercase: true  },
  { key: "address",              label: "Adress",                visible: true,  size: 8,  weight: "normal", align: "center"                   },
  { key: "phone",                label: "Telefon",               visible: true,  size: 8,  weight: "normal", align: "center"                   },
  { key: "divider1",             label: "Avdelare 1",            visible: true,  size: 8,  weight: "normal", align: "center"                   },
  { key: "headerMsg",            label: "Rubrikmeddelande",      visible: false, size: 9,  weight: "bold",   align: "center", content: ""       },
  { key: "divider2",             label: "Avdelare 2",            visible: false, size: 8,  weight: "normal", align: "center"                   },
  // ── Order info (centered) ──────────────────────────────────────────────────
  { key: "orderNumber",          label: "Ordernummer",           visible: true,  size: 9,  weight: "normal", align: "center"                   },
  { key: "timestamp",            label: "Datum/tid",             visible: true,  size: 9,  weight: "normal", align: "center"                   },
  { key: "orderType",            label: "Ordertyp (box)",        visible: true,  size: 12, weight: "black",  align: "center", uppercase: true  },
  { key: "scheduledFor",         label: "Förbeställd (box)",     visible: true,  size: 12, weight: "black",  align: "center"                   },
  { key: "paymentMethod",        label: "Betalmetod (box)",      visible: true,  size: 12, weight: "black",  align: "center"                   },
  { key: "estimatedTime",        label: "Leveranstid (stor)",    visible: true,  size: 14, weight: "black",  align: "center"                   },
  { key: "divider3",             label: "Avdelare 3",            visible: true,  size: 8,  weight: "normal", align: "center"                   },
  // ── Kund (vänster) ────────────────────────────────────────────────────────
  { key: "customerName",         label: "Kundnamn",              visible: true,  size: 12, weight: "black",  align: "left"                     },
  { key: "customerPhone",        label: "Kundtelefon",           visible: true,  size: 9,  weight: "normal", align: "left"                     },
  { key: "customerAddress",      label: "Leveransadress",        visible: true,  size: 9,  weight: "normal", align: "left"                     },
  { key: "deliveryInstructions", label: "Leveransinstruktion",   visible: true,  size: 9,  weight: "bold",   align: "left"                     },
  { key: "note",                 label: "Ordernotering",         visible: true,  size: 9,  weight: "bold",   align: "left"                     },
  { key: "allergens",            label: "Allergener",            visible: true,  size: 9,  weight: "bold",   align: "left"                     },
  { key: "divider4",             label: "Avdelare 4",            visible: true,  size: 8,  weight: "normal", align: "center"                   },
  // ── Artiklar (vänster+höger) ───────────────────────────────────────────────
  { key: "items",                label: "Artiklar",              visible: true,  size: 10, weight: "bold",   align: "left"                     },
  { key: "extras",               label: "Tillval",               visible: true,  size: 8,  weight: "normal", align: "left"                     },
  { key: "divider5",             label: "Avdelare 5",            visible: true,  size: 8,  weight: "normal", align: "center"                   },
  // ── Totaler (vänster+höger) ───────────────────────────────────────────────
  { key: "deliveryFee",          label: "Leveransavgift",        visible: true,  size: 9,  weight: "normal", align: "left"                     },
  { key: "discount",             label: "Rabatt",                visible: true,  size: 9,  weight: "normal", align: "left"                     },
  { key: "total",                label: "Totalt (stor)",         visible: true,  size: 14, weight: "black",  align: "left"                     },
  { key: "divider6",             label: "Avdelare 6",            visible: true,  size: 8,  weight: "normal", align: "center"                   },
  { key: "thankYou",             label: "Tackhälsning",          visible: true,  size: 9,  weight: "bold",   align: "center", content: "Tack för din beställning!" },
  { key: "footerMsg",            label: "Sidfot",                visible: true,  size: 8,  weight: "normal", align: "center", content: "Välkommen åter!"            },
];

const mergeTemplateElements = (template: ReceiptTemplate): ReceiptTemplate => {
  const map = new Map(template.elements.map((element) => [element.key, element]));
  return {
    ...template,
    elements: defaultElements.map((def) => {
      const saved = map.get(def.key);
      if (!saved) return def;
      // use all saved properties; fall back to defaults only for fields not present in DB
      return { ...def, ...saved };
    }),
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

function ReceiptPreviewContent({ data, template }: { data: ReceiptPreviewData; template: ReceiptTemplate }) {
  const h = (data.header ?? {}) as Record<string, unknown>;
  const o = (data.orderInfo ?? {}) as Record<string, unknown>;
  const c = (data.customer ?? {}) as Record<string, unknown>;
  const items = (data.items ?? []) as Array<Record<string, unknown>>;
  const t = (data.totals ?? {}) as Record<string, unknown>;

  const s = (v: unknown) => (v != null && v !== "" ? String(v) : "");
  const n = (v: unknown) => { const x = parseFloat(String(v ?? 0)); return isNaN(x) ? 0 : x; };

  const elMap = new Map(template.elements.map((el) => [el.key, el]));
  const vis = (key: string) => elMap.get(key)?.visible !== false;
  const content = (key: string, fallback: string) => elMap.get(key)?.content ?? fallback;
  const elStyle = (key: string): React.CSSProperties => {
    const el = elMap.get(key);
    if (!el) return {};
    return {
      fontSize: `${el.size}px`,
      fontWeight: el.weight === "black" ? 900 : el.weight === "bold" ? 700 : 400,
      textAlign: el.align,
      textTransform: el.uppercase ? "uppercase" : undefined,
    };
  };

  const restaurantAddr = [s(h.address), [s(h.zip), s(h.city)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const customerAddr   = [s(c.street),  [s(c.zip), s(c.city)].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const isDelivery     = s(o.type) === "DELIVERY";

  const allergensRaw = c.allergens;
  const allergenStr = Array.isArray(allergensRaw)
    ? (allergensRaw as unknown[]).map((e) => s(e)).filter(Boolean).join(", ")
    : s(allergensRaw);

  const HR = () => <div className="border-t-2 border-black my-2" />;
  const BoxBadge = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
    <span className="inline-block border-[3px] border-black px-4 py-1 tracking-wide" style={{ fontWeight: 900, fontSize: "14px", ...style }}>{children}</span>
  );

  return (
    <div className="text-[12px] leading-[1.6] font-medium" style={{ fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif" }}>

      {/* ── Platform + ordernummer ── */}
      {vis("platformName") && (
        <div className="mb-1" style={{ textAlign: elMap.get("platformName")?.align ?? "center" }}>
          <p style={elStyle("platformName")}>{template.platformName} {vis("orderNumber") ? `#${s(o.number) || "—"}` : ""}</p>
          <p className="text-[10px] text-[#555]">Ej kvitto</p>
        </div>
      )}

      {vis("divider1") && <HR />}

      {/* ── Restaurang ── */}
      <div className="mb-2">
        {vis("restaurantName") && <p style={elStyle("restaurantName")} className="tracking-wide">{s(h.restaurantName) || "MatGo"}</p>}
        {vis("timestamp") && <p style={elStyle("timestamp")}>{s(o.date)} {s(o.time)}</p>}
        {vis("address") && restaurantAddr && <p style={elStyle("address")}>{restaurantAddr}</p>}
        {vis("phone") && s(h.phone) && <p style={elStyle("phone")}>Tel: {s(h.phone)}</p>}
      </div>

      {vis("headerMsg") && content("headerMsg", "") && (
        <p style={elStyle("headerMsg")} className="mb-2">{content("headerMsg", "")}</p>
      )}

      {vis("divider2") && <HR />}

      {/* ── Kund ── */}
      <div className="mb-2">
        {vis("customerName") && s(c.name) && (
          <>
            <p className="text-[10px] text-[#555] font-bold">Kund:</p>
            <p style={elStyle("customerName")}>{s(c.name)}</p>
          </>
        )}
        {vis("customerPhone") && s(c.phone) && <p style={elStyle("customerPhone")}>{s(c.phone)}</p>}
        {vis("customerAddress") && customerAddr && (
          <>
            <p className="text-[10px] text-[#555] font-bold mt-1">Adress:</p>
            <p style={elStyle("customerAddress")}>{customerAddr}</p>
          </>
        )}
        {vis("deliveryInstructions") && s(c.instructions) && <p style={elStyle("deliveryInstructions")} className="mt-0.5">{s(c.instructions)}</p>}
        {vis("note") && s(c.note) && <p style={elStyle("note")} className="mt-0.5">{s(c.note)}</p>}
        {vis("allergens") && allergenStr && <p style={elStyle("allergens")} className="text-red-700 mt-0.5">! {allergenStr}</p>}
      </div>

      {/* ── Status-badges ── */}
      <div className="flex flex-col items-center gap-2 mb-2">
        {vis("orderType") && <BoxBadge style={elStyle("orderType")}>{isDelivery ? "Utkörning" : "Avhämtning"}</BoxBadge>}
        {vis("scheduledFor") && !!o.isPreorder && <BoxBadge style={elStyle("scheduledFor")}>Förbeställd {s(o.scheduledDate)} {s(o.scheduledTime)}</BoxBadge>}
        {vis("paymentMethod") && s(o.paymentMethod) && <BoxBadge style={elStyle("paymentMethod")}>{s(o.paymentMethod)}</BoxBadge>}
      </div>

      {/* ── Leveranstid (jättestor) + artikelräknare ── */}
      {vis("estimatedTime") && !o.isPreorder && n(o.estimatedTime) > 0 && (
        <div className="mb-1.5" style={{ textAlign: elMap.get("estimatedTime")?.align ?? "center" }}>
          <p className="text-[12px] font-bold">Leveranstid</p>
          <p style={elStyle("estimatedTime")} className="leading-tight">{s(o.estimatedTime)} min</p>
        </div>
      )}

      {vis("divider3") && <HR />}

      <p className="text-center text-[11px] font-bold mb-1">{items.length} artikel{items.length !== 1 ? "ar" : ""}</p>

      {/* ── Artiklar ── */}
      {vis("items") && (
        <div className="mb-2 space-y-2">
          {items.map((item, i) => (
            <div key={i}>
              <div className="flex justify-between items-baseline gap-1">
                <span style={elStyle("items")} className="flex-1">{s(item.qty)} x {s(item.name)}</span>
                <span style={elStyle("items")} className="whitespace-nowrap shrink-0">{s(item.subtotal)} kr</span>
              </div>
              {vis("extras") && (item.extras as Array<unknown> ?? []).map((extra, ei) => (
                <p key={ei} style={elStyle("extras")} className="text-[#555] pl-3">
                  ** {typeof extra === "string" ? extra : s((extra as Record<string, unknown>).name)}
                </p>
              ))}
              {s(item.note) && <p className="text-[10px] font-black pl-3">! {s(item.note)}</p>}
            </div>
          ))}
        </div>
      )}

      {vis("divider5") && <HR />}

      {/* ── Totaler ── */}
      <div className="mb-2">
        {vis("deliveryFee") && n(t.deliveryFee) > 0 && (
          <div className="flex justify-between" style={elStyle("deliveryFee")}>
            <span>Leveransavgift</span><span>{s(t.deliveryFee)} kr</span>
          </div>
        )}
        {vis("discount") && n(t.discount) > 0 && (
          <div className="flex justify-between" style={elStyle("discount")}>
            <span>Rabatt{s(t.discountCode) ? ` (${s(t.discountCode)})` : ""}</span>
            <span>-{s(t.discount)} kr</span>
          </div>
        )}
        {vis("total") && (
          <div className="flex justify-between items-baseline border-t-2 border-black pt-1 mt-1">
            <span style={elStyle("total")}>Totalt</span>
            <span style={elStyle("total")}>{s(t.total)} kr</span>
          </div>
        )}
      </div>

      {vis("divider6") && <HR />}

      {/* ── Sidfot ── */}
      <div className="space-y-0.5">
        {vis("thankYou") && <p style={elStyle("thankYou")}>{content("thankYou", "Tack för din beställning!")}</p>}
        {vis("footerMsg") && <p style={elStyle("footerMsg")}>{content("footerMsg", "Välkommen åter!")}</p>}
      </div>
    </div>
  );
}

export function ReceiptsPage() {
  const [printerOpen, setPrinterOpen] = useState(false);
  const [activePrinter, setActivePrinter] = useState<PrinterRecord | null>(null);
  const [previewOrderId, setPreviewOrderId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReceiptTemplate | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const config = useQuery({ queryKey: printingConfigQueryKey, queryFn: getPrintingConfig });
  const restaurants = useQuery({ queryKey: ["receipts", "restaurants"], queryFn: getRestaurantOverview });
  const previewOrders = useQuery({ queryKey: receiptPreviewOrdersQueryKey, queryFn: getPreviewOrders });
  const preview = useQuery({ queryKey: receiptPreviewDataQueryKey(previewOrderId), queryFn: () => getReceiptPreview(previewOrderId!), enabled: Boolean(previewOrderId) });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (config.data && !draft) setDraft(mergeTemplateElements(config.data.template));
  }, [config.data, draft]);

  useEffect(() => {
    if (!previewOrderId && previewOrders.data?.[0]?.id) setPreviewOrderId(previewOrders.data[0].id);
  }, [previewOrderId, previewOrders.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");

  const saveMutation = useMutation({
    mutationFn: () => updateReceiptTemplate(draft!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: printingConfigQueryKey });
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 3000);
    },
    onError: () => {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 4000);
    },
  });

  const updateElement = (key: string, patch: Partial<ReceiptElement>) => {
    setDraft((prev) => prev ? { ...prev, elements: prev.elements.map((el) => el.key === key ? { ...el, ...patch } : el) } : prev);
  };

  const selectedElement = draft?.elements.find((el) => el.key === selectedKey) ?? null;

  if (config.isLoading || restaurants.isLoading || previewOrders.isLoading) {
    return <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Loading receipt control...</Surface>;
  }

  if (config.isError || restaurants.isError || previewOrders.isError || !config.data || !restaurants.data || !previewOrders.data) {
    return <ErrorPanel title="Receipts could not be loaded" description="Printing config, restaurants or preview orders failed to load." action={<Button onClick={() => { void config.refetch(); void restaurants.refetch(); void previewOrders.refetch(); }}>Retry</Button>} />;
  }

  const effectiveTemplate = draft ?? mergeTemplateElements(config.data.template);

  return (
    <div className="page-stack">
      <PageHeader
        title="Receipts"
        actions={<Button variant="primary" onClick={() => { setActivePrinter(null); setPrinterOpen(true); }}><Plus size={13} /> New printer</Button>}
      />

      {/* Printer registry */}
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

      {/* Template editor + live preview */}
      <Surface className="px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Template editor</p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">Receipt template</h2>
          </div>
          <div className="flex items-center gap-3">
            {saveStatus === "saved" && (
              <span className="text-sm font-medium text-green-600">✓ Sparat!</span>
            )}
            {saveStatus === "error" && (
              <span className="text-sm font-medium text-red-500">✗ Kunde inte spara</span>
            )}
            <Button
              onClick={() => {
                if (config.data) setDraft(mergeTemplateElements({ ...config.data.template, elements: defaultElements }));
              }}
              disabled={!draft}
            >
              Återställ allt
            </Button>
            <Button variant="primary" onClick={() => saveMutation.mutate()} disabled={!draft || saveMutation.isPending}>
              {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Spara template
            </Button>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[300px_1fr]">
          {/* Left: element controls */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Paper width">
                <Select value={draft?.paperWidth ?? "80mm"} onChange={(e) => setDraft((p) => p ? { ...p, paperWidth: e.target.value as ReceiptTemplate["paperWidth"] } : p)}>
                  <option value="58mm">58 mm</option>
                  <option value="72mm">72 mm</option>
                  <option value="80mm">80 mm</option>
                  <option value="A4">A4</option>
                </Select>
              </Field>
              <Field label="Plattform">
                <Input value={draft?.platformName ?? ""} onChange={(e) => setDraft((p) => p ? { ...p, platformName: e.target.value } : p)} />
              </Field>
            </div>

            {(() => {
              const sections = [
                { key: "paymentMethod", label: "Betalmetod", elements: ["paymentMethod"] },
                { key: "estimatedTime", label: "Beräknad tid (leverans)", elements: ["estimatedTime"] },
                { key: "orderType", label: "Ordertyp", elements: ["orderType", "scheduledFor"] },
                { key: "direction", label: "Leveransadress", elements: ["customerAddress", "deliveryInstructions"] },
                { key: "orderDetails", label: "Orderdetaljer", elements: ["orderNumber", "timestamp"] },
                { key: "clientInfo", label: "Kundinformation", elements: ["customerName", "customerPhone"] },
                { key: "items", label: "Artiklar", elements: ["items", "extras"] },
                { key: "notes", label: "Notering / Allergener", elements: ["note", "allergens"] },
                { key: "totals", label: "Totaler", elements: ["deliveryFee", "discount", "total"] },
                { key: "footer", label: "Sidfot", elements: ["thankYou", "footerMsg"] },
                { key: "headerMsg", label: "Rubrikmeddelande", elements: ["headerMsg"] },
              ];

              const contentKeys = new Set(["thankYou", "footerMsg", "headerMsg"]);

              return (
                <div className="rounded border border-[var(--border)] overflow-hidden divide-y divide-[var(--border)]">
                  {sections.map((section) => {
                    const sectionVisible = section.elements.some((key) => {
                      const el = draft?.elements.find((e) => e.key === key);
                      return el?.visible === true;
                    });
                    const isExpanded = expandedSection === section.key;

                    const toggleSectionVisible = () => {
                      const newVisible = !sectionVisible;
                      setDraft((prev) => {
                        if (!prev) return prev;
                        return {
                          ...prev,
                          elements: prev.elements.map((el) =>
                            section.elements.includes(el.key) ? { ...el, visible: newVisible } : el
                          ),
                        };
                      });
                    };

                    return (
                      <div key={section.key}>
                        {/* Section header row */}
                        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--border)] last:border-b-0">
                          {/* iOS-style toggle */}
                          <button
                            type="button"
                            onClick={toggleSectionVisible}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${sectionVisible ? "bg-emerald-500" : "bg-zinc-300"}`}
                          >
                            <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${sectionVisible ? "translate-x-5" : "translate-x-0"}`} />
                          </button>
                          {/* Label */}
                          <span className="flex-1 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{section.label}</span>
                          {/* Expand/collapse */}
                          <button
                            type="button"
                            onClick={() => setExpandedSection((k) => k === section.key ? null : section.key)}
                            className="text-[var(--text-muted)]"
                          >
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        </div>

                        {/* Expanded element detail */}
                        {isExpanded && (
                          <div className="px-4 py-3 bg-[var(--bg-deep,var(--surface-muted))] space-y-3 border-b border-[var(--border)]">
                            {section.elements.map((key) => {
                              const el = draft?.elements.find((e) => e.key === key);
                              if (!el) return null;
                              return (
                                <div key={key} className="space-y-2">
                                  <div className="flex items-center gap-3">
                                    <span className="flex-1 text-xs font-medium text-[var(--text-secondary)]">{el.label}</span>
                                    <Select
                                      value={el.size}
                                      onChange={(e) => updateElement(key, { size: Number(e.target.value) })}
                                    >
                                      {[7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 30].map((sz) => (
                                        <option key={sz} value={sz}>{sz} px</option>
                                      ))}
                                    </Select>
                                    <Select
                                      value={el.align}
                                      onChange={(e) => updateElement(key, { align: e.target.value as ReceiptElement["align"] })}
                                    >
                                      <option value="left">Vänster</option>
                                      <option value="center">Mitten</option>
                                      <option value="right">Höger</option>
                                    </Select>
                                  </div>
                                  {contentKeys.has(key) && el.content !== undefined && (
                                    <Field label="Innehåll">
                                      <Textarea
                                        value={el.content ?? ""}
                                        onChange={(e) => updateElement(key, { content: e.target.value })}
                                        rows={2}
                                      />
                                    </Field>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Right: live preview */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Field label="Preview order">
                  <Select value={previewOrderId || ""} onChange={(e) => setPreviewOrderId(e.target.value)}>
                    {previewOrders.data.map((order) => <option key={order.id} value={order.id}>{order.orderNumber} • {order.customerName}</option>)}
                  </Select>
                </Field>
              </div>
              <Printer size={18} className="text-[var(--accent-strong)] mt-5 shrink-0" />
            </div>

            <div className="surface-muted flex justify-center px-4 py-6">
              {/* 72 mm-rulle: 72 × 3.78 ≈ 272 px, marginal px-3 → ~65 mm utskriftsyta */}
              <div className="w-[272px] bg-white px-3 py-4 text-black shadow-[0_18px_60px_rgba(0,0,0,0.22)]">
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
                  <ReceiptPreviewContent data={preview.data} template={effectiveTemplate} />
                )}
              </div>
            </div>
          </div>
        </div>
      </Surface>

      <PrinterModal open={printerOpen} printer={activePrinter} restaurants={restaurants.data.map((restaurant) => ({ id: restaurant.id, name: restaurant.name }))} onClose={() => { setPrinterOpen(false); setActivePrinter(null); }} />
    </div>
  );
}
