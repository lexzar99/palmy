// Recensionsprompt efter levererad order — delad skip-lista (Swift-paritet).
// Swift sparar skippade order-id i AppStorage viaeats.skippedReviewOrderIds
// (JSON-strängarray); webben använder samma nyckel i localStorage så en
// skippad prompt inte dyker upp igen på hemskärmen eller ordersidan.
export const SKIPPED_REVIEW_ORDER_IDS_KEY = "viaeats.skippedReviewOrderIds";

export function readSkippedReviewOrderIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(SKIPPED_REVIEW_ORDER_IDS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function addSkippedReviewOrderId(orderId: string): string[] {
  const next = Array.from(new Set([...readSkippedReviewOrderIds(), orderId]));
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(SKIPPED_REVIEW_ORDER_IDS_KEY, JSON.stringify(next));
    } catch {
      /* noop */
    }
  }
  return next;
}

export function isReviewSkipped(orderId: string): boolean {
  return readSkippedReviewOrderIds().includes(orderId);
}
