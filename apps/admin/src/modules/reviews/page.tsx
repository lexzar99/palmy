"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { deleteReview, getReviews, replyToReview, reviewsQueryKey, updateReview, type ReviewRecord } from "@/modules/reviews/api";
import { Badge, Button, EmptyState, ErrorPanel, Input, Modal, PageHeader, Surface, Textarea } from "@/shared/components/ui";
import { formatDateTime } from "@/shared/utils/format";
import { cn } from "@/shared/utils/cn";

type ReviewFilter = "all" | "low" | "unanswered";

function ReplyModal({ review, open, onClose }: { review: ReviewRecord | null; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setReply(review?.reply || "");
  }, [open, review]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const mutation = useMutation({
    mutationFn: () => replyToReview(review!.id, reply),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: reviewsQueryKey });
      onClose();
    },
  });

  return (
    <Modal open={open} onClose={onClose} title={review ? `Svara ${review.customerName}` : "Svara"} footer={<div className="flex justify-end gap-2"><Button onClick={onClose}>Stäng</Button><Button variant="primary" onClick={() => mutation.mutate()}>Spara svar</Button></div>}>
      <div className="space-y-4">
        {review ? <div className="surface-muted px-4 py-4 text-sm text-[var(--text-secondary)]">{review.comment || "Ingen kommentar"}</div> : null}
        <Textarea value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Skriv ett kort svar på recensionen" />
      </div>
    </Modal>
  );
}

export function ReviewsPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [activeReview, setActiveReview] = useState<ReviewRecord | null>(null);
  const REVIEWS_PAGE = 20;
  const [visible, setVisible] = useState(REVIEWS_PAGE);

  const reviews = useQuery({ queryKey: reviewsQueryKey, queryFn: getReviews });

  const flagMutation = useMutation({
    mutationFn: (review: ReviewRecord) => updateReview(review.id, { flagged: !review.flagged }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: reviewsQueryKey }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (reviewId: string) => deleteReview(reviewId),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: reviewsQueryKey }); },
  });

  const filteredReviews = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    return (reviews.data || []).filter((review) => {
      if (lowerQuery && !`${review.customerName} ${review.restaurantName} ${review.comment}`.toLowerCase().includes(lowerQuery)) return false;
      if (filter === "low" && (review.rating || 0) >= 3) return false;
      if (filter === "unanswered" && Boolean(review.reply)) return false;
      return true;
    });
  }, [query, filter, reviews.data]);

  if (reviews.isLoading) {
    return <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Laddar recensioner...</Surface>;
  }

  if (reviews.isError || !reviews.data) {
    return <ErrorPanel title="Recensionerna kunde inte laddas" description="Admin-endpointen för recensioner är inte tillgänglig." action={<Button onClick={() => void reviews.refetch()}>Försök igen</Button>} />;
  }

  const totalReviews = reviews.data?.length || 0;

  const chips: Array<{ value: ReviewFilter; label: React.ReactNode }> = [
    { value: "all", label: "Alla" },
    { value: "low", label: "★ Låga" },
    { value: "unanswered", label: "Obesvarade" },
  ];

  return (
    <div className="page-stack">
      <PageHeader
        title="Recensioner"
        breadcrumb="Drift"
        actions={chips.map((chip) => (
          <button
            key={chip.value}
            type="button"
            onClick={() => { setFilter(chip.value); setVisible(REVIEWS_PAGE); }}
            className={cn("chip", filter === chip.value && "is-active")}
          >
            {chip.label}
          </button>
        ))}
      />

      <Surface className="px-6 py-6">
        <Input value={query} onChange={(event) => { setQuery(event.target.value); setVisible(REVIEWS_PAGE); }} placeholder="Sök recensioner" />

        {filteredReviews.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title={totalReviews === 0 ? "Inga recensioner än" : "Inga matchande recensioner"}
              description={totalReviews === 0
                ? "Recensioner skapas när kunder lämnar betyg via web (/order/[id]) eller mobil-appen efter levererad order. När de börjar trilla in dyker de upp här. Kontrollera att du loggat in som SUPER_ADMIN för att se alla restauranger."
                : "Justera filtret eller söktermen ovan."}
            />
          </div>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            {filteredReviews.slice(0, visible).map((review) => {
              const rating = review.rating || 0;
              const isLow = rating < 3;
              const isHigh = rating >= 4;
              const answered = Boolean(review.reply);
              return (
                <div
                  key={review.id}
                  className={cn(
                    "surface px-[18px] py-4",
                    isLow && "border-[color-mix(in_srgb,var(--danger)_18%,transparent)]",
                    answered && "opacity-70",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span
                        className="flex items-center gap-1 text-[13px] font-extrabold"
                        style={{ color: isHigh ? "var(--success-text)" : isLow ? "var(--danger)" : "var(--text-secondary)" }}
                      >
                        <Star size={13} fill="currentColor" strokeWidth={0} />
                        {rating.toFixed(1).replace(".", ",")}
                      </span>
                      <span className="text-[13px] font-bold text-[var(--text-primary)]">{review.customerName}</span>
                      <span className="text-[12px] text-[var(--text-muted)]">· {review.restaurantName} · {formatDateTime(review.createdAt)}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {answered ? (
                        <Badge tone="success">Besvarad</Badge>
                      ) : (
                        <>
                          <Button variant="primary" className="px-3 py-1.5 text-[12px]" onClick={() => setActiveReview(review)}>Svara</Button>
                          <Button variant="secondary" className="px-3 py-1.5 text-[12px]" onClick={() => flagMutation.mutate(review)}>{review.flagged ? "Visa" : "Dölj"}</Button>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="mt-[9px] text-[13px] leading-[1.5] text-[var(--text-secondary)]">{review.comment || "Ingen kommentar"}</p>
                  {answered ? (
                    <div className="mt-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--success-soft)] px-4 py-3 text-[13px] leading-[1.5] text-[var(--success-text)]">{review.reply}</div>
                  ) : null}
                </div>
              );
            })}
            {filteredReviews.length > visible && (
              <div className="flex justify-center pt-1">
                <Button variant="secondary" onClick={() => setVisible((v) => v + REVIEWS_PAGE)}>
                  Visa fler ({filteredReviews.length - visible} kvar)
                </Button>
              </div>
            )}
          </div>
        )}
      </Surface>

      <ReplyModal review={activeReview} open={Boolean(activeReview)} onClose={() => setActiveReview(null)} />
    </div>
  );
}
