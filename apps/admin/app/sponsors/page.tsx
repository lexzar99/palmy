"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  Plus, Trash2, Eye, EyeOff, Loader2, Image as ImageIcon,
  Link as LinkIcon, Type, ToggleLeft, ToggleRight, Info,
  ArrowUp, ArrowDown, ExternalLink, Save, X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/components/Toast";
import { ConfirmModal } from "@/components/Modal";
import { API_URL } from "@/lib/api";

interface Sponsor {
  id: string;
  name: string;
  imageUrl: string;
  isActive: boolean;
  isClickable: boolean;
  infoText?: string;
  ctaText?: string;
  ctaLink?: string;
  linkType?: 'EXTERNAL' | 'DEAL' | 'RESTAURANT';
  linkTarget?: string;
  sortOrder: number;
  createdAt: string;
}

const emptyForm = (): Omit<Sponsor, "id" | "sortOrder" | "createdAt"> => ({
  name: "",
  imageUrl: "",
  isActive: true,
  isClickable: false,
  infoText: "",
  ctaText: "Läs mer",
  ctaLink: "",
  linkType: "EXTERNAL",
  linkTarget: "",
});

export default function SponsorsPage() {
  const { success, error: toastErr } = useToast();
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [editId, setEditId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Sponsor | null>(null);
  const [deals, setDeals] = useState<any[]>([]);
  const [restaurants, setRestaurants] = useState<any[]>([]);

  const token = () => typeof window !== "undefined" ? localStorage.getItem("matgo_token") || "" : "";
  const headers = () => ({ Authorization: `Bearer ${token()}` });

  const fetchContext = useCallback(async () => {
    try {
      const [sRes, dRes, rRes] = await Promise.all([
        axios.get(`${API_URL}/api/sponsors/all`, { headers: headers() }),
        axios.get(`${API_URL}/api/deals`, { headers: headers() }),
        axios.get(`${API_URL}/api/restaurants`, { headers: headers() }),
      ]);
      setSponsors(sRes.data || []);
      setDeals(dRes.data || []);
      setRestaurants(rRes.data || []);
    } catch { toastErr("Kunde inte hämta data"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchContext(); }, [fetchContext]);

  const handleSave = async () => {
    if (!form.name.trim() || !form.imageUrl.trim()) {
      toastErr("Namn och bild-URL krävs");
      return;
    }
    setSaving(true);
    try {
      if (editId) {
        const res = await axios.patch(`${API_URL}/api/sponsors/${editId}`, form, { headers: headers() });
        setSponsors(prev => prev.map(s => s.id === editId ? res.data : s));
        success("Sponsor uppdaterad!");
      } else {
        const res = await axios.post(`${API_URL}/api/sponsors`, form, { headers: headers() });
        setSponsors(prev => [...prev, res.data]);
        success("Sponsor tillagd!");
      }
      setForm(emptyForm());
      setEditId(null);
      setShowForm(false);
    } catch { toastErr("Kunde inte spara sponsor"); }
    finally { setSaving(false); }
  };

  const toggleActive = async (s: Sponsor) => {
    try {
      await axios.patch(`${API_URL}/api/sponsors/${s.id}`, { isActive: !s.isActive }, { headers: headers() });
      setSponsors(prev => prev.map(x => x.id === s.id ? { ...x, isActive: !s.isActive } : x));
      success(s.isActive ? "Dold" : "Aktiverad");
    } catch { toastErr("Fel"); }
  };

  const toggleClickable = async (s: Sponsor) => {
    try {
      await axios.patch(`${API_URL}/api/sponsors/${s.id}`, { isClickable: !s.isClickable }, { headers: headers() });
      setSponsors(prev => prev.map(x => x.id === s.id ? { ...x, isClickable: !s.isClickable } : x));
    } catch { toastErr("Fel"); }
  };

  const move = async (s: Sponsor, dir: "up" | "down") => {
    const sorted = [...sponsors].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex(x => x.id === s.id);
    if ((dir === "up" && idx === 0) || (dir === "down" && idx === sorted.length - 1)) return;
    const swap = sorted[dir === "up" ? idx - 1 : idx + 1];
    try {
      await Promise.all([
        axios.patch(`${API_URL}/api/sponsors/${s.id}`, { sortOrder: swap.sortOrder }, { headers: headers() }),
        axios.patch(`${API_URL}/api/sponsors/${swap.id}`, { sortOrder: s.sortOrder }, { headers: headers() }),
      ]);
      setSponsors(prev => prev.map(x => {
        if (x.id === s.id) return { ...x, sortOrder: swap.sortOrder };
        if (x.id === swap.id) return { ...x, sortOrder: s.sortOrder };
        return x;
      }));
    } catch { toastErr("Fel"); }
  };

  const handleDelete = async (s: Sponsor) => {
    try {
      await axios.delete(`${API_URL}/api/sponsors/${s.id}`, { headers: headers() });
      setSponsors(prev => prev.filter(x => x.id !== s.id));
      setDeleteConfirm(null);
      success("Sponsor raderad");
    } catch { toastErr("Kunde inte radera sponsor"); }
  };

  const sorted = [...sponsors].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-8 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight">Sponsorer</h1>
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-[var(--text-primary)]/30 mt-1">
            Annonsbilder i horisontell scroll · Webb & React-appen
          </p>
        </div>
        <button onClick={() => { setShowForm(true); setForm(emptyForm()); setEditId(null); }}
          className="flex items-center gap-2 px-5 py-3 bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-xl shadow-gold-500/20 transition-all">
          <Plus size={15} /> Ny Sponsor
        </button>
      </div>

      {/* Info */}
      <div className="p-5 rounded-2xl border border-sky-500/20 bg-sky-500/5 flex items-start gap-3">
        <Info size={15} className="text-sky-400 shrink-0 mt-0.5" />
        <div className="text-[9px] font-bold text-sky-400/80 leading-relaxed space-y-1">
          <p><strong>Klickbar (interaktiv):</strong> Sponsorn flippar och visar infotext + CTA-knapp. Bra för erbjudanden.</p>
          <p><strong>Ej klickbar:</strong> Visas som ren annonsild i scrollen utan interaktion.</p>
          <p>Ordning styrs med pil-knapparna. Sponsors visas direkt under headern på hemsidan.</p>
        </div>
      </div>

      {/* Add form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="bg-[var(--border-subtle)] border border-gold-500/20 rounded-[2.5rem] p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black uppercase tracking-tight">{editId ? 'Redigera Sponsor' : 'Ny Sponsor'}</h2>
              <button onClick={() => { setShowForm(false); setEditId(null); }} className="p-2 rounded-xl hover:bg-white/10 transition-all text-[var(--text-secondary)]">
                <X size={16} />
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              {/* Name */}
              <div>
                <label className="text-[8px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-1.5">Namn *</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="t.ex. CocaCola Sverige"
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-gold-500/30 transition-all" />
              </div>
              {/* Image URL */}
              <div>
                <label className="text-[8px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-1.5">Bild-URL * (240×120 rekommenderas)</label>
                <input value={form.imageUrl} onChange={e => setForm(p => ({ ...p, imageUrl: e.target.value }))}
                  placeholder="https://..."
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-gold-500/30 transition-all font-mono" />
              </div>
            </div>

            {/* Image preview */}
            {form.imageUrl && (
              <div className="flex items-center gap-4 p-4 bg-[var(--bg-primary)] rounded-2xl border border-[var(--border-subtle)]">
                <img src={form.imageUrl} alt="preview" className="h-16 w-40 object-cover rounded-xl border border-white/10" onError={e => (e.currentTarget.style.opacity = "0.3")} />
                <p className="text-[9px] font-bold text-[var(--text-secondary)] uppercase tracking-widest">Förhandsvisning</p>
              </div>
            )}

            {/* Clickable toggle */}
            <div className="flex items-center gap-4 p-4 bg-[var(--bg-primary)] rounded-2xl border border-[var(--border-subtle)]">
              <button onClick={() => setForm(p => ({ ...p, isClickable: !p.isClickable }))}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all ${
                  form.isClickable ? "bg-violet-500 text-white" : "bg-[var(--border-subtle)] text-[var(--text-secondary)]"
                }`}>
                {form.isClickable ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
                {form.isClickable ? "Interaktiv (flippar)" : "Statisk (ingen interaktion)"}
              </button>
            </div>

            {/* Clickable info fields */}
            {form.isClickable && (
              <div className="space-y-6 p-6 bg-violet-500/5 border border-violet-500/20 rounded-[2rem]">
                <div className="grid md:grid-cols-2 gap-5">
                  <div>
                    <label className="text-[8px] font-black uppercase tracking-widest text-violet-400 block mb-1.5">Informationstext (Baksida)</label>
                    <textarea value={form.infoText} onChange={e => setForm(p => ({ ...p, infoText: e.target.value }))}
                      rows={3} placeholder="Beskrivning som visas på baksidan..."
                      className="w-full bg-[var(--bg-primary)] border border-violet-500/20 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-violet-500/40 resize-none transition-all" />
                  </div>
                  <div>
                    <label className="text-[8px] font-black uppercase tracking-widest text-violet-400 block mb-1.5">Knapptext</label>
                    <input value={form.ctaText} onChange={e => setForm(p => ({ ...p, ctaText: e.target.value }))}
                      placeholder="t.ex. Utforska nu"
                      className="w-full bg-[var(--bg-primary)] border border-violet-500/20 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-violet-500/40 transition-all" />
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-5">
                  <div>
                    <label className="text-[8px] font-black uppercase tracking-widest text-violet-400 block mb-1.5">Länktyp</label>
                    <select value={form.linkType} onChange={e => setForm(p => ({ ...p, linkType: e.target.value as any, linkTarget: "" }))}
                      className="w-full bg-[var(--bg-primary)] border border-violet-500/20 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-violet-500/40 transition-all appearance-none cursor-pointer">
                      <option value="EXTERNAL">Extern URL</option>
                      <option value="DEAL">Erbjudande (Internt)</option>
                      <option value="RESTAURANT">Restaurang (Internt)</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="text-[8px] font-black uppercase tracking-widest text-violet-400 block mb-1.5">
                      {form.linkType === 'EXTERNAL' ? 'Mål-URL (https://...)' : form.linkType === 'DEAL' ? 'Välj Erbjudande' : 'Välj Restaurang'}
                    </label>
                    {form.linkType === 'EXTERNAL' ? (
                      <input value={form.linkTarget || form.ctaLink} onChange={e => setForm(p => ({ ...p, linkTarget: e.target.value, ctaLink: e.target.value }))}
                        placeholder="https://..."
                        className="w-full bg-[var(--bg-primary)] border border-violet-500/20 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-violet-500/40 transition-all font-mono" />
                    ) : form.linkType === 'DEAL' ? (
                      <select value={form.linkTarget} onChange={e => setForm(p => ({ ...p, linkTarget: e.target.value }))}
                        className="w-full bg-[var(--bg-primary)] border border-violet-500/20 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-violet-500/40 transition-all appearance-none cursor-pointer">
                        <option value="">Välj ett erbjudande...</option>
                        {deals.map(d => (
                          <option key={d.id} value={d.id}>{d.title} ({d.restaurantName || 'Global'})</option>
                        ))}
                      </select>
                    ) : (
                      <select value={form.linkTarget} onChange={e => setForm(p => ({ ...p, linkTarget: e.target.value }))}
                        className="w-full bg-[var(--bg-primary)] border border-violet-500/20 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-violet-500/40 transition-all appearance-none cursor-pointer">
                        <option value="">Välj en restaurang...</option>
                        {restaurants.map(r => (
                          <option key={r.id} value={r.slug}>{r.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={() => { setShowForm(false); setEditId(null); }}
                className="px-6 py-3 bg-[var(--border-subtle)] hover:bg-white/10 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all">
                Avbryt
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 px-8 py-3 bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] font-black uppercase tracking-widest text-[10px] rounded-2xl transition-all shadow-xl shadow-gold-500/20">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                {editId ? 'Uppdatera sponsor' : 'Spara sponsor'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-gold-500" /></div>
      ) : sorted.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-[var(--border-subtle)] rounded-3xl">
          <ImageIcon size={32} className="text-[var(--text-secondary)] opacity-20 mx-auto mb-3" />
          <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-30">
            Inga sponsorer ännu — klicka "Ny Sponsor" för att lägga till
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sorted.map((s, idx) => (
            <motion.div key={s.id} layout
              className={`bg-[var(--border-subtle)] border rounded-[2.5rem] p-6 transition-all ${
                s.isActive ? "border-[var(--border-subtle)]" : "border-red-500/10 opacity-60"
              }`}>
              <div className="flex items-center gap-5 flex-wrap">
                {/* Image */}
                <div className="w-40 h-20 shrink-0 rounded-2xl overflow-hidden border border-white/10 bg-[var(--bg-primary)]">
                  <img src={s.imageUrl} alt={s.name} className="w-full h-full object-cover" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-base font-black uppercase tracking-tight">{s.name}</p>
                    <span className={`text-[8px] font-black px-2 py-0.5 rounded-full border uppercase ${
                      s.isActive ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"
                    }`}>{s.isActive ? "Aktiv" : "Dold"}</span>
                    <span className={`text-[8px] font-black px-2 py-0.5 rounded-full border uppercase ${
                      s.isClickable ? "bg-violet-500/10 text-violet-400 border-violet-500/20" : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                    }`}>{s.isClickable ? "Interaktiv" : "Statisk"}</span>
                  </div>
                  {s.isClickable && s.infoText && (
                    <p className="text-[10px] text-[var(--text-secondary)] font-bold truncate max-w-sm">{s.infoText}</p>
                  )}
                  {s.isClickable && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[8px] font-black uppercase text-violet-400/60">{s.linkType || 'EXTERNAL'}:</span>
                      <p className="text-[9px] font-bold text-sky-400 truncate max-w-[200px]">
                        {s.linkTarget || s.ctaLink || 'Ingen länk'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Reorder */}
                  <div className="flex flex-col gap-1">
                    <button onClick={() => move(s, "up")} disabled={idx === 0}
                      className="p-1.5 rounded-lg disabled:opacity-20 hover:bg-white/10 transition-all text-[var(--text-secondary)]">
                      <ArrowUp size={12} />
                    </button>
                    <button onClick={() => move(s, "down")} disabled={idx === sorted.length - 1}
                      className="p-1.5 rounded-lg disabled:opacity-20 hover:bg-white/10 transition-all text-[var(--text-secondary)]">
                      <ArrowDown size={12} />
                    </button>
                  </div>

                  {/* Toggle clickable */}
                  <button onClick={() => toggleClickable(s)}
                    className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border transition-all ${
                      s.isClickable
                        ? "bg-violet-500/10 text-violet-400 border-violet-500/20 hover:bg-violet-500/20"
                        : "bg-[var(--bg-primary)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:text-[var(--text-primary)]"
                    }`}>
                    {s.isClickable ? "Gör statisk" : "Gör interaktiv"}
                  </button>

                  {/* Toggle active */}
                  <button onClick={() => toggleActive(s)}
                    className={`p-2 rounded-xl border transition-all ${
                      s.isActive ? "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                    }`}>
                    {s.isActive ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>

                  {/* Edit */}
                  <button onClick={() => { setForm({ ...s }); setEditId(s.id); setShowForm(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    className="p-2 rounded-xl bg-sky-500/5 border border-sky-500/10 text-sky-400 hover:bg-sky-500/15 transition-all">
                    <Save size={14} className="rotate-0" />
                  </button>

                  {/* Delete */}
                  <button onClick={() => setDeleteConfirm(s)}
                    className="p-2 rounded-xl bg-rose-500/5 border border-rose-500/10 text-rose-400 hover:bg-rose-500/15 transition-all">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Preview flip card */}
              {s.isClickable && (
                <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
                  <button onClick={() => setPreviewId(previewId === s.id ? null : s.id)}
                    className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1 transition-all">
                    <Info size={10} /> {previewId === s.id ? "Dölj" : "Visa"} baksidesinfo
                  </button>
                  {previewId === s.id && (
                    <div className="mt-3 p-4 bg-[var(--bg-primary)] rounded-2xl border border-violet-500/20 space-y-2">
                      {s.infoText && <p className="text-xs font-bold text-[var(--text-primary)]">{s.infoText}</p>}
                      {s.ctaText && (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl">
                          {s.ctaText}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        title="Radera sponsor"
        message={`Är du säker på att du vill radera "${deleteConfirm?.name}"?`}
        confirmLabel="Radera"
        danger
      />
    </div>
  );
}
