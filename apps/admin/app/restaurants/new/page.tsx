/* eslint-disable @next/next/no-img-element */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { API_URL } from "@/lib/api";
import {
  ArrowLeft,
  Save,
  Loader2,
  Upload,
  MapPin,
  Utensils,
  Building,
  Phone,
  Globe,
  Mail,
} from "lucide-react";
import { useToast } from "@/components/Toast";

const CUISINES = [
  "Svensk",
  "Italiensk",
  "Asiatisk",
  "Indisk",
  "Mexikansk",
  "Amerikansk",
  "Sushi",
  "Kinesisk",
  "Thailändsk",
  "Grekisk",
  "Libanesisk",
  "Vegetarisk",
  "Cafe",
  "Bakery",
  "Pizza",
  "Hamburgare",
  "Kafé",
  "Annat",
];

const CITIES = [
  "Stockholm",
  "Göteborg",
  "Malmö",
  "Uppsala",
  "Västerås",
  "Örebro",
  "Linköping",
  "Helsingborg",
  "Jönköping",
  "Norrköping",
  "Lund",
  "Umeå",
  "Gävle",
  "Borås",
  "Eskilstuna",
  "Halmstad",
  "Södertälje",
  "Karlstad",
  "Täby",
  "Botkyrka",
];

export default function NewRestaurantPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    cuisine: "",
    city: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    imageUrl: "",
    heroImageUrl: "",
  });

  const handleImageUpload = async (file: File, field: 'imageUrl' | 'heroImageUrl') => {
    // Validate size (2MB)
    if (file.size > 2 * 1024 * 1024) {
      toastError("Bilden är för stor (max 2MB)");
      return;
    }

    setUploading(field);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await axios.post(`${API_URL}/api/admin/upload`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
      });
      setForm((p) => ({ ...p, [field]: res.data.url }));
      success("Bild uppladdad");
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte ladda upp bild");
    } finally {
      setUploading(null);
    }
  };

  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("matgo_token") || ""
      : "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toastError("Ange ett restaurangnamn");
      return;
    }
    if (!form.cuisine) {
      toastError("Välj kök");
      return;
    }
    if (!form.city) {
      toastError("Välj stad");
      return;
    }

    setSaving(true);
    try {
      const res = await axios.post(
        `${API_URL}/api/restaurants`,
        form,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      success("Restaurang skapad");
      router.push(`/restaurants/${res.data.id}`);
    } catch (err: any) {
      toastError(err.response?.data?.message || "Kunde inte skapa restaurang");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-24">
      {/* Back */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push("/restaurants")}
          className="w-9 h-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all shrink-0"
        >
          <ArrowLeft size={15} />
        </button>
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight text-[var(--text-primary)]">
            Ny restaurang
          </h1>
          <p className="text-[9px] text-[var(--text-secondary)] font-bold uppercase tracking-widest mt-0.5">
            Skapa en ny restaurang i plattformen
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Basic info */}
        <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
          <h2 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Building size={15} className="text-gold-500" /> Basinfo
          </h2>

          <div className="space-y-4">
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-2">
                Restaurangnamn *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Restaurangnamn"
                className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-black outline-none focus:border-gold-500/30"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-2">
                  Kök *
                </label>
                <select
                  value={form.cuisine}
                  onChange={(e) => setForm((p) => ({ ...p, cuisine: e.target.value }))}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-black outline-none focus:border-gold-500/30 appearance-none cursor-pointer"
                >
                  <option value="">Välj kök</option>
                  {CUISINES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-2">
                  Stad *
                </label>
                <select
                  value={form.city}
                  onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))}
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm font-black outline-none focus:border-gold-500/30 appearance-none cursor-pointer"
                >
                  <option value="">Välj stad</option>
                  {CITIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-2">
                Adress
              </label>
              <div className="relative">
                <MapPin
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                />
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
                  placeholder="Gatuadress"
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl pl-10 pr-4 py-3 text-sm font-black outline-none focus:border-gold-500/30"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Contact */}
        <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
          <h2 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Phone size={15} className="text-gold-500" /> Kontakt
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-2">
                Telefon
              </label>
              <div className="relative">
                <Phone
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                />
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="+46..."
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl pl-10 pr-4 py-3 text-sm font-black outline-none focus:border-gold-500/30"
                />
              </div>
            </div>

            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-2">
                E-post
              </label>
              <div className="relative">
                <Mail
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                />
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="info@restaurant.se"
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl pl-10 pr-4 py-3 text-sm font-black outline-none focus:border-gold-500/30"
                />
              </div>
            </div>

            <div className="col-span-2">
              <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-2">
                Webbplats
              </label>
              <div className="relative">
                <Globe
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                />
                <input
                  type="url"
                  value={form.website}
                  onChange={(e) => setForm((p) => ({ ...p, website: e.target.value }))}
                  placeholder="https://..."
                  className="w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl pl-10 pr-4 py-3 text-sm font-black outline-none focus:border-gold-500/30"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Images */}
        <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
          <h2 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Upload size={15} className="text-gold-500" /> Bilder
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Profile Image */}
            <div className="space-y-3">
              <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-2">
                Logotyp / Profilbild (Max 2MB)
              </label>
              
              <div 
                className={`relative aspect-square rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center overflow-hidden bg-[var(--bg-primary)] ${
                  form.imageUrl ? 'border-transparent' : 'border-[var(--border-subtle)] hover:border-gold-500/50'
                }`}
              >
                {form.imageUrl ? (
                  <>
                    <img 
                      src={form.imageUrl} 
                      alt="Profil" 
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, imageUrl: "" }))}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg shadow-lg hover:scale-105 transition-all text-[10px] font-bold uppercase px-2"
                    >
                      Ta bort
                    </button>
                  </>
                ) : (
                  <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer p-4 group">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file, 'imageUrl');
                      }}
                    />
                    <div className="w-10 h-10 rounded-full bg-gold-500/10 flex items-center justify-center mb-2 group-hover:scale-110 transition-all">
                      <Upload size={18} className="text-gold-500" />
                    </div>
                    <span className="text-[10px] font-black text-[var(--text-primary)] uppercase tracking-tight">Välj bild</span>
                    <span className="text-[8px] font-bold text-[var(--text-secondary)] uppercase mt-1">PNG, JPG (Max 2MB)</span>
                  </label>
                )}
                
                {uploading === 'imageUrl' && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                    <Loader2 size={24} className="text-gold-500 animate-spin mb-2" />
                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Laddar upp...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Hero Image */}
            <div className="space-y-3">
              <label className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] block mb-2">
                Hero / Banner (Max 2MB)
              </label>
              
              <div 
                className={`relative aspect-[16/9] md:aspect-square rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center overflow-hidden bg-[var(--bg-primary)] ${
                  form.heroImageUrl ? 'border-transparent' : 'border-[var(--border-subtle)] hover:border-gold-500/50'
                }`}
              >
                {form.heroImageUrl ? (
                  <>
                    <img 
                      src={form.heroImageUrl} 
                      alt="Hero" 
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, heroImageUrl: "" }))}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-lg shadow-lg hover:scale-105 transition-all text-[10px] font-bold uppercase px-2"
                    >
                      Ta bort
                    </button>
                  </>
                ) : (
                  <label className="w-full h-full flex flex-col items-center justify-center cursor-pointer p-4 group">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file, 'heroImageUrl');
                      }}
                    />
                    <div className="w-10 h-10 rounded-full bg-gold-500/10 flex items-center justify-center mb-2 group-hover:scale-110 transition-all">
                      <Upload size={18} className="text-gold-500" />
                    </div>
                    <span className="text-[10px] font-black text-[var(--text-primary)] uppercase tracking-tight">Välj bild</span>
                    <span className="text-[8px] font-bold text-[var(--text-secondary)] uppercase mt-1">PNG, JPG (Max 2MB)</span>
                  </label>
                )}

                {uploading === 'heroImageUrl' && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                    <Loader2 size={24} className="text-gold-500 animate-spin mb-2" />
                    <span className="text-[10px] font-black text-white uppercase tracking-widest">Laddar upp...</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={saving}
          className="w-full py-4 bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] font-black uppercase tracking-widest text-[11px] rounded-xl shadow-lg shadow-gold-500/20 transition-all flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Skapar...
            </>
          ) : (
            <>
              <Save size={16} /> Skapa restaurang
            </>
          )}
        </button>
      </form>
    </div>
  );
}