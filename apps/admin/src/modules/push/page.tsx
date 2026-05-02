"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, BellRing, CheckCircle2, Loader2, MapPin, Send, Smartphone, User, Users, X } from "lucide-react";
import { getSystemHealth, healthQueryKey } from "@/modules/dashboard/api";
import { sendPushBroadcast, sendPushToCity, sendPushToUser, type PushResult } from "@/modules/push/api";
import { Badge, Button, Field, Input, Modal, SectionHeader, Surface, Textarea } from "@/shared/components/ui";

type TargetMode = "all" | "user" | "city";

interface ComposerState {
  title: string;
  body: string;
  deeplink: string;
  identifier: string;
  city: string;
}

const EMPTY_COMPOSER: ComposerState = {
  title: "",
  body: "",
  deeplink: "",
  identifier: "",
  city: "",
};

const templates = [
  {
    label: "Lunch",
    title: "Lunch is live on MatGo",
    body: "Open the app before 13:30 to catch today's lunch traffic and active offers.",
    deeplink: "/deals",
  },
  {
    label: "Comeback",
    title: "We have new offers waiting",
    body: "Come back to MatGo and check the latest restaurant deals in your area.",
    deeplink: "/discover",
  },
  {
    label: "New restaurant",
    title: "A new restaurant just launched",
    body: "A new partner is live right now. Open the app to see the menu and order.",
    deeplink: "/menu",
  },
];

function PhonePreview({ title, body, deeplink }: { title: string; body: string; deeplink: string }) {
  return (
    <div className="w-[280px] rounded-[28px] border border-[rgba(255,255,255,0.1)] bg-[#0b101b] p-3 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
      <div className="mx-auto mb-3 h-1.5 w-20 rounded-full bg-white/15" />
      <div className="rounded-[22px] bg-[linear-gradient(180deg,#111827,#0b1220)] px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#f3bf57,#ffd77f)] text-[10px] font-black text-[#11151b]">M</div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/60">MatGo</p>
            <p className="text-[9px] text-white/30">now</p>
          </div>
        </div>
        <div className="mt-3 rounded-[18px] border border-white/8 bg-white/6 px-3 py-3">
          <p className="text-sm font-black text-white">{title || "Push title preview"}</p>
          <p className="mt-1.5 text-sm leading-5 text-white/70">{body || "Push message preview"}</p>
          {deeplink ? <p className="mt-2 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--accent-strong)]">Opens {deeplink}</p> : null}
        </div>
      </div>
    </div>
  );
}

function ComposerModal({
  mode,
  open,
  onClose,
  audience,
}: {
  mode: TargetMode;
  open: boolean;
  onClose: () => void;
  audience: number;
}) {
  const [form, setForm] = useState<ComposerState>(EMPTY_COMPOSER);
  const [result, setResult] = useState<PushResult | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const broadcastMutation = useMutation({
    mutationFn: () => sendPushBroadcast({ title: form.title, body: form.body, ...(form.deeplink ? { data: { deeplink: form.deeplink } } : {}) }),
    onSuccess: (r) => { setResult(r); setSendError(null); },
    onError: (e: any) => setSendError(e?.response?.data?.error || "Kunde inte skicka"),
  });

  const userMutation = useMutation({
    mutationFn: () => sendPushToUser({ identifier: form.identifier, title: form.title, body: form.body, ...(form.deeplink ? { data: { deeplink: form.deeplink } } : {}) }),
    onSuccess: (r) => { setResult(r); setSendError(null); },
    onError: (e: any) => setSendError(e?.response?.data?.error || "Kunde inte skicka"),
  });

  const cityMutation = useMutation({
    mutationFn: () => sendPushToCity({ city: form.city, title: form.title, body: form.body, ...(form.deeplink ? { data: { deeplink: form.deeplink } } : {}) }),
    onSuccess: (r) => { setResult(r); setSendError(null); },
    onError: (e: any) => setSendError(e?.response?.data?.error || "Kunde inte skicka"),
  });

  const isPending = broadcastMutation.isPending || userMutation.isPending || cityMutation.isPending;

  const canSend =
    form.title.trim() &&
    form.body.trim() &&
    (mode === "all" || (mode === "user" && form.identifier.trim()) || (mode === "city" && form.city.trim()));

  const handleSend = () => {
    setResult(null);
    setSendError(null);
    if (mode === "all") broadcastMutation.mutate();
    else if (mode === "user") userMutation.mutate();
    else cityMutation.mutate();
  };

  const handleClose = () => {
    setForm(EMPTY_COMPOSER);
    setResult(null);
    setSendError(null);
    onClose();
  };

  const modeLabel = mode === "all" ? "Alla användare" : mode === "user" ? "En användare" : "Stad / grupp";
  const modeIcon = mode === "all" ? <Users size={16} /> : mode === "user" ? <User size={16} /> : <MapPin size={16} />;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={`Push: ${modeLabel}`}
      description={mode === "all" ? `${audience} användare med push-token` : mode === "user" ? "Skicka till en specifik användare" : "Skicka till alla i en stad"}
      widthClassName="max-w-[900px]"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
            {modeIcon}
            {modeLabel}
          </div>
          <div className="flex gap-2">
            <Button onClick={handleClose}>Stäng</Button>
            <Button variant="primary" onClick={handleSend} disabled={isPending || !canSend}>
              {isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {isPending ? "Skickar…" : "Skicka"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          {mode !== "all" && (
            <div className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-4">
              {mode === "user" ? (
                <Field label="Användare (ID, email eller telefon)">
                  <Input
                    value={form.identifier}
                    onChange={(e) => setForm((s) => ({ ...s, identifier: e.target.value }))}
                    placeholder="user@example.com / +46701234567"
                  />
                </Field>
              ) : (
                <Field label="Stad">
                  <Input
                    value={form.city}
                    onChange={(e) => setForm((s) => ({ ...s, city: e.target.value }))}
                    placeholder="Stockholm"
                  />
                </Field>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <Button
                key={t.label}
                variant="secondary"
                onClick={() => setForm((s) => ({ ...s, title: t.title, body: t.body, deeplink: t.deeplink }))}
              >
                {t.label}
              </Button>
            ))}
          </div>

          <Field label="Titel">
            <Input value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} placeholder="Push-rubrik" />
          </Field>
          <Field label="Meddelande">
            <Textarea value={form.body} onChange={(e) => setForm((s) => ({ ...s, body: e.target.value }))} placeholder="Meddelandetext" />
          </Field>
          <Field label="Deep link (valfri)">
            <Input value={form.deeplink} onChange={(e) => setForm((s) => ({ ...s, deeplink: e.target.value }))} placeholder="/deals" />
          </Field>

          {result && (
            <div className="rounded-2xl border border-[rgba(48,199,143,0.2)] bg-[rgba(48,199,143,0.08)] px-4 py-4">
              <div className="flex items-center gap-2 text-sm text-[#c4ffeb]">
                <CheckCircle2 size={16} />
                Skickat till {result.count} enhet{result.count !== 1 ? "er" : ""}
                {result.chunks && result.chunks > 1 ? ` (${result.chunks} batchar)` : ""}
              </div>
            </div>
          )}

          {sendError && (
            <div className="rounded-2xl border border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.08)] px-4 py-4">
              <div className="flex items-center gap-2 text-sm text-rose-400">
                <AlertCircle size={16} /> {sendError}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-4 pt-2">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Förhandsvisning</p>
          <PhonePreview title={form.title} body={form.body} deeplink={form.deeplink} />
          <div className="mt-2 space-y-2 text-sm text-[var(--text-secondary)] w-full">
            <div className="surface-muted px-3 py-3 text-xs">Publicera innehåll innan du skickar push.</div>
            <div className="surface-muted px-3 py-3 text-xs">Deep links kräver att destinationen redan finns i appen.</div>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function PushPage() {
  const health = useQuery({ queryKey: healthQueryKey, queryFn: getSystemHealth, refetchInterval: 30_000 });
  const [activeMode, setActiveMode] = useState<TargetMode | null>(null);

  const audience = useMemo(() => health.data?.operations.userCount || 0, [health.data?.operations.userCount]);

  const targets: Array<{ mode: TargetMode; icon: React.ReactNode; title: string; desc: string; badge?: string }> = [
    {
      mode: "all",
      icon: <Users size={28} />,
      title: "Alla användare",
      desc: `Broadcast till ${audience} registrerade enheter`,
      badge: String(audience),
    },
    {
      mode: "user",
      icon: <User size={28} />,
      title: "En användare",
      desc: "Skicka till en specifik person via ID, email eller telefon",
    },
    {
      mode: "city",
      icon: <MapPin size={28} />,
      title: "Stad / grupp",
      desc: "Skicka till alla användare i en vald stad",
    },
  ];

  return (
    <div className="page-stack">
      <Surface className="px-6 py-6">
        <SectionHeader
          eyebrow="Push"
          title="Push-notiser"
          description="Välj målgrupp och skicka notis via det befintliga push-systemet (Expo)."
          actions={
            <>
              <Badge tone="info"><Smartphone size={12} /> Expo</Badge>
              <Badge tone="success">{audience} användare</Badge>
            </>
          }
        />
      </Surface>

      <div className="grid gap-4 sm:grid-cols-3">
        {targets.map(({ mode, icon, title, desc, badge }) => (
          <button
            key={mode}
            type="button"
            onClick={() => setActiveMode(mode)}
            className="surface-muted flex flex-col items-start gap-4 px-6 py-6 text-left hover:border-[var(--accent-strong)] transition-colors"
          >
            <div className="flex w-full items-start justify-between gap-3">
              <div className="text-[var(--accent-strong)]">{icon}</div>
              {badge ? <Badge tone="info">{badge}</Badge> : null}
            </div>
            <div>
              <p className="text-lg font-black tracking-[-0.02em]">{title}</p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">{desc}</p>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-[var(--accent-strong)]">
              <BellRing size={12} /> Öppna composer
            </div>
          </button>
        ))}
      </div>

      <Surface className="px-6 py-5">
        <div className="space-y-2 text-sm text-[var(--text-secondary)]">
          <p className="font-black text-[var(--text-primary)]">Riktlinjer</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>Publicera alltid innehållet innan du skickar push-notisen.</li>
            <li>Håll rubriken kort nog för att synas på låsskärmen.</li>
            <li>Använd deep links enbart om destinationen redan finns i appen.</li>
          </ul>
        </div>
      </Surface>

      {activeMode && (
        <ComposerModal
          mode={activeMode}
          open={true}
          onClose={() => setActiveMode(null)}
          audience={audience}
        />
      )}
    </div>
  );
}
