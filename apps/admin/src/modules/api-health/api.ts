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

export type Severity = "ok" | "warning" | "critical" | "info";

export interface CapacityMetric {
  key: string;
  label: string;
  value: string;
  used?: number;
  limit?: number;
  pct?: number | null;
  severity: Severity;
  hint?: string;
}

export interface Capacity {
  supabase: { ok: boolean; metrics: CapacityMetric[]; note: string };
  host: { metrics: CapacityMetric[]; note: string };
  worst: Severity;
  alerts: CapacityMetric[];
  generatedAt: string;
}

export interface ApiHealthResponse {
  generatedAt: string;
  period: string;
  services: ApiServiceStatus[];
  capacity?: Capacity;
}

export const apiHealthQueryKey = ["api-health"] as const;

export const getApiHealth = () => apiGet<ApiHealthResponse>("/admin/api-health");
