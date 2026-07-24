"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  KeyRound,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Tablet,
  Trash2,
} from "lucide-react";
import { CityRestaurantPicker } from "@/shared/components/city-restaurant-picker";
import creamSmiley from "../../../../../Logotyp/exports/smiley-cream-transparent.png";
import brandPattern from "../../../../../Logotyp/exports/background-pattern-navy-wide.png";
import {
  Badge,
  Button,
  EmptyState,
  LoadingPanel,
  Modal,
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
  const [linkOpen, setLinkOpen] = useState(false);

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
  const onlineCount = devices.filter((device) => device.status === "linked").length;

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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb="Katalog"
        title="Enheter"
        actions={
          <Button variant="primary" onClick={() => setLinkOpen(true)}>
            <Plus size={15} className="mr-1.5 inline" />
            Koppla enhet
          </Button>
        }
      />

      {/* Navy-hero: plats-väljare + status i ett. Enheter är restaurang-
          specifika, så listan är alltid scopad till en restaurang. */}
      <section className="hero-card" style={{ padding: "20px 22px" }}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="hero-stat-label">Plats</p>
            <div className="mt-2.5">
              <CityRestaurantPicker value={restaurantId} onChange={setRestaurantId} />
            </div>
          </div>
          {restaurantId ? (
            <div className="flex flex-none items-center gap-3">
              <div className="text-right">
                <p className="hero-stat-label">Online</p>
                <p className="hero-stat-value">
                  {onlineCount}<span className="text-[rgba(254,247,240,0.5)]"> / {devices.length}</span>
                </p>
              </div>
              <Button variant="secondary" onClick={() => devicesQuery.refetch()} disabled={busy}>
                <RefreshCw size={14} className={busy ? "animate-spin" : undefined} />
              </Button>
            </div>
          ) : null}
        </div>
      </section>

      {!restaurantId ? (
        <Surface className="px-6 py-16 text-center">
          <Tablet size={28} className="mx-auto mb-3 text-[var(--text-muted)]" />
          <h2 className="text-[16px] font-extrabold tracking-[-0.3px]">Välj en restaurang</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--text-secondary)]">Välj stad och restaurang ovan för att se och hantera dess enheter.</p>
        </Surface>
      ) : devicesQuery.isLoading ? (
        <LoadingPanel label="Laddar enheter…" />
      ) : (
        <div className="grid gap-4">
          {devices.length === 0 ? (
            <Surface className="px-6 py-14">
              <EmptyState
                title="Ingen enhet parad ännu"
                description="Tryck på Koppla enhet, generera en kod och skriv in den i ViaEats Business-appen på enheten."
                action={
                  <Button variant="primary" onClick={() => setLinkOpen(true)}>
                    <Plus size={15} className="mr-1.5 inline" />
                    Koppla enhet
                  </Button>
                }
              />
            </Surface>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {devices.map((device) => {
                const linked = device.status === "linked";
                const model = [device.deviceBrand, device.deviceModel].filter(Boolean).join(" ");
                return (
                  <Surface key={device.id} className="device-card">
                    <div className="flex items-start gap-3.5">
                      <span className={`device-icon${linked ? " is-online" : ""}`}>
                        <Tablet size={19} />
                        {linked && <span className="device-pulse" aria-hidden />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="min-w-0 truncate text-[14.5px] font-extrabold tracking-[-0.2px] text-[var(--text-primary)]">
                            {device.label || model || "Enhet"}
                          </p>
                          <Badge tone={linked ? "success" : "warning"}>{linked ? "Online" : "Utloggad"}</Badge>
                        </div>
                        <p className="mt-0.5 truncate text-[12px] text-[var(--text-muted)]">
                          {[device.label ? model : null, device.osVersion ? `Android ${device.osVersion}` : null, device.appVersion ? `v${device.appVersion}` : null]
                            .filter(Boolean)
                            .join(" · ") || "Ingen enhetsinfo"}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div>
                        <p className="card-label">Senast aktiv</p>
                        <p className="mt-1 text-[12.5px] font-bold text-[var(--text-secondary)]">{formatWhen(device.lastSeenAt)}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="card-label">Enhets-ID</p>
                        <p className="mt-1 truncate font-mono text-[11.5px] text-[var(--text-muted)]" title={device.deviceId}>
                          {device.deviceId.slice(0, 16)}…
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--row-divider)] pt-3.5">
                      {linked ? (
                        // Logga ut FÖRST — delete är inte tillgängligt på en
                        // inloggad platta (annars loggas den inte ut innan den
                        // tas bort).
                        <Button variant="danger" disabled={busy} onClick={() => revokeMutation.mutate(device.id)}>
                          <LogOut size={14} /> Logga ut
                        </Button>
                      ) : (
                        <>
                          <Button variant="primary" disabled={busy} onClick={() => restoreMutation.mutate(device.id)}>
                            <LogIn size={14} /> Logga in igen
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={busy}
                            onClick={() => {
                              if (window.confirm("Ta bort enheten helt? Enheten loggas ut och kan paras om med en ny kod (även till en annan restaurang).")) {
                                deleteMutation.mutate(device.id);
                              }
                            }}
                          >
                            <Trash2 size={14} /> Ta bort
                          </Button>
                        </>
                      )}
                    </div>
                  </Surface>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Koppla enhet: stad → restaurang → enhetskod */}
      <Modal
        open={linkOpen}
        title="Koppla ny enhet"
        size="lg"
        onClose={() => setLinkOpen(false)}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Steg 1 — välj plats */}
          <div className="grid content-start gap-4">
            <p className="eyebrow mb-4">Steg 1 · välj plats</p>
            <CityRestaurantPicker
              value={restaurantId}
              onChange={(id) => {
                setRestaurantId(id);
              }}
              className="!grid-cols-1"
            />
            <div className="mt-5">
              <Button
                variant="primary"
                className="w-full justify-center"
                disabled={!restaurantId || busy}
                onClick={() => generateMutation.mutate()}
              >
                <KeyRound size={15} className="mr-2 inline" />
                {generateMutation.isPending ? "Genererar…" : "Generera enhetskod"}
              </Button>
            </div>
          </div>

          {/* Steg 2 — ange på enheten */}
          <div className="pairing-stage" style={{ backgroundImage: `url(${brandPattern.src})` }}>
            <p className="text-[11px] font-extrabold uppercase tracking-[0.09em] text-[rgba(254,247,240,0.55)]">
              Steg 2 · ange på enheten
            </p>
            {pendingCode ? (
              <>
                <p className="pairing-code">{pendingCode.code}</p>
                <Button variant="secondary" className="mt-5" onClick={copyCode}>
                  {copied ? <Check size={15} /> : <Copy size={15} />}
                  {copied ? "Kopierad" : "Kopiera kod"}
                </Button>
                <p className="mt-5 flex items-center gap-2 text-[12px] text-[rgba(254,247,240,0.7)]">
                  <RefreshCw size={13} className="animate-spin opacity-70" />
                  Väntar på att plattan parar…
                </p>
                <p className="mt-2 max-w-[32ch] text-[11.5px] leading-relaxed text-[rgba(254,247,240,0.5)]">
                  Giltig till {formatWhen(pendingCode.expiresAt)}. Upprepade klick visar samma kod.
                </p>
              </>
            ) : (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={creamSmiley.src} alt="" className="mt-5 h-16 w-16 object-contain opacity-90" />
                <p className="mt-4 max-w-[30ch] text-[13px] leading-relaxed text-[rgba(254,247,240,0.6)]">
                  Välj restaurang och generera en kod — den visas här att skriva in på plattan.
                </p>
              </>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
