"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Flag,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Star,
  Trash2,
} from "lucide-react";
import { API_URL } from "@/lib/api";
import { getStoredToken } from "@/lib/auth-storage";
import { useToast } from "@/components/Toast";
import { useRestaurantStore } from "@/store/restaurantStore";

type Review = {
  id: string;
  customerName: string;
  restaurantName: string;
  restaurantId: string;
  rating: number;
  comment: string;
  reply?: string;
  flagged: boolean;
  createdAt: string;
};

const relativeDate = (value: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const Stars = ({ rating }: { rating: number }) => (
  <div className="flex items-center gap-1">
    {[1, 2, 3, 4, 5].map((value) => (
      <Star key={value} size={12} className={value <= rating ? "fill-amber-300 text-amber-300" : "text-slate-600"} />
    ))}
  </div>
);

export default function ReviewsPage() {
  const { success, error: toastError } = useToast();
  const { selectedRestaurantId } = useRestaurantStore();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [ratingFilter, setRatingFilter] = useState<number | null>(null);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const fetchReviews = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/admin/reviews`, {
        headers: { Authorization: `Bearer ${token}` },
        params: selectedRestaurantId ? { restaurantId: selectedRestaurantId } : undefined,
      });
      setReviews(response.data || []);
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte ladda recensionerna.");
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [selectedRestaurantId, toastError]);

  useEffect(() => {
    void fetchReviews();
  }, [fetchReviews]);

  const filtered = useMemo(() => {
    return reviews.filter((review) => {
      if (ratingFilter !== null && review.rating !== ratingFilter) return false;
      if (!search.trim()) return true;

      const query = search.toLowerCase();
      return (
        review.customerName.toLowerCase().includes(query) ||
        review.restaurantName.toLowerCase().includes(query) ||
        review.comment.toLowerCase().includes(query)
      );
    });
  }, [ratingFilter, reviews, search]);

  const metrics = useMemo(() => {
    const average = reviews.length > 0 ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;
    return {
      average,
      total: reviews.length,
      low: reviews.filter((review) => review.rating <= 2).length,
      flagged: reviews.filter((review) => review.flagged).length,
      replied: reviews.filter((review) => Boolean(review.reply)).length,
    };
  }, [reviews]);

  const toggleFlag = async (review: Review) => {
    const token = getStoredToken();
    if (!token) return;

    try {
      await axios.patch(
        `${API_URL}/api/admin/reviews/${review.id}`,
        { flagged: !review.flagged },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setReviews((previous) => previous.map((item) => (item.id === review.id ? { ...item, flagged: !item.flagged } : item)));
      success(!review.flagged ? "Recensionen flaggades." : "Flaggan togs bort.");
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte uppdatera recensionen.");
    }
  };

  const submitReply = async (reviewId: string) => {
    const token = getStoredToken();
    if (!token || !replyText.trim()) return;

    try {
      await axios.post(
        `${API_URL}/api/admin/reviews/${reviewId}/reply`,
        { reply: replyText },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setReviews((previous) => previous.map((review) => (review.id === reviewId ? { ...review, reply: replyText } : review)));
      setReplyingId(null);
      setReplyText("");
      success("Svar sparat.");
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte spara svaret.");
    }
  };

  const removeReview = async (reviewId: string) => {
    const token = getStoredToken();
    if (!token) return;

    if (!window.confirm("Radera recensionen?")) return;

    try {
      await axios.delete(`${API_URL}/api/admin/reviews/${reviewId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setReviews((previous) => previous.filter((review) => review.id !== reviewId));
      success("Recensionen raderades.");
    } catch (err: any) {
      toastError(err.response?.data?.error || "Kunde inte radera recensionen.");
    }
  };

  if (loading) {
    return (
      <div className="panel flex min-h-[360px] items-center justify-center rounded-[32px] px-6 py-12">
        <div className="flex items-center gap-3 text-[var(--text-secondary)]">
          <Loader2 className="animate-spin text-amber-200" size={18} />
          <span className="text-sm font-bold">Laddar recensioner…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-16">
      <section className="panel rounded-[32px] px-6 py-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <span className="control-chip">Quality desk</span>
            <div>
              <h2 className="text-3xl font-black tracking-[-0.06em] text-[var(--text-primary)] sm:text-4xl">Reviews utan döda flöden</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
                Recensioner hämtas nu från riktiga orderdata och kan flaggas, besvaras eller rensas utan att gå via saknade endpoints.
              </p>
            </div>
          </div>

          <button type="button" onClick={() => void fetchReviews()} className="control-chip">
            <RefreshCw size={13} /> Uppdatera
          </button>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-5">
        {[
          { label: "Snittbetyg", value: metrics.average.toFixed(1), sub: `${metrics.total} recensioner` },
          { label: "Låga betyg", value: metrics.low, sub: "1-2 stjärnor" },
          { label: "Flaggade", value: metrics.flagged, sub: "Kräver uppföljning" },
          { label: "Besvarade", value: metrics.replied, sub: "Svarade från admin" },
          { label: "Obesvarade", value: metrics.total - metrics.replied, sub: "Kan följas upp idag" },
        ].map((metric) => (
          <article key={metric.label} className="metric-card panel-muted">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-[var(--text-muted)]">{metric.label}</p>
            <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{metric.value}</p>
            <p className="mt-4 text-sm leading-6 text-[var(--text-secondary)]">{metric.sub}</p>
          </article>
        ))}
      </section>

      <section className="panel rounded-[32px] px-6 py-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative flex-1">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Sök kund, restaurang eller kommentar"
              className="control-input pl-10"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setRatingFilter(null)} className={`rounded-2xl px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] ${ratingFilter === null ? "bg-gold-gradient text-[#091018]" : "border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)]"}`}>
              Alla betyg
            </button>
            {[5, 4, 3, 2, 1].map((rating) => (
              <button key={rating} type="button" onClick={() => setRatingFilter(rating)} className={`rounded-2xl px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] ${ratingFilter === rating ? "bg-[rgba(245,191,91,0.18)] text-amber-100" : "border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] text-[var(--text-secondary)]"}`}>
                {rating}★
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          {filtered.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-[var(--border-subtle)] px-6 py-16 text-center text-sm leading-7 text-[var(--text-secondary)]">
              Inga recensioner matchade filtren.
            </div>
          ) : (
            filtered.map((review) => (
              <article key={review.id} className={`rounded-[30px] border px-5 py-5 ${review.flagged ? "border-amber-300/24 bg-amber-300/10" : "border-[var(--border-subtle)] bg-[var(--panel-muted)]"}`}>
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black uppercase tracking-[0.22em] text-amber-200">{review.restaurantName}</span>
                      <span className="control-chip">{review.customerName}</span>
                      {review.flagged ? <span className="control-chip text-amber-100">Flaggad</span> : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <Stars rating={review.rating} />
                      <span className="text-xs text-[var(--text-muted)]">{relativeDate(review.createdAt)}</span>
                    </div>
                    <p className="max-w-3xl text-sm leading-7 text-[var(--text-secondary)]">{review.comment || "Kunden lämnade ett betyg utan text."}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => toggleFlag(review)} className="control-chip">
                      <Flag size={13} /> {review.flagged ? "Avflagga" : "Flagga"}
                    </button>
                    <button type="button" onClick={() => removeReview(review.id)} className="control-chip text-rose-200">
                      <Trash2 size={13} /> Radera
                    </button>
                  </div>
                </div>

                {review.reply ? (
                  <div className="mt-4 rounded-[24px] border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.03)] px-4 py-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">Svar från admin</p>
                    <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">{review.reply}</p>
                  </div>
                ) : null}

                {replyingId === review.id ? (
                  <div className="mt-4 grid gap-3">
                    <textarea
                      value={replyText}
                      onChange={(event) => setReplyText(event.target.value)}
                      placeholder="Skriv ett tydligt svar till kunden"
                      className="control-input min-h-[120px] resize-none"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => void submitReply(review.id)} className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018]">
                        <MessageSquare size={14} /> Spara svar
                      </button>
                      <button type="button" onClick={() => { setReplyingId(null); setReplyText(""); }} className="control-chip">
                        Avbryt
                      </button>
                    </div>
                  </div>
                ) : !review.reply ? (
                  <div className="mt-4">
                    <button type="button" onClick={() => { setReplyingId(review.id); setReplyText(""); }} className="control-chip">
                      <MessageSquare size={13} /> Svara
                    </button>
                  </div>
                ) : null}
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
