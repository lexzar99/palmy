"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Loader2, Send, Smartphone, XCircle } from "lucide-react";
import { getCities, zonesCitiesQueryKey } from "@/modules/zones/api";
import { getCustomers, customersQueryKey } from "@/modules/customers/api";
import { getRestaurantOverview, restaurantsQueryKey } from "@/modules/restaurants/api";
import { getSystemHealth, healthQueryKey } from "@/modules/dashboard/api";
import {
  cancelScheduledPush,
  COHORT_LABEL,
  type CohortKey,
  getPushHistory,
  getScheduledPushes,
  pushHistoryQueryKey,
  schedulePush,
  scheduledPushesQueryKey,
  sendPushBroadcast,
  sendPushToCity,
  sendPushToCohort,
  sendPushToUser,
  type PushLogRecord,
  type PushResult,
} from "@/modules/push/api";
import { Badge, Button, Field, Input, PageHeader, Select, Surface, Tabs, Textarea } from "@/shared/components/ui";
import { formatDateTime } from "@/shared/utils/format";

type TargetMode = "all" | "user" | "city" | "cohort";
type LinkType = "none" | "restaurant" | "discover" | "manual";

interface ComposerForm {
  title: string;
  body: string;
  linkType: LinkType;
  restaurantSlug: string;
  manualLink: string;
  userId: string;
  city: string;
  userSearch: string;
  cohort: CohortKey | "";
  scheduledFor: string; // YYYY-MM-DDTHH:MM (local), empty = send now
}

const EMPTY_FORM: ComposerForm = {
  title: "",
  body: "",
  linkType: "none",
  restaurantSlug: "",
  manualLink: "",
  userId: "",
  city: "",
  userSearch: "",
  cohort: "",
  scheduledFor: "",
};

const TEMPLATES = [
  { label: "Lunch", title: "Lunch live på FoodGo", body: "Öppna appen innan 13:30 för att se luncher och aktiva erbjudanden." },
  { label: "Comeback", title: "Nya erbjudanden väntar", body: "Kom tillbaka till FoodGo och kolla de senaste restaurangerbjudandena." },
  { label: "Ny restaurang", title: "En ny restaurang har öppnat", body: "En ny partner är live just nu. Öppna appen för att se menyn." },
];

function buildPushData(form: ComposerForm): Record<string, unknown> | undefined {
  if (form.linkType === "restaurant" && form.restaurantSlug) return { restaurantSlug: form.restaurantSlug };
  if (form.linkType === "discover") return { screen: "discover" };
  if (form.linkType === "manual" && form.manualLink) return { deeplink: form.manualLink };
  return undefined;
}

function linkPreviewLabel(form: ComposerForm): string {
  if (form.linkType === "restaurant" && form.restaurantSlug) return `Öppnar restaurang: ${form.restaurantSlug}`;
  if (form.linkType === "discover") return "Öppnar Utforska / Erbjudanden";
  if (form.linkType === "manual" && form.manualLink) return `Öppnar ${form.manualLink}`;
  return "";
}

function PhonePreview({ title, body, linkLabel }: { title: string; body: string; linkLabel: string }) {
  return (
    <div className="w-[260px] rounded-[26px] border border-[rgba(255,255,255,0.1)] bg-[#0b101b] p-3 shadow-[0_24px_60px_rgba(0,0,0,0.4)]">
      <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-white/15" />
      <div className="rounded-[20px] bg-[linear-gradient(180deg,#111827,#0b1220)] px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#f3bf57,#ffd77f)] text-[10px] font-black text-[#11151b]">M</div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/60">FoodGo</p>
            <p className="text-[9px] text-white/30">nu</p>
          </div>
        </div>
        <div className="mt-3 rounded-[16px] border border-white/8 bg-white/6 px-3 py-3">
          <p className="text-sm font-black text-white">{title || "Push-rubrik"}</p>
          <p className="mt-1.5 text-sm leading-5 text-white/70">{body || "Meddelandetext"}</p>
          {linkLabel ? <p className="mt-2 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--accent-strong)]">{linkLabel}</p> : null}
        </div>
      </div>
    </div>
  );
}

function targetLabel(target: PushLogRecord["target"]) {
  if (target === "all") return "Alla";
  if (target === "user") return "Användare";
  if (target === "cohort") return "Cohort";
  return "Stad";
}

export function PushPage() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<TargetMode>("all");
  const [form, setForm] = useState<ComposerForm>(EMPTY_FORM);
  const [result, setResult] = useState<PushResult | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const health = useQuery({ queryKey: healthQueryKey, queryFn: getSystemHealth, refetchInterval: 30_000 });
  const cities = useQuery({ queryKey: zonesCitiesQueryKey, queryFn: getCities });
  const customers = useQuery({ queryKey: customersQueryKey, queryFn: getCustomers });
  const restaurants = useQuery({ queryKey: restaurantsQueryKey, queryFn: getRestaurantOverview });
  const history = useQuery({ queryKey: pushHistoryQueryKey, queryFn: getPushHistory });

  const audience = health.data?.operations.userCount ?? 0;

  const filteredCustomers = useMemo(() => {
    const q = form.userSearch.trim().toLowerCase();
    if (!q) return (customers.data || []).slice(0, 8);
    return (customers.data || [])
      .filter((c) => `${c.name} ${c.phone || ""} ${c.email || ""}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [customers.data, form.userSearch]);

  const selectedCustomer = useMemo(
    () => (form.userId ? (customers.data || []).find((c) => c.id === form.userId) : null),
    [customers.data, form.userId]
  );

  const onSuccess = async (r: PushResult) => {
    setResult(r);
    setSendError(null);
    await queryClient.invalidateQueries({ queryKey: pushHistoryQueryKey });
  };
  const onError = (e: any) => setSendError(e?.response?.data?.error || "Kunde inte skicka");

  const broadcastMutation = useMutation({ mutationFn: sendPushBroadcast, onSuccess, onError });
  const userMutation = useMutation({ mutationFn: sendPushToUser, onSuccess, onError });
  const cityMutation = useMutation({ mutationFn: sendPushToCity, onSuccess, onError });
  const cohortMutation = useMutation({
    mutationFn: sendPushToCohort,
    onSuccess: async (r) => {
      // Adapt cohort response to PushResult shape so the existing result panel works.
      setResult({ success: r.errors === 0, count: r.count, errors: r.errors });
      setSendError(null);
      await queryClient.invalidateQueries({ queryKey: pushHistoryQueryKey });
    },
    onError,
  });
  const scheduleMutation = useMutation({
    mutationFn: schedulePush,
    onSuccess: async () => {
      setResult({ success: true, count: 0 });
      setSendError(null);
      await queryClient.invalidateQueries({ queryKey: scheduledPushesQueryKey });
    },
    onError,
  });

  const isPending = broadcastMutation.isPending || userMutation.isPending || cityMutation.isPending || cohortMutation.isPending || scheduleMutation.isPending;

  const canSend =
    form.title.trim() &&
    form.body.trim() &&
    (
      mode === "all" ||
      (mode === "user" && form.userId) ||
      (mode === "city" && form.city) ||
      (mode === "cohort" && form.cohort)
    ) &&
    (form.linkType !== "restaurant" || form.restaurantSlug) &&
    (form.linkType !== "manual" || form.manualLink.trim());

  const handleSend = () => {
    setResult(null);
    setSendError(null);
    const data = buildPushData(form);
    const base = { title: form.title, body: form.body, ...(data ? { data } : {}) };

    // Scheduled path: same composer, dispatched later by the dispatcher.
    if (form.scheduledFor) {
      const payload: any = { scheduledFor: new Date(form.scheduledFor).toISOString(), target: mode, ...base };
      if (mode === "user") payload.identifier = form.userId;
      if (mode === "city") payload.city = form.city;
      if (mode === "cohort") payload.cohort = form.cohort;
      scheduleMutation.mutate(payload);
      return;
    }

    if (mode === "all") broadcastMutation.mutate(base);
    else if (mode === "user") userMutation.mutate({ ...base, identifier: form.userId });
    else if (mode === "city") cityMutation.mutate({ ...base, city: form.city });
    else if (mode === "cohort" && form.cohort) cohortMutation.mutate({ ...base, cohort: form.cohort });
  };

  const handleModeChange = (next: TargetMode) => {
    setMode(next);
    setResult(null);
    setSendError(null);
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="Push-notiser"
        actions={
          <>
            <Badge tone="info"><Smartphone size={12} /> APNs</Badge>
            <Badge tone="success">{audience} användare</Badge>
          </>
        }
      />

      <Surface className="px-6 py-6">
        <Tabs
          value={mode}
          onChange={handleModeChange}
          options={[
            { value: "all", label: `Alla användare (${audience})` },
            { value: "user", label: "En användare" },
            { value: "city", label: "Stad" },
            { value: "cohort", label: "Cohort" },
          ]}
        />

        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_280px]">
          <div className="space-y-5">
            {/* Target selector */}
            {mode === "user" && (
              <div className="space-y-3">
                <Field label="Sök användare">
                  <Input
                    value={form.userSearch}
                    onChange={(e) => setForm((s) => ({ ...s, userSearch: e.target.value, userId: "" }))}
                    placeholder="Namn, telefon eller e-post"
                  />
                </Field>
                {selectedCustomer ? (
                  <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[rgba(48,199,143,0.06)] px-4 py-3 text-sm">
                    <div>
                      <p className="font-black">{selectedCustomer.name}</p>
                      <p className="text-[var(--text-secondary)]">{selectedCustomer.phone || selectedCustomer.email || "—"}</p>
                    </div>
                    <Button variant="secondary" onClick={() => setForm((s) => ({ ...s, userId: "", userSearch: "" }))}>
                      <XCircle size={14} /> Ändra
                    </Button>
                  </div>
                ) : (
                  form.userSearch.trim() && (
                    <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
                      {filteredCustomers.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-[var(--text-secondary)]">Inga användare hittades</p>
                      ) : (
                        filteredCustomers.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-[rgba(255,255,255,0.04)] border-b border-[var(--border-subtle)] last:border-0"
                            onClick={() => setForm((s) => ({ ...s, userId: c.id, userSearch: c.name }))}
                          >
                            <div>
                              <p className="font-black">{c.name}</p>
                              <p className="text-[var(--text-secondary)]">{c.phone || c.email || "—"}</p>
                            </div>
                            <p className="text-[var(--text-muted)]">{c._count?.orders ?? 0} orders</p>
                          </button>
                        ))
                      )}
                    </div>
                  )
                )}
              </div>
            )}

            {mode === "city" && (
              <Field label="Stad">
                <Select value={form.city} onChange={(e) => setForm((s) => ({ ...s, city: e.target.value }))}>
                  <option value="">Välj stad…</option>
                  {(cities.data || []).map((city) => (
                    <option key={city.id} value={city.name}>{city.name}</option>
                  ))}
                </Select>
              </Field>
            )}

            {mode === "cohort" && (
              <Field label="Cohort">
                <Select value={form.cohort} onChange={(e) => setForm((s) => ({ ...s, cohort: e.target.value as CohortKey | "" }))}>
                  <option value="">Välj cohort…</option>
                  <option value="inactive_30d">{COHORT_LABEL.inactive_30d}</option>
                  <option value="new_users_7d">{COHORT_LABEL.new_users_7d}</option>
                  <option value="active_repeaters">{COHORT_LABEL.active_repeaters}</option>
                </Select>
              </Field>
            )}

            {/* Templates */}
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((t) => (
                <Button key={t.label} variant="secondary" onClick={() => setForm((s) => ({ ...s, title: t.title, body: t.body }))}>
                  {t.label}
                </Button>
              ))}
            </div>

            {/* Message */}
            <Field label="Rubrik">
              <Input value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} placeholder="Rubrik (syns på låsskärmen)" />
            </Field>
            <Field label="Meddelande">
              <Textarea value={form.body} onChange={(e) => setForm((s) => ({ ...s, body: e.target.value }))} placeholder="Meddelandetext" />
            </Field>

            {/* Deep link */}
            <div className="space-y-3 rounded-xl border border-[var(--border-subtle)] px-4 py-4">
              <Field label="Länka till (valfri)">
                <Select value={form.linkType} onChange={(e) => setForm((s) => ({ ...s, linkType: e.target.value as LinkType, restaurantSlug: "", manualLink: "" }))}>
                  <option value="none">Ingen länk</option>
                  <option value="restaurant">Restaurang</option>
                  <option value="discover">Utforska / Erbjudanden</option>
                  <option value="manual">Manuell</option>
                </Select>
              </Field>
              {form.linkType === "restaurant" && (
                <Field label="Välj restaurang">
                  <Select value={form.restaurantSlug} onChange={(e) => setForm((s) => ({ ...s, restaurantSlug: e.target.value }))}>
                    <option value="">Välj restaurang…</option>
                    {(restaurants.data || []).map((r) => (
                      <option key={r.id} value={r.slug}>{r.name}{r.city ? ` (${r.city})` : ""}</option>
                    ))}
                  </Select>
                </Field>
              )}
              {form.linkType === "manual" && (
                <Field label="Sökväg">
                  <Input value={form.manualLink} onChange={(e) => setForm((s) => ({ ...s, manualLink: e.target.value }))} placeholder="/min-sida" />
                </Field>
              )}
            </div>

            {/* Result / error */}
            {result && (
              <div className="rounded-2xl border border-[rgba(48,199,143,0.25)] bg-[rgba(48,199,143,0.08)] px-4 py-4">
                <div className="flex items-center gap-2 text-sm font-black text-[#c4ffeb]">
                  <CheckCircle2 size={16} />
                  Skickat till {result.count} enhet{result.count !== 1 ? "er" : ""}
                  {result.errors && result.errors > 0 ? ` (${result.errors} fel)` : ""}
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

            {/* A13 — optional schedule. Empty = send now. */}
            <Field label="Schemalägg (valfritt — tomt = skicka nu)">
              <Input
                type="datetime-local"
                value={form.scheduledFor}
                onChange={(e) => setForm((s) => ({ ...s, scheduledFor: e.target.value }))}
              />
            </Field>

            <div>
              <Button variant="primary" onClick={handleSend} disabled={isPending || !canSend}>
                {isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                {isPending ? "Skickar…" : form.scheduledFor ? "Schemalägg push" : "Skicka push"}
              </Button>
            </div>
          </div>

          {/* Phone preview */}
          <div className="flex flex-col items-center gap-4 pt-1">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Förhandsvisning</p>
            <PhonePreview title={form.title} body={form.body} linkLabel={linkPreviewLabel(form)} />
          </div>
        </div>
      </Surface>

      <ScheduledPushList />

      {/* History */}
      <Surface className="px-6 py-6">
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Skickade notiser</p>
        {history.isLoading ? (
          <p className="mt-4 text-sm text-[var(--text-secondary)]">Laddar historik…</p>
        ) : !history.data?.logs.length ? (
          <p className="mt-4 text-sm text-[var(--text-secondary)]">Inga skickade notiser än.</p>
        ) : (
          <div className="mt-4 table-shell">
            <table className="data-table">
              <thead>
                <tr><th>Tid</th><th>Målgrupp</th><th>Mottagare</th><th>Rubrik</th><th>Enheter</th><th>Status</th></tr>
              </thead>
              <tbody>
                {history.data.logs.map((log) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap text-sm">{formatDateTime(log.createdAt)}</td>
                    <td>
                      <Badge tone={log.target === "all" ? "info" : log.target === "user" ? "success" : "warning"}>
                        {targetLabel(log.target)}
                      </Badge>
                    </td>
                    <td className="text-sm text-[var(--text-secondary)]">
                      {log.target === "user" ? (log.identifier || "—") : log.target === "city" ? (log.city || "—") : "Alla"}
                    </td>
                    <td className="max-w-[200px] truncate text-sm">{log.title}</td>
                    <td className="font-black">{log.count}</td>
                    <td>
                      {log.success
                        ? <Badge tone="success"><CheckCircle2 size={11} /> OK</Badge>
                        : <Badge tone="danger"><AlertCircle size={11} /> Fel</Badge>}
                    </td>
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

// A13 — list of scheduled pushes (upcoming + recently dispatched)
function ScheduledPushList() {
  const queryClient = useQueryClient();
  const scheduled = useQuery({ queryKey: scheduledPushesQueryKey, queryFn: getScheduledPushes, refetchInterval: 30_000 });
  const cancelMut = useMutation({
    mutationFn: cancelScheduledPush,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: scheduledPushesQueryKey });
    },
  });
  const rows = scheduled.data?.rows ?? [];
  if (rows.length === 0) return null;
  return (
    <Surface className="px-6 py-6">
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Schemalagda pushar</p>
      <div className="mt-4 table-shell">
        <table className="data-table">
          <thead>
            <tr><th>Schemalagd</th><th>Mål</th><th>Rubrik</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const targetText =
                row.target === "user" ? `Användare · ${row.identifier ?? "—"}` :
                row.target === "city" ? `Stad · ${row.city ?? "—"}` :
                row.target === "cohort" ? `Cohort · ${row.cohort ?? "—"}` :
                "Alla";
              const status = row.cancelledAt
                ? { tone: "neutral" as const, label: "Avbokad" }
                : row.sentAt
                  ? row.sentSuccess
                    ? { tone: "success" as const, label: `Skickad · ${row.sentCount ?? 0}` }
                    : { tone: "danger" as const, label: `Fel · ${row.sentError?.slice(0, 40) || ""}` }
                  : { tone: "info" as const, label: "Väntar" };
              const canCancel = !row.cancelledAt && !row.sentAt;
              return (
                <tr key={row.id}>
                  <td className="whitespace-nowrap text-sm">{formatDateTime(row.scheduledFor)}</td>
                  <td className="text-sm">{targetText}</td>
                  <td className="max-w-[280px] truncate text-sm">{row.title}</td>
                  <td><Badge tone={status.tone}>{status.label}</Badge></td>
                  <td className="text-right">
                    {canCancel && (
                      <Button variant="secondary" onClick={() => { if (window.confirm("Avboka schemalagd push?")) cancelMut.mutate(row.id); }} disabled={cancelMut.isPending}>
                        Avboka
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Surface>
  );
}
