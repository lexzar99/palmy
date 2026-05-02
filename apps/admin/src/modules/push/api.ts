import { apiPost } from "@/shared/api/client";

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
  chunks?: number;
  error?: string;
}

export const sendPushBroadcast = (payload: PushBroadcastPayload) =>
  apiPost<PushResult>("/notifications/admin/send-all", payload);

export const sendPushToUser = (payload: PushUserPayload) =>
  apiPost<PushResult>("/notifications/admin/send-user", payload);

export const sendPushToCity = (payload: PushCityPayload) =>
  apiPost<PushResult>("/notifications/admin/send-city", payload);
