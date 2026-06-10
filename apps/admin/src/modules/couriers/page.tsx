"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bike, Car, Loader2, Plus, RefreshCw } from "lucide-react";
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
import { formatCurrency, formatDate } from "@/shared/utils/format";

type Tab = "couriers" | "applications" | "rates";

const VehiclePill = ({ v }: { v: "BIKE" | "CAR" }) => (
  <Badge tone="neutral">
    {v === "CAR" ? <Car size={12} style={{ marginRight: 4, display: "inline" }} /> : <Bike size={12} style={{ marginRight: 4, display: "inline" }} />}
    {v === "CAR" ? "Bil" : "Cykel"}
  </Badge>
);

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
    mutationFn: () => createCourier({ ...f, vehicle: f.vehicle as "BIKE" | "CAR" }),
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
      description="Skapa ett kurir-konto. Kuriren loggar in i appen med e-post + lösenord."
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
          <Field label="Fordon"><Select value={f.vehicle} onChange={set("vehicle")}><option value="BIKE">Cykel</option><option value="CAR">Bil</option></Select></Field>
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
      description="Ansökans info fylls i automatiskt. Sätt ett lösenord och ge det till kuriren."
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
  const [tab, setTab] = useState<Tab>("couriers");
  const [createOpen, setCreateOpen] = useState(false);
  const [approveApp, setApproveApp] = useState<CourierApplication | null>(null);

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
  const todaySum = rows.reduce((s, c) => s + c.todayEarnings, 0);

  const TABS: { id: Tab; label: string }[] = [
    { id: "couriers", label: "Kurirer" },
    { id: "applications", label: `Ansökningar${pendingCount ? ` (${pendingCount})` : ""}` },
    { id: "rates", label: "Ersättning & regler" },
  ];

  return (
    <div className="page-stack">
      <PageHeader
        title="Kurirer"
        actions={
          <div className="flex gap-2">
            <Button onClick={() => { void couriers.refetch(); void applications.refetch(); }}><RefreshCw size={14} /></Button>
            <Button variant="primary" onClick={() => setCreateOpen(true)}><Plus size={15} /> Lägg till kurir</Button>
          </div>
        }
      />

      <Surface className="px-5 py-4">
        <div className="flex gap-2">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`rounded-lg px-4 py-2 text-sm font-bold transition ${tab === t.id ? "bg-[var(--accent-strong,#111)] text-white" : "border border-[var(--border-subtle)] text-[var(--text-secondary)]"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </Surface>

      {tab === "couriers" && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCard label="Kurirer" value={String(rows.length)} detail={`${onlineCount} online`} />
            <MetricCard label="Online nu" value={String(onlineCount)} />
            <MetricCard label="Utbetalt idag" value={formatCurrency(todaySum)} />
          </div>
          <Surface className="px-6 py-6">
            {couriers.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"><Loader2 size={16} className="animate-spin" /> Laddar…</div>
            ) : couriers.isError ? (
              <ErrorPanel title="Kunde inte ladda kurirer" action={<Button onClick={() => void couriers.refetch()}>Försök igen</Button>} />
            ) : rows.length === 0 ? (
              <EmptyState title="Inga kurirer än" />
            ) : (
              <div className="table-shell">
                <table className="data-table">
                  <thead><tr><th>Kurir</th><th>Fordon</th><th>Stad</th><th>Status</th><th>Idag</th><th>30 dgr</th><th>km-pris</th><th /></tr></thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.id} style={{ opacity: c.isActive ? 1 : 0.5 }}>
                        <td><div><p className="font-black">{c.name}</p><p className="text-sm text-[var(--text-secondary)]">{c.email}</p></div></td>
                        <td><VehiclePill v={c.vehicle} /></td>
                        <td>{c.city}</td>
                        <td><Badge tone={c.online ? "success" : "neutral"}>{c.online ? "Online" : "Offline"}</Badge></td>
                        <td className="tabular-nums">{formatCurrency(c.todayEarnings)} <span className="text-[var(--text-muted)]">({c.todayDeliveries})</span></td>
                        <td className="tabular-nums">{formatCurrency(c.last30Earnings)} <span className="text-[var(--text-muted)]">({c.last30Deliveries})</span></td>
                        <td className="tabular-nums">{c.ratePerKm} kr</td>
                        <td>
                          <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => toggleActive.mutate({ id: c.id, isActive: !c.isActive })}>{c.isActive ? "Inaktivera" : "Aktivera"}</Button>
                            <Button variant="danger" onClick={() => { if (confirm(`Logga ut ${c.name} från alla enheter?`)) revoke.mutate(c.id); }}>Logga ut</Button>
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
