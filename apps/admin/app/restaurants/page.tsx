"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { API_URL } from "@/lib/api";
import { Check, Loader2, Plus, Save, Trash2 } from "lucide-react";

interface RestaurantItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  isPopular?: boolean;
}

interface RestaurantCategory {
  id: string;
  name: string;
  description?: string;
  position?: number;
  items?: RestaurantItem[];
}

interface Restaurant {
  id: string;
  name: string;
  slug: string;
  description?: string;
  cuisine?: string;
  city?: string;
  address?: string;
  zip?: string;
  phone?: string;
  rating?: number;
  ratingCount?: number;
  imageUrl?: string;
  heroImageUrl?: string;
  minOrderAmount?: number;
  deliveryFee?: number;
  etaMinutes?: number;
  isOpen?: boolean;
  featuredClass?: number;
  tags?: string[];
  openingHours?: Record<string, string>;
  menu?: RestaurantCategory[];
}

const emptyForm: Partial<Restaurant> = {
  name: "",
  slug: "",
  cuisine: "",
  city: "Lund",
  minOrderAmount: 0,
  deliveryFee: 0,
  etaMinutes: 30,
  isOpen: true,
  featuredClass: 3,
  tags: [],
};

export default function RestaurantsPage() {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Restaurant>>(emptyForm);
  const [categoryDraft, setCategoryDraft] = useState({ name: "", description: "" });
  const [itemDraft, setItemDraft] = useState({ name: "", description: "", price: 0, categoryId: "" });
  const [openingHoursText, setOpeningHoursText] = useState("");

  const token = typeof window !== "undefined" ? localStorage.getItem("palmyra_token") || "" : "";

  const selected = useMemo(
    () => restaurants.find((r) => r.id === selectedId) || restaurants[0],
    [restaurants, selectedId]
  );

  const fetchRestaurants = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/restaurants?withMenu=1`);
      setRestaurants(res.data);
      if (!selectedId && res.data.length > 0) {
        setSelectedId(res.data[0].id);
      }
    } catch (error) {
      console.error("Failed to fetch restaurants", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRestaurants();
  }, []);

  useEffect(() => {
    if (selected) {
      setForm({ ...emptyForm, ...selected });
      setItemDraft((draft) => ({ ...draft, categoryId: selected.menu?.[0]?.id || "" }));
      setOpeningHoursText(selected.openingHours ? JSON.stringify(selected.openingHours, null, 2) : "");
    }
  }, [selected?.id]);

  const handleSave = async () => {
    if (!form.name) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        ...(openingHoursText
          ? (() => {
              try {
                return { openingHours: JSON.parse(openingHoursText) };
              } catch {
                return { openingHours: { custom: openingHoursText } };
              }
            })()
          : {}),
      };

      if (selected) {
        await axios.patch(`${API_URL}/api/restaurants/${selected.id}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        await axios.post(`${API_URL}/api/restaurants`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      await fetchRestaurants();
    } catch (error: any) {
      alert(error.response?.data?.error || "Kunde inte spara");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!selected || !categoryDraft.name) return;
    setSaving(true);
    try {
      await axios.post(
        `${API_URL}/api/restaurants/${selected.id}/categories`,
        { name: categoryDraft.name, description: categoryDraft.description },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCategoryDraft({ name: "", description: "" });
      await fetchRestaurants();
    } catch (error: any) {
      alert(error.response?.data?.error || "Kunde inte lägga till kategori");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateItem = async () => {
    if (!selected || !itemDraft.name || !itemDraft.categoryId) return;
    setSaving(true);
    try {
      await axios.post(
        `${API_URL}/api/restaurants/${selected.id}/items`,
        {
          categoryId: itemDraft.categoryId,
          name: itemDraft.name,
          description: itemDraft.description,
          price: Number(itemDraft.price) || 0,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setItemDraft({ name: "", description: "", price: 0, categoryId: itemDraft.categoryId });
      await fetchRestaurants();
    } catch (error: any) {
      alert(error.response?.data?.error || "Kunde inte lägga till menyobjekt");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRestaurant = async (id: string) => {
    if (!confirm("Radera restaurangen?")) return;
    await axios.delete(`${API_URL}/api/restaurants/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    await fetchRestaurants();
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="animate-spin text-gold-500" size={36} />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-black uppercase tracking-tight">Restauranger</h1>
          <button
            className="rounded-xl bg-gold-500 px-3 py-2 text-sm font-black uppercase text-dark-500"
            onClick={() => {
              setForm(emptyForm);
              setSelectedId(null);
            }}
          >
            Ny
          </button>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 space-y-2 max-h-[70vh] overflow-y-auto">
          {restaurants.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={`w-full text-left rounded-xl border px-3 py-3 transition-all ${
                selected?.id === r.id
                  ? "border-gold-500/50 bg-gold-500/10"
                  : "border-white/5 bg-white/0 hover:bg-white/5"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold">{r.name}</div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-white/30">{r.cuisine || ""}</div>
                </div>
                {(r.featuredClass || 3) < 3 && (
                  <span className={`rounded-full px-2 py-1 text-[10px] font-black ${
                    r.featuredClass === 1 ? "bg-gold-500/20 text-gold-400" : "bg-white/10 text-white/50"
                  }`}>
                    {r.featuredClass === 1 ? "Premium" : "Standard"}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/30">Hantera</p>
              <h2 className="text-xl font-black">{selected ? selected.name : "Ny restaurang"}</h2>
            </div>
            <div className="flex gap-2">
              {selected && (
                <button
                  onClick={() => handleDeleteRestaurant(selected.id)}
                  className="rounded-xl border border-red-500/40 px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"
                >
                  <Trash2 size={16} />
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-gold-500 px-4 py-2 text-sm font-black uppercase text-dark-500 hover:bg-gold-400"
              >
                {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                Spara
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-bold text-white/50">
              Namn
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                value={form.name || ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className="text-xs font-bold text-white/50">
              Slug
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                value={form.slug || ""}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </label>
            <label className="text-xs font-bold text-white/50">
              Kort beskrivning
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                value={form.description || ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </label>
            <label className="text-xs font-bold text-white/50">
              Kök / kategori
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                value={form.cuisine || ""}
                onChange={(e) => setForm({ ...form, cuisine: e.target.value })}
              />
            </label>
            <label className="text-xs font-bold text-white/50">
              Stad
              <input
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                value={form.city || ""}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
              />
            </label>
            <label className="text-xs font-bold text-white/50">
              Minimiorder (kr)
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                value={form.minOrderAmount ?? 0}
                onChange={(e) => setForm({ ...form, minOrderAmount: Number(e.target.value) })}
              />
            </label>
            <label className="text-xs font-bold text-white/50">
              Leveransavgift (kr)
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                value={form.deliveryFee ?? 0}
                onChange={(e) => setForm({ ...form, deliveryFee: Number(e.target.value) })}
              />
            </label>
            <label className="text-xs font-bold text-white/50">
              ETA minuter
              <input
                type="number"
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                value={form.etaMinutes ?? 30}
                onChange={(e) => setForm({ ...form, etaMinutes: Number(e.target.value) })}
              />
            </label>
          </div>

          <label className="mt-2 block text-xs font-bold text-white/50">
            Öppettider (JSON eller fri text)
            <textarea
              className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
              rows={3}
              value={openingHoursText}
              onChange={(e) => setOpeningHoursText(e.target.value)}
              placeholder='{ "monday": "10-22", "tuesday": "10-22" }'
            />
          </label>

          <div className="mt-4 flex flex-wrap gap-3 text-xs">
            <button
              onClick={() => setForm({ ...form, isOpen: !form.isOpen })}
              className={`flex items-center gap-2 rounded-full px-3 py-2 font-black uppercase tracking-wider ${
                form.isOpen ? "bg-emerald-500/20 text-emerald-300" : "bg-white/5 text-white/40"
              }`}
            >
              <Check size={14} /> {form.isOpen ? "Öppen" : "Stängd"}
            </button>
            
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-1">
              {[1, 2, 3].map((cls) => (
                <button
                  key={cls}
                  onClick={() => setForm({ ...form, featuredClass: cls })}
                  className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all ${
                    form.featuredClass === cls
                      ? "bg-gold-500 text-dark-500 shadow-lg"
                      : "text-white/40 hover:text-white"
                  }`}
                >
                  {cls === 1 ? "Premium" : cls === 2 ? "Standard" : "Normal"}
                </button>
              ))}
            </div>
            <p className="w-full text-[9px] text-white/20 mt-1 ml-1 uppercase tracking-widest italic">Featured Class styr ranking och synlighet på startsidan</p>
          </div>
        </div>

        {selected && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black">Meny</h3>
              <div className="text-[10px] uppercase tracking-[0.3em] text-white/30">{selected.menu?.length || 0} kategorier</div>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr,1fr,120px]">
              <input
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                placeholder="Ny kategori"
                value={categoryDraft.name}
                onChange={(e) => setCategoryDraft({ ...categoryDraft, name: e.target.value })}
              />
              <input
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                placeholder="Beskrivning"
                value={categoryDraft.description}
                onChange={(e) => setCategoryDraft({ ...categoryDraft, description: e.target.value })}
              />
              <button
                onClick={handleCreateCategory}
                className="rounded-lg bg-gold-500 px-3 py-2 text-sm font-black text-dark-500"
              >
                Lägg till
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-[1.2fr,1fr,120px,120px]">
              <input
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                placeholder="Rätt"
                value={itemDraft.name}
                onChange={(e) => setItemDraft({ ...itemDraft, name: e.target.value })}
              />
              <input
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                placeholder="Beskrivning"
                value={itemDraft.description}
                onChange={(e) => setItemDraft({ ...itemDraft, description: e.target.value })}
              />
              <input
                type="number"
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                placeholder="Pris"
                value={itemDraft.price}
                onChange={(e) => setItemDraft({ ...itemDraft, price: Number(e.target.value) })}
              />
              <select
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                value={itemDraft.categoryId}
                onChange={(e) => setItemDraft({ ...itemDraft, categoryId: e.target.value })}
              >
                <option value="">Kategori</option>
                {selected.menu?.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <button
                onClick={handleCreateItem}
                className="md:col-span-4 rounded-lg bg-white/10 px-3 py-2 text-sm font-bold hover:bg-white/15"
              >
                Lägg till rätt
              </button>
            </div>

            <div className="space-y-3">
              {selected.menu?.map((cat) => (
                <div key={cat.id} className="rounded-xl border border-white/5 bg-white/5 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-black">{cat.name}</div>
                      <p className="text-xs text-white/40">{cat.description}</p>
                    </div>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white/30">{cat.items?.length || 0} rätter</span>
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    {cat.items?.map((item) => (
                      <div key={item.id} className="rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-bold">{item.name}</div>
                            <div className="text-xs text-white/40">{item.description}</div>
                          </div>
                          <div className="text-sm font-black text-gold-400">{item.price} kr</div>
                        </div>
                      </div>
                    ))}
                    {(!cat.items || cat.items.length === 0) && (
                      <div className="text-xs text-white/30">Inga rätter i denna kategori ännu.</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
