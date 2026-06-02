"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CityRestaurantPicker } from "@/shared/components/city-restaurant-picker";
import {
  Badge,
  Button,
  EmptyState,
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

  const queryKey = useMemo(() => ["restaurant-devices", restaurantId], [restaurantId]);

  const devicesQuery = useQuery({
    queryKey,
    queryFn: () => getRestaurantDevices(restaurantId),
    enabled: Boolean(restaurantId),
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Enheter / Terminaler" />

      <Surface className="flex flex-col gap-5 p-6">
        <div>
          <p className="eyebrow mb-1">Välj restaurang</p>
          <p className="section-subtitle">
            Para en platta med en restaurang via en engångskod. Plattan förblir
            inloggad för alltid — bara du kan logga ut den här.
          </p>
        </div>

        <CityRestaurantPicker value={restaurantId} onChange={setRestaurantId} />

        {!restaurantId ? (
          <EmptyState
            title="Ingen restaurang vald"
            description="Välj stad och restaurang ovan för att se eller para en platta."
          />
        ) : devicesQuery.isLoading ? (
          <p className="text-sm text-[var(--text-secondary)]">Laddar enheter…</p>
        ) : devicesQuery.isError ? (
          <p className="text-sm text-[var(--accent-danger,#dc2626)]">
            Kunde inte hämta enheter. Försök igen.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Status-rad */}
            <div className="flex flex-wrap items-center gap-3">
              {linkedDevice ? (
                <Badge tone="success">Länkad till en platta</Badge>
              ) : devices.length > 0 ? (
                <Badge tone="danger">Utloggad</Badge>
              ) : (
                <Badge tone="neutral">Inte länkad till någon enhet</Badge>
              )}
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => generateMutation.mutate()}
              >
                {generateMutation.isPending ? "Genererar…" : "Generera pairing-kod"}
              </Button>
            </div>

            {/* Aktiv pairing-kod */}
            {pendingCode ? (
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel-strong,transparent)] p-5">
                <p className="eyebrow mb-2">Pairing-kod (skriv in på plattan)</p>
                <p className="text-[40px] font-bold tracking-[0.25em] text-[var(--text-primary)]">
                  {pendingCode.code}
                </p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  Giltig till {formatWhen(pendingCode.expiresAt)}. Koden kan bara
                  användas en gång.
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
                {devices.map((device) => (
                  <div
                    key={device.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--border-subtle)] p-4"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--text-primary)]">
                          {device.label || "Platta"}
                        </span>
                        {device.status === "linked" ? (
                          <Badge tone="success">Länkad</Badge>
                        ) : (
                          <Badge tone="danger">Utloggad</Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-[var(--text-secondary)]">
                        ID: {device.deviceId.slice(0, 12)}… · Senast sedd{" "}
                        {formatWhen(device.lastSeenAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {device.status === "linked" ? (
                        <Button
                          variant="danger"
                          disabled={busy}
                          onClick={() => revokeMutation.mutate(device.id)}
                        >
                          Logga ut
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          disabled={busy}
                          onClick={() => restoreMutation.mutate(device.id)}
                        >
                          Logga in igen
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Ta bort enheten helt? Plattan måste paras om med en ny kod.",
                            )
                          ) {
                            deleteMutation.mutate(device.id);
                          }
                        }}
                      >
                        Ta bort
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Surface>
    </div>
  );
}
