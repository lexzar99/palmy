"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Info,
  Link as LinkIcon,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Store,
  ToggleLeft,
  ToggleRight,
  Trash2,
  X,
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-storage";
import { ConfirmModal, Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

interface Sponsor {
  id: string;
  name: string;
  imageUrl: string;
  sortOrder: number;
  isActive: boolean;
  isClickable: boolean;
  infoText?: string;
  ctaText?: string;
  ctaLink?: string;
  linkType?: "EXTERNAL" | "DEAL" | "RESTAURANT" | "NONE";
  linkTarget?: string;
  showName?: boolean;
}

type LinkableDeal = { id: string; title: string; restaurant?: { name?: string | null } | null };
type LinkableRestaurant = { id: string; name: string; slug: string };

const emptyForm = {
  name: "",
  imageUrl: "",
  isActive: true,
  isClickable: false,
  infoText: "",
  ctaText: "Läs mer",
  ctaLink: "",
  linkType: "EXTERNAL" as "EXTERNAL" | "DEAL" | "RESTAURANT" | "NONE",
  linkTarget: "",
  showName: true,
};

export default function SponsorsPage() {
  const { success, error: toastError } = useToast();
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [deals, setDeals] = useState<LinkableDeal[]>([]);
  const [restaurants, setRestaurants] = useState<LinkableRestaurant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Sponsor | null>(null);
  const [form, setForm] = useState(emptyForm);

  const token = getStoredToken();

  const fetchContext = async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [sponsorsResponse, dealsResponse, restaurantsResponse] = await Promise.all([
        axios.get(`${API_URL}/api/sponsors/all`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/api/admin/deals`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API_URL}/api/restaurants`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      setSponsors((sponsorsResponse.data || []).sort((a: Sponsor, b: Sponsor) => a.sortOrder - b.sortOrder));
      setDeals(dealsResponse.data || []);
      setRestaurants(restaurantsResponse.data || []);
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte ladda sponsorpanelen.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchContext();
  }, []);

  const sortedSponsors = useMemo(() => [...sponsors].sort((a, b) => a.sortOrder - b.sortOrder), [sponsors]);

  const stats = useMemo(() => ({
    total: sponsors.length,
    active: sponsors.filter((sponsor) => sponsor.isActive).length,
    interactive: sponsors.filter((sponsor) => sponsor.isClickable).length,
    static: sponsors.filter((sponsor) => !sponsor.isClickable).length,
  }), [sponsors]);

  const openCreateModal = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEditModal = (sponsor: Sponsor) => {
    setEditingId(sponsor.id);
    setForm({
      name: sponsor.name,
      imageUrl: sponsor.imageUrl,
      isActive: sponsor.isActive,
      isClickable: sponsor.isClickable,
      infoText: sponsor.infoText || "",
      ctaText: sponsor.ctaText || "Läs mer",
      ctaLink: sponsor.ctaLink || "",
      linkType: sponsor.linkType || "EXTERNAL",
      linkTarget: sponsor.linkTarget || "",
      showName: sponsor.showName !== false,
    });
    setModalOpen(true);
  };

  const uploadImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !token) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await axios.post(`${API_URL}/api/admin/upload`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });
      setForm((previous) => ({ ...previous, imageUrl: response.data.url }));
      success("Bilden laddades upp.");
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte ladda upp bilden.");
    } finally {
      setUploading(false);
    }
  };

  const saveSponsor = async () => {
    if (!token) return;
    if (!form.name.trim() || !form.imageUrl.trim()) {
      toastError("Namn och bild krävs.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        imageUrl: form.imageUrl.trim(),
        infoText: form.isClickable ? form.infoText || undefined : undefined,
        ctaText: form.isClickable && form.linkType !== "NONE" ? form.ctaText || undefined : undefined,
        ctaLink: form.linkType === "EXTERNAL" ? form.linkTarget || form.ctaLink || undefined : undefined,
        linkTarget: form.linkType !== "NONE" ? form.linkTarget || undefined : undefined,
      };

      if (editingId) {
        const response = await axios.patch(`${API_URL}/api/sponsors/${editingId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setSponsors((previous) => previous.map((entry) => (entry.id === editingId ? response.data : entry)));
        success("Sponsorn uppdaterades.");
      } else {
        const response = await axios.post(`${API_URL}/api/sponsors`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setSponsors((previous) => [...previous, response.data]);
        success("Sponsorn skapades.");
      }

      setModalOpen(false);
      setEditingId(null);
      setForm(emptyForm);
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte spara sponsorn.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (sponsor: Sponsor) => {
    if (!token) return;
    try {
      const response = await axios.patch(`${API_URL}/api/sponsors/${sponsor.id}`, { isActive: !sponsor.isActive }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSponsors((previous) => previous.map((entry) => (entry.id === sponsor.id ? response.data : entry)));
      success(!sponsor.isActive ? "Sponsorn aktiverades." : "Sponsorn doldes.");
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte uppdatera sponsorn.");
    }
  };

  const toggleClickable = async (sponsor: Sponsor) => {
    if (!token) return;
    try {
      const response = await axios.patch(`${API_URL}/api/sponsors/${sponsor.id}`, { isClickable: !sponsor.isClickable }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSponsors((previous) => previous.map((entry) => (entry.id === sponsor.id ? response.data : entry)));
      success(!sponsor.isClickable ? "Sponsorn är nu interaktiv." : "Sponsorn är nu statisk.");
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte uppdatera sponsorn.");
    }
  };

  const moveSponsor = async (sponsor: Sponsor, direction: "up" | "down") => {
    if (!token) return;

    const currentIndex = sortedSponsors.findIndex((entry) => entry.id === sponsor.id);
    if (currentIndex === -1) return;
    if (direction === "up" && currentIndex === 0) return;
    if (direction === "down" && currentIndex === sortedSponsors.length - 1) return;

    const swapSponsor = sortedSponsors[direction === "up" ? currentIndex - 1 : currentIndex + 1];

    try {
      await Promise.all([
        axios.patch(`${API_URL}/api/sponsors/${sponsor.id}`, { sortOrder: swapSponsor.sortOrder }, { headers: { Authorization: `Bearer ${token}` } }),
        axios.patch(`${API_URL}/api/sponsors/${swapSponsor.id}`, { sortOrder: sponsor.sortOrder }, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      setSponsors((previous) =>
        previous.map((entry) => {
          if (entry.id === sponsor.id) return { ...entry, sortOrder: swapSponsor.sortOrder };
          if (entry.id === swapSponsor.id) return { ...entry, sortOrder: sponsor.sortOrder };
          return entry;
        })
      );
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte ändra ordningen.");
    }
  };

  const deleteSponsor = async () => {
    if (!deleteConfirm || !token) return;
    try {
      await axios.delete(`${API_URL}/api/sponsors/${deleteConfirm.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSponsors((previous) => previous.filter((entry) => entry.id !== deleteConfirm.id));
      setDeleteConfirm(null);
      success("Sponsorn raderades.");
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte radera sponsorn.");
    }
  };

  const selectedDealLabel = deals.find((deal) => deal.id === form.linkTarget);
  const selectedRestaurantLabel = restaurants.find((restaurant) => restaurant.slug === form.linkTarget);

  if (loading) {
    return (
      <div className="panel flex min-h-[360px] items-center justify-center rounded-[32px] px-6 py-12">
        <div className="flex items-center gap-3 text-[var(--text-secondary)]">
          <Loader2 className="animate-spin text-amber-200" size={18} />
          <span className="text-sm font-bold">Laddar sponsorsystemet…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-16">
      <section className="panel rounded-[32px] px-6 py-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <span className="control-chip">Sponsor control</span>
            <div>
              <h2 className="text-3xl font-black tracking-[-0.06em] text-[var(--text-primary)] sm:text-4xl">Sponsors är kopplade igen</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
                Sponsorytan hämtar nu riktiga deals från adminflödet och riktiga restauranger från katalogen. Här styr du exakt vad som syns i webb och React Native.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void fetchContext()} className="control-chip">
              <RefreshCw size={13} /> Synka
            </button>
            <button type="button" onClick={openCreateModal} className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018]">
              <Plus size={14} /> Ny sponsor
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        {[
          { label: "Totalt", value: stats.total, sub: "Partners i karusellen" },
          { label: "Aktiva", value: stats.active, sub: "Syns publikt just nu" },
          { label: "Interaktiva", value: stats.interactive, sub: "Har baksida eller CTA" },
          { label: "Statisk banner", value: stats.static, sub: "Ren exponering utan klick" },
        ].map((card) => (
          <article key={card.label} className="metric-card panel-muted">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">{card.label}</p>
            <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{card.value}</p>
            <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">{card.sub}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-5 2xl:grid-cols-[1.1fr_0.9fr]">
        <div className="panel rounded-[32px] px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Placement</p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Karusellordning och beteende</h3>
            </div>
            <span className="control-chip">Web + RN</span>
          </div>

          <div className="mt-5 grid gap-4">
            {sortedSponsors.length === 0 ? (
              <div className="rounded-[28px] border border-dashed border-[var(--border-subtle)] px-6 py-16 text-center text-sm leading-7 text-[var(--text-secondary)]">
                Inga sponsorer är skapade ännu.
              </div>
            ) : (
              sortedSponsors.map((sponsor, index) => (
                <article key={sponsor.id} className="rounded-[28px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-5 py-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                      <div className="h-20 w-32 shrink-0 overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)]">
                        <img src={sponsor.imageUrl} alt={sponsor.name} className="h-full w-full object-cover" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xl font-black tracking-[-0.04em] text-[var(--text-primary)]">{sponsor.name}</p>
                          <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${sponsor.isActive ? "bg-emerald-300/12 text-emerald-100" : "bg-rose-300/12 text-rose-100"}`}>
                            {sponsor.isActive ? "Aktiv" : "Dold"}
                          </span>
                          <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${sponsor.isClickable ? "bg-violet-300/12 text-violet-100" : "bg-[rgba(255,255,255,0.08)] text-[var(--text-secondary)]"}`}>
                            {sponsor.isClickable ? "Interaktiv" : "Statisk"}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                          {sponsor.infoText || "Ren annonsyta utan extra infotext."}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
                          <span className="control-chip">Position {index + 1}</span>
                          <span className="control-chip">{sponsor.showName !== false ? "Namn visas" : "Namn dolt"}</span>
                          {sponsor.linkType && sponsor.linkType !== "NONE" ? <span className="control-chip">{sponsor.linkType}</span> : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => moveSponsor(sponsor, "up")} disabled={index === 0} className="control-chip disabled:opacity-40">
                        <ArrowUp size={13} /> Upp
                      </button>
                      <button type="button" onClick={() => moveSponsor(sponsor, "down")} disabled={index === sortedSponsors.length - 1} className="control-chip disabled:opacity-40">
                        <ArrowDown size={13} /> Ner
                      </button>
                      <button type="button" onClick={() => toggleClickable(sponsor)} className="control-chip">
                        {sponsor.isClickable ? <ToggleRight size={13} /> : <ToggleLeft size={13} />} {sponsor.isClickable ? "Gör statisk" : "Gör interaktiv"}
                      </button>
                      <button type="button" onClick={() => toggleActive(sponsor)} className="control-chip">
                        {sponsor.isActive ? <EyeOff size={13} /> : <Eye size={13} />} {sponsor.isActive ? "Dölj" : "Visa"}
                      </button>
                      <button type="button" onClick={() => openEditModal(sponsor)} className="control-chip">
                        <Save size={13} /> Redigera
                      </button>
                      <button type="button" onClick={() => setDeleteConfirm(sponsor)} className="control-chip text-rose-200">
                        <Trash2 size={13} /> Radera
                      </button>
                    </div>
                  </div>

                  {sponsor.isClickable ? (
                    <div className="mt-4 rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">CTA-koppling</p>
                          <p className="mt-1 text-sm font-black text-[var(--text-primary)]">{sponsor.ctaText || "Ingen CTA-text"}</p>
                        </div>
                        <button type="button" onClick={() => setPreviewId((current) => current === sponsor.id ? null : sponsor.id)} className="control-chip">
                          {previewId === sponsor.id ? "Dölj preview" : "Visa preview"}
                        </button>
                      </div>

                      <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        {sponsor.linkType === "DEAL"
                          ? `Öppnar deal: ${deals.find((deal) => deal.id === sponsor.linkTarget)?.title || sponsor.linkTarget || "Ej vald"}`
                          : sponsor.linkType === "RESTAURANT"
                          ? `Öppnar restaurang: ${restaurants.find((restaurant) => restaurant.slug === sponsor.linkTarget)?.name || sponsor.linkTarget || "Ej vald"}`
                          : sponsor.linkType === "EXTERNAL"
                          ? `Extern länk: ${sponsor.ctaLink || sponsor.linkTarget || "Ej vald"}`
                          : "Ingen länk kopplad"}
                      </p>

                      {previewId === sponsor.id ? (
                        <div className="mt-4 rounded-2xl border border-violet-300/16 bg-violet-300/10 px-4 py-4">
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-100">Interaktiv preview</p>
                          <p className="mt-2 text-sm font-black text-[var(--text-primary)]">{sponsor.infoText || "Lägg infotext för att förklara sponsorn när användaren klickar."}</p>
                          {sponsor.linkType !== "NONE" ? (
                            <div className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-violet-400/16 px-4 py-3 text-[11px] font-black uppercase tracking-[0.2em] text-violet-100">
                              <ExternalLink size={13} /> {sponsor.ctaText || "Läs mer"}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </div>

        <div className="grid gap-5">
          <div className="panel rounded-[32px] px-6 py-6">
            <div className="flex items-center gap-3 text-sky-100">
              <Info size={18} />
              <p className="text-sm font-black uppercase tracking-[0.22em]">Hur sponsorflödet fungerar</p>
            </div>
            <div className="mt-4 grid gap-3 text-sm leading-7 text-[var(--text-secondary)]">
              <p>1. Skapa eller redigera sponsor och ladda upp en ren bannerbild.</p>
              <p>2. Om sponsorn ska vara klickbar kopplar du den till en deal, restaurang eller extern URL.</p>
              <p>3. Justera ordningen med upp/ner så den viktigaste placeringen kommer först i både webben och React Native.</p>
            </div>
          </div>

          <div className="panel rounded-[32px] px-6 py-6">
            <div className="flex items-center gap-3 text-amber-100">
              <Sparkles size={18} />
              <p className="text-sm font-black uppercase tracking-[0.22em]">Kopplingar som är live</p>
            </div>
            <div className="mt-4 grid gap-3 text-sm leading-7 text-[var(--text-secondary)]">
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4">
                <p className="font-black text-[var(--text-primary)]">Deals</p>
                <p className="mt-2">Sponsorer läser nu riktiga deal-poster från adminflödet istället för att falla tillbaka på en lös offentlig lista.</p>
              </div>
              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4">
                <p className="font-black text-[var(--text-primary)]">Restauranger</p>
                <p className="mt-2">Restaurangval bygger på den riktiga katalogen, så bannerlänkar kan peka rätt direkt i app och web.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditingId(null); }} title={editingId ? "Redigera sponsor" : "Ny sponsor"} maxWidth="max-w-3xl">
        <div className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)] md:col-span-2">
              <span>Namn</span>
              <input value={form.name} onChange={(event) => setForm((previous) => ({ ...previous, name: event.target.value }))} className="control-input" placeholder="t.ex. Coca Cola Sverige" />
            </label>

            <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)] md:col-span-2">
              <span>Bild-URL</span>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input value={form.imageUrl} onChange={(event) => setForm((previous) => ({ ...previous, imageUrl: event.target.value }))} className="control-input flex-1" placeholder="https://..." />
                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018]">
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />}
                  Ladda upp
                  <input type="file" accept="image/*" className="hidden" onChange={uploadImage} disabled={uploading} />
                </label>
              </div>
            </label>

            {form.imageUrl ? (
              <div className="md:col-span-2 rounded-2xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4">
                <img src={form.imageUrl} alt="Sponsor preview" className="h-28 w-full rounded-2xl object-cover" />
              </div>
            ) : null}

            <label className="inline-flex items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4 text-sm font-bold text-[var(--text-primary)]">
              <input type="checkbox" checked={form.isClickable} onChange={(event) => setForm((previous) => ({ ...previous, isClickable: event.target.checked }))} />
              Interaktiv sponsor med baksida / CTA
            </label>
            <label className="inline-flex items-center gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4 text-sm font-bold text-[var(--text-primary)]">
              <input type="checkbox" checked={form.showName} onChange={(event) => setForm((previous) => ({ ...previous, showName: event.target.checked }))} />
              Visa namn på bannern
            </label>
          </div>

          {form.isClickable ? (
            <div className="grid gap-4 rounded-[28px] border border-violet-300/16 bg-violet-300/10 p-5">
              <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
                <span>Infotext</span>
                <textarea value={form.infoText} onChange={(event) => setForm((previous) => ({ ...previous, infoText: event.target.value }))} className="control-input min-h-[100px] resize-none" />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
                  <span>Knapptext</span>
                  <input value={form.ctaText} onChange={(event) => setForm((previous) => ({ ...previous, ctaText: event.target.value }))} className="control-input" />
                </label>
                <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
                  <span>Länktyp</span>
                  <select value={form.linkType} onChange={(event) => setForm((previous) => ({ ...previous, linkType: event.target.value as typeof form.linkType, linkTarget: "", ctaLink: "" }))} className="control-input">
                    <option value="EXTERNAL">Extern URL</option>
                    <option value="DEAL">Deal</option>
                    <option value="RESTAURANT">Restaurang</option>
                    <option value="NONE">Ingen CTA</option>
                  </select>
                </label>
              </div>

              {form.linkType === "EXTERNAL" ? (
                <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
                  <span>Extern länk</span>
                  <input value={form.linkTarget} onChange={(event) => setForm((previous) => ({ ...previous, linkTarget: event.target.value, ctaLink: event.target.value }))} className="control-input" placeholder="https://..." />
                </label>
              ) : null}

              {form.linkType === "DEAL" ? (
                <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
                  <span>Välj deal</span>
                  <select value={form.linkTarget} onChange={(event) => setForm((previous) => ({ ...previous, linkTarget: event.target.value }))} className="control-input">
                    <option value="">Välj en deal</option>
                    {deals.map((deal) => (
                      <option key={deal.id} value={deal.id}>{deal.title}{deal.restaurant?.name ? ` • ${deal.restaurant.name}` : ""}</option>
                    ))}
                  </select>
                </label>
              ) : null}

              {form.linkType === "RESTAURANT" ? (
                <label className="grid gap-2 text-[11px] font-bold text-[var(--text-secondary)]">
                  <span>Välj restaurang</span>
                  <select value={form.linkTarget} onChange={(event) => setForm((previous) => ({ ...previous, linkTarget: event.target.value }))} className="control-input">
                    <option value="">Välj en restaurang</option>
                    {restaurants.map((restaurant) => (
                      <option key={restaurant.id} value={restaurant.slug}>{restaurant.name}</option>
                    ))}
                  </select>
                </label>
              ) : null}

              <div className="rounded-2xl border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.04)] px-4 py-4 text-sm leading-6 text-[var(--text-secondary)]">
                <div className="flex items-center gap-2 text-violet-100">
                  <LinkIcon size={14} />
                  <span className="font-black uppercase tracking-[0.18em]">Preview-koppling</span>
                </div>
                <p className="mt-2">
                  {form.linkType === "DEAL"
                    ? selectedDealLabel ? `Länkar till dealen ${selectedDealLabel.title}.` : "Välj en deal att länka sponsorn till."
                    : form.linkType === "RESTAURANT"
                    ? selectedRestaurantLabel ? `Länkar till restaurangen ${selectedRestaurantLabel.name}.` : "Välj en restaurang att länka sponsorn till."
                    : form.linkType === "EXTERNAL"
                    ? form.linkTarget ? `Öppnar extern URL: ${form.linkTarget}` : "Lägg till en extern URL."
                    : "Sponsorn visar bara info utan CTA-knapp."}
                </p>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            <button type="button" onClick={() => { setModalOpen(false); setEditingId(null); }} className="control-chip">
              <X size={13} /> Avbryt
            </button>
            <button type="button" onClick={() => void saveSponsor()} disabled={saving} className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018] disabled:opacity-60">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {editingId ? "Spara sponsor" : "Skapa sponsor"}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={deleteSponsor}
        title="Radera sponsor"
        message={`Radera ${deleteConfirm?.name}?`}
        confirmLabel="Radera"
        danger
      />
    </div>
  );
}
