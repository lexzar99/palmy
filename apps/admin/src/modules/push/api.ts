import { apiGet, apiPost } from "@/shared/api/client";

export interface PushBroadcastPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushUserPayload {
  identifier: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushCityPayload {
  city: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushResult {
  success: boolean;
  count: number;
  errors?: number;
  queued?: boolean;
  chunks?: number;
  error?: string;
}

export interface PushLogRecord {
  id: string;
  createdAt: string;
  target: "all" | "user" | "city" | "cohort";
  identifier?: string | null;
  city?: string | null;
  cohort?: string | null;
  title: string;
  body: string;
  deeplink?: string | null;
  count: number;
  success: boolean;
  error?: string | null;
  sentBy?: string | null;
}

export interface PushDeliveryMetric {
  provider: "FCM_FID" | "APNS" | "EXPO" | "WEB_PUSH" | string;
  status: "ACCEPTED" | "RETRY" | "INVALID" | "FAILED" | string;
  count: number;
}

export interface PushOutboxMetric {
  status: "PENDING" | "PROCESSING" | "RETRY" | "COMPLETED" | "DEAD" | string;
  count: number;
}

export interface PushHistoryResponse {
  logs: PushLogRecord[];
  deliveryMetrics: {
    since: string;
    acceptedMeans: "provider_accepted_not_device_displayed";
    deliveries: PushDeliveryMetric[];
    outbox: PushOutboxMetric[];
  };
  recentOutbox: Array<{
    id: string;
    kind: string;
    status: string;
    attemptCount: number;
    acceptedCount: number;
    invalidCount: number;
    failureCount: number;
    lastError?: string | null;
    createdAt: string;
    completedAt?: string | null;
  }>;
}

// A13 — cohort + scheduler types
export type CohortKey = "inactive_30d" | "new_users_7d" | "active_repeaters";

export const COHORT_LABEL: Record<CohortKey, string> = {
  inactive_30d: "Inaktiva kunder (>30 dagar)",
  new_users_7d: "Nya kunder (senaste 7 dagar, 0 ordrar)",
  active_repeaters: "Aktiva återköpare (3+ ordrar/30d)",
};

export interface SendCohortPayload {
  cohort: CohortKey;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface SchedulePushPayload {
  scheduledFor: string; // ISO
  target: "all" | "user" | "city" | "cohort";
  identifier?: string;
  city?: string;
  cohort?: CohortKey;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface ScheduledPushRecord {
  id: string;
  createdAt: string;
  scheduledFor: string;
  target: "all" | "user" | "city" | "cohort";
  identifier?: string | null;
  city?: string | null;
  cohort?: string | null;
  title: string;
  body: string;
  deeplink?: string | null;
  sentAt?: string | null;
  sentCount?: number | null;
  sentSuccess?: boolean | null;
  sentError?: string | null;
  cancelledAt?: string | null;
}

export const pushHistoryQueryKey = ["push", "history"] as const;
export const scheduledPushesQueryKey = ["push", "scheduled"] as const;

const pushIdempotencyConfig = () => ({
  headers: { "Idempotency-Key": crypto.randomUUID() },
});

export const sendPushBroadcast = (payload: PushBroadcastPayload) =>
  apiPost<PushResult>("/notifications/admin/send-all", payload, pushIdempotencyConfig());

export const sendPushToUser = (payload: PushUserPayload) =>
  apiPost<PushResult>("/notifications/admin/send-user", payload, pushIdempotencyConfig());

export const sendPushToCity = (payload: PushCityPayload) =>
  apiPost<PushResult>("/notifications/admin/send-city", payload, pushIdempotencyConfig());

export const sendPushToCohort = (payload: SendCohortPayload) =>
  apiPost<{ cohort: CohortKey; recipients: number; count: number; errors: number }>(
    "/notifications/admin/send-cohort",
    payload,
    pushIdempotencyConfig(),
  );

export const schedulePush = (payload: SchedulePushPayload) =>
  apiPost<ScheduledPushRecord>("/notifications/admin/schedule", payload);

export const getScheduledPushes = () =>
  apiGet<{ rows: ScheduledPushRecord[] }>("/notifications/admin/scheduled");

export const cancelScheduledPush = (id: string) =>
  apiPost<{ success: boolean }>(`/notifications/admin/scheduled/${id}/cancel`, {});

export const getPushHistory = () =>
  apiGet<PushHistoryResponse>("/notifications/admin/history");

export const getPushHistoryForCustomer = (customerId: string) =>
  apiGet<{ logs: PushLogRecord[] }>(`/customers/${customerId}/push-history`);
