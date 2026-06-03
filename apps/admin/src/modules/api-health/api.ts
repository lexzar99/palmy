import { apiGet } from "@/shared/api/client";

export type ApiStatus = "ok" | "error" | "configured" | "not_configured";

export interface ApiServiceStatus {
  key: string;
  name: string;
  category: string;
  configured: boolean;
  status: ApiStatus;
  latencyMs: number | null;
  detail: string | null;
  usage: { used: number; limit: number | null; remaining: number | null; period: string };
  limitNote: string | null;
  envVars: string[];
}

export interface ApiHealthResponse {
  generatedAt: string;
  period: string;
  services: ApiServiceStatus[];
}

export const apiHealthQueryKey = ["api-health"] as const;

export const getApiHealth = () => apiGet<ApiHealthResponse>("/admin/api-health");
