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

      {/* Kontext: välj restaurang för att se DESS kopplade enheter. Enheter
          är restaurang-specifika, så listan är alltid scopad till en
          restaurang, aldrig en platt lista över alla restauranger. */}
      <Surface className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="eyebrow mb-2">Restaurang</p>
            <CityRestaurantPicker value={restaurantId} onChange={setRestaurantId} />
          </div>
          {restaurantId ? (
            <Button variant="secondary" onClick={() => devicesQuery.refetch()} disabled={busy}>
              <RefreshCw size={14} className="mr-1.5 inline" /> Uppdatera
            </Button>
          ) : null}
        </div>
      </Surface>

      {!restaurantId ? (
        <Surface className="p-6">
          <EmptyState
            title="Välj en restaurang ovan"
            description="Enheter är restaurang-specifika. Välj stad och restaurang i väljaren ovanför för att se dess kopplade plattor, eller tryck på Koppla enhet för att para en ny."
          />
        </Surface>
      ) : devicesQuery.isLoading ? (
        <LoadingPanel label="Laddar enheter…" />
      ) : (
        <Surface className="overflow-hidden p-0">
          {/* Tabellrubrik */}
          <div
            className="grid items-center px-[18px] py-[11px] text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-muted)]"
            style={{ gridTemplateColumns: "1.4fr 1.1fr 1fr 90px 64px", borderBottom: "1px solid var(--row-divider)" }}
          >
            <span>Enhet{devices.length > 0 ? ` (${devices.length})` : ""}</span>
            <span>ID</span>
            <span>Senast sedd</span>
            <span>Status</span>
            <span />
          </div>

          {devices.length === 0 ? (
            <div className="px-6 py-14">
              <EmptyState
                title="Ingen platta parad ännu"
                description="Tryck på Koppla enhet, generera en kod och skriv in den i ViaEats Business-appen på plattan."
                action={
                  <Button variant="primary" onClick={() => setLinkOpen(true)}>
                    <Plus size={15} className="mr-1.5 inline" />
                    Koppla enhet
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="max-h-[460px] overflow-y-auto">
              {devices.map((device, idx) => {
              const linked = device.status === "linked";
              return (
                <div
                  key={device.id}
                  className="grid items-center px-[18px] py-[13px] text-[13px]"
                  style={{
                    gridTemplateColumns: "1.4fr 1.1fr 1fr 90px 64px",
                    borderBottom: idx === devices.length - 1 ? "none" : "1px solid var(--row-divider)",
                  }}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
                      style={{
                        background: linked
                          ? "var(--accent-soft)"
                          : "var(--danger-soft)",
                      }}
                    >
                      <Tablet size={17} color={linked ? "var(--accent)" : "var(--danger)"} />
                    </div>
                    <span className="truncate font-bold text-[var(--text-primary)]">
                      {device.label || "Platta"}
                    </span>
                  </div>
                  <span className="truncate font-mono text-[12px] text-[var(--text-secondary)]">
                    {device.deviceId.slice(0, 14)}…
                  </span>
                  <span className="text-[var(--text-secondary)]">{formatWhen(device.lastSeenAt)}</span>
                  <span>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-[7px] w-[7px] shrink-0 rounded-full"
                        style={{ background: linked ? "var(--success)" : "var(--warning)" }}
                      />
                      <Badge tone={linked ? "success" : "warning"}>
                        {linked ? "Online" : "Utloggad"}
                      </Badge>
                    </span>
                  </span>
                  <div className="flex items-center justify-end gap-1.5">
                    {linked ? (
                      // Logga ut FÖRST — delete är inte tillgängligt på en
                      // inloggad platta (annars loggas den inte ut innan den
                      // tas bort).
                      <Button
                        variant="danger"
                        disabled={busy}
                        onClick={() => revokeMutation.mutate(device.id)}
                        aria-label="Logga ut"
                        title="Logga ut"
                      >
                        <LogOut size={15} />
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="primary"
                          disabled={busy}
                          onClick={() => restoreMutation.mutate(device.id)}
                          aria-label="Logga in igen"
                          title="Logga in igen"
                        >
                          <LogIn size={15} />
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={busy}
                          aria-label="Ta bort"
                          title="Ta bort"
                          onClick={() => {
                            if (window.confirm("Ta bort enheten helt? Plattan loggas ut och kan paras om med en ny kod (även till en annan restaurang).")) {
                              deleteMutation.mutate(device.id);
                            }
                          }}
                        >
                          <Trash2 size={15} />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
              })}
            </div>
          )}
        </Surface>
      )}

      {/* Koppla enhet: stad → restaurang → enhetskod */}
      <Modal
        open={linkOpen}
        title="Koppla ny enhet"
        description="Enheter är restaurang-specifika. Välj stad och restaurang, generera sedan en engångskod att skriva in på plattan."
        size="lg"
        onClose={() => setLinkOpen(false)}
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Steg 1 — välj plats */}
          <div className="rounded-2xl border border-[var(--border-subtle)] p-5">
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
          <div
            className="flex flex-col items-center justify-center rounded-2xl p-6 text-center"
            style={{ background: "#111113" }}
          >
            <p className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#9CA3AF]">
              Steg 2 · ange på enheten
            </p>
            {pendingCode ? (
              <>
                <p
                  className="mt-5 font-mono text-[40px] font-extrabold leading-none tracking-[0.16em] text-white"
                  style={{ wordBreak: "break-all" }}
                >
                  {pendingCode.code}
                </p>
                <Button variant="secondary" className="mt-5" onClick={copyCode}>
                  {copied ? <Check size={15} className="mr-1.5 inline" /> : <Copy size={15} className="mr-1.5 inline" />}
                  {copied ? "Kopierad" : "Kopiera kod"}
                </Button>
                <p className="mt-5 flex items-center gap-2 text-[12px] leading-relaxed text-white/70">
                  <RefreshCw size={13} className="animate-spin opacity-70" />
                  Väntar på att plattan parar. Giltig till {formatWhen(pendingCode.expiresAt)}, engångskod.
                </p>
                <p className="mt-2 max-w-[30ch] text-[12px] leading-relaxed text-white/60">
                  Öppna ViaEats Business på enheten och ange koden.
                </p>
              </>
            ) : (
              <p className="mt-5 max-w-[30ch] text-[13px] leading-relaxed text-white/60">
                Välj restaurang och tryck på Generera enhetskod. Koden visas här att skriva in på plattan.
              </p>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
