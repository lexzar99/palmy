"use client";

import { useMemo, useState } from "react";
import axios from "axios";
import {
  Bell,
  CheckCircle2,
  Info,
  Loader2,
  Send,
  Smartphone,
  Sparkles,
  Users,
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-storage";
import { useToast } from "@/components/Toast";
import { useControlCenter } from "@/lib/use-control-center";

const TEMPLATES = [
  {
    label: "Lunchkampanj",
    title: "Lunchrush i MatGo",
    body: "Beställ innan 13:30 och använd din kod i appen för snabbare lunchflow idag.",
    deeplink: "/deals",
  },
  {
    label: "Comeback",
    title: "Vi saknar dig i MatGo",
    body: "Kom tillbaka idag och upptäck nya deals från dina favoritrestauranger.",
    deeplink: "/discover",
  },
  {
    label: "Ny restaurang",
    title: "Ny partner har landat",
    body: "En ny restaurang är live i appen. Kolla in menyn och beställ direkt.",
    deeplink: "/menu",
  },
];

export default function PushCentralPage() {
  const { success, error: toastError } = useToast();
  const { data } = useControlCenter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    body: "",
    deeplink: "",
  });

  const audience = useMemo(() => data?.summary.registeredCustomers || 0, [data]);
  const previewBody = form.body || "Meddelandet visas här när du börjar skriva.";

  const sendPush = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim() || !form.body.trim()) return;

    if (!window.confirm("Skicka denna push-notis till alla mobilanvändare med aktiverade notiser?")) {
      return;
    }

    const token = getStoredToken();
    if (!token) return;

    setLoading(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/notifications/admin/send-all`,
        {
          title: form.title,
          body: form.body,
          ...(form.deeplink ? { data: { deeplink: form.deeplink } } : {}),
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      success(`Push skickad till ${response.data.count} enheter.`);
      setForm({ title: "", body: "", deeplink: "" });
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte skicka push-notisen.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5 pb-16">
      <section className="panel rounded-[32px] px-6 py-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <span className="control-chip">Push center</span>
            <div>
              <h2 className="text-3xl font-black tracking-[-0.06em] text-[var(--text-primary)] sm:text-4xl">Skicka broadcast utan att chansa</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
                Den här ytan är nu tydligare: skriv budskapet, lägg valfri deeplink och granska hur notisen ser ut innan du skickar.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="control-chip">
              <Users size={13} /> {audience} registrerade kunder
            </span>
            <span className="control-chip">
              <Smartphone size={13} /> iOS + Android
            </span>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        {[
          { label: "Målgrupp", value: audience, sub: "Registrerade kunder i plattformen" },
          { label: "Kanal", value: "Expo", sub: "Push via iOS och Android" },
          { label: "Läge", value: "Live", sub: "Skickas direkt till alla enheter" },
          { label: "Säkerhet", value: "Confirm", sub: "Kräver manuell bekräftelse innan utskick" },
        ].map((card) => (
          <article key={card.label} className="metric-card panel-muted">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">{card.label}</p>
            <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{card.value}</p>
            <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">{card.sub}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 2xl:grid-cols-[1.05fr_0.95fr]">
        <div className="panel rounded-[32px] px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Templates</p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Snabbstart för vanliga utskick</h3>
            </div>
            <Sparkles size={18} className="text-amber-200" />
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {TEMPLATES.map((template) => (
              <button
                key={template.label}
                type="button"
                onClick={() => setForm({ title: template.title, body: template.body, deeplink: template.deeplink })}
                className="control-chip"
              >
                {template.label}
              </button>
            ))}
          </div>

          <form onSubmit={sendPush} className="mt-5 grid gap-4">
            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
              <span>Titel</span>
              <input
                required
                value={form.title}
                onChange={(event) => setForm((previous) => ({ ...previous, title: event.target.value }))}
                className="control-input"
                placeholder="t.ex. Lunchrush i MatGo"
              />
            </label>

            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
              <span>Meddelande</span>
              <textarea
                required
                rows={5}
                value={form.body}
                onChange={(event) => setForm((previous) => ({ ...previous, body: event.target.value }))}
                className="control-input min-h-[140px] resize-none"
                placeholder="Beskriv erbjudandet, anledningen att öppna appen och gärna nästa steg."
              />
            </label>

            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
              <span>Valfri deeplink</span>
              <input
                value={form.deeplink}
                onChange={(event) => setForm((previous) => ({ ...previous, deeplink: event.target.value }))}
                className="control-input"
                placeholder="t.ex. /deals eller /menu"
              />
            </label>

            <div className="rounded-[24px] border border-amber-300/18 bg-amber-300/10 px-4 py-4 text-sm leading-6 text-[var(--text-secondary)]">
              <div className="flex items-center gap-2 text-amber-100">
                <Info size={15} />
                <span className="font-black uppercase tracking-[0.18em]">Check innan skick</span>
              </div>
              <div className="mt-3 grid gap-2">
                <p>1. Skriv en tydlig titel som går att förstå direkt på låsskärmen.</p>
                <p>2. Lägg bara deeplink om du vet exakt var användaren ska landa.</p>
                <p>3. Skicka inte pushar som kräver att en restaurang eller deal ännu inte är live.</p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !form.title.trim() || !form.body.trim()}
              className="inline-flex items-center justify-center gap-3 rounded-[26px] bg-gold-gradient px-6 py-4 text-sm font-black uppercase tracking-[0.24em] text-[#091018] disabled:opacity-60"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
              {loading ? "Skickar" : "Skicka broadcast"}
            </button>
          </form>
        </div>

        <div className="grid gap-5">
          <div className="panel rounded-[32px] px-6 py-6">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Live preview</p>
            <div className="mt-5 flex justify-center">
              <div className="relative w-[290px] rounded-[34px] border border-[rgba(255,255,255,0.1)] bg-[#0b101b] p-3 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
                <div className="mx-auto mb-3 h-1.5 w-24 rounded-full bg-white/15" />
                <div className="rounded-[26px] bg-[linear-gradient(180deg,#111827,#0b1220)] px-4 py-5">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-gold-gradient text-xs font-black text-[#091018]">M</div>
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/60">MatGo</p>
                      <p className="text-[10px] text-white/30">nu</p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-[22px] border border-white/8 bg-white/6 px-4 py-4 backdrop-blur-sm">
                    <p className="text-sm font-black text-white">{form.title || "Din push-titel visas här"}</p>
                    <p className="mt-2 text-sm leading-6 text-white/70">{previewBody}</p>
                    {form.deeplink ? <p className="mt-3 text-[11px] font-black uppercase tracking-[0.18em] text-amber-200">Öppnar {form.deeplink}</p> : null}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="panel rounded-[32px] px-6 py-6">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Playbook</p>
            <div className="mt-4 grid gap-3 text-sm leading-7 text-[var(--text-secondary)]">
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4">
                <p className="font-black text-[var(--text-primary)]">När push fungerar bäst</p>
                <p className="mt-2">Utskick med en tydlig anledning att öppna appen och en enkel nästa handling presterar bättre än generisk branding.</p>
              </div>
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4">
                <p className="font-black text-[var(--text-primary)]">Bra ordning</p>
                <p className="mt-2">1. Publicera deal eller restaurang. 2. Verifiera att länken fungerar. 3. Skicka pushen.</p>
              </div>
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4">
                <div className="flex items-center gap-2 text-emerald-100">
                  <CheckCircle2 size={15} />
                  <p className="font-black text-[var(--text-primary)]">Skickflödet är kopplat</p>
                </div>
                <p className="mt-2">Push Center använder nu samma nya panelstil och skickar via backendens superadmin-säkrade broadcast-route.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
