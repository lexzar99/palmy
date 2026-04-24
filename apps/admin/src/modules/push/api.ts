import { apiPost } from "@/shared/api/client";

export interface PushBroadcastPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushBroadcastResult {
  success: boolean;
  count: number;
  chunks?: number;
}

export const sendPushBroadcast = (payload: PushBroadcastPayload) => apiPost<PushBroadcastResult>("/notifications/admin/send-all", payload);
