"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import axios from "axios";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Star } from "lucide-react";

type ReviewItem = {
  id: string;
  customerName: string;
  rating: number;
  comment: string;
  reply: string;
  likedItems: string[];
  createdAt: string;
};

type ReviewsResponse = {
  averageRating: number;
  totalCount: number;
  distribution: Record<string, number>;
  sort: "top" | "recent" | "low";
  reviews: ReviewItem[];
};

const SORT_OPTIONS = [
  { value: "top", label: "Bästa först" },
  { value: "recent", label: "Senaste" },
  { value: "low", label: "Lägst betyg" },
] as const;

const RATING_FILTERS = [
  { value: 1, label: "Alla" },
  { value: 5, label: "Endast 5★" },
  { value: 4, label: "4★ och uppåt" },
  { value: 3, label: "3★ och uppåt" },
] as const;

function relativeDate(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "";
  const diffDays = Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000));
  if (diffDays < 1) return "Idag";
  if (diffDays < 2) return "Igår";
  if (diffDays < 7) return `${diffDays} dagar sedan`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} veckor sedan`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} mån sedan`;
  return `${Math.floor(diffDays / 365)} år sedan`;
}

export default function RestaurantReviewsPage() {
  const params = useParams();
  const slug = String(params?.slug || "");

  const [data, setData] = useState<ReviewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<"top" | "recent" | "low">("top");
  const [minRating, setMinRating] = useState<number>(1);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    axios
      .get(`/api/platform/restaurants/${slug}/reviews`, {
        params: { sort, minRating },
      })
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setError(e?.response?.data?.error || "Kunde inte hämta recensioner");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, sort, minRating]);

  const distribution = useMemo(() => {
    const dist = data?.distribution || ({} as Record<string, number>);
    const total = data?.totalCount || 0;
    return [5, 4, 3, 2, 1].map((star) => {
      const count = Number(dist[star] || dist[String(star)] || 0);
      const percent = total > 0 ? Math.round((count / total) * 100) : 0;
      return { star, count, percent };
    });
  }, [data]);

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6 sm:pt-8">
        <Link
          href={`/restaurants/${slug}`}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider"
          style={{ color: "var(--text-secondary)" }}
        >
          <ArrowLeft size={14} /> Tillbaka till restaurang
        </Link>

        <h1 className="mt-6 text-3xl font-black tracking-[-0.04em] sm:text-4xl" style={{ color: "var(--text-primary)" }}>
          Recensioner
        </h1>

        {/* Översikt: snittbetyg + fördelning */}
        <div className="mt-6 rounded-[28px] p-6" style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}>
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-black tracking-[-0.04em]" style={{ color: "var(--text-primary)" }}>
                  {(data?.averageRating || 0).toFixed(1)}
                </span>
                <span className="text-sm font-bold text-zinc-500">/5</span>
              </div>
              <div className="mt-2 flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    size={18}
                    className={s <= Math.round(data?.averageRating || 0) ? "fill-gold-500 text-gold-500" : "text-zinc-700"}
                  />
                ))}
              </div>
              <p className="mt-2 text-xs font-bold uppercase tracking-wider text-zinc-500">
                {data?.totalCount || 0} recensioner totalt
              </p>
            </div>

            <div className="flex-1 w-full grid gap-1.5">
              {distribution.map((row) => (
                <button
                  key={row.star}
                  type="button"
                  onClick={() => setMinRating(row.star)}
                  className="flex items-center gap-3 text-left"
                >
                  <span className="text-xs font-black w-6" style={{ color: "var(--text-secondary)" }}>{row.star}★</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bg-deep)" }}>
                    <div
                      className="h-full bg-gold-500 transition-all"
                      style={{ width: `${row.percent}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider w-8 text-right" style={{ color: "var(--text-secondary)" }}>
                    {row.count}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Filter-knappar */}
        <div className="mt-6 flex flex-wrap gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 self-center">Sortera:</span>
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setSort(option.value)}
              className={`px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${
                sort === option.value
                  ? "bg-gold-500 text-zinc-950"
                  : "border border-zinc-700/40"
              }`}
              style={{ color: sort === option.value ? undefined : "var(--text-primary)" }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 self-center">Filter:</span>
          {RATING_FILTERS.map((option) => (
            <button
              key={option.value}
              onClick={() => setMinRating(option.value)}
              className={`px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${
                minRating === option.value
                  ? "bg-gold-500 text-zinc-950"
                  : "border border-zinc-700/40"
              }`}
              style={{ color: minRating === option.value ? undefined : "var(--text-primary)" }}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Reviews-lista */}
        <div className="mt-8 grid gap-4">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="animate-spin text-gold-500" size={32} />
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4 py-4 text-sm text-rose-300">
              {error}
            </div>
          ) : !data || data.reviews.length === 0 ? (
            <div className="rounded-2xl border border-zinc-700/30 px-6 py-12 text-center text-sm text-zinc-400">
              Inga recensioner som matchar filtren.
            </div>
          ) : (
            data.reviews.map((review, index) => (
              <motion.div
                key={review.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.03, 0.3) }}
                className="rounded-[24px] p-5 sm:p-6"
                style={{ backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-muted)" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black tracking-[-0.02em]" style={{ color: "var(--text-primary)" }}>
                      {review.customerName}
                    </p>
                    <div className="mt-1 flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          size={12}
                          className={s <= review.rating ? "fill-gold-500 text-gold-500" : "text-zinc-700"}
                        />
                      ))}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    {relativeDate(review.createdAt)}
                  </span>
                </div>

                {review.comment ? (
                  <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-secondary)" }}>
                    {review.comment}
                  </p>
                ) : null}

                {review.likedItems && review.likedItems.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {review.likedItems.map((name) => (
                      <span
                        key={name}
                        className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider"
                        style={{ backgroundColor: "rgba(243,191,87,0.12)", color: "var(--accent-strong, #f3bf57)" }}
                      >
                        ♥ {name}
                      </span>
                    ))}
                  </div>
                ) : null}

                {review.reply ? (
                  <div className="mt-4 rounded-2xl border-l-2 border-gold-500/60 bg-gold-500/5 px-4 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gold-500">Svar från restaurangen</p>
                    <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-secondary)" }}>{review.reply}</p>
                  </div>
                ) : null}
              </motion.div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
