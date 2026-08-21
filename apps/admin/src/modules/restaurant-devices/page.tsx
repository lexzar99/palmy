"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import {
  Check,
  Copy,
  KeyRound,
  LogIn,
  LogOut,
  Package,
  Plus,
  RefreshCw,
  Tablet,
  Trash2,
  Upload,
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
  activateTerminalRelease,
  deleteDevice,
  generatePairingCode,
  getRestaurantDevices,
  getTerminalReleases,
  restoreDevice,
  revokeDevice,
  uploadTerminalRelease,
  type RestaurantDevicesResponse,
  type TerminalAppRelease,
} from "./api";

function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} kB`;
}

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
  const [updateOpen, setUpdateOpen] = useState(false);
  const [apkFile, setApkFile] = useState<File | null>(null);
  const [releaseNotes, setReleaseNotes] = useState("");
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const queryKey = useMemo(() => ["restaurant-devices", restaurantId], [restaurantId]);

  const devicesQuery = useQuery({
    queryKey,
    queryFn: () => getRestaurantDevices(restaurantId),
    enabled: Boolean(restaurantId),
    // Ingen poll när inget händer: plattan PUSHAR sin status via socket
    // ("device:updated") och vi hämtar om då. Enda undantaget är medan en
    // parningskod är aktiv — då väntar operatören på att enheten ska dyka
    // upp, och koden kan dessutom hinna gå ut medan vyn står öppen.
    refetchInterval: (query) => (restaurantId && query.state.data?.pendingCode ? 3500 : false),
    refetchOnWindowFocus: true,
  });

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey }),
    [queryClient, queryKey],
  );

  // Socket-lyssnare: enheten talar om när den parats, startat session eller
  // loggats ut. Offline enhet = noll trafik mot databasen.
  useEffect(() => {
    if (!restaurantId) return;
    const socket = io(typeof window !== "undefined" ? window.location.origin : "", {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      withCredentials: true,
    });
    socket.on("connect", () => socket.emit("join:admin"));
    socket.on("device:updated", (payload: { restaurantId?: string }) => {
      if (!payload?.restaurantId || payload.restaurantId === restaurantId) void invalidate();
    });
    return () => {
      socket.disconnect();
    };
  }, [restaurantId, invalidate]);

  // Releaserna är gemensamma för hela flottan, inte scopade till en
  // restaurang — därför en egen query som lever oberoende av platsvalet.
  const releasesQuery = useQuery({
    queryKey: ["terminal-releases"],
    queryFn: getTerminalReleases,
  });
  const invalidateReleases = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["terminal-releases"] }),
    [queryClient],
  );

  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      uploadTerminalRelease(file, {
        notes: releaseNotes.trim() || undefined,
        onProgress: setUploadPercent,
      }),
    onSuccess: () => {
      void invalidateReleases();
      setUpdateOpen(false);
      setApkFile(null);
      setReleaseNotes("");
      setUploadPercent(0);
      setUploadError(null);
    },
    onError: (error: unknown) => {
      // Serverns felmeddelanden är skrivna för att läsas rakt av (fel
      // paketnamn, redan uppladdad versionCode, nedgradering) — visa dem.
      const detail =
        (error as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (error as Error)?.message ??
        "Uppladdningen misslyckades";
      setUploadError(detail);
      setUploadPercent(0);
    },
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => activateTerminalRelease(id),
    onSuccess: (result) => {
      void invalidateReleases();
      if (result?.warning) window.alert(result.warning);
    },
  });

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
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setUpdateOpen(true)}>
              <Upload size={15} className="mr-1.5 inline" />
              Ladda upp ny uppdatering
            </Button>
            <Button variant="primary" onClick={() => setLinkOpen(true)}>
              <Plus size={15} className="mr-1.5 inline" />
              Koppla enhet
            </Button>
          </div>
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

      {/* Appversion: den APK terminalerna hämtar när personalen trycker
          Uppdatera i plattans inställningar. Global för hela flottan. */}
      <Surface className="px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Package size={17} className="text-[var(--text-muted)]" />
            <h2 className="text-[15px] font-extrabold tracking-[-0.2px]">Appversion på terminalerna</h2>
          </div>
          <Button variant="secondary" onClick={() => setUpdateOpen(true)}>
            <Upload size={14} className="mr-1.5 inline" />
            Ladda upp ny uppdatering
          </Button>
        </div>

        {releasesQuery.isLoading ? (
          <p className="mt-4 text-[13px] text-[var(--text-muted)]">Laddar versioner…</p>
        ) : (releasesQuery.data?.releases ?? []).length === 0 ? (
          <p className="mt-4 max-w-prose text-[13px] leading-relaxed text-[var(--text-secondary)]">
            Ingen version är publicerad än. Ladda upp en APK här — då dyker den upp på
            plattorna när personalen trycker Uppdatera i inställningarna.
          </p>
        ) : (
          <div className="mt-4 grid gap-2">
            {(releasesQuery.data?.releases ?? []).map((release: TerminalAppRelease) => (
              <div
                key={release.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--row-divider)] px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13.5px] font-extrabold tracking-[-0.2px]">
                      {release.versionName}
                    </p>
                    <span className="font-mono text-[11.5px] text-[var(--text-muted)]">
                      versionCode {release.versionCode}
                    </span>
                    {release.isActive ? <Badge tone="success">Aktiv</Badge> : null}
                    <Badge tone="neutral">{release.flavor}</Badge>
                  </div>
                  <p className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">
                    {formatBytes(release.sizeBytes)} · {formatWhen(release.createdAt)}
                    {release.uploadedBy ? ` · ${release.uploadedBy}` : ""}
                  </p>
                  {release.notes ? (
                    <p className="mt-1.5 max-w-prose text-[12px] leading-relaxed text-[var(--text-secondary)]">
                      {release.notes}
                    </p>
                  ) : null}
                </div>
                {!release.isActive ? (
                  <Button
                    variant="secondary"
                    disabled={activateMutation.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Gör denna version aktiv igen? Plattor som redan installerat en nyare version behåller den — Android tillåter ingen nedgradering.",
                        )
                      ) {
                        activateMutation.mutate(release.id);
                      }
                    }}
                  >
                    Aktivera
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Surface>

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

      {/* Ladda upp ny uppdatering: servern läser versionCode/versionName ur
          APK:n själv, så det finns inga versionsfält att skriva fel i. */}
      <Modal
        open={updateOpen}
        title="Ladda upp ny uppdatering"
        size="md"
        onClose={() => {
          if (uploadMutation.isPending) return;
          setUpdateOpen(false);
          setUploadError(null);
        }}
      >
        <div className="grid gap-4">
          <p className="max-w-prose text-[13px] leading-relaxed text-[var(--text-secondary)]">
            Välj den signerade partner-APK:n. Versionen läses ur filen, den ersätter
            den aktiva releasen, och plattorna hittar den när personalen trycker
            Uppdatera i inställningarna.
          </p>

          <label className="grid gap-2">
            <span className="card-label">APK-fil</span>
            <input
              type="file"
              accept=".apk,application/vnd.android.package-archive"
              disabled={uploadMutation.isPending}
              onChange={(event) => {
                setApkFile(event.target.files?.[0] ?? null);
                setUploadError(null);
              }}
              className="rounded-xl border border-[var(--row-divider)] px-3 py-2.5 text-[13px] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--surface-2)] file:px-3 file:py-1.5 file:text-[12.5px] file:font-bold"
            />
            {apkFile ? (
              <span className="text-[11.5px] text-[var(--text-muted)]">
                {apkFile.name} · {formatBytes(apkFile.size)}
              </span>
            ) : null}
          </label>

          <label className="grid gap-2">
            <span className="card-label">Vad är nytt (valfritt)</span>
            <textarea
              rows={3}
              value={releaseNotes}
              disabled={uploadMutation.isPending}
              onChange={(event) => setReleaseNotes(event.target.value)}
              placeholder="Syns i versionslistan här i admin."
              className="rounded-xl border border-[var(--row-divider)] px-3 py-2.5 text-[13px] leading-relaxed"
            />
          </label>

          {uploadMutation.isPending ? (
            <div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-2)]">
                <div
                  className="h-full rounded-full bg-[var(--brand-orange,#E8622C)] transition-[width]"
                  style={{ width: `${uploadPercent}%` }}
                />
              </div>
              <p className="mt-2 text-[12px] text-[var(--text-muted)]">
                Laddar upp… {uploadPercent}%
              </p>
            </div>
          ) : null}

          {uploadError ? (
            <p className="rounded-xl border border-[rgba(220,70,50,0.35)] bg-[rgba(220,70,50,0.08)] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-[var(--text-primary)]">
              {uploadError}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              disabled={uploadMutation.isPending}
              onClick={() => {
                setUpdateOpen(false);
                setUploadError(null);
              }}
            >
              Avbryt
            </Button>
            <Button
              variant="primary"
              disabled={!apkFile || uploadMutation.isPending}
              onClick={() => {
                if (!apkFile) return;
                setUploadError(null);
                setUploadPercent(0);
                uploadMutation.mutate(apkFile);
              }}
            >
              <Upload size={15} className="mr-1.5 inline" />
              {uploadMutation.isPending ? "Laddar upp…" : "Publicera uppdatering"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
