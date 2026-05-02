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
  chunks?: number;
  error?: string;
}

export interface PushLogRecord {
  id: string;
  createdAt: string;
  target: "all" | "user" | "city";
  identifier?: string | null;
  city?: string | null;
  title: string;
  body: string;
  deeplink?: string | null;
  count: number;
  success: boolean;
  error?: string | null;
  sentBy?: string | null;
}

export const pushHistoryQueryKey = ["push", "history"] as const;

export const sendPushBroadcast = (payload: PushBroadcastPayload) =>
  apiPost<PushResult>("/notifications/admin/send-all", payload);

export const sendPushToUser = (payload: PushUserPayload) =>
  apiPost<PushResult>("/notifications/admin/send-user", payload);

export const sendPushToCity = (payload: PushCityPayload) =>
  apiPost<PushResult>("/notifications/admin/send-city", payload);

export const getPushHistory = () =>
  apiGet<{ logs: PushLogRecord[] }>("/notifications/admin/history");

export const getPushHistoryForCustomer = (customerId: string) =>
  apiGet<{ logs: PushLogRecord[] }>(`/customers/${customerId}/push-history`);
