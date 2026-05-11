"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle2, XCircle, AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { apiGet } from "@/shared/api/client";
import { Badge, Button, PageHeader, Surface } from "@/shared/components/ui";

type ServiceStatus = {
  status: "up" | "down" | "unconfigured";
  latencyMs?: number;
  error?: string;
};

interface HealthResponse {
  services: Record<string, ServiceStatus>;
  checkedAt: string;
}

const SERVICE_LABELS: Record<string, string> = {
  database: "Database (Postgres)",
  stripe: "Stripe API",
  stripeWebhook: "Stripe Webhook Secret",
  twilio: "Twilio (SMS)",
  apns: "Apple Push (APNs)",
  redis: "Redis (Socket.IO)",
  supabase: "Supabase Auth",
  cloudinary: "Cloudinary (CDN)",
};

export function HealthPage() {
  const health = useQuery({
    queryKey: ["health-services"],
    queryFn: () => apiGet<HealthResponse>("/admin/health/services"),
    refetchInterval: 30000,
  });

  const services = health.data?.services || {};

  return (
    <div className="page-stack">
      <PageHeader
        title="Tjänststatus"
        actions={
          <Button variant="secondary" onClick={() => health.refetch()}>
            <RefreshCw size={14} /> Uppdatera
          </Button>
        }
      />

      <Surface className="px-6 py-5">
        <div className="flex items-center gap-3">
          <Activity size={18} className="text-[var(--accent)]" />
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Realtidsstatus för alla externa beroenden. Refreshar var 30:e sekund.
          </p>
        </div>
      </Surface>

      {health.isLoading ? (
        <Surface className="px-6 py-12">
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            <Loader2 size={14} className="animate-spin" /> Kollar tjänster...
          </div>
        </Surface>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {Object.entries(SERVICE_LABELS).map(([key, label]) => {
            const svc = services[key] || { status: "unconfigured" as const };
            const Icon = svc.status === "up" ? CheckCircle2 : svc.status === "down" ? XCircle : AlertCircle;
            const tone = svc.status === "up" ? "success" : svc.status === "down" ? "danger" : "warning";
            const colorClass = svc.status === "up" ? "text-emerald-500" : svc.status === "down" ? "text-rose-500" : "text-amber-500";
            return (
              <Surface key={key} className="px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <Icon size={20} className={`${colorClass} shrink-0 mt-0.5`} />
                    <div className="min-w-0">
                      <p className="font-black text-sm tracking-tight">{label}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge tone={tone as "success" | "danger" | "warning"}>{svc.status}</Badge>
                        {svc.latencyMs !== undefined && (
                          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
                            {svc.latencyMs}ms
                          </span>
                        )}
                      </div>
                      {svc.error && (
                        <p className="text-[11px] mt-2 break-words" style={{ color: "var(--text-secondary)" }}>{svc.error}</p>
                      )}
                    </div>
                  </div>
                </div>
              </Surface>
            );
          })}
        </div>
      )}

      {health.data?.checkedAt && (
        <p className="text-[10px] text-center font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)", opacity: 0.6 }}>
          Senast kontrollerat: {new Date(health.data.checkedAt).toLocaleString("sv-SE")}
        </p>
      )}
    </div>
  );
}
