"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  ShieldCheck,
  ShieldOff,
  Loader2,
  KeyRound,
  Monitor,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Copy,
  Download,
} from "lucide-react";
import { apiDelete, apiGet, apiPost } from "@/shared/api/client";
import { Button, Field, Input, PageHeader, Surface } from "@/shared/components/ui";

type TwoFAStatus = {
  enabled: boolean;
  remainingRecoveryCodes: number;
  recoveryGeneratedAt: string | null;
  /** Metadata per kodplats — koderna själva lagras hashade och kan inte visas. */
  codes?: Array<{ used: boolean; usedAt: string | null }>;
};

type TrustedDevice = {
  id: string;
  deviceLabel: string;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
};

/** Ikonplatta i navy-tint — samma mönster som dashboardens kort. */
function SectionIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] bg-[var(--brand-navy-soft)] text-[var(--brand-navy-ink)]">
      {children}
    </span>
  );
}

export function TwoFAPage({ embedded = false }: { embedded?: boolean } = {}) {
  const queryClient = useQueryClient();
  const [setupData, setSetupData] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [regenerateCode, setRegenerateCode] = useState("");
  // Engångsvisning av recovery codes — visas EFTER backend bekräftar
  const [shownRecoveryCodes, setShownRecoveryCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);

  const status = useQuery({
    queryKey: ["2fa-status"],
    queryFn: () => apiGet<TwoFAStatus>("/auth/2fa/status"),
  });

  const devices = useQuery({
    queryKey: ["trusted-devices"],
    queryFn: () => apiGet<TrustedDevice[]>("/auth/trusted-devices"),
    enabled: Boolean(status.data?.enabled),
  });

  const setupMut = useMutation({
    mutationFn: () => apiPost<{ secret: string; qrDataUrl: string; otpauthUrl: string }>("/auth/2fa/setup"),
    onSuccess: (data) => setSetupData({ qrDataUrl: data.qrDataUrl, secret: data.secret }),
  });

  const verifyMut = useMutation({
    mutationFn: () => apiPost<{ success: boolean; recoveryCodes: string[] }>("/auth/2fa/verify", { totp: code }),
    onSuccess: async (data) => {
      setShownRecoveryCodes(data.recoveryCodes);
      setSetupData(null);
      setCode("");
      await queryClient.invalidateQueries({ queryKey: ["2fa-status"] });
    },
    onError: (err: any) => alert(`Fel: ${err?.response?.data?.error || "Verifiering misslyckades"}`),
  });

  const regenerateMut = useMutation({
    mutationFn: () => apiPost<{ recoveryCodes: string[] }>("/auth/2fa/recovery/regenerate", { totp: regenerateCode }),
    onSuccess: async (data) => {
      setShownRecoveryCodes(data.recoveryCodes);
      setRegenerateCode("");
      await queryClient.invalidateQueries({ queryKey: ["2fa-status"] });
    },
    onError: (err: any) => alert(`Fel: ${err?.response?.data?.error || "Kunde inte generera nya koder"}`),
  });

  const disableMut = useMutation({
    mutationFn: () => apiPost<{ success: boolean }>("/auth/2fa/disable", { totp: disableCode }),
    onSuccess: async () => {
      setDisableCode("");
      await queryClient.invalidateQueries({ queryKey: ["2fa-status"] });
      await queryClient.invalidateQueries({ queryKey: ["trusted-devices"] });
    },
    onError: (err: any) => alert(`Fel: ${err?.response?.data?.error || "Avstängning misslyckades"}`),
  });

  const revokeDeviceMut = useMutation({
    mutationFn: (id: string) => apiDelete<{ success: boolean }>(`/auth/trusted-devices/${id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["trusted-devices"] });
    },
  });

  const revokeAllMut = useMutation({
    mutationFn: () => apiDelete<{ success: boolean }>("/auth/trusted-devices"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["trusted-devices"] });
    },
  });

  const isEnabled = Boolean(status.data?.enabled);
  const remainingCodes = status.data?.remainingRecoveryCodes ?? 0;

  return (
    <div className="page-stack">
      {!embedded && <PageHeader title="Säkerhet" />}

      {/* Status — navy hero i miniformat */}
      <section className="hero-card flex flex-wrap items-center gap-4" style={{ padding: "20px 22px" }}>
        <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-[var(--brand-cream)] text-[#0a2340]">
          {isEnabled ? <ShieldCheck size={22} /> : <Shield size={22} />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-extrabold text-white">Tvåfaktorsautentisering</h2>
          <p className="mt-0.5 text-[12.5px] font-medium text-[rgba(254,247,240,0.65)]">
            {isEnabled ? "Ditt konto kräver kod vid nya enheter." : "Aktivera för att skydda kontot."}
          </p>
        </div>
        <span
          className="rounded-full px-3 py-1.5 text-[11.5px] font-extrabold"
          style={
            isEnabled
              ? { background: "rgba(74, 222, 128, 0.18)", color: "#86efac" }
              : { background: "var(--brand-orange-soft)", color: "var(--brand-orange-ink)" }
          }
        >
          {isEnabled ? "Aktivt" : "Avstängt"}
        </span>
      </section>

      {/* Recovery codes — visas EN gång */}
      {shownRecoveryCodes && (
        <Surface className="border-[color-mix(in_srgb,var(--warning)_35%,transparent)] px-5 py-5">
          <div className="mb-4 flex items-start gap-3">
            <SectionIcon><AlertTriangle size={17} /></SectionIcon>
            <div>
              <h3 className="section-title">Spara koderna nu</h3>
              <p className="section-subtitle">Visas bara en gång.</p>
            </div>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-2 font-mono sm:grid-cols-5">
            {shownRecoveryCodes.map((c) => (
              <code key={c} className="block rounded-[9px] bg-[var(--bg-panel-muted)] p-2.5 text-center text-sm font-semibold text-[var(--text-primary)]">
                {c}
              </code>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(shownRecoveryCodes.join("\n"));
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              <Copy size={14} /> {copied ? "Kopierat!" : "Kopiera"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const blob = new Blob([shownRecoveryCodes.join("\n")], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `viaeats-recovery-codes-${new Date().toISOString().slice(0, 10)}.txt`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download size={14} /> Ladda ner
            </Button>
            <Button variant="primary" onClick={() => setShownRecoveryCodes(null)}>
              Klar — sparade
            </Button>
          </div>
        </Surface>
      )}

      {/* Setup-flow */}
      {!isEnabled && !setupData && (
        <Surface className="flex flex-wrap items-center justify-between gap-4 px-5 py-5">
          <div className="flex items-center gap-3">
            <SectionIcon><Shield size={17} /></SectionIcon>
            <div>
              <h3 className="section-title">Aktivera 2FA</h3>
              <p className="section-subtitle">Tar en minut med valfri autentiseringsapp.</p>
            </div>
          </div>
          <Button variant="primary" onClick={() => setupMut.mutate()} disabled={setupMut.isPending}>
            {setupMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
            Kom igång
          </Button>
        </Surface>
      )}

      {setupData && (
        <Surface className="px-5 py-5">
          <h3 className="section-title mb-4">Skanna QR-koden</h3>
          <div className="mb-5 flex flex-wrap items-start gap-6">
            {/* Data-URL från 2FA-setup; Next Image kan inte optimera den. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={setupData.qrDataUrl}
              alt="2FA QR-kod"
              className="h-48 w-48 rounded-[14px] border border-[var(--border-subtle)] bg-white p-2"
            />
            <div className="min-w-[200px] flex-1">
              <p className="card-label mb-2">Eller ange manuellt</p>
              <code className="block break-all rounded-[9px] bg-[var(--bg-panel-muted)] p-3 text-xs text-[var(--text-primary)]">
                {setupData.secret}
              </code>
            </div>
          </div>
          <Field label="Kod från appen">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              maxLength={6}
              inputMode="numeric"
              autoFocus
              className="input-compact-number max-w-[180px]"
            />
          </Field>
          <div className="mt-4 flex gap-3">
            <Button variant="primary" onClick={() => verifyMut.mutate()} disabled={code.length !== 6 || verifyMut.isPending}>
              {verifyMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              Aktivera
            </Button>
            <Button variant="secondary" onClick={() => { setSetupData(null); setCode(""); }}>
              Avbryt
            </Button>
          </div>
        </Surface>
      )}

      {/* När 2FA är aktivt: recovery codes + betrodda enheter + avstängning */}
      {isEnabled && !setupData && (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {/* Recovery codes */}
          <Surface className="px-5 py-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <SectionIcon><KeyRound size={17} /></SectionIcon>
                <div>
                  <h3 className="section-title">Återställningskoder</h3>
                  <p className="section-subtitle">
                    {remainingCodes > 0 ? `${remainingCodes} av 10 kvar` : "Inga kvar — generera nya"}
                  </p>
                </div>
              </div>
              {remainingCodes <= 3 && (
                <span className="badge badge-warning">Få kvar</span>
              )}
            </div>
            {(status.data?.codes?.length ?? 0) > 0 && (
              <div className="mb-4 grid grid-cols-5 gap-2">
                {status.data!.codes!.map((slot, i) => (
                  <div
                    key={i}
                    className="rounded-[9px] px-2 py-2 text-center"
                    style={{
                      background: slot.used ? "var(--bg-hover)" : "var(--success-soft)",
                      opacity: slot.used ? 0.65 : 1,
                    }}
                    title={slot.used && slot.usedAt ? `Använd ${new Date(slot.usedAt).toLocaleDateString("sv-SE")}` : "Oanvänd"}
                  >
                    <span className="block font-mono text-[11px] font-bold" style={{ color: slot.used ? "var(--text-muted)" : "var(--success-text)", textDecoration: slot.used ? "line-through" : "none" }}>
                      Kod {i + 1}
                    </span>
                    <span className="mt-0.5 block text-[9.5px] font-semibold text-[var(--text-muted)]">
                      {slot.used ? (slot.usedAt ? new Date(slot.usedAt).toLocaleDateString("sv-SE") : "Använd") : "Kvar"}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <Field label="TOTP-kod" hint="Nya koder ersätter alla gamla. Kopian sparas när de visas — de kan inte visas igen.">
              <Input
                value={regenerateCode}
                onChange={(e) => setRegenerateCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                maxLength={6}
                inputMode="numeric"
                className="input-compact-number max-w-[180px]"
              />
            </Field>
            <Button
              variant="secondary"
              className="mt-3"
              onClick={() => regenerateMut.mutate()}
              disabled={regenerateCode.length !== 6 || regenerateMut.isPending}
            >
              {regenerateMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Generera nya
            </Button>
          </Surface>

          {/* Betrodda enheter */}
          <Surface className="px-5 py-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <SectionIcon><Monitor size={17} /></SectionIcon>
                <div>
                  <h3 className="section-title">
                    Betrodda enheter
                    {(devices.data?.length || 0) > 0 && (
                      <span className="sidebar-section-count ml-2 align-middle">{devices.data!.length}</span>
                    )}
                  </h3>
                  <p className="section-subtitle">Slipper koden vid inloggning.</p>
                </div>
              </div>
              {(devices.data?.length || 0) > 0 && (
                <Button
                  variant="danger"
                  onClick={() => {
                    if (window.confirm("Glöm alla enheter? Alla behöver ange kod vid nästa inloggning.")) {
                      revokeAllMut.mutate();
                    }
                  }}
                  disabled={revokeAllMut.isPending}
                >
                  Glöm alla
                </Button>
              )}
            </div>
            {devices.isLoading ? (
              <p className="section-subtitle">Laddar…</p>
            ) : (devices.data?.length || 0) === 0 ? (
              <p className="section-subtitle">Inga betrodda enheter ännu.</p>
            ) : (
              /* Många enheter får inte spränga kortet — listan scrollar internt. */
              <div className="grid max-h-[330px] content-start gap-2 overflow-y-auto pr-1">
                {(devices.data || []).map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 rounded-[11px] bg-[var(--bg-panel-muted)] px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{d.deviceLabel}</p>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                        {d.ipAddress ? `${d.ipAddress} · ` : ""}
                        {new Date(d.lastSeenAt).toLocaleString("sv-SE")}
                      </p>
                    </div>
                    <Button variant="danger" onClick={() => revokeDeviceMut.mutate(d.id)} disabled={revokeDeviceMut.isPending}>
                      <Trash2 size={13} /> Glöm
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Surface>

          {/* Stäng av */}
          <Surface className="px-5 py-5 xl:col-span-2">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="flex items-start gap-3">
                  <SectionIcon><ShieldOff size={17} /></SectionIcon>
                  <div>
                    <h3 className="section-title">Stäng av 2FA</h3>
                    <p className="section-subtitle">Tar även bort alla återställningskoder.</p>
                  </div>
                </div>
                <Field label="TOTP-kod" className="mt-4">
                  <Input
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="123456"
                    maxLength={6}
                    inputMode="numeric"
                    className="input-compact-number max-w-[180px]"
                  />
                </Field>
              </div>
              <Button
                variant="danger"
                onClick={() => {
                  if (window.confirm("Stäng av 2FA? Detta tar även bort alla återställningskoder.")) disableMut.mutate();
                }}
                disabled={disableCode.length !== 6 || disableMut.isPending}
              >
                {disableMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <ShieldOff size={14} />}
                Stäng av
              </Button>
            </div>
          </Surface>
        </div>
      )}
    </div>
  );
}
