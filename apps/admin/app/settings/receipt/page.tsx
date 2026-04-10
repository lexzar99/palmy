"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import {
  Printer, Save, MessageSquare, AlignLeft, AlignCenter, AlignRight,
  Type, Ruler, Eye, EyeOff, Store, Phone, MapPin, Loader2,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { API_URL } from "@/lib/api";

interface ReceiptSettings {
  width: "58mm" | "80mm" | "A4";
  headerMessage: string;
  footerMessage: string;
  showLogo: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showOrderNumber: boolean;
  showTimestamp: boolean;
  showExtras: boolean;
  textAlign: "left" | "center" | "right";
  fontSize: "small" | "medium" | "large";
  restaurantName: string;
  thankYouMessage: string;
}

const DEFAULTS: ReceiptSettings = {
  width: "80mm",
  headerMessage: "",
  footerMessage: "Tack för beställningen! Välkommen åter.",
  showLogo: true,
  showAddress: true,
  showPhone: true,
  showOrderNumber: true,
  showTimestamp: true,
  showExtras: true,
  textAlign: "center",
  fontSize: "medium",
  restaurantName: "MatGo",
  thankYouMessage: "Tack för din beställning!",
};

const LS_KEY = "matgo_receipt_settings";

const WIDTHS = [
  { id: "58mm", label: "58mm", desc: "Smal (äldre skrivare)" },
  { id: "80mm", label: "80mm", desc: "Standard (vanligast)" },
  { id: "A4", label: "A4", desc: "Utskrift / PDF" },
];

const inputCls = "w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-gold-500/30 transition-all";

const Toggle = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="flex items-center justify-between cursor-pointer py-2">
    <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">{label}</span>
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors ${checked ? "bg-gold-500" : "bg-[var(--border-subtle)]"}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${checked ? "right-0.5" : "left-0.5"}`} />
    </button>
  </label>
);

export default function ReceiptSettingsPage() {
  const { success } = useToast();
  const [settings, setSettings] = useState<ReceiptSettings>(DEFAULTS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) setSettings({ ...DEFAULTS, ...JSON.parse(stored) });
    } catch { /* ignore */ }
  }, []);

  const update = <K extends keyof ReceiptSettings>(key: K, value: ReceiptSettings[K]) => {
    setSettings((p) => ({ ...p, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(settings));
      const token = localStorage.getItem("matgo_token") || "";
      // Also persist header/footer to global settings API if possible
      await axios.patch(`${API_URL}/api/settings`, {
        receiptHeader: settings.headerMessage,
        receiptFooter: settings.footerMessage,
      }, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
      success("Kvittolayout sparad");
    } finally {
      setSaving(false);
    }
  };

  const previewWidthPx = settings.width === "58mm" ? 200 : settings.width === "A4" ? 360 : 280;
  const previewFont = settings.fontSize === "small" ? "text-[9px]" : settings.fontSize === "large" ? "text-sm" : "text-[11px]";
  const previewAlign = settings.textAlign === "left" ? "text-left" : settings.textAlign === "right" ? "text-right" : "text-center";

  return (
    <div className="space-y-5 pb-24 max-w-5xl">
      <div>
        <h1 className="text-2xl font-black uppercase tracking-tight text-[var(--text-primary)] flex items-center gap-3">
          <Printer size={22} className="text-gold-500" /> Kvittolayout
        </h1>
        <p className="text-[var(--text-secondary)] text-[9px] font-bold uppercase tracking-widest mt-0.5">
          Global inställning för alla restaurangers kvitton
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Settings */}
        <div className="space-y-4">
          {/* Paper width */}
          <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
            <h2 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <Ruler size={14} className="text-gold-500" /> Pappersbredd
            </h2>
            <div className="grid grid-cols-3 gap-2">
              {WIDTHS.map((w) => (
                <button key={w.id} onClick={() => update("width", w.id as ReceiptSettings["width"])}
                  className={`p-3 rounded-xl border text-center transition-all ${settings.width === w.id ? "bg-gold-500/10 border-gold-500/30 text-gold-500" : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-gold-500/20"}`}>
                  <p className="text-sm font-black">{w.label}</p>
                  <p className="text-[8px] font-bold mt-0.5 opacity-60">{w.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Text */}
          <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
            <h2 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <MessageSquare size={14} className="text-gold-500" /> Text
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-1.5">Restaurangnamn på kvittot</label>
                <input className={inputCls} value={settings.restaurantName} onChange={(e) => update("restaurantName", e.target.value)} />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-1.5">Sidhuvud (visas högst upp)</label>
                <textarea className={`${inputCls} resize-none h-16`} value={settings.headerMessage}
                  placeholder="T.ex: Välkommen!" onChange={(e) => update("headerMessage", e.target.value)} />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-1.5">Tackmeddelande</label>
                <input className={inputCls} value={settings.thankYouMessage} onChange={(e) => update("thankYouMessage", e.target.value)} />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-1.5">Sidfot (visas längst ner)</label>
                <textarea className={`${inputCls} resize-none h-16`} value={settings.footerMessage}
                  placeholder="T.ex: Tack för beställningen!" onChange={(e) => update("footerMessage", e.target.value)} />
              </div>
            </div>
          </div>

          {/* Typography */}
          <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
            <h2 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <Type size={14} className="text-gold-500" /> Typografi & Justering
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-2">Textstorlek</label>
                <div className="flex gap-2">
                  {(["small", "medium", "large"] as const).map((s) => (
                    <button key={s} onClick={() => update("fontSize", s)}
                      className={`flex-1 py-2 rounded-xl border text-[9px] font-black uppercase transition-all ${settings.fontSize === s ? "bg-gold-500/10 border-gold-500/30 text-gold-500" : "border-[var(--border-subtle)] text-[var(--text-secondary)]"}`}>
                      {s === "small" ? "Liten" : s === "large" ? "Stor" : "Medium"}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-2">Textjustering</label>
                <div className="flex gap-2">
                  {([{ id: "left", icon: AlignLeft }, { id: "center", icon: AlignCenter }, { id: "right", icon: AlignRight }] as const).map(({ id, icon: Icon }) => (
                    <button key={id} onClick={() => update("textAlign", id as ReceiptSettings["textAlign"])}
                      className={`flex-1 py-2 rounded-xl border flex items-center justify-center transition-all ${settings.textAlign === id ? "bg-gold-500/10 border-gold-500/30 text-gold-500" : "border-[var(--border-subtle)] text-[var(--text-secondary)]"}`}>
                      <Icon size={14} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Show/hide sections */}
          <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
            <h2 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <Eye size={14} className="text-gold-500" /> Visa / Dölj sektioner
            </h2>
            <div className="divide-y divide-[var(--border-subtle)]">
              <Toggle label="Visa logotyp" checked={settings.showLogo} onChange={(v) => update("showLogo", v)} />
              <Toggle label="Visa adress" checked={settings.showAddress} onChange={(v) => update("showAddress", v)} />
              <Toggle label="Visa telefon" checked={settings.showPhone} onChange={(v) => update("showPhone", v)} />
              <Toggle label="Visa ordernummer" checked={settings.showOrderNumber} onChange={(v) => update("showOrderNumber", v)} />
              <Toggle label="Visa tidstämpel" checked={settings.showTimestamp} onChange={(v) => update("showTimestamp", v)} />
              <Toggle label="Visa tillbehör (extras)" checked={settings.showExtras} onChange={(v) => update("showExtras", v)} />
            </div>
          </div>

          <button onClick={handleSave} disabled={saving}
            className="w-full py-4 bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] font-black uppercase tracking-widest text-[11px] rounded-xl shadow-lg shadow-gold-500/20 transition-all flex items-center justify-center gap-2">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Spara kvittolayout
          </button>
        </div>

        {/* Live Preview */}
        <div className="sticky top-5">
          <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-3 flex items-center gap-2">
            <Eye size={12} /> Live-förhandsgranskning
          </p>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl p-6 flex justify-center">
            <div
              className={`bg-white rounded-xl shadow-2xl p-5 font-mono ${previewFont} ${previewAlign} text-black`}
              style={{ width: previewWidthPx, minHeight: 320 }}
            >
              {/* Header */}
              {settings.showLogo && (
                <div className={`mb-3 ${settings.textAlign === "center" ? "flex flex-col items-center" : ""}`}>
                  <div className="w-10 h-10 bg-black text-white rounded-full flex items-center justify-center font-black text-lg mb-2 mx-auto">
                    {settings.restaurantName.charAt(0)}
                  </div>
                  <p className="font-black uppercase text-base">{settings.restaurantName}</p>
                </div>
              )}
              {settings.showAddress && (
                <p className="text-gray-500 text-[8px] mb-0.5">Gatuadress 1, Lund</p>
              )}
              {settings.showPhone && (
                <p className="text-gray-500 text-[8px] mb-2">046-123 456</p>
              )}
              {settings.headerMessage && (
                <p className="text-gray-600 text-[8px] border-t border-dashed border-gray-200 pt-2 mb-2">{settings.headerMessage}</p>
              )}

              <div className="border-t-2 border-dashed border-gray-300 my-2" />

              {settings.showOrderNumber && (
                <p className="font-black text-[9px] mb-1">Order #1042</p>
              )}
              {settings.showTimestamp && (
                <p className="text-gray-400 text-[8px] mb-2">2026-04-10 17:34</p>
              )}

              <div className="text-left space-y-1 mb-3">
                <div className="flex justify-between text-[9px] font-bold">
                  <span>1x Crispy Tallrik</span>
                  <span>139 kr</span>
                </div>
                {settings.showExtras && (
                  <div className="text-[7px] text-gray-400 pl-2">Pommes, Vitlökssås</div>
                )}
                <div className="flex justify-between text-[9px] font-bold">
                  <span>1x Kebab Rulle</span>
                  <span>89 kr</span>
                </div>
              </div>

              <div className="border-t-2 border-dashed border-gray-300 my-2" />
              <div className="flex justify-between font-black text-[10px] mb-3">
                <span>Totalt:</span>
                <span>228 kr</span>
              </div>

              <div className="border-t-2 border-dashed border-gray-300 my-2" />
              <p className="text-[9px] font-black">{settings.thankYouMessage}</p>
              {settings.footerMessage && (
                <p className="text-gray-400 text-[8px] mt-1">{settings.footerMessage}</p>
              )}
            </div>
          </div>
          <p className="text-[8px] font-bold text-[var(--text-secondary)] text-center mt-2 opacity-40">
            Bredd: {settings.width} · Förhandsgranskning är ungefärlig
          </p>
        </div>
      </div>
    </div>
  );
}
