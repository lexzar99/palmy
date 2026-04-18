"use client";

import { useState, useEffect, useCallback } from "react";
import { Printer, Save, GripVertical, Eye, EyeOff, Loader2 } from "lucide-react";
import { useToast } from "@/components/Toast";

// ── Types ─────────────────────────────────────────────────────────────────────
type Align = "left" | "center" | "right";
type Weight = "normal" | "bold" | "black";
type Size = 7 | 8 | 9 | 10 | 11 | 12 | 14 | 16 | 18;

interface ReceiptElement {
  key: string;
  label: string;          // Admin label
  content?: string;       // Editable text (for header/footer)
  visible: boolean;
  size: Size;
  weight: Weight;
  align: Align;
  uppercase?: boolean;
}

interface ReceiptSettings {
  paperWidth: "58mm" | "80mm" | "A4";
  platformName: string;   // "MatGo" shown below restaurant name
  elements: ReceiptElement[];
}

const DEFAULT_ELEMENTS: ReceiptElement[] = [
  { key: "restaurantName", label: "Restaurangnamn", visible: true, size: 14, weight: "black", align: "center", uppercase: true },
  { key: "platformName",   label: "Plattformsnamn (MatGo)", visible: true, size: 8, weight: "normal", align: "center", uppercase: true },
  { key: "address",        label: "Adress", visible: true, size: 8, weight: "normal", align: "center" },
  { key: "phone",          label: "Telefon", visible: true, size: 8, weight: "normal", align: "center" },
  { key: "divider1",       label: "Avdelare (efter info)", visible: true, size: 8, weight: "normal", align: "center" },
  { key: "headerMsg",      label: "Sidhuvud", content: "", visible: true, size: 9, weight: "bold", align: "center" },
  { key: "divider2",       label: "Avdelare (efter sidhuvud)", visible: true, size: 8, weight: "normal", align: "center" },
  { key: "orderNumber",    label: "Ordernummer", visible: true, size: 10, weight: "bold", align: "left" },
  { key: "timestamp",      label: "Datum & tid", visible: true, size: 8, weight: "normal", align: "left" },
  { key: "orderType",      label: "Typ (Leverans/Avhämtning)", visible: true, size: 9, weight: "bold", align: "left" },
  { key: "divider3",       label: "Avdelare (före produkter)", visible: true, size: 8, weight: "normal", align: "center" },
  { key: "items",          label: "Produktrader", visible: true, size: 10, weight: "bold", align: "left" },
  { key: "extras",         label: "Tillbehör", visible: true, size: 8, weight: "normal", align: "left" },
  { key: "divider4",       label: "Avdelare (före summa)", visible: true, size: 8, weight: "normal", align: "center" },
  { key: "deliveryFee",    label: "Leveransavgift", visible: true, size: 9, weight: "normal", align: "left" },
  { key: "discount",       label: "Rabatt/Kod", visible: true, size: 9, weight: "normal", align: "left" },
  { key: "total",          label: "Totalt", visible: true, size: 12, weight: "black", align: "left" },
  { key: "divider5",       label: "Avdelare (efter summa)", visible: true, size: 8, weight: "normal", align: "center" },
  { key: "thankYou",       label: "Tack-meddelande", content: "Tack för din beställning!", visible: true, size: 9, weight: "bold", align: "center" },
  { key: "footerMsg",      label: "Sidfot", content: "Välkommen åter!", visible: true, size: 8, weight: "normal", align: "center" },
];

const DEFAULTS: ReceiptSettings = {
  paperWidth: "80mm",
  platformName: "MatGo",
  elements: DEFAULT_ELEMENTS,
};

const LS_KEY = "matgo_receipt_v2";

// ── Helpers ───────────────────────────────────────────────────────────────────
const SIZES: Size[] = [7, 8, 9, 10, 11, 12, 14, 16, 18];
const WEIGHTS: { id: Weight; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "bold", label: "Bold" },
  { id: "black", label: "Black" },
];
const ALIGNS: { id: Align; label: string }[] = [
  { id: "left", label: "L" },
  { id: "center", label: "C" },
  { id: "right", label: "R" },
];

const weightClass = (w: Weight) =>
  w === "black" ? "font-black" : w === "bold" ? "font-bold" : "font-normal";
const alignClass = (a: Align) =>
  a === "center" ? "text-center" : a === "right" ? "text-right" : "text-left";

const isDivider = (key: string) => key.startsWith("divider");

// ── Component ─────────────────────────────────────────────────────────────────
export default function ReceiptSettingsPage() {
  const { success } = useToast();
  const [s, setS] = useState<ReceiptSettings>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>("restaurantName");
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ReceiptSettings;
        // Merge: keep any new default elements not yet in stored settings
        const stored = new Map(parsed.elements.map((e) => [e.key, e]));
        const merged = DEFAULT_ELEMENTS.map((def) => stored.get(def.key) ?? def);
        setS({ ...DEFAULTS, ...parsed, elements: merged });
      }
    } catch { /* ignore */ }
  }, []);

  const updateElement = useCallback(<K extends keyof ReceiptElement>(key: string, field: K, value: ReceiptElement[K]) => {
    setS((prev) => ({
      ...prev,
      elements: prev.elements.map((e) => (e.key === key ? { ...e, [field]: value } : e)),
    }));
  }, []);

  const selected = s.elements.find((e) => e.key === selectedKey);

  const handleSave = async () => {
    setSaving(true);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(s));
      success("Kvittolayout sparad");
    } finally {
      setSaving(false);
    }
  };

  // Drag & drop reorder
  const onDragStart = (i: number) => setDragIndex(i);
  const onDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === i) return;
    setS((prev) => {
      const els = [...prev.elements];
      const [moved] = els.splice(dragIndex, 1);
      els.splice(i, 0, moved);
      setDragIndex(i);
      return { ...prev, elements: els };
    });
  };
  const onDragEnd = () => setDragIndex(null);

  const previewWidth = s.paperWidth === "58mm" ? 200 : s.paperWidth === "A4" ? 380 : 280;

  return (
    <div className="space-y-4 pb-24 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-[var(--text-primary)] flex items-center gap-3">
            <Printer size={20} className="text-gold-500" /> Kvittolayout
          </h1>
          <p className="text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-widest mt-0.5">
            Dra för att ändra ordning · Klicka element för att redigera stil
          </p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg shadow-gold-500/20 transition-all">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Spara
        </button>
      </div>

      {/* Paper width */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Pappersbredd:</span>
        {(["58mm", "80mm", "A4"] as const).map((w) => (
          <button key={w} onClick={() => setS((p) => ({ ...p, paperWidth: w }))}
            className={`px-4 py-2 rounded-xl border text-[10px] font-black uppercase transition-all ${s.paperWidth === w ? "bg-gold-500/10 border-gold-500/30 text-gold-500" : "border-[var(--border-subtle)] text-[var(--text-secondary)]"}`}>
            {w}
          </button>
        ))}
        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] ml-4">Plattformsnamn:</span>
        <input value={s.platformName} onChange={(e) => setS((p) => ({ ...p, platformName: e.target.value }))}
          className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-sm font-black outline-none focus:border-gold-500/30 w-28" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[340px,1fr,280px] gap-4">

        {/* Element list (draggable) */}
        <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-3">Ordning & synlighet</p>
          <div className="space-y-1">
            {s.elements.map((el, i) => (
              <div
                key={el.key}
                draggable
                onDragStart={() => onDragStart(i)}
                onDragOver={(e) => onDragOver(e, i)}
                onDragEnd={onDragEnd}
                onClick={() => setSelectedKey(el.key)}
                className={`flex items-center gap-2 p-2.5 rounded-xl cursor-pointer transition-all ${
                  selectedKey === el.key ? "bg-gold-500/10 border border-gold-500/20" : "hover:bg-[var(--bg-primary)] border border-transparent"
                } ${dragIndex === i ? "opacity-50" : ""}`}
              >
                <GripVertical size={12} className="text-[var(--text-secondary)] opacity-30 shrink-0 cursor-grab" />
                <span className="flex-1 text-[10px] font-bold text-[var(--text-primary)] truncate">
                  {isDivider(el.key) ? <span className="opacity-30">━━━━━━━</span> : el.label}
                </span>
                <button onClick={(e) => { e.stopPropagation(); updateElement(el.key, "visible", !el.visible); }}
                  className={`shrink-0 ${el.visible ? "text-emerald-400" : "text-[var(--text-secondary)] opacity-30"}`}>
                  {el.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Style editor for selected element */}
        <div className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
          {!selected ? (
            <div className="flex items-center justify-center h-full text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-30">
              Klicka ett element till vänster
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)]">{selected.label}</p>

              {/* Editable content for text elements */}
              {selected.content !== undefined && !isDivider(selected.key) && (
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-1.5">Text</label>
                  <input value={selected.content}
                    onChange={(e) => updateElement(selected.key, "content", e.target.value)}
                    className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-gold-500/30" />
                </div>
              )}

              {!isDivider(selected.key) && (
                <>
                  {/* Font size */}
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-2">Storlek (pt)</label>
                    <div className="flex flex-wrap gap-1">
                      {SIZES.map((sz) => (
                        <button key={sz} onClick={() => updateElement(selected.key, "size", sz)}
                          className={`w-9 h-8 rounded-lg text-[10px] font-black transition-all ${selected.size === sz ? "bg-gold-500 text-[#0d0d0d]" : "bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-secondary)]"}`}>
                          {sz}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Font weight */}
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-2">Tjocklek</label>
                    <div className="flex gap-2">
                      {WEIGHTS.map(({ id, label }) => (
                        <button key={id} onClick={() => updateElement(selected.key, "weight", id)}
                          className={`flex-1 py-2 rounded-xl border text-[10px] transition-all ${selected.weight === id ? "bg-gold-500/10 border-gold-500/30 text-gold-500" : "border-[var(--border-subtle)] text-[var(--text-secondary)]"} font-${id === "black" ? "black" : id === "bold" ? "bold" : "normal"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Alignment */}
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-2">Justering</label>
                    <div className="flex gap-2">
                      {ALIGNS.map(({ id, label }) => (
                        <button key={id} onClick={() => updateElement(selected.key, "align", id)}
                          className={`flex-1 py-2 rounded-xl border text-[10px] font-black transition-all ${selected.align === id ? "bg-gold-500/10 border-gold-500/30 text-gold-500" : "border-[var(--border-subtle)] text-[var(--text-secondary)]"}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Uppercase toggle */}
                  <label className="flex items-center gap-3 cursor-pointer">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">VERSALER</span>
                    <button onClick={() => updateElement(selected.key, "uppercase", !selected.uppercase)}
                      className={`relative w-10 h-5 rounded-full transition-colors ${selected.uppercase ? "bg-gold-500" : "bg-[var(--border-subtle)]"}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${selected.uppercase ? "right-0.5" : "left-0.5"}`} />
                    </button>
                  </label>
                </>
              )}

              {/* Visibility */}
              <label className="flex items-center gap-3 cursor-pointer">
                <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">Synlig</span>
                <button onClick={() => updateElement(selected.key, "visible", !selected.visible)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${selected.visible ? "bg-emerald-500" : "bg-[var(--border-subtle)]"}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${selected.visible ? "right-0.5" : "left-0.5"}`} />
                </button>
              </label>
            </div>
          )}
        </div>

        {/* Live preview */}
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-3">Förhandsgranskning</p>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl p-4 flex justify-center overflow-x-auto">
            <div className="bg-white text-black font-mono p-4 rounded-xl shadow-xl overflow-hidden" style={{ width: previewWidth, minHeight: 400 }}>
              {s.elements.filter((e) => e.visible).map((el) => {
                if (isDivider(el.key)) return (
                  <div key={el.key} className="border-t border-dashed border-gray-300 my-2" />
                );

                const cls = `${weightClass(el.weight)} ${alignClass(el.align)} ${el.uppercase ? "uppercase" : ""}`;
                const style = { fontSize: el.size };

                if (el.key === "restaurantName") return (
                  <p key={el.key} className={cls} style={style}>Palmyra Pizzeria</p>
                );
                if (el.key === "platformName") return (
                  <p key={el.key} className={cls} style={{ ...style, color: "#888" }}>{s.platformName}</p>
                );
                if (el.key === "address") return (
                  <p key={el.key} className={cls} style={{ ...style, color: "#888" }}>Västra Mårtensgatan 10, Lund</p>
                );
                if (el.key === "phone") return (
                  <p key={el.key} className={cls} style={{ ...style, color: "#888" }}>046-120 612</p>
                );
                if (el.key === "headerMsg") return el.content
                  ? <p key={el.key} className={cls} style={style}>{el.content}</p>
                  : null;
                if (el.key === "orderNumber") return (
                  <p key={el.key} className={cls} style={style}>Order #1042</p>
                );
                if (el.key === "timestamp") return (
                  <p key={el.key} className={cls} style={{ ...style, color: "#aaa" }}>2026-04-10 18:34</p>
                );
                if (el.key === "orderType") return (
                  <p key={el.key} className={cls} style={style}>Leverans</p>
                );
                if (el.key === "items") return (
                  <div key={el.key}>
                    <div className="flex justify-between" style={style}>
                      <span className={weightClass(el.weight)}>1× Crispy Tallrik</span>
                      <span className={weightClass(el.weight)}>139 kr</span>
                    </div>
                    <div className="flex justify-between" style={style}>
                      <span className={weightClass(el.weight)}>1× Kebab Rulle</span>
                      <span className={weightClass(el.weight)}>89 kr</span>
                    </div>
                  </div>
                );
                if (el.key === "extras") return (
                  <p key={el.key} className={cls} style={{ ...style, color: "#aaa" }}>  Pommes, Vitlökssås</p>
                );
                if (el.key === "deliveryFee") return (
                  <div key={el.key} className="flex justify-between" style={style}>
                    <span className={cls}>Leverans</span>
                    <span className={cls}>39 kr</span>
                  </div>
                );
                if (el.key === "discount") return (
                  <div key={el.key} className="flex justify-between" style={{ ...style, color: "#16a34a" }}>
                    <span>Rabatt (SUMMER10)</span>
                    <span>-27 kr</span>
                  </div>
                );
                if (el.key === "total") return (
                  <div key={el.key} className="flex justify-between" style={style}>
                    <span className={cls}>TOTALT</span>
                    <span className={cls}>200 kr</span>
                  </div>
                );
                if (el.key === "thankYou") return (
                  <p key={el.key} className={cls} style={style}>{el.content || "Tack för din beställning!"}</p>
                );
                if (el.key === "footerMsg") return el.content
                  ? <p key={el.key} className={cls} style={{ ...style, color: "#aaa" }}>{el.content}</p>
                  : null;
                return null;
              })}
            </div>
          </div>
          <p className="text-[10px] text-[var(--text-secondary)] text-center mt-1 opacity-40">{s.paperWidth}</p>
        </div>
      </div>
    </div>
  );
}
