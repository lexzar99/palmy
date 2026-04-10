/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { API_URL } from "@/lib/api";
import {
  Loader2,
  Plus,
  Trash2,
  Search,
  Star,
  Crown,
  Medal,
  Award,
  EyeOff,
  CheckCircle2,
  XCircle,
  Filter,
  ChevronRight,
  Sparkles,
  MapPin,
  Clock,
  Package,
  TrendingUp,
  LayoutGrid,
  RefreshCw,
} from "lucide-react";
import { motion } from "framer-motion";
import { ConfirmModal } from "@/components/Modal";
import { useToast } from "@/components/Toast";

export const PREMIUM_TIERS = [
  {
    value: 1,
    label: "Guld",
    sublabel: "Visas mest",
    icon: Crown,
    color: "text-gold-500",
    bg: "bg-gold-500/10 border-gold-500/30",
    dot: "bg-gold-500",
  },
  {
    value: 2,
    label: "Silver",
    sublabel: "Visas mycket",
    icon: Medal,
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/30",
    dot: "bg-blue-400",
  },
  {
    value: 3,
    label: "Standard",
    sublabel: "Normal synlighet",
    icon: Award,
    color: "text-[var(--text-secondary)]",
    bg: "bg-[var(--border-subtle)] border-[var(--border-subtle)]",
    dot: "bg-[var(--text-secondary)]",
  },
  {
    value: 0,
    label: "Dold",
    sublabel: "Gömd från appen",
    icon: EyeOff,
    color: "text-rose-400",
    bg: "bg-rose-500/10 border-rose-500/20",
    dot: "bg-rose-400",
  },
];

export default function RestaurantsPage() {
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const [restaurants, setRestaurants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTier, setFilterTier] = useState<number | "all">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "closed">("all");
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);

  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("matgo_token") || ""
      : "";

  const fetchRestaurants = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/restaurants`);
      setRestaurants(res.data);
    } catch {
      toastError("Kunde inte ladda restauranger");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRestaurants();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`${API_URL}/api/restaurants/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      success("Restaurang raderad");
      setRestaurants((prev) => prev.filter((r) => r.id !== id));
      setDeleteConfirm(null);
    } catch {
      toastError("Kunde inte radera restaurangen");
    }
  };

  const filtered = useMemo(() => {
    let result = restaurants;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.cuisine?.toLowerCase().includes(q) ||
          r.city?.toLowerCase().includes(q)
      );
    }
    if (filterTier !== "all")
      result = result.filter((r) => (r.featuredClass ?? 3) === filterTier);
    if (filterStatus === "open")
      result = result.filter((r) => r.isOpen || r.manualIsOpen);
    if (filterStatus === "closed")
      result = result.filter((r) => !r.isOpen && !r.manualIsOpen);
    return result;
  }, [restaurants, searchTerm, filterTier, filterStatus]);

  const stats = useMemo(() => ({
    total: restaurants.length,
    open: restaurants.filter((r) => r.isOpen || r.manualIsOpen).length,
    gold: restaurants.filter((r) => (r.featuredClass ?? 3) === 1).length,
  }), [restaurants]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="animate-spin text-gold-500" size={32} />
        <p className="text-[var(--text-secondary)] font-black uppercase tracking-widest text-[9px]">
          Laddar restauranger...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-[var(--text-primary)]">
            Restauranger
          </h1>
          <p className="text-[var(--text-secondary)] text-[9px] font-bold uppercase tracking-widest mt-0.5">
            {stats.total} totalt · {stats.open} öppna · {stats.gold} guld-tier
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchRestaurants}
            className="w-9 h-9 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => router.push("/restaurants/new")}
            className="flex items-center gap-2 px-4 py-2.5 bg-gold-500 hover:bg-gold-400 text-[#0d0d0d] font-black uppercase tracking-widest text-[9px] rounded-xl shadow-lg shadow-gold-500/20 transition-all active:scale-95"
          >
            <Plus size={14} /> Ny restaurang
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            size={13}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
          />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Sök restauranger..."
            className="w-full bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl pl-9 pr-4 py-2.5 text-[11px] font-bold outline-none focus:border-gold-500/30 transition-all"
          />
        </div>
        <div className="flex gap-1 p-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl">
          {[
            { id: "all", label: "Alla" },
            { id: "open", label: "Öppna" },
            { id: "closed", label: "Stängda" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilterStatus(f.id as any)}
              className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                filterStatus === f.id
                  ? "bg-gold-500 text-[#0d0d0d]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 p-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl">
          <button
            onClick={() => setFilterTier("all")}
            className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
              filterTier === "all"
                ? "bg-gold-500 text-[#0d0d0d]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Tier: Alla
          </button>
          {PREMIUM_TIERS.map((t) => (
            <button
              key={t.value}
              onClick={() => setFilterTier(t.value)}
              className={`px-3 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                filterTier === t.value
                  ? `${t.bg} ${t.color} border`
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Restaurant grid */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center rounded-2xl border border-dashed border-[var(--border-subtle)]">
          <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-30">
            Inga restauranger hittades
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((r) => {
            const tier =
              PREMIUM_TIERS.find((t) => t.value === (r.featuredClass ?? 3)) ||
              PREMIUM_TIERS[2];
            const TierIcon = tier.icon;
            const isOnline = r.isOpen || r.manualIsOpen;

            return (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="group relative rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] overflow-hidden hover:border-gold-500/20 transition-all cursor-pointer"
                onClick={() => router.push(`/restaurants/${r.id}`)}
              >
                {/* Hero */}
                <div className="h-28 relative overflow-hidden bg-[var(--bg-primary)]">
                  {r.heroImageUrl ? (
                    <img
                      src={r.heroImageUrl}
                      className="h-full w-full object-cover opacity-50 group-hover:scale-105 transition-transform duration-500"
                      alt={r.name}
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center">
                      <Sparkles
                        size={24}
                        className="text-[var(--text-secondary)] opacity-10"
                      />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-secondary)] to-transparent" />

                  {/* Avatar */}
                  <div className="absolute -bottom-4 left-4 w-12 h-12 rounded-xl border-2 border-[var(--bg-secondary)] overflow-hidden bg-[var(--bg-primary)] shadow-lg">
                    {r.imageUrl ? (
                      <img
                        src={r.imageUrl}
                        className="h-full w-full object-cover"
                        alt=""
                      />
                    ) : (
                      <div className="h-full flex items-center justify-center text-[var(--text-secondary)] opacity-20">
                        <Sparkles size={14} />
                      </div>
                    )}
                  </div>

                  {/* Tier badge */}
                  <div className="absolute top-2 right-2">
                    <span
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[7px] font-black uppercase border ${tier.bg} ${tier.color}`}
                    >
                      <TierIcon size={8} /> {tier.label}
                    </span>
                  </div>
                </div>

                <div className="p-4 pt-7">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-sm font-black uppercase text-[var(--text-primary)] leading-tight">
                        {r.name}
                      </h3>
                      <p className="text-[8px] font-bold text-gold-500 uppercase tracking-widest mt-0.5">
                        {r.cuisine || "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          isOnline
                            ? "bg-emerald-400 animate-pulse"
                            : "bg-[var(--text-secondary)] opacity-30"
                        }`}
                      />
                      <span
                        className={`text-[8px] font-black uppercase ${
                          isOnline ? "text-emerald-400" : "text-[var(--text-secondary)]"
                        }`}
                      >
                        {isOnline ? "Öppen" : "Stängd"}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div>
                      <p className="text-[7px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-50">
                        ETA
                      </p>
                      <p className="text-[9px] font-black text-[var(--text-primary)]">
                        {r.etaMinutes} min
                      </p>
                    </div>
                    <div>
                      <p className="text-[7px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-50">
                        Frakt
                      </p>
                      <p className="text-[9px] font-black text-[var(--text-primary)]">
                        {r.deliveryFee} kr
                      </p>
                    </div>
                    <div>
                      <p className="text-[7px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-50">
                        Min order
                      </p>
                      <p className="text-[9px] font-black text-[var(--text-primary)]">
                        {r.minOrderAmount} kr
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-3 border-t border-[var(--border-subtle)]">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/restaurants/${r.id}`);
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[8px] font-black uppercase tracking-wider text-[var(--text-secondary)] hover:text-gold-500 hover:border-gold-500/20 transition-all"
                    >
                      Hantera <ChevronRight size={11} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm(r);
                      }}
                      className="w-8 h-8 rounded-xl bg-rose-500/5 border border-rose-500/10 text-rose-400 hover:bg-rose-500/15 transition-all flex items-center justify-center"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}

          {/* Add new */}
          <div
            onClick={() => router.push("/restaurants/new")}
            className="group border-2 border-dashed border-[var(--border-subtle)] rounded-2xl flex flex-col items-center justify-center p-10 hover:border-gold-500/30 transition-all cursor-pointer bg-white/[0.01] min-h-[220px]"
          >
            <div className="w-10 h-10 rounded-xl bg-[var(--bg-secondary)] flex items-center justify-center text-[var(--text-secondary)] group-hover:text-gold-500 group-hover:bg-gold-500/10 transition-all mb-3">
              <Plus size={20} />
            </div>
            <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
              Lägg till restaurang
            </p>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm.id)}
        title="Radera restaurang"
        message={`Radera ${deleteConfirm?.name} permanent? Alla ordrar och produkter raderas.`}
        confirmLabel="Radera"
        danger
      />
    </div>
  );
}
