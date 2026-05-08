"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareReply } from "lucide-react";
import { deleteReview, getReviews, replyToReview, reviewsQueryKey, updateReview, type ReviewRecord } from "@/modules/reviews/api";
import { Badge, Button, EmptyState, ErrorPanel, Input, Modal, PageHeader, Surface, Textarea } from "@/shared/components/ui";
import { formatDateTime } from "@/shared/utils/format";

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
    <Modal open={open} onClose={onClose} title={review ? `Reply to ${review.customerName}` : "Reply"} footer={<div className="flex justify-end gap-2"><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={() => mutation.mutate()}>Save reply</Button></div>}>
      <div className="space-y-4">
        {review ? <div className="surface-muted px-4 py-4 text-sm text-[var(--text-secondary)]">{review.comment || "No comment"}</div> : null}
        <Textarea value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write a concise review response" />
      </div>
    </Modal>
  );
}

export function ReviewsPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [activeReview, setActiveReview] = useState<ReviewRecord | null>(null);

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
    return (reviews.data || []).filter((review) => !lowerQuery || `${review.customerName} ${review.restaurantName} ${review.comment}`.toLowerCase().includes(lowerQuery));
  }, [query, reviews.data]);

  if (reviews.isLoading) {
    return <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Loading reviews...</Surface>;
  }

  if (reviews.isError || !reviews.data) {
    return <ErrorPanel title="Reviews could not be loaded" description="The review admin endpoint is unavailable." action={<Button onClick={() => void reviews.refetch()}>Retry</Button>} />;
  }

  const totalReviews = reviews.data?.length || 0;
  const flaggedCount = (reviews.data || []).filter((r) => r.flagged).length;
  const avgRating = totalReviews > 0
    ? ((reviews.data || []).reduce((sum, r) => sum + (r.rating || 0), 0) / totalReviews).toFixed(1)
    : "—";

  return (
    <div className="page-stack">
      <PageHeader title="Recensioner" />

      <Surface className="px-6 py-6">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Sök recensioner" />

        {filteredReviews.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              title={totalReviews === 0 ? "Inga recensioner än" : "Inga matchande recensioner"}
              description={totalReviews === 0
                ? "Recensioner skapas när kunder lämnar betyg via web (/order/[id]) eller mobil-appen efter levererad order. När de börjar trilla in dyker de upp här. Kontrollera att du loggat in som SUPER_ADMIN för att se alla restauranger."
                : "Justera söktermen ovan."}
            />
          </div>
        ) : (
          <div className="mt-6 grid gap-3 lg:grid-cols-2">
            {filteredReviews.map((review) => (
              <div key={review.id} className="surface-muted px-5 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-black tracking-[-0.02em]">{review.customerName}</p>
                      <Badge tone={review.flagged ? "danger" : "info"}>{review.rating}/5</Badge>
                    </div>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">{review.restaurantName} • {formatDateTime(review.createdAt)}</p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-7 text-[var(--text-secondary)]">{review.comment || "No comment"}</p>
                {review.reply ? <div className="mt-4 rounded-2xl border border-[rgba(94,166,255,0.18)] bg-[rgba(94,166,255,0.08)] px-4 py-4 text-sm text-[#d4e7ff]">{review.reply}</div> : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => setActiveReview(review)}><MessageSquareReply size={16} /> Reply</Button>
                  <Button variant="secondary" onClick={() => flagMutation.mutate(review)}>{review.flagged ? "Unflag" : "Flag"}</Button>
                  <Button variant="danger" onClick={() => deleteMutation.mutate(review.id)}>Delete</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Surface>

      <ReplyModal review={activeReview} open={Boolean(activeReview)} onClose={() => setActiveReview(null)} />
    </div>
  );
}
