"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BellRing, CheckCircle2, Send, Smartphone, Users } from "lucide-react";
import { getSystemHealth, healthQueryKey } from "@/modules/dashboard/api";
import { sendPushBroadcast } from "@/modules/push/api";
import { Badge, Button, Field, Input, SectionHeader, Surface, Textarea } from "@/shared/components/ui";

const templates = [
  {
    label: "Lunch campaign",
    title: "Lunch is live on MatGo",
    body: "Open the app before 13:30 to catch today’s lunch traffic and active offers.",
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

export function PushPage() {
  const health = useQuery({ queryKey: healthQueryKey, queryFn: getSystemHealth, refetchInterval: 30_000 });
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [deeplink, setDeeplink] = useState("");
  const [lastResult, setLastResult] = useState<string | null>(null);

  const sendMutation = useMutation({
    mutationFn: () => sendPushBroadcast({ title, body, ...(deeplink ? { data: { deeplink } } : {}) }),
    onSuccess: (response) => {
      setLastResult(`Sent to ${response.count} devices across ${response.chunks || 1} chunk(s).`);
      setTitle("");
      setBody("");
      setDeeplink("");
    },
  });

  const audience = useMemo(() => health.data?.operations.userCount || 0, [health.data?.operations.userCount]);

  return (
    <div className="page-stack">
      <Surface className="px-6 py-6">
        <SectionHeader
          eyebrow="Push"
          title="Push notification center"
          description="Send broadcast pushes through the existing secured backend route with a simple preview and template launcher."
          actions={
            <>
              <Badge tone="info"><Users size={12} /> {audience} users</Badge>
              <Badge tone="success"><Smartphone size={12} /> Expo delivery</Badge>
            </>
          }
        />
      </Surface>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Surface className="px-5 py-5"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Audience</p><p className="mt-3 text-3xl font-black tracking-[-0.04em]">{audience}</p></Surface>
        <Surface className="px-5 py-5"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Channel</p><p className="mt-3 text-3xl font-black tracking-[-0.04em]">Expo</p></Surface>
        <Surface className="px-5 py-5"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Mode</p><p className="mt-3 text-3xl font-black tracking-[-0.04em]">Live</p></Surface>
        <Surface className="px-5 py-5"><p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Confirmation</p><p className="mt-3 text-3xl font-black tracking-[-0.04em]">Manual</p></Surface>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Surface className="px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Composer</p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.04em]">Broadcast message</h2>
            </div>
            <BellRing size={18} className="text-[var(--accent-strong)]" />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {templates.map((template) => (
              <Button key={template.label} variant="secondary" onClick={() => { setTitle(template.title); setBody(template.body); setDeeplink(template.deeplink); }}>
                {template.label}
              </Button>
            ))}
          </div>

          <div className="mt-5 grid gap-4">
            <Field label="Title"><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Push title" /></Field>
            <Field label="Message"><Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Message body" /></Field>
            <Field label="Optional deeplink"><Input value={deeplink} onChange={(event) => setDeeplink(event.target.value)} placeholder="/deals" /></Field>

            {lastResult ? (
              <div className="rounded-2xl border border-[rgba(48,199,143,0.2)] bg-[rgba(48,199,143,0.08)] px-4 py-4 text-sm text-[#c4ffeb]">
                <div className="flex items-center gap-2"><CheckCircle2 size={16} /> {lastResult}</div>
              </div>
            ) : null}

            <Button
              variant="primary"
              onClick={() => {
                if (!title.trim() || !body.trim()) return;
                if (window.confirm("Send this push notification to all registered devices?")) {
                  sendMutation.mutate();
                }
              }}
              disabled={sendMutation.isPending || !title.trim() || !body.trim()}
            >
              {sendMutation.isPending ? "Sending" : "Send broadcast"} <Send size={16} />
            </Button>
          </div>
        </Surface>

        <Surface className="px-6 py-6">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Preview</p>
          <div className="mt-5 flex justify-center">
            <div className="w-[300px] rounded-[30px] border border-[rgba(255,255,255,0.1)] bg-[#0b101b] p-3 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
              <div className="mx-auto mb-3 h-1.5 w-24 rounded-full bg-white/15" />
              <div className="rounded-[24px] bg-[linear-gradient(180deg,#111827,#0b1220)] px-4 py-5">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#f3bf57,#ffd77f)] text-xs font-black text-[#11151b]">M</div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-white/60">MatGo</p>
                    <p className="text-[10px] text-white/30">now</p>
                  </div>
                </div>
                <div className="mt-4 rounded-[22px] border border-white/8 bg-white/6 px-4 py-4">
                  <p className="text-sm font-black text-white">{title || "Push title preview"}</p>
                  <p className="mt-2 text-sm leading-6 text-white/70">{body || "Push message preview"}</p>
                  {deeplink ? <p className="mt-3 text-[11px] font-black uppercase tracking-[0.16em] text-[var(--accent-strong)]">Opens {deeplink}</p> : null}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 text-sm text-[var(--text-secondary)]">
            <div className="surface-muted px-4 py-4">Publish content first, then send the push.</div>
            <div className="surface-muted px-4 py-4">Use deeplinks only when the mobile destination already exists.</div>
            <div className="surface-muted px-4 py-4">Keep the title short enough to fit the lock screen cleanly.</div>
          </div>
        </Surface>
      </div>
    </div>
  );
}
