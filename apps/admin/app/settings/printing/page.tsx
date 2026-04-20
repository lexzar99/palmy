"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import {
  Bluetooth,
  Clock3,
  Loader2,
  Network,
  Plus,
  Printer,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-storage";
import { Modal, ConfirmModal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { useControlCenter } from "@/lib/use-control-center";

interface PrinterDevice {
  id: string;
  restaurantId: string;
  restaurantName?: string | null;
  name: string;
  connectionType: "NETWORK" | "BLUETOOTH";
  address: string;
  paperWidth: "58mm" | "80mm" | "A4";
  copies: number;
  autoPrint: boolean;
  isDefault: boolean;
  isActive: boolean;
  receiptMode: "STANDARD" | "COMPACT" | "DETAILED";
  notes?: string | null;
  lastSeenAt?: string | null;
  status: "ONLINE" | "STALE" | "OFFLINE" | "UNKNOWN";
}

interface PrintingConfigPayload {
  template: {
    paperWidth: string;
    platformName: string;
    elements: Array<{ key: string; visible?: boolean }>;
  };
  printers: PrinterDevice[];
}

const emptyForm = {
  restaurantId: "",
  name: "",
  connectionType: "NETWORK" as "NETWORK" | "BLUETOOTH",
  address: "",
  paperWidth: "80mm" as "58mm" | "80mm" | "A4",
  copies: 1,
  autoPrint: false,
  isDefault: true,
  isActive: true,
  receiptMode: "STANDARD" as "STANDARD" | "COMPACT" | "DETAILED",
  notes: "",
};

const relativeSeenAt = (value?: string | null) => {
  if (!value) return "Aldrig synkad";
  return new Intl.DateTimeFormat("sv-SE", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
};

export default function PrintingSettingsPage() {
  const { success, error: toastError } = useToast();
  const { data: controlData, selectedRestaurantId } = useControlCenter();
  const [config, setConfig] = useState<PrintingConfigPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PrinterDevice | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const token = getStoredToken();

  const fetchConfig = async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/admin/printing/config`, {
        headers: { Authorization: `Bearer ${token}` },
        params: selectedRestaurantId ? { restaurantId: selectedRestaurantId } : undefined,
      });
      setConfig(response.data);
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte ladda printerkonfigurationen.");
      setConfig(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchConfig();
  }, [selectedRestaurantId]);

  const printers = config?.printers || [];

  const stats = useMemo(() => ({
    total: printers.length,
    defaults: printers.filter((printer) => printer.isDefault).length,
    autoPrint: printers.filter((printer) => printer.autoPrint && printer.isActive).length,
    stale: printers.filter((printer) => ["STALE", "OFFLINE", "UNKNOWN"].includes(printer.status)).length,
  }), [printers]);

  const restaurantOptions = useMemo(
    () => controlData?.restaurantSnapshots.map((restaurant) => ({ id: restaurant.id, name: restaurant.name })) || [],
    [controlData?.restaurantSnapshots]
  );

  const openCreateModal = () => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      restaurantId: selectedRestaurantId || restaurantOptions[0]?.id || "",
    });
    setModalOpen(true);
  };

  const openEditModal = (printer: PrinterDevice) => {
    setEditingId(printer.id);
    setForm({
      restaurantId: printer.restaurantId,
      name: printer.name,
      connectionType: printer.connectionType,
      address: printer.address,
      paperWidth: printer.paperWidth,
      copies: printer.copies,
      autoPrint: printer.autoPrint,
      isDefault: printer.isDefault,
      isActive: printer.isActive,
      receiptMode: printer.receiptMode,
      notes: printer.notes || "",
    });
    setModalOpen(true);
  };

  const savePrinter = async () => {
    if (!token) return;
    if (!form.name.trim() || !form.address.trim()) {
      toastError("Namn och adress krävs.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        restaurantId: form.restaurantId || selectedRestaurantId || undefined,
        notes: form.notes || undefined,
      };

      const response = editingId
        ? await axios.patch(`${API_URL}/api/admin/printing/printers/${editingId}`, payload, {
            headers: { Authorization: `Bearer ${token}` },
          })
        : await axios.post(`${API_URL}/api/admin/printing/printers`, payload, {
            headers: { Authorization: `Bearer ${token}` },
          });

      setConfig((previous) => {
        const current = previous?.printers || [];
        const next = editingId
          ? current.map((printer) => (printer.id === editingId ? response.data : printer))
          : [response.data, ...current];

        return previous ? { ...previous, printers: next } : { template: { paperWidth: "80mm", platformName: "MatGo", elements: [] }, printers: next };
      });
      setModalOpen(false);
      setEditingId(null);
      success(editingId ? "Skrivaren uppdaterades." : "Skrivaren skapades.");
      await fetchConfig();
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte spara skrivaren.");
    } finally {
      setSaving(false);
    }
  };

  const togglePrinter = async (printer: PrinterDevice, patch: Partial<PrinterDevice>) => {
    if (!token) return;
    try {
      await axios.patch(`${API_URL}/api/admin/printing/printers/${printer.id}`, patch, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchConfig();
      success("Printerprofilen uppdaterades.");
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte uppdatera skrivaren.");
    }
  };

  const deletePrinter = async () => {
    if (!deleteTarget || !token) return;
    try {
      await axios.delete(`${API_URL}/api/admin/printing/printers/${deleteTarget.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDeleteTarget(null);
      await fetchConfig();
      success("Skrivaren togs bort.");
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte ta bort skrivaren.");
    }
  };

  if (loading) {
    return (
      <div className="panel flex min-h-[360px] items-center justify-center rounded-[32px] px-6 py-12">
        <div className="flex items-center gap-3 text-[var(--text-secondary)]">
          <Loader2 className="animate-spin text-amber-200" size={18} />
          <span className="text-sm font-bold">Laddar printer registry…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-16">
      <section className="panel rounded-[32px] px-6 py-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <span className="control-chip">Printing registry</span>
            <div>
              <h2 className="text-3xl font-black tracking-[-0.06em] text-[var(--text-primary)] sm:text-4xl">Riktiga printerprofiler istället för fake devices</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
                Adminen lagrar nu verkliga skrivare per restaurang med kopior, autoprint, pappersbredd och senast sedd-status. Själva lokala nätverkstestet sker fortfarande på restaurangens enhet, men konfigurationen är nu central och äkta.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link href="/settings/receipt" className="control-chip">Öppna Receipt Studio</Link>
            <button type="button" onClick={() => void fetchConfig()} className="control-chip">
              <RefreshCw size={13} /> Synka
            </button>
            <button type="button" onClick={openCreateModal} className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018]">
              <Plus size={14} /> Ny skrivare
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        {[
          { label: "Skrivare", value: stats.total, sub: "Profiler i registryn" },
          { label: "Standardprofiler", value: stats.defaults, sub: "En per restaurang bör vara default" },
          { label: "Auto-print", value: stats.autoPrint, sub: "Skriver automatiskt vid ny order" },
          { label: "Behöver sync", value: stats.stale, sub: "Stale/offline/unknown status" },
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
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Printer registry</p>
            <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Konfiguration per restaurang</h3>
          </div>

          <div className="mt-5 grid gap-4">
            {printers.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-[var(--border-subtle)] px-6 py-16 text-center text-sm leading-7 text-[var(--text-secondary)]">
                Inga skrivare är konfigurerade ännu.
              </div>
            ) : (
              printers.map((printer) => (
                <article key={printer.id} className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(245,191,91,0.12)] text-amber-200">
                        {printer.connectionType === "BLUETOOTH" ? <Bluetooth size={18} /> : <Network size={18} />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xl font-black tracking-[-0.04em] text-[var(--text-primary)]">{printer.name}</p>
                          {printer.isDefault ? <span className="control-chip text-amber-100">Default</span> : null}
                          <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${printer.isActive ? "bg-emerald-300/12 text-emerald-100" : "bg-rose-300/12 text-rose-100"}`}>
                            {printer.isActive ? "Aktiv" : "Inaktiv"}
                          </span>
                          <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${printer.status === "ONLINE" ? "bg-emerald-300/12 text-emerald-100" : printer.status === "STALE" ? "bg-amber-300/12 text-amber-100" : "bg-slate-300/12 text-slate-100"}`}>
                            {printer.status}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{printer.restaurantName || "Ingen restaurang"} • {printer.address}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                          <span className="control-chip"><Printer size={12} /> {printer.paperWidth}</span>
                          <span className="control-chip">{printer.copies} kopior</span>
                          <span className="control-chip">{printer.receiptMode}</span>
                          <span className="control-chip">Auto-print {printer.autoPrint ? "på" : "av"}</span>
                          <span className="control-chip"><Clock3 size={12} /> {relativeSeenAt(printer.lastSeenAt)}</span>
                        </div>
                        {printer.notes ? <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{printer.notes}</p> : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!printer.isDefault ? (
                        <button type="button" onClick={() => void togglePrinter(printer, { isDefault: true })} className="control-chip">
                          <ShieldCheck size={13} /> Sätt som default
                        </button>
                      ) : null}
                      <button type="button" onClick={() => void togglePrinter(printer, { isActive: !printer.isActive })} className="control-chip">
                        {printer.isActive ? "Inaktivera" : "Aktivera"}
                      </button>
                      <button type="button" onClick={() => openEditModal(printer)} className="control-chip">
                        <Save size={13} /> Redigera
                      </button>
                      <button type="button" onClick={() => setDeleteTarget(printer)} className="control-chip text-rose-200">
                        <Trash2 size={13} /> Ta bort
                      </button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>

        <div className="grid gap-5">
          <div className="panel rounded-[32px] px-6 py-6">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Production reality</p>
            <div className="mt-4 grid gap-3 text-sm leading-7 text-[var(--text-secondary)]">
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4">
                <p className="font-black text-[var(--text-primary)]">Vad adminen gör på riktigt</p>
                <p className="mt-2">Lagrar printerprofil, autoprint, kopior, pappersbredd och standardval centralt i databasen.</p>
              </div>
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4">
                <p className="font-black text-[var(--text-primary)]">Vad som fortfarande sker lokalt</p>
                <p className="mt-2">Själva nätverksupptäckten och den fysiska anslutningen till skrivaren sker från restaurangens enhet, inte från molnadminen.</p>
              </div>
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4">
                <p className="font-black text-[var(--text-primary)]">Senast sedd-status</p>
                <p className="mt-2">Status uppdateras när restaurangappen sparar eller använder en printerprofil, så du ser om konfigurationen verkligen lever.</p>
              </div>
            </div>
          </div>

          <div className="panel rounded-[32px] px-6 py-6">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Receipt summary</p>
            <div className="mt-4 grid gap-3 text-sm leading-7 text-[var(--text-secondary)]">
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4">
                <p className="font-black text-[var(--text-primary)]">Global pappersbredd</p>
                <p className="mt-2">{config?.template.paperWidth || "80mm"}</p>
              </div>
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4">
                <p className="font-black text-[var(--text-primary)]">Aktiva template-block</p>
                <p className="mt-2">{config?.template.elements.filter((element) => (element as any).visible).length || 0}</p>
              </div>
              <Link href="/settings/receipt" className="control-chip w-fit">Gå till Receipt Studio</Link>
            </div>
          </div>
        </div>
      </section>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditingId(null); }} title={editingId ? "Redigera skrivare" : "Ny skrivare"} maxWidth="max-w-2xl">
        <div className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)] md:col-span-2">
              <span>Restaurang</span>
              <select value={form.restaurantId} onChange={(event) => setForm((previous) => ({ ...previous, restaurantId: event.target.value }))} className="control-input" disabled={Boolean(selectedRestaurantId)}>
                <option value="">Välj restaurang</option>
                {restaurantOptions.map((restaurant) => (
                  <option key={restaurant.id} value={restaurant.id}>{restaurant.name}</option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
              <span>Namn</span>
              <input value={form.name} onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))} className="control-input" placeholder="t.ex. Epson front" />
            </label>
            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
              <span>Anslutning</span>
              <select value={form.connectionType} onChange={(event) => setForm((previous) => ({ ...previous, connectionType: event.target.value as typeof form.connectionType }))} className="control-input">
                <option value="NETWORK">Network</option>
                <option value="BLUETOOTH">Bluetooth</option>
              </select>
            </label>

            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)] md:col-span-2">
              <span>Adress</span>
              <input value={form.address} onChange={(event) => setForm((previous) => ({ ...previous, address: event.target.value }))} className="control-input" placeholder={form.connectionType === "NETWORK" ? "192.168.1.120" : "00:11:22:33:44:55"} />
            </label>

            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
              <span>Pappersbredd</span>
              <select value={form.paperWidth} onChange={(event) => setForm((previous) => ({ ...previous, paperWidth: event.target.value as typeof form.paperWidth }))} className="control-input">
                <option value="58mm">58mm</option>
                <option value="80mm">80mm</option>
                <option value="A4">A4</option>
              </select>
            </label>
            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
              <span>Kopior</span>
              <input type="number" min={1} max={5} value={form.copies} onChange={(event) => setForm((previous) => ({ ...previous, copies: Number(event.target.value) }))} className="control-input" />
            </label>

            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
              <span>Receipt mode</span>
              <select value={form.receiptMode} onChange={(event) => setForm((previous) => ({ ...previous, receiptMode: event.target.value as typeof form.receiptMode }))} className="control-input">
                <option value="STANDARD">Standard</option>
                <option value="COMPACT">Compact</option>
                <option value="DETAILED">Detailed</option>
              </select>
            </label>

            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)] md:col-span-2">
              <span>Intern notering</span>
              <textarea value={form.notes} onChange={(event) => setForm((previous) => ({ ...previous, notes: event.target.value }))} className="control-input min-h-[100px] resize-none" placeholder="Frontdesk, köksskrivare, fallback, statisk IP..." />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="inline-flex items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4 text-sm font-bold text-[var(--text-primary)]">
              <input type="checkbox" checked={form.autoPrint} onChange={(event) => setForm((previous) => ({ ...previous, autoPrint: event.target.checked }))} />
              Auto-print
            </label>
            <label className="inline-flex items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4 text-sm font-bold text-[var(--text-primary)]">
              <input type="checkbox" checked={form.isDefault} onChange={(event) => setForm((previous) => ({ ...previous, isDefault: event.target.checked }))} />
              Standard
            </label>
            <label className="inline-flex items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4 text-sm font-bold text-[var(--text-primary)]">
              <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((previous) => ({ ...previous, isActive: event.target.checked }))} />
              Aktiv
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button type="button" onClick={() => { setModalOpen(false); setEditingId(null); }} className="control-chip">Avbryt</button>
            <button type="button" onClick={() => void savePrinter()} disabled={saving} className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018] disabled:opacity-60">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {editingId ? "Spara skrivare" : "Skapa skrivare"}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deletePrinter}
        title="Ta bort skrivare"
        message={`Ta bort ${deleteTarget?.name}?`}
        confirmLabel="Ta bort"
        danger
      />
    </div>
  );
}
