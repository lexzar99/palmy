"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import {
  Calendar,
  CheckCircle2,
  Copy,
  DollarSign,
  Edit2,
  Loader2,
  Percent,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Trash2,
  XCircle,
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-storage";
import { Modal, ConfirmModal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

interface DiscountCode {
  id: string;
  code: string;
  description?: string | null;
  discountType: "percentage" | "fixed";
  discountValue: number;
  minOrderAmount?: number;
  maxUses?: number | null;
  usedCount: number;
  startsAt?: string | null;
  expiresAt?: string | null;
  isActive: boolean;
  createdAt: string;
}

const emptyForm = {
  code: "",
  description: "",
  discountType: "percentage" as "percentage" | "fixed",
  discountValue: 10,
  minOrderAmount: 0,
  maxUses: 0,
  startsAt: "",
  expiresAt: "",
};

const formatDiscountValue = (code: DiscountCode) =>
  code.discountType === "percentage" ? `${code.discountValue}%` : `${code.discountValue} kr`;

const isScheduled = (startsAt?: string | null) => Boolean(startsAt && new Date(startsAt) > new Date());

export default function DiscountsPage() {
  const { success, error: toastError } = useToast();
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<DiscountCode | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DiscountCode | null>(null);
  const [form, setForm] = useState(emptyForm);

  const token = getStoredToken();

  const fetchCodes = async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/admin/discounts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCodes(response.data || []);
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte ladda rabattkoder.");
      setCodes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCodes();
  }, []);

  const filteredCodes = useMemo(() => {
    return codes.filter((code) => {
      const matchesFilter =
        filterActive === "all" ||
        (filterActive === "active" && code.isActive) ||
        (filterActive === "inactive" && !code.isActive);

      if (!matchesFilter) return false;
      if (!search.trim()) return true;

      const query = search.toLowerCase();
      return code.code.toLowerCase().includes(query) || (code.description || "").toLowerCase().includes(query);
    });
  }, [codes, filterActive, search]);

  const stats = useMemo(() => ({
    total: codes.length,
    active: codes.filter((code) => code.isActive).length,
    scheduled: codes.filter((code) => isScheduled(code.startsAt)).length,
    redemptions: codes.reduce((sum, code) => sum + (code.usedCount || 0), 0),
  }), [codes]);

  const openCreateModal = () => {
    setEditingCode(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEditModal = (code: DiscountCode) => {
    setEditingCode(code);
    setForm({
      code: code.code,
      description: code.description || "",
      discountType: code.discountType,
      discountValue: code.discountValue,
      minOrderAmount: code.minOrderAmount || 0,
      maxUses: code.maxUses || 0,
      startsAt: code.startsAt ? code.startsAt.slice(0, 16) : "",
      expiresAt: code.expiresAt ? code.expiresAt.slice(0, 16) : "",
    });
    setModalOpen(true);
  };

  const handleToggle = async (code: DiscountCode) => {
    if (!token) return;

    try {
      const response = await axios.patch(
        `${API_URL}/api/admin/discounts/${code.id}`,
        { isActive: !code.isActive },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCodes((previous) => previous.map((entry) => (entry.id === code.id ? response.data : entry)));
      success(!code.isActive ? "Rabattkoden aktiverades." : "Rabattkoden pausades.");
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte uppdatera rabattkoden.");
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) return;

    const payload = {
      code: form.code,
      description: form.description || undefined,
      type: form.discountType === "percentage" ? "PERCENTAGE" : "FIXED",
      value: form.discountValue,
      minOrder: form.minOrderAmount || 0,
      maxUsages: form.maxUses || undefined,
      validFrom: form.startsAt || undefined,
      validUntil: form.expiresAt || undefined,
    };

    try {
      if (editingCode) {
        const response = await axios.patch(`${API_URL}/api/admin/discounts/${editingCode.id}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setCodes((previous) => previous.map((entry) => (entry.id === editingCode.id ? response.data : entry)));
        success("Rabattkoden uppdaterades.");
      } else {
        const response = await axios.post(`${API_URL}/api/admin/discounts`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setCodes((previous) => [response.data, ...previous]);
        success("Rabattkoden skapades.");
      }

      setModalOpen(false);
      setEditingCode(null);
      setForm(emptyForm);
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte spara rabattkoden.");
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm || !token) return;

    try {
      await axios.delete(`${API_URL}/api/admin/discounts/${deleteConfirm.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCodes((previous) => previous.filter((entry) => entry.id !== deleteConfirm.id));
      success("Rabattkoden raderades.");
      setDeleteConfirm(null);
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte radera rabattkoden.");
    }
  };

  if (loading) {
    return (
      <div className="panel flex min-h-[360px] items-center justify-center rounded-[32px] px-6 py-12">
        <div className="flex items-center gap-3 text-[var(--text-secondary)]">
          <Loader2 className="animate-spin text-amber-200" size={18} />
          <span className="text-sm font-bold">Laddar rabattkoder…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-16">
      <section className="panel rounded-[32px] px-6 py-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <span className="control-chip">Discount center</span>
            <div>
              <h2 className="text-3xl font-black tracking-[-0.06em] text-[var(--text-primary)] sm:text-4xl">Plattformskoder utan kampanjkaos</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
                Här styr du generella rabattkoder för hela plattformen. För restaurangspecifika erbjudanden använder du <Link href="/deals" className="font-black text-amber-200 underline underline-offset-4">Deals</Link>.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void fetchCodes()} className="control-chip">
              <RefreshCw size={13} /> Synka
            </button>
            <button type="button" onClick={openCreateModal} className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018]">
              <Plus size={14} /> Ny rabattkod
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        {[
          { label: "Totalt", value: stats.total, sub: "Koder i systemet" },
          { label: "Aktiva", value: stats.active, sub: "Kan användas nu" },
          { label: "Schemalagda", value: stats.scheduled, sub: "Startar framåt i tiden" },
          { label: "Redemptions", value: stats.redemptions, sub: "Totalt antal användningar" },
        ].map((card) => (
          <article key={card.label} className="metric-card panel-muted">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">{card.label}</p>
            <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{card.value}</p>
            <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">{card.sub}</p>
          </article>
        ))}
      </section>

      <section className="panel rounded-[32px] px-6 py-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Sök kod eller beskrivning" className="control-input pl-10" />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {([
              { id: "all", label: "Alla" },
              { id: "active", label: "Aktiva" },
              { id: "inactive", label: "Inaktiva" },
            ] as const).map((item) => (
              <button key={item.id} type="button" onClick={() => setFilterActive(item.id)} className={`rounded-2xl px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] ${filterActive === item.id ? "bg-gold-gradient text-[#091018]" : "border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)]"}`}>
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {filteredCodes.length === 0 ? (
            <div className="xl:col-span-2 rounded-[28px] border border-dashed border-[var(--border-subtle)] px-6 py-16 text-center text-sm leading-7 text-[var(--text-secondary)]">
              Inga rabattkoder matchade filtren.
            </div>
          ) : (
            filteredCodes.map((code) => (
              <article key={code.id} className="rounded-[30px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-2xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{code.code}</p>
                      <button type="button" onClick={() => navigator.clipboard.writeText(code.code)} className="control-chip">
                        <Copy size={12} /> Kopiera
                      </button>
                      <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${code.isActive ? "bg-emerald-300/12 text-emerald-100" : "bg-rose-300/12 text-rose-100"}`}>
                        {code.isActive ? "Aktiv" : "Pausad"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{code.description || "Ingen beskrivning satt för koden ännu."}</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(245,191,91,0.12)] text-amber-200">
                    <Tag size={18} />
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Rabatt</p>
                    <p className="mt-1 text-lg font-black text-[var(--text-primary)]">{formatDiscountValue(code)}</p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">Min order {code.minOrderAmount || 0} kr</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">Användning</p>
                    <p className="mt-1 text-lg font-black text-[var(--text-primary)]">{code.usedCount}</p>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">{code.maxUses ? `Max ${code.maxUses}` : "Obegränsad"}</p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                  {code.startsAt ? <span className="control-chip"><Calendar size={12} /> Start {new Date(code.startsAt).toLocaleDateString("sv-SE")}</span> : null}
                  {code.expiresAt ? <span className="control-chip"><Calendar size={12} /> Slut {new Date(code.expiresAt).toLocaleDateString("sv-SE")}</span> : null}
                  {isScheduled(code.startsAt) ? <span className="control-chip text-sky-100">Schemalagd</span> : null}
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => void handleToggle(code)} className="control-chip">
                    {code.isActive ? <XCircle size={13} /> : <CheckCircle2 size={13} />} {code.isActive ? "Pausa" : "Aktivera"}
                  </button>
                  <button type="button" onClick={() => openEditModal(code)} className="control-chip">
                    <Edit2 size={13} /> Redigera
                  </button>
                  <button type="button" onClick={() => setDeleteConfirm(code)} className="control-chip text-rose-200">
                    <Trash2 size={13} /> Radera
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-[30px] border border-sky-300/18 bg-sky-300/10 px-5 py-5">
          <div className="flex items-center gap-3 text-sky-100">
            <Sparkles size={18} />
            <p className="text-sm font-black uppercase tracking-[0.22em]">När används rabattkoder?</p>
          </div>
          <div className="mt-4 grid gap-3 text-sm leading-7 text-[var(--text-secondary)]">
            <p>Använd plattformskoder för breda kampanjer som välkomstkod, comeback-flöden eller nationella pushar.</p>
            <p>Om du vill göra ett restaurangspecifikt erbjudande eller menykampanj ska du istället skapa en deal.</p>
          </div>
        </div>
        <div className="rounded-[30px] border border-amber-300/18 bg-amber-300/10 px-5 py-5">
          <div className="flex items-center gap-3 text-amber-100">
            <Tag size={18} />
            <p className="text-sm font-black uppercase tracking-[0.22em]">Nästa steg</p>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Link href="/deals" className="control-chip">Öppna Deals</Link>
            <Link href="/push" className="control-chip">Öppna Push Center</Link>
          </div>
        </div>
      </section>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditingCode(null); }} title={editingCode ? "Redigera rabattkod" : "Ny rabattkod"} maxWidth="max-w-2xl">
        <form onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)] md:col-span-2">
              <span>Kod</span>
              <input value={form.code} onChange={(event) => setForm((previous) => ({ ...previous, code: event.target.value.toUpperCase() }))} placeholder="SUMMER25" className={`${inputCls} uppercase`} required />
            </label>
            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)] md:col-span-2">
              <span>Beskrivning</span>
              <textarea value={form.description} onChange={(event) => setForm((previous) => ({ ...previous, description: event.target.value }))} className={`${inputCls} min-h-[100px] resize-none`} placeholder="Valfri intern beskrivning eller kampanjtext" />
            </label>
            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
              <span>Typ</span>
              <select value={form.discountType} onChange={(event) => setForm((previous) => ({ ...previous, discountType: event.target.value as "percentage" | "fixed" }))} className={inputCls}>
                <option value="percentage">Procent</option>
                <option value="fixed">Fast belopp</option>
              </select>
            </label>
            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
              <span>{form.discountType === "percentage" ? "Procent" : "Belopp i kr"}</span>
              <div className="relative">
                {form.discountType === "percentage" ? <Percent size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" /> : <DollarSign size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />}
                <input type="number" value={form.discountValue} onChange={(event) => setForm((previous) => ({ ...previous, discountValue: Number(event.target.value) }))} className={`${inputCls} pl-9`} required />
              </div>
            </label>
            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
              <span>Minsta order</span>
              <input type="number" value={form.minOrderAmount} onChange={(event) => setForm((previous) => ({ ...previous, minOrderAmount: Number(event.target.value) }))} className={inputCls} />
            </label>
            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
              <span>Max användningar</span>
              <input type="number" value={form.maxUses} onChange={(event) => setForm((previous) => ({ ...previous, maxUses: Number(event.target.value) }))} className={inputCls} />
            </label>
            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
              <span>Start</span>
              <input type="datetime-local" value={form.startsAt} onChange={(event) => setForm((previous) => ({ ...previous, startsAt: event.target.value }))} className={inputCls} />
            </label>
            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
              <span>Slut</span>
              <input type="datetime-local" value={form.expiresAt} onChange={(event) => setForm((previous) => ({ ...previous, expiresAt: event.target.value }))} className={inputCls} />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button type="button" onClick={() => { setModalOpen(false); setEditingCode(null); }} className="control-chip">Avbryt</button>
            <button type="submit" className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018]">
              <Sparkles size={14} /> {editingCode ? "Spara rabattkod" : "Skapa rabattkod"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleDelete}
        title="Radera rabattkod"
        message={`Radera ${deleteConfirm?.code}?`}
        confirmLabel="Radera"
        danger
      />
    </div>
  );
}
