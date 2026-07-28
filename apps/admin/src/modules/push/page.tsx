"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  Loader2,
  Send,
  ShoppingBag,
  Smartphone,
} from "lucide-react";
import {
  getPushHistory,
  getPushInstallations,
  pushHistoryQueryKey,
  pushInstallationsQueryKey,
  sendPushToInstallations,
  type InstallationOrderFilter,
  type PushResult,
} from "@/modules/push/api";
import {
  Badge,
  Button,
  Field,
  Input,
  PageHeader,
  Select,
  Surface,
  Textarea,
} from "@/shared/components/ui";
import { formatDateTime } from "@/shared/utils/format";

type FormState = {
  title: string;
  body: string;
  deeplink: string;
  ordered: InstallationOrderFilter;
  minOrders: string;
  maxOrders: string;
};

const TEMPLATES = [
  { label: "Lunch", title: "Lunch i Lund", body: "Se vad som är öppet och beställ direkt i ViaEats." },
  { label: "Nytt", title: "Nytt på ViaEats", body: "Öppna appen och upptäck det senaste." },
  { label: "Helg", title: "Helgen är räddad", body: "Dina lokala favoriter finns redo i appen." },
];

function optionalCount(value: string): number | undefined {
  const clean = value.trim();
  if (!clean) return undefined;
  const parsed = Number(clean);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function Stat({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Surface className={`flex items-center justify-between gap-4 p-4 ${accent ? "ring-1 ring-[var(--accent)]/20" : ""}`}>
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</p>
        <p className="mt-1 text-[28px] font-black tracking-[-1px] text-[var(--text-primary)]">{value}</p>
      </div>
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${accent ? "bg-[var(--accent)] text-white" : "bg-[var(--bg-panel-soft)] text-[var(--text-secondary)]"}`}>
        {icon}
      </span>
    </Surface>
  );
}

export function PushPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [form, setForm] = useState<FormState>(() => ({
    title: searchParams.get("title") ?? "",
    body: searchParams.get("body") ?? "",
    deeplink: searchParams.get("restaurant")
      ? `/restaurants/${searchParams.get("restaurant")}`
      : "",
    ordered: "all",
    minOrders: "",
    maxOrders: "",
  }));
  const [result, setResult] = useState<(PushResult & { selected?: number }) | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const filter = useMemo(() => ({
    ordered: form.ordered,
    minOrders: optionalCount(form.minOrders),
    maxOrders: optionalCount(form.maxOrders),
  }), [form.ordered, form.minOrders, form.maxOrders]);

  const audience = useQuery({
    queryKey: [...pushInstallationsQueryKey, filter],
    queryFn: () => getPushInstallations(filter),
    refetchInterval: 60_000,
  });
  const history = useQuery({
    queryKey: pushHistoryQueryKey,
    queryFn: getPushHistory,
  });

  const sendMutation = useMutation({
    mutationFn: sendPushToInstallations,
    onSuccess: async (response) => {
      setResult(response);
      setSendError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: pushHistoryQueryKey }),
        queryClient.invalidateQueries({ queryKey: pushInstallationsQueryKey }),
      ]);
    },
    onError: (error: any) => {
      setResult(null);
      setSendError(error?.response?.data?.error || "Kunde inte skicka push");
    },
  });

  const minOrders = optionalCount(form.minOrders);
  const maxOrders = optionalCount(form.maxOrders);
  const invalidRange = minOrders != null && maxOrders != null && minOrders > maxOrders;
  const selected = audience.data?.selected ?? 0;
  const canSend =
    form.title.trim().length > 0 &&
    form.body.trim().length > 0 &&
    selected > 0 &&
    !invalidRange;

  const handleSend = () => {
    if (!canSend) return;
    setResult(null);
    setSendError(null);
    sendMutation.mutate({
      title: form.title.trim(),
      body: form.body.trim(),
      ordered: form.ordered,
      ...(minOrders != null ? { minOrders } : {}),
      ...(maxOrders != null ? { maxOrders } : {}),
      ...(form.deeplink.trim() ? { data: { deeplink: form.deeplink.trim() } } : {}),
    });
  };

  const totals = audience.data?.totals ?? {
    installed: 0,
    ordered: 0,
    neverOrdered: 0,
    ios: 0,
    android: 0,
  };

  return (
    <div className="page-stack">
      <PageHeader
        breadcrumb="Tillväxt"
        title="Push"
        actions={
          <Button variant="primary" onClick={handleSend} disabled={!canSend || sendMutation.isPending}>
            {sendMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {sendMutation.isPending ? "Skickar…" : `Skicka till ${selected}`}
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Installerade appar" value={totals.installed} icon={<Smartphone size={19} />} accent />
        <Stat label="Har beställt" value={totals.ordered} icon={<ShoppingBag size={19} />} />
        <Stat label="Inte beställt" value={totals.neverOrdered} icon={<BellRing size={19} />} />
        <Stat label="Valda mottagare" value={selected} icon={<Send size={19} />} />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <Surface className="overflow-hidden p-0">
          <div className="border-b border-[var(--row-divider)] px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[16px] font-extrabold tracking-[-0.3px]">Mottagare</p>
                <p className="mt-0.5 text-[12px] text-[var(--text-secondary)]">En notis per aktiv appinstallation.</p>
              </div>
              <div className="flex gap-2">
                <Badge tone="neutral">iOS {totals.ios}</Badge>
                <Badge tone="neutral">Android {totals.android}</Badge>
              </div>
            </div>
          </div>

          <div className="grid gap-4 border-b border-[var(--row-divider)] bg-[var(--bg-panel-soft)] p-5 md:grid-cols-3">
            <Field label="Orderstatus">
              <Select
                value={form.ordered}
                onChange={(event) => setForm((state) => ({
                  ...state,
                  ordered: event.target.value as InstallationOrderFilter,
                }))}
              >
                <option value="all">Alla appar</option>
                <option value="yes">Har beställt</option>
                <option value="no">Har inte beställt</option>
              </Select>
            </Field>
            <Field label="Minst antal ordrar">
              <Input
                type="number"
                min="0"
                inputMode="numeric"
                value={form.minOrders}
                onChange={(event) => setForm((state) => ({ ...state, minOrders: event.target.value }))}
                placeholder="0"
              />
            </Field>
            <Field label="Högst antal ordrar">
              <Input
                type="number"
                min="0"
                inputMode="numeric"
                value={form.maxOrders}
                onChange={(event) => setForm((state) => ({ ...state, maxOrders: event.target.value }))}
                placeholder="Alla"
              />
            </Field>
            {invalidRange ? (
              <p className="text-[12px] font-semibold text-[var(--danger,#dc2626)] md:col-span-3">
                Minsta antal kan inte vara större än högsta.
              </p>
            ) : null}
          </div>

          <div className="space-y-5 p-5">
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((template) => (
                <Button
                  key={template.label}
                  variant="secondary"
                  className="h-9 min-h-9 px-3 text-[12px]"
                  onClick={() => setForm((state) => ({
                    ...state,
                    title: template.title,
                    body: template.body,
                  }))}
                >
                  {template.label}
                </Button>
              ))}
            </div>

            <Field label="Rubrik">
              <Input
                value={form.title}
                maxLength={120}
                onChange={(event) => setForm((state) => ({ ...state, title: event.target.value }))}
                placeholder="Kort rubrik"
              />
            </Field>
            <Field label="Meddelande">
              <Textarea
                value={form.body}
                maxLength={500}
                onChange={(event) => setForm((state) => ({ ...state, body: event.target.value }))}
                placeholder="Skriv meddelandet"
              />
            </Field>
            <Field label="Länk i appen (valfri)">
              <Input
                value={form.deeplink}
                onChange={(event) => setForm((state) => ({ ...state, deeplink: event.target.value }))}
                placeholder="/deals"
              />
            </Field>

            {result ? (
              <div className="flex items-center gap-2 rounded-xl bg-[var(--success-soft)] px-4 py-3 text-[13px] font-bold text-[var(--success-text)]">
                <CheckCircle2 size={16} />
                Köat till {result.count} app{result.count === 1 ? "" : "ar"}
              </div>
            ) : null}
            {sendError ? (
              <div className="flex items-center gap-2 rounded-xl bg-[rgba(220,38,38,0.08)] px-4 py-3 text-[13px] font-bold text-[#dc2626]">
                <AlertCircle size={16} />
                {sendError}
              </div>
            ) : null}
          </div>
        </Surface>

        <Surface className="p-5">
          <p className="text-[16px] font-extrabold tracking-[-0.3px]">Förhandsvisning</p>
          <div className="mt-4 rounded-[18px] bg-[#111113] p-4">
            <div className="flex gap-3 rounded-[14px] bg-white/10 p-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--accent)] text-white">
                <BellRing size={18} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-extrabold text-white">{form.title || "ViaEats"}</p>
                <p className="mt-0.5 text-[12px] leading-[1.35] text-white/70">{form.body || "Din notis visas här."}</p>
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between rounded-xl bg-[var(--bg-panel-soft)] px-4 py-3">
            <span className="text-[12px] font-semibold text-[var(--text-secondary)]">Mottagare</span>
            <span className="text-[18px] font-black">{selected}</span>
          </div>
        </Surface>
      </div>

      <Surface className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-[var(--row-divider)] px-5 py-4">
          <p className="text-[15px] font-extrabold">Senaste utskick</p>
          {history.isFetching ? <Loader2 size={15} className="animate-spin text-[var(--text-muted)]" /> : null}
        </div>
        {(history.data?.logs || []).length === 0 ? (
          <p className="px-5 py-8 text-sm text-[var(--text-secondary)]">Inga utskick ännu.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tid</th>
                  <th>Rubrik</th>
                  <th>Mottagare</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(history.data?.logs || []).slice(0, 20).map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap text-[var(--text-secondary)]">{formatDateTime(row.createdAt)}</td>
                    <td>
                      <p className="font-bold">{row.title}</p>
                      <p className="max-w-[520px] truncate text-[12px] text-[var(--text-muted)]">{row.body}</p>
                    </td>
                    <td>{row.count}</td>
                    <td><Badge tone={row.success ? "success" : "danger"}>{row.success ? "Köad" : "Fel"}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>
    </div>
  );
}
