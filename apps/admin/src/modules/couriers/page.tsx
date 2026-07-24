"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bike, Car, ChevronRight, Loader2, Plus, RefreshCw } from "lucide-react";
import {
  applicationsQueryKey,
  approveApplication,
  couriersQueryKey,
  createCourier,
  getApplications,
  getCouriers,
  rejectApplication,
  revokeCourier,
  updateCourier,
  type CourierApplication,
} from "@/modules/couriers/api";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, MetricCard, Modal, PageHeader, Select, Surface } from "@/shared/components/ui";
import { LiveMap } from "@/shared/components/live-map";
import { formatCurrency, formatDate, formatDateTime } from "@/shared/utils/format";

type Tab = "couriers" | "applications" | "rates";

const VehiclePill = ({ v }: { v: "BIKE" | "EBIKE" | "CAR" }) => (
  <Badge tone="neutral">
    {v === "CAR" ? <Car size={12} style={{ marginRight: 4, display: "inline" }} /> : <Bike size={12} style={{ marginRight: 4, display: "inline" }} />}
    {v === "CAR" ? "Bil" : v === "EBIKE" ? "Elcykel" : "Cykel"}
  </Badge>
);

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";

type CourierFilter = "all" | "online" | "offline" | "inactive";

const COURIER_FILTERS: { value: CourierFilter; label: string }[] = [
  { value: "all", label: "Alla" },
  { value: "online", label: "Online" },
  { value: "offline", label: "Offline" },
  { value: "inactive", label: "Inaktiva" },
];

// ----------------------------------------------------------- create modal
function CreateCourierModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: "", email: "", password: "", phone: "", city: "Lund", vehicle: "BIKE", personalNumber: "", address: "", payoutAccount: "", ratePerKm: 15 });
  const [err, setErr] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) {
      setF({ name: "", email: "", password: "", phone: "", city: "Lund", vehicle: "BIKE", personalNumber: "", address: "", payoutAccount: "", ratePerKm: 15 });
      setErr(null);
    }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const save = useMutation({
    mutationFn: () => createCourier({ ...f, vehicle: f.vehicle as "BIKE" | "EBIKE" | "CAR" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["couriers"] });
      onClose();
    },
    onError: (e: any) => setErr(e?.message || "Kunde inte skapa kurir"),
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Lägg till kurir"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Avbryt</Button>
          <Button variant="primary" onClick={() => save.mutate()}>{save.isPending ? <Loader2 size={16} className="animate-spin" /> : "Skapa konto"}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        {err && <p className="text-sm font-medium text-rose-500">{err}</p>}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Namn"><Input value={f.name} onChange={set("name")} /></Field>
          <Field label="Telefon"><Input value={f.phone} onChange={set("phone")} /></Field>
          <Field label="E-post (inloggning)"><Input type="email" value={f.email} onChange={set("email")} /></Field>
          <Field label="Lösenord"><Input value={f.password} onChange={set("password")} /></Field>
          <Field label="Stad"><Input value={f.city} onChange={set("city")} /></Field>
          <Field label="Fordon"><Select value={f.vehicle} onChange={set("vehicle")}><option value="BIKE">Cykel</option><option value="EBIKE">Elcykel</option><option value="CAR">Bil</option></Select></Field>
          <Field label="Personnummer"><Input value={f.personalNumber} onChange={set("personalNumber")} /></Field>
          <Field label="km-ersättning (kr/km)"><Input type="number" value={f.ratePerKm} onChange={(e) => setF((p) => ({ ...p, ratePerKm: Number(e.target.value) }))} /></Field>
          <div className="md:col-span-2"><Field label="Adress"><Input value={f.address} onChange={set("address")} /></Field></div>
          <div className="md:col-span-2"><Field label="Utbetalningskonto (bank / IBAN / Swish)"><Input value={f.payoutAccount} onChange={set("payoutAccount")} /></Field></div>
        </div>
        <p className="text-xs text-[var(--text-muted)]">Personnummer + utbetalningskonto är känsliga och visas bara för super-admin.</p>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------- approve modal
function ApproveModal({ app, open, onClose }: { app: CourierApplication | null; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (open) { setPassword(""); setErr(null); }
  }, [open]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const approve = useMutation({
    mutationFn: () => approveApplication(app!.id, password),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["couriers"] });
      onClose();
    },
    onError: (e: any) => setErr(e?.message || "Kunde inte godkänna"),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={app ? `Skapa konto åt ${app.name}` : "Skapa konto"}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Avbryt</Button>
          <Button variant="primary" onClick={() => approve.mutate()}>{approve.isPending ? <Loader2 size={16} className="animate-spin" /> : "Skapa konto"}</Button>
        </div>
      }
    >
      {app && (
        <div className="space-y-4">
          {err && <p className="text-sm font-medium text-rose-500">{err}</p>}
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Namn"><Input value={app.name} disabled /></Field>
            <Field label="E-post"><Input value={app.email} disabled /></Field>
            <Field label="Telefon"><Input value={app.phone || "—"} disabled /></Field>
            <Field label="Fordon"><Input value={app.vehicle === "CAR" ? "Bil" : "Cykel"} disabled /></Field>
          </div>
          <Field label="Sätt lösenord (minst 6 tecken)"><Input value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ page
export function CouriersPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("couriers");
  const [createOpen, setCreateOpen] = useState(false);
  const [approveApp, setApproveApp] = useState<CourierApplication | null>(null);
  const [courierFilter, setCourierFilter] = useState<CourierFilter>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const couriers = useQuery({ queryKey: couriersQueryKey, queryFn: getCouriers });
  const applications = useQuery({ queryKey: applicationsQueryKey, queryFn: getApplications });

  const revoke = useMutation({ mutationFn: (id: string) => revokeCourier(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["couriers"] }) });
  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateCourier(id, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["couriers"] }),
  });
  const reject = useMutation({ mutationFn: (id: string) => rejectApplication(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["couriers"] }) });

  const pendingCount = (applications.data || []).filter((a) => a.status === "PENDING").length;
  const rows = couriers.data || [];
  const onlineCount = rows.filter((c) => c.online).length;
  const activeSum = rows.reduce((s, c) => s + (c.activeDeliveries || 0), 0);
  const deliveredSum = rows.reduce((s, c) => s + c.todayDeliveries, 0);
  const todaySum = rows.reduce((s, c) => s + c.todayEarnings, 0);
  const cities = [...new Set(rows.map((c) => c.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, "sv"));
  // Filter: status-chip + stad + fritext (namn/e-post/telefon), sedan sortering:
  // online först, därefter flest aktiva leveranser, sist namn.
  const term = search.trim().toLowerCase();
  const visibleRows = rows
    .filter((c) =>
      courierFilter === "online" ? c.online : courierFilter === "offline" ? !c.online : courierFilter === "inactive" ? !c.isActive : true,
    )
    .filter((c) => cityFilter === "all" || c.city === cityFilter)
    .filter((c) => !term || [c.name, c.email, c.phone || ""].some((v) => v.toLowerCase().includes(term)))
    .sort(
      (a, b) =>
        Number(b.online) - Number(a.online) ||
        (b.activeDeliveries || 0) - (a.activeDeliveries || 0) ||
        a.name.localeCompare(b.name, "sv"),
    );
  // Karta: bara online-kurirer med position (LiveMap saknar grå ton för offline).
  const liveMarkers = rows
    .filter((c) => c.online && c.currentLat != null && c.currentLng != null)
    .map((c) => ({
      id: c.id,
      label: c.name,
      subtitle: `${c.activeDeliveries || 0} aktiva${c.lastSeenAt ? ` · senast sedd ${formatDateTime(c.lastSeenAt)}` : ""}`,
      lat: c.currentLat,
      lng: c.currentLng,
      tone: "courier" as const,
    }));

  const TABS: { id: Tab; label: string }[] = [
    { id: "couriers", label: "Kurirer" },
    { id: "applications", label: `Ansökningar${pendingCount ? ` (${pendingCount})` : ""}` },
    { id: "rates", label: "Ersättning & regler" },
  ];

  return (
    <div className="page-stack">
      <PageHeader
        breadcrumb="Drift"
        title="Kurirer"
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={() => { void couriers.refetch(); void applications.refetch(); }}><RefreshCw size={14} /></Button>
            <Button variant="primary" onClick={() => setCreateOpen(true)}><Plus size={15} /> Lägg till kurir</Button>
          </div>
        }
      />

      <Surface className="px-5 py-4">
        <div className="flex gap-2">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`rounded-lg px-4 py-2 text-sm font-bold transition ${tab === t.id ? "bg-[var(--brand-navy)] text-[var(--brand-cream)]" : "border border-[var(--border-subtle)] text-[var(--text-secondary)]"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </Surface>

      {tab === "couriers" && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard label="Online nu" value={String(onlineCount)} detail={`av ${rows.length} kurirer`} />
            <MetricCard label="Aktiva leveranser" value={String(activeSum)} />
            <MetricCard label="Levererade idag" value={String(deliveredSum)} />
            <MetricCard label="Utbetalt idag" value={formatCurrency(todaySum)} />
          </div>
          {liveMarkers.length > 0 && (
            <Surface className="p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-black text-[var(--text-primary)]">Livekarta</p>
                  <p className="text-xs font-semibold text-[var(--text-muted)]">{liveMarkers.length} online-kurirer med position</p>
                </div>
              </div>
              <LiveMap markers={liveMarkers} height={320} onMarkerClick={(marker) => router.push(`/couriers/${marker.id}`)} />
            </Surface>
          )}
          {/* Sök + filter: samma pill-stil som periodväljaren på detaljsidan. */}
          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök namn, e-post eller telefon…"
              className="w-full max-w-[280px]"
            />
            <div className="inline-flex rounded-full border border-[var(--border-subtle)] p-1">
              {COURIER_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setCourierFilter(f.value)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                    courierFilter === f.value
                      ? "bg-[var(--text-primary)] text-[var(--bg-primary)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {cities.length > 1 && (
              <div className="inline-flex rounded-full border border-[var(--border-subtle)] p-1">
                {["all", ...cities].map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => setCityFilter(city)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                      cityFilter === city
                        ? "bg-[var(--text-primary)] text-[var(--bg-primary)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {city === "all" ? "Alla städer" : city}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Surface className="overflow-hidden p-0">
            {couriers.isLoading ? (
              <div className="flex items-center gap-2 px-6 py-6 text-sm text-[var(--text-secondary)]"><Loader2 size={16} className="animate-spin" /> Laddar…</div>
            ) : couriers.isError ? (
              <div className="px-6 py-6"><ErrorPanel title="Kunde inte ladda kurirer" action={<Button onClick={() => void couriers.refetch()}>Försök igen</Button>} /></div>
            ) : rows.length === 0 ? (
              <div className="px-6 py-6"><EmptyState title="Inga kurirer än" /></div>
            ) : visibleRows.length === 0 ? (
              <div className="px-6 py-6"><EmptyState title="Inga kurirer matchar filtret" /></div>
            ) : (
              <div className="table-shell">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Kurir</th>
                      <th>Status</th>
                      <th>Aktiv order</th>
                      <th>Idag</th>
                      <th>Betyg</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((c) => (
                      <tr key={c.id} style={{ opacity: c.isActive ? 1 : 0.5 }}>
                        <td>
                          <div className="flex items-center gap-[11px]">
                            <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#111113] text-[12px] font-extrabold text-white">
                              {initials(c.name)}
                            </span>
                            <span className="font-bold text-[var(--text-primary)]">{c.name}</span>
                          </div>
                        </td>
                        <td>
                          {c.online ? (
                            <span className="inline-flex items-center gap-[5px] text-[11px] font-extrabold text-[var(--success-text)]">
                              <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
                              {c.activeDeliveries > 0 ? "Levererar" : "Ledig"}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-[5px] text-[11px] font-extrabold text-[var(--warning)]">
                              <span className="h-1.5 w-1.5 rounded-full bg-[var(--warning)]" />
                              {c.lastSeenAt ? `Senast sedd ${formatDateTime(c.lastSeenAt)}` : "Offline"}
                            </span>
                          )}
                        </td>
                        <td>
                          {c.activeDeliveries > 0 ? (
                            <Badge tone="info">{c.activeDeliveries} aktiva</Badge>
                          ) : (
                            <span className="text-[var(--text-muted)]" style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12 }}>–</span>
                          )}
                        </td>
                        <td className="tabular-nums">{c.todayDeliveries}</td>
                        <td className="font-bold text-[var(--text-muted)]">–</td>
                        <td>
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="secondary" onClick={() => toggleActive.mutate({ id: c.id, isActive: !c.isActive })}>{c.isActive ? "Inaktivera" : "Aktivera"}</Button>
                            <Button variant="danger" onClick={() => { if (confirm(`Logga ut ${c.name} från alla enheter?`)) revoke.mutate(c.id); }}>Logga ut</Button>
                            <button
                              type="button"
                              aria-label={`Öppna ${c.name}`}
                              onClick={() => router.push(`/couriers/${c.id}`)}
                              className="text-[var(--text-muted)] transition-colors hover:text-[var(--brand-navy-ink)]"
                            >
                              <ChevronRight size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Surface>
        </>
      )}

      {tab === "applications" && (
        <Surface className="px-6 py-6">
          {applications.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"><Loader2 size={16} className="animate-spin" /> Laddar…</div>
          ) : (applications.data || []).length === 0 ? (
            <EmptyState title="Inga ansökningar" />
          ) : (
            <div className="space-y-2">
              {(applications.data || []).map((a) => (
                <div key={a.id} className="surface-muted flex items-center justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><p className="font-black">{a.name}</p><VehiclePill v={a.vehicle} /><Badge tone={a.status === "PENDING" ? "warning" : a.status === "APPROVED" ? "success" : "neutral"}>{a.status === "PENDING" ? "Väntar" : a.status === "APPROVED" ? "Godkänd" : "Avslagen"}</Badge></div>
                    <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{a.email}{a.phone ? ` · ${a.phone}` : ""} · {a.city} · {formatDate(a.createdAt)}</p>
                    {a.message && <p className="mt-1 text-sm text-[var(--text-secondary)]">“{a.message}”</p>}
                  </div>
                  {a.status === "PENDING" && (
                    <div className="flex shrink-0 gap-2">
                      <Button variant="primary" onClick={() => setApproveApp(a)}>Skapa konto</Button>
                      <Button variant="secondary" onClick={() => reject.mutate(a.id)}>Avslå</Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Surface>
      )}

      {tab === "rates" && (
        <Surface className="px-6 py-6">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Ersättningsmodell</p>
          <div className="mt-3 space-y-2 text-sm text-[var(--text-secondary)]">
            <p>Ersättning betalas <strong>per order</strong> (inte per timme): <strong>avstånd × km-pris</strong> per fordon. Ingen grundavgift.</p>
            <p>Routing-regel: <strong>över 2 km → bil</strong>, ≤ 2 km → cykel.</p>
            <p>Bonus-lager (t.ex. +3 kr om levererat &lt; 30 min) byggs ut senare.</p>
            <p>km-priset sätts <strong>per kurir</strong> (i fliken Kurirer / vid skapande). Bud-utbetalningarna är skilda från restaurangernas.</p>
          </div>
        </Surface>
      )}

      <CreateCourierModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <ApproveModal app={approveApp} open={Boolean(approveApp)} onClose={() => setApproveApp(null)} />
    </div>
  );
}
