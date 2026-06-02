"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  KeyRound,
  LogIn,
  LogOut,
  RefreshCw,
  Tablet,
  Trash2,
  WifiOff,
} from "lucide-react";
import { CityRestaurantPicker } from "@/shared/components/city-restaurant-picker";
import {
  Badge,
  Button,
  EmptyState,
  LoadingPanel,
  PageHeader,
  Surface,
} from "@/shared/components/ui";
import {
  deleteDevice,
  generatePairingCode,
  getRestaurantDevices,
  restoreDevice,
  revokeDevice,
  type RestaurantDevicesResponse,
} from "./api";

function formatWhen(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("sv-SE", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

export function RestaurantDevicesPage() {
  const queryClient = useQueryClient();
  const [restaurantId, setRestaurantId] = useState("");
  const [copied, setCopied] = useState(false);

  const queryKey = useMemo(() => ["restaurant-devices", restaurantId], [restaurantId]);

  const devicesQuery = useQuery({
    queryKey,
    queryFn: () => getRestaurantDevices(restaurantId),
    enabled: Boolean(restaurantId),
    // Poll: så en nyparad platta dyker upp automatiskt (operatören slipper
    // refresha sidan), och status flippar till "Länkad" inom några sekunder.
    refetchInterval: restaurantId ? 3500 : false,
    refetchOnWindowFocus: true,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const generateMutation = useMutation({
    mutationFn: () => generatePairingCode(restaurantId),
    onSuccess: invalidate,
  });
  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeDevice(id),
    onSuccess: invalidate,
  });
  const restoreMutation = useMutation({
    mutationFn: (id: string) => restoreDevice(id),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDevice(id),
    onSuccess: invalidate,
  });

  const busy =
    generateMutation.isPending ||
    revokeMutation.isPending ||
    restoreMutation.isPending ||
    deleteMutation.isPending;

  const data: RestaurantDevicesResponse | undefined = devicesQuery.data;
  const devices = data?.devices ?? [];
  const pendingCode = data?.pendingCode ?? null;
  const linkedDevice = devices.find((d) => d.status === "linked") ?? null;
  const revokedDevice = devices.find((d) => d.status === "revoked") ?? null;

  const copyCode = async () => {
    if (!pendingCode) return;
    try {
      await navigator.clipboard.writeText(pendingCode.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  // Status-sammanfattning högst upp.
  const status = linkedDevice
    ? { tone: "success" as const, label: "Länkad", icon: Tablet, detail: `Senast aktiv ${formatWhen(linkedDevice.lastSeenAt)}` }
    : revokedDevice
      ? { tone: "danger" as const, label: "Utloggad", icon: WifiOff, detail: "Plattan är utloggad. Logga in igen nedan." }
      : { tone: "neutral" as const, label: "Inte länkad", icon: KeyRound, detail: "Generera en kod och skriv in den i appen på plattan." };

  const StatusIcon = status.icon;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Enheter / Terminaler" />

      <Surface className="flex flex-col gap-5 p-6">
        <div>
          <p className="eyebrow mb-1">Välj restaurang</p>
          <p className="section-subtitle">
            Para en platta med en restaurang via en engångskod. Plattan förblir
            inloggad — bara du kan logga ut den här.
          </p>
        </div>
        <CityRestaurantPicker value={restaurantId} onChange={setRestaurantId} />
      </Surface>

      {!restaurantId ? (
        <EmptyState
          title="Ingen restaurang vald"
          description="Välj stad och restaurang ovan för att se eller para en platta."
        />
      ) : devicesQuery.isLoading ? (
        <LoadingPanel label="Laddar enheter…" />
      ) : (
        <Surface className="flex flex-col gap-6 p-6">
          {/* Status-hero */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl"
                style={{
                  background:
                    status.tone === "success"
                      ? "color-mix(in srgb, var(--accent) 16%, transparent)"
                      : status.tone === "danger"
                        ? "color-mix(in srgb, #dc2626 14%, transparent)"
                        : "var(--bg-panel-strong, rgba(120,120,120,0.10))",
                }}
              >
                <StatusIcon
                  size={26}
                  color={
                    status.tone === "success"
                      ? "var(--accent)"
                      : status.tone === "danger"
                        ? "#dc2626"
                        : "var(--text-secondary)"
                  }
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[20px] font-bold tracking-[-0.02em] text-[var(--text-primary)]">
                    {status.label}
                  </span>
                  <Badge tone={status.tone}>{linkedDevice ? "ansluten" : revokedDevice ? "avstängd" : "väntar"}</Badge>
                </div>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">{status.detail}</p>
              </div>
            </div>
            <Button variant="primary" disabled={busy} onClick={() => generateMutation.mutate()}>
              <KeyRound size={15} className="mr-2 inline" />
              {generateMutation.isPending ? "Genererar…" : "Generera pairing-kod"}
            </Button>
          </div>

          {/* Aktiv pairing-kod */}
          {pendingCode ? (
            <div className="rounded-2xl border border-dashed border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_7%,transparent)] p-5">
              <p className="eyebrow mb-3">Pairing-kod — skriv in på plattan</p>
              <div className="flex flex-wrap items-center gap-4">
                <span className="font-mono text-[44px] font-bold leading-none tracking-[0.22em] text-[var(--text-primary)]">
                  {pendingCode.code}
                </span>
                <Button variant="secondary" onClick={copyCode}>
                  {copied ? <Check size={15} className="mr-1.5 inline" /> : <Copy size={15} className="mr-1.5 inline" />}
                  {copied ? "Kopierad" : "Kopiera"}
                </Button>
              </div>
              <p className="mt-3 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <RefreshCw size={13} className="animate-spin opacity-70" />
                Väntar på att plattan parar… giltig till {formatWhen(pendingCode.expiresAt)} · engångskod.
              </p>
            </div>
          ) : null}

          {/* Enhetslista */}
          {devices.length === 0 ? (
            <EmptyState
              title="Ingen platta parad ännu"
              description="Generera en kod ovan och skriv in den i Levera Business-appen på plattan."
            />
          ) : (
            <div className="flex flex-col gap-3">
              {devices.map((device) => {
                const linked = device.status === "linked";
                return (
                  <div
                    key={device.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel-strong,transparent)] p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-11 w-11 items-center justify-center rounded-xl"
                        style={{
                          background: linked
                            ? "color-mix(in srgb, var(--accent) 14%, transparent)"
                            : "color-mix(in srgb, #dc2626 12%, transparent)",
                        }}
                      >
                        <Tablet size={20} color={linked ? "var(--accent)" : "#dc2626"} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[var(--text-primary)]">
                            {device.label || "Platta"}
                          </span>
                          <Badge tone={linked ? "success" : "danger"}>
                            {linked ? "Länkad" : "Utloggad"}
                          </Badge>
                        </div>
                        <p className="mt-0.5 font-mono text-xs text-[var(--text-secondary)]">
                          {device.deviceId.slice(0, 14)}… · senast {formatWhen(device.lastSeenAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {linked ? (
                        <Button variant="danger" disabled={busy} onClick={() => revokeMutation.mutate(device.id)}>
                          <LogOut size={15} className="mr-1.5 inline" />
                          Logga ut
                        </Button>
                      ) : (
                        <Button variant="primary" disabled={busy} onClick={() => restoreMutation.mutate(device.id)}>
                          <LogIn size={15} className="mr-1.5 inline" />
                          Logga in igen
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm("Ta bort enheten helt? Plattan måste paras om med en ny kod.")) {
                            deleteMutation.mutate(device.id);
                          }
                        }}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Surface>
      )}
    </div>
  );
}
