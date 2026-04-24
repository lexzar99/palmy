import { apiDelete, apiGet, apiPatch, apiPost } from "@/shared/api/client";

export interface ReviewRecord {
  id: string;
  customerName: string;
  restaurantName: string;
  restaurantId: string;
  rating: number;
  comment: string;
  reply: string;
  flagged: boolean;
  createdAt: string;
}

export const reviewsQueryKey = ["reviews", "list"] as const;

export const getReviews = () => apiGet<ReviewRecord[]>("/admin/reviews");
export const replyToReview = (reviewId: string, reply: string) => apiPost(`/admin/reviews/${reviewId}/reply`, { reply });
export const updateReview = (reviewId: string, payload: { flagged?: boolean }) => apiPatch(`/admin/reviews/${reviewId}`, payload);
export const deleteReview = (reviewId: string) => apiDelete<{ success: boolean }>(`/admin/reviews/${reviewId}`);
