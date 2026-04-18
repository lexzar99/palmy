 
"use client";

import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import {
  Star,
  Loader2,
  MessageSquare,
  ThumbsUp,
  ThumbsDown,
  Trash2,
  Search,
  Filter,
  TrendingUp,
  ChevronRight,
  Flag,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { useToast } from "@/components/Toast";
import { useRestaurantStore } from "@/store/restaurantStore";

interface Review {
  id: string;
  customerName: string;
  restaurantName: string;
  restaurantId: string;
  rating: number;
  comment: string;
  reply?: string;
  flagged: boolean;
  createdAt: string;
}

export default function ReviewsPage() {
  const { success, error: toastError } = useToast();
  const { selectedRestaurantId } = useRestaurantStore();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const token = () =>
    typeof window !== "undefined" ? localStorage.getItem("matgo_token") || "" : "";

  const fetchReviews = useCallback(async () => {
    try {
      const params = selectedRestaurantId ? `?restaurantId=${selectedRestaurantId}` : "";
      const res = await axios.get(`${API_URL}/api/admin/reviews${params}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      setReviews(res.data || []);
    } catch {
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [selectedRestaurantId]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleReply = async (reviewId: string) => {
    if (!replyText.trim()) return;
    try {
      await axios.post(
        `${API_URL}/api/admin/reviews/${reviewId}/reply`,
        { reply: replyText },
        { headers: { Authorization: `Bearer ${token()}` } }
      );
      setReviews((prev) =>
        prev.map((r) => (r.id === reviewId ? { ...r, reply: replyText } : r))
      );
      setReplyingTo(null);
      setReplyText("");
      success("Svar skickat!");
    } catch {
      toastError("Kunde inte skicka svar");
    }
  };

  const toggleFlag = async (reviewId: string, flagged: boolean) => {
    try {
      await axios.patch(
        `${API_URL}/api/admin/reviews/${reviewId}`,
        { flagged: !flagged },
        { headers: { Authorization: `Bearer ${token()}` } }
      );
      setReviews((prev) =>
        prev.map((r) => (r.id === reviewId ? { ...r, flagged: !flagged } : r))
      );
      success(!flagged ? "Recension flaggad" : "Flagga borttagen");
    } catch {
      toastError("Kunde inte uppdatera");
    }
  };

  const deleteReview = async (reviewId: string) => {
    if (!confirm("Radera denna recension?")) return;
    try {
      await axios.delete(`${API_URL}/api/admin/reviews/${reviewId}`, {
        headers: { Authorization: `Bearer ${token()}` },
      });
      setReviews((prev) => prev.filter((r) => r.id !== reviewId));
      success("Recension raderad");
    } catch {
      toastError("Kunde inte radera");
    }
  };

  // Stats
  const avgRating =
    reviews.length > 0
      ? (reviews.reduce((s, r) => s + r.rating, 0) / reviews.length).toFixed(1)
      : "0.0";
  const ratingDist = [5, 4, 3, 2, 1].map((r) => ({
    rating: r,
    count: reviews.filter((rev) => rev.rating === r).length,
    pct: reviews.length > 0
      ? Math.round((reviews.filter((rev) => rev.rating === r).length / reviews.length) * 100)
      : 0,
  }));

  const filtered = reviews.filter((r) => {
    if (search && !r.customerName.toLowerCase().includes(search.toLowerCase()) && !r.comment.toLowerCase().includes(search.toLowerCase())) return false;
    if (ratingFilter !== null && r.rating !== ratingFilter) return false;
    return true;
  });

  const Stars = ({ rating, size = 12 }: { rating: number; size?: number }) => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={size}
          className={i <= rating ? "text-gold-500 fill-gold-500" : "text-[var(--border-subtle)]"}
        />
      ))}
    </div>
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-40 gap-4">
        <Loader2 className="animate-spin text-gold-500" size={32} />
        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] animate-pulse">
          Laddar recensioner…
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black uppercase tracking-tight text-[var(--text-primary)]">
          Recensioner
        </h1>
        <p className="text-[var(--text-secondary)] text-[10px] font-bold uppercase tracking-widest mt-1">
          Kundbetyg & feedback
        </p>
      </div>

      {/* Rating overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Average score */}
        <div className="p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] flex flex-col items-center justify-center gap-3">
          <div className="text-5xl font-black text-gold-500">{avgRating}</div>
          <Stars rating={Math.round(parseFloat(avgRating))} size={18} />
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)]">
            {reviews.length} recensioner totalt
          </p>
        </div>

        {/* Distribution */}
        <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] col-span-1 lg:col-span-2">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)] mb-4">
            Betygsfördelning
          </h3>
          <div className="space-y-2">
            {ratingDist.map((d) => (
              <button
                key={d.rating}
                onClick={() => setRatingFilter(ratingFilter === d.rating ? null : d.rating)}
                className={`w-full flex items-center gap-3 py-1.5 group transition-all rounded-lg px-2 ${
                  ratingFilter === d.rating ? "bg-gold-500/5" : "hover:bg-white/[0.02]"
                }`}
              >
                <span className="text-[10px] font-black text-[var(--text-secondary)] w-4">{d.rating}</span>
                <Star size={11} className="text-gold-500 fill-gold-500" />
                <div className="flex-1 h-2 rounded-full bg-[var(--bg-primary)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gold-gradient transition-all duration-500"
                    style={{ width: `${d.pct}%` }}
                  />
                </div>
                <span className="text-[10px] font-black text-[var(--text-secondary)] w-10 text-right">
                  {d.count}
                </span>
                <span className="text-[10px] font-bold text-[var(--text-secondary)] w-8 text-right">
                  {d.pct}%
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: "Positiva",
            value: reviews.filter((r) => r.rating >= 4).length,
            icon: ThumbsUp,
            color: "text-emerald-400",
            bg: "bg-emerald-500/10",
          },
          {
            label: "Negativa",
            value: reviews.filter((r) => r.rating <= 2).length,
            icon: ThumbsDown,
            color: "text-rose-400",
            bg: "bg-rose-500/10",
          },
          {
            label: "Flaggade",
            value: reviews.filter((r) => r.flagged).length,
            icon: AlertTriangle,
            color: "text-amber-400",
            bg: "bg-amber-500/10",
          },
          {
            label: "Besvarade",
            value: reviews.filter((r) => r.reply).length,
            icon: CheckCircle2,
            color: "text-sky-400",
            bg: "bg-sky-500/10",
          },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)]">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-8 h-8 rounded-xl ${s.bg} flex items-center justify-center`}>
                  <Icon size={14} className={s.color} />
                </div>
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] mb-1">
                {s.label}
              </div>
              <div className={`text-xl font-black ${s.color}`}>{s.value}</div>
            </div>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sök recensioner…"
          className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)] text-[11px] font-bold text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none focus:border-gold-500/30"
        />
        {ratingFilter !== null && (
          <button
            onClick={() => setRatingFilter(null)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black uppercase text-gold-500 hover:text-gold-400"
          >
            Rensa filter
          </button>
        )}
      </div>

      {/* Reviews list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="py-20 text-center">
            <MessageSquare size={40} className="mx-auto mb-4 text-[var(--text-secondary)] opacity-20" />
            <p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-secondary)] opacity-40">
              {search || ratingFilter !== null ? "Inga recensioner matchade" : "Inga recensioner ännu"}
            </p>
          </div>
        ) : (
          filtered.map((review) => (
            <div
              key={review.id}
              className={`p-4 rounded-2xl border bg-[var(--bg-secondary)] transition-all ${
                review.flagged ? "border-amber-500/20" : "border-[var(--border-subtle)] hover:border-gold-500/10"
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0 text-[11px] font-black text-[var(--text-secondary)]">
                  {review.customerName.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-black uppercase text-[var(--text-primary)]">
                        {review.customerName}
                      </span>
                      <span className="text-[10px] font-bold text-[var(--text-secondary)] ml-2">
                        {review.restaurantName}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Stars rating={review.rating} />
                      <span className="text-[10px] font-bold text-[var(--text-secondary)] ml-1">
                        {new Date(review.createdAt).toLocaleDateString("sv-SE")}
                      </span>
                    </div>
                  </div>

                  {review.comment && (
                    <p className="text-[11px] font-medium text-[var(--text-primary)] mt-2 leading-relaxed opacity-80">
                      &ldquo;{review.comment}&rdquo;
                    </p>
                  )}

                  {/* Reply */}
                  {review.reply && (
                    <div className="mt-3 p-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
                      <p className="text-[10px] font-black uppercase tracking-widest text-gold-500 mb-1">
                        Svar från restaurang
                      </p>
                      <p className="text-[10px] font-medium text-[var(--text-secondary)]">
                        {review.reply}
                      </p>
                    </div>
                  )}

                  {/* Reply input */}
                  {replyingTo === review.id && (
                    <div className="mt-3 flex gap-2">
                      <input
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Skriv svar…"
                        className="flex-1 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[10px] font-bold text-[var(--text-primary)] outline-none focus:border-gold-500/30"
                        onKeyDown={(e) => e.key === "Enter" && handleReply(review.id)}
                        autoFocus
                      />
                      <button
                        onClick={() => handleReply(review.id)}
                        className="px-3 py-2 rounded-xl bg-gold-gradient text-[#0d0d0d] text-[10px] font-black uppercase"
                      >
                        Skicka
                      </button>
                      <button
                        onClick={() => { setReplyingTo(null); setReplyText(""); }}
                        className="px-3 py-2 rounded-xl border border-[var(--border-subtle)] text-[10px] font-black uppercase text-[var(--text-secondary)]"
                      >
                        Avbryt
                      </button>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3">
                    {!review.reply && replyingTo !== review.id && (
                      <button
                        onClick={() => setReplyingTo(review.id)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)] hover:text-gold-500 hover:bg-gold-500/5 transition-all"
                      >
                        <MessageSquare size={11} /> Svara
                      </button>
                    )}
                    <button
                      onClick={() => toggleFlag(review.id, review.flagged)}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                        review.flagged
                          ? "text-amber-400 bg-amber-500/10"
                          : "text-[var(--text-secondary)] hover:text-amber-400 hover:bg-amber-500/5"
                      }`}
                    >
                      <Flag size={11} /> {review.flagged ? "Flaggad" : "Flagga"}
                    </button>
                    <button
                      onClick={() => deleteReview(review.id)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider text-rose-400/40 hover:text-rose-400 hover:bg-rose-500/5 transition-all"
                    >
                      <Trash2 size={11} /> Radera
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
