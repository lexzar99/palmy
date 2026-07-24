"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Loader2, Send, XCircle } from "lucide-react";
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
import { Badge, Button, Field, Input, PageHeader, Select, Surface, Tabs, Textarea, Toggle } from "@/shared/components/ui";
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
  { label: "Lunch", title: "Lunch live på ViaEats", body: "Öppna appen innan 13:30 för att se luncher och aktiva erbjudanden." },
  { label: "Comeback", title: "Nya erbjudanden väntar", body: "Kom tillbaka till ViaEats och kolla de senaste restaurangerbjudandena." },
  { label: "Ny restaurang", title: "En ny restaurang har öppnat", body: "En ny partner är live just nu. Öppna appen för att se menyn." },
];

// Default value for the schedule input when the toggle is switched on (local one hour ahead).
function defaultScheduleValue(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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
    <div className="rounded-[14px] bg-[#111113] p-4">
      <div className="flex gap-2.5 rounded-[11px] bg-white/10 p-3">
        <span className="mt-0.5 h-[30px] w-[30px] shrink-0 rounded-[7px] bg-[var(--accent)]" />
        <div className="min-w-0">
          <p className="text-[12.5px] font-bold text-white">{title || "Push-rubrik"}</p>
          <p className="mt-0.5 text-[11.5px] leading-[1.35] text-white/70">{body || "Meddelandetext"}</p>
          {linkLabel ? (
            <p className="mt-1.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--accent)]">{linkLabel}</p>
          ) : null}
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
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<TargetMode>("all");
  // Förifyllning från t.ex. deal-formulärets "Skicka push": ?title=&body=&restaurant=<slug>
  const [form, setForm] = useState<ComposerForm>(() => {
    const title = searchParams.get("title") ?? "";
    const body = searchParams.get("body") ?? "";
    const restaurantSlug = searchParams.get("restaurant") ?? "";
    if (!title && !body && !restaurantSlug) return EMPTY_FORM;
    return {
      ...EMPTY_FORM,
      title,
      body,
      linkType: restaurantSlug ? "restaurant" : "none",
      restaurantSlug,
    };
  });
  const [result, setResult] = useState<PushResult | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const HISTORY_PAGE = 20;
  const [historyVisible, setHistoryVisible] = useState(HISTORY_PAGE);

  const health = useQuery({ queryKey: healthQueryKey, queryFn: getSystemHealth, refetchInterval: 60_000 });
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
      setResult({ success: r.errors === 0, count: r.count, errors: r.errors, queued: true });
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
        breadcrumb="Tillväxt"
        title="Push-notiser"
        actions={
          <>
            <span className="hidden items-center gap-2 text-[12px] font-semibold text-[var(--text-secondary)] sm:flex">
              <span className="h-2 w-2 rounded-full bg-[var(--success)]" /> Push-tjänst ansluten
            </span>
            <Button variant="primary" onClick={handleSend} disabled={isPending || !canSend}>
              {isPending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {isPending ? "Skickar…" : form.scheduledFor ? "Schemalägg" : "Skicka"}
            </Button>
          </>
        }
      />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.85fr)]">
        {/* Compose card */}
        <Surface className="overflow-hidden p-0">
          <div className="px-6 pb-5 pt-6">
            <p className="text-[17px] font-extrabold tracking-[-0.4px]">Skapa utskick</p>
            <p className="mt-1 text-[13px] text-[var(--text-secondary)]">Skriv ett kort meddelande och välj vilka som ska få det.</p>
          </div>

          <div className="border-y border-[var(--row-divider)] bg-[var(--bg-panel-soft)] px-6 py-3.5">
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
          </div>

          <div className="space-y-6 px-6 py-6">
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
                  <div className="flex items-center justify-between rounded-xl border border-[var(--border-subtle)] bg-[var(--accent-soft)] px-4 py-3 text-sm">
                    <div>
                      <p className="font-bold">{selectedCustomer.name}</p>
                      <p className="text-[var(--text-secondary)]">{selectedCustomer.phone || selectedCustomer.email || "saknas"}</p>
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
                            className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-[var(--bg-hover)] border-b border-[var(--border-subtle)] last:border-0"
                            onClick={() => setForm((s) => ({ ...s, userId: c.id, userSearch: c.name }))}
                          >
                            <div>
                              <p className="font-bold">{c.name}</p>
                              <p className="text-[var(--text-secondary)]">{c.phone || c.email || "saknas"}</p>
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
            <div>
              <p className="eyebrow mb-2">Snabbstarter</p>
              <div className="flex flex-wrap gap-2">
                {TEMPLATES.map((t) => (
                  <Button key={t.label} variant="secondary" className="h-9 min-h-9 px-3 text-[12px]" onClick={() => setForm((s) => ({ ...s, title: t.title, body: t.body }))}>
                    {t.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Message */}
            <Field label="Rubrik">
              <Input value={form.title} onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))} placeholder="Rubrik (syns på låsskärmen)" />
            </Field>
            <Field label="Meddelande">
              <Textarea value={form.body} onChange={(e) => setForm((s) => ({ ...s, body: e.target.value }))} placeholder="Meddelandetext" />
            </Field>

            {/* Deep link */}
            <div className="space-y-4 border-t border-[var(--row-divider)] pt-5">
              <div>
                <p className="eyebrow mb-1">Åtgärd efter tryck</p>
                <p className="text-[12px] text-[var(--text-secondary)]">Länka till en relevant sida i appen (valfritt).</p>
              </div>
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
              <div className="rounded-xl border border-[color-mix(in_srgb,var(--success)_24%,transparent)] bg-[var(--success-soft)] px-4 py-3.5">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--success-text)]">
                  <CheckCircle2 size={16} />
                  {result.queued ? "Köat för" : "Skickat till"} {result.count} mottagare
                  {result.errors && result.errors > 0 ? ` (${result.errors} fel)` : ""}
                </div>
              </div>
            )}
            {sendError && (
              <div className="rounded-xl border border-[color-mix(in_srgb,var(--danger,#dc2626)_24%,transparent)] bg-[rgba(220,38,38,0.08)] px-4 py-3.5">
                <div className="flex items-center gap-2 text-[13px] font-semibold text-[#dc2626]">
                  <AlertCircle size={16} /> {sendError}
                </div>
              </div>
            )}

            {/* A13 — optional schedule. Off = send now. */}
            <div className="border-t border-[var(--row-divider)] pt-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[13px] font-semibold text-[var(--text-primary)]">Schemalägg</p>
                  <p className="mt-0.5 text-[12px] text-[var(--text-secondary)]">Av = skicka nu. På = välj tidpunkt.</p>
                </div>
                <Toggle
                  checked={!!form.scheduledFor}
                  onChange={(v) => setForm((s) => ({ ...s, scheduledFor: v ? defaultScheduleValue() : "" }))}
                />
              </div>
              {form.scheduledFor && (
                <div className="mt-4">
                  <Field label="Tidpunkt">
                    <Input
                      type="datetime-local"
                      value={form.scheduledFor}
                      onChange={(e) => setForm((s) => ({ ...s, scheduledFor: e.target.value }))}
                    />
                  </Field>
                </div>
              )}
            </div>

          </div>
        </Surface>

        {/* Preview + recent */}
        <div className="flex flex-col gap-5 lg:sticky lg:top-5">
          <Surface className="overflow-hidden p-0">
            <div className="border-b border-[var(--row-divider)] px-5 py-4">
              <p className="text-[14px] font-extrabold">Förhandsvisning</p>
              <p className="mt-1 text-[12px] text-[var(--text-secondary)]">Så här ser notisen ut på mottagarens enhet.</p>
            </div>
            <div className="p-5">
              <PhonePreview title={form.title} body={form.body} linkLabel={linkPreviewLabel(form)} />
              <div className="mt-4 flex items-center justify-between border-t border-[var(--row-divider)] pt-4 text-[12px]">
                <span className="text-[var(--text-secondary)]">Beräknad räckvidd</span>
                <strong className="text-[var(--text-primary)]">{audience} enheter</strong>
              </div>
            </div>
          </Surface>

          <Surface className="px-5 py-5">
            <div className="flex items-center justify-between">
              <p className="text-[14px] font-extrabold">Senaste utskick</p>
              <span className="text-[11px] font-semibold text-[var(--text-muted)]">Senaste 4</span>
            </div>
            {history.isLoading ? (
              <p className="mt-3 text-[12.5px] text-[var(--text-secondary)]">Laddar…</p>
            ) : !history.data?.logs.length ? (
              <p className="mt-3 text-[12.5px] text-[var(--text-secondary)]">Inga skickade notiser än.</p>
            ) : (
              <div className="mt-2">
                {history.data.logs.slice(0, 4).map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between gap-3 border-b border-[var(--row-divider)] py-2.5 last:border-0"
                  >
                    <span className="min-w-0 truncate text-[12.5px] font-semibold text-[var(--text-primary)]">{log.title}</span>
                    <span className="shrink-0 text-[12px] text-[var(--text-muted)]">
                      {log.count} · {targetLabel(log.target)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Surface>
        </div>
      </div>

      <ScheduledPushList />

      <PushDeliveryHealth history={history.data} />

      {/* History */}
      <Surface className="px-6 py-6">
        <p className="text-[15px] font-extrabold tracking-[-0.3px]">Pushutskick</p>
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
                {history.data.logs.slice(0, historyVisible).map((log) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap text-sm">{formatDateTime(log.createdAt)}</td>
                    <td>
                      <Badge tone={log.target === "all" ? "info" : log.target === "user" ? "success" : "warning"}>
                        {targetLabel(log.target)}
                      </Badge>
                    </td>
                    <td className="text-sm text-[var(--text-secondary)]">
                      {log.target === "user" ? (log.identifier || "saknas") : log.target === "city" ? (log.city || "saknas") : "Alla"}
                    </td>
                    <td className="max-w-[200px] truncate text-sm">{log.title}</td>
                    <td className="font-bold">{log.count}</td>
                    <td>
                      {log.success
                        ? <Badge tone="success"><CheckCircle2 size={11} /> Köad</Badge>
                        : <Badge tone="danger"><AlertCircle size={11} /> Fel</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {history.data.logs.length > historyVisible && (
              <div className="flex justify-center py-3">
                <Button variant="secondary" onClick={() => setHistoryVisible((v) => v + HISTORY_PAGE)}>
                  Visa fler ({history.data.logs.length - historyVisible} kvar)
                </Button>
              </div>
            )}
          </div>
        )}
      </Surface>
    </div>
  );
}

function PushDeliveryHealth({ history }: { history: Awaited<ReturnType<typeof getPushHistory>> | undefined }) {
  if (!history?.deliveryMetrics) return null;
  const deliveryCount = (status: string) => history.deliveryMetrics.deliveries
    .filter((row) => row.status === status)
    .reduce((sum, row) => sum + row.count, 0);
  const outboxCount = (statuses: string[]) => history.deliveryMetrics.outbox
    .filter((row) => statuses.includes(row.status))
    .reduce((sum, row) => sum + row.count, 0);
  const cards = [
    { label: "Provider-godkända", value: deliveryCount("ACCEPTED"), tone: "text-[var(--success-text)]" },
    { label: "Köade / retry", value: outboxCount(["PENDING", "PROCESSING", "RETRY"]), tone: "text-[var(--warning-text)]" },
    { label: "Ogiltiga enheter", value: deliveryCount("INVALID"), tone: "text-[var(--danger,#dc2626)]" },
    { label: "Döda jobb", value: outboxCount(["DEAD"]), tone: "text-[var(--danger,#dc2626)]" },
  ];
  return (
    <Surface className="px-6 py-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[15px] font-extrabold tracking-[-0.3px]">Leveranshälsa · senaste 24 h</p>
          <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
            Godkänd betyder att Apple, Google, Expo eller browser-gatewayn tog emot notisen — inte att kunden har sett den.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-muted)]">{card.label}</p>
            <p className={`mt-1 text-2xl font-extrabold ${card.tone}`}>{card.value}</p>
          </div>
        ))}
      </div>
    </Surface>
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
      <p className="text-[15px] font-extrabold tracking-[-0.3px]">Schemalagda pushar</p>
      <div className="mt-4 table-shell">
        <table className="data-table">
          <thead>
            <tr><th>Schemalagd</th><th>Mål</th><th>Rubrik</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const targetText =
                row.target === "user" ? `Användare · ${row.identifier ?? "saknas"}` :
                row.target === "city" ? `Stad · ${row.city ?? "saknas"}` :
                row.target === "cohort" ? `Cohort · ${row.cohort ?? "saknas"}` :
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
