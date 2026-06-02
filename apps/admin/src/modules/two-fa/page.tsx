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
} from "lucide-react";
import { apiDelete, apiGet, apiPost } from "@/shared/api/client";
import { Button, Field, Input, PageHeader, Surface } from "@/shared/components/ui";

type TwoFAStatus = {
  enabled: boolean;
  remainingRecoveryCodes: number;
  recoveryGeneratedAt: string | null;
};

type TrustedDevice = {
  id: string;
  deviceLabel: string;
  ipAddress: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
};

export function TwoFAPage() {
  const queryClient = useQueryClient();
  const [setupData, setSetupData] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [regenerateCode, setRegenerateCode] = useState("");
  // Engångsvisning av recovery codes — visas EFTER backend bekräftar
  const [shownRecoveryCodes, setShownRecoveryCodes] = useState<string[] | null>(null);

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
      <PageHeader title="Tvåfaktor + enheter" />

      {/* Status-banner */}
      <Surface className="px-6 py-5">
        <div className="flex items-start gap-3">
          {isEnabled ? (
            <ShieldCheck size={20} className="text-emerald-500 mt-0.5" />
          ) : (
            <Shield size={20} className="text-amber-500 mt-0.5" />
          )}
          <div>
            <h2 className="section-title">
              {isEnabled ? "2FA är aktivt" : "2FA är avstängt"}
            </h2>
            <p className="section-subtitle">
              {isEnabled
                ? "På nya enheter krävs en TOTP-kod (Google Authenticator) eller en recovery code. Trusted devices slipper prompt i 30 dagar."
                : "Aktivera för extra säkerhet — kräver Google Authenticator, 1Password eller liknande app."}
            </p>
          </div>
        </div>
      </Surface>

      {/* Recovery codes — visas EN gång */}
      {shownRecoveryCodes && (
        <div
          className="rounded-2xl px-6 py-6"
          style={{
            border: "1px solid rgba(251, 191, 36, 0.4)",
            backgroundColor: "var(--bg-panel)",
          }}
        >
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle size={20} className="text-amber-500 mt-0.5 shrink-0" />
            <div>
              <h3 className="section-title">Spara dessa recovery codes nu</h3>
              <p className="section-subtitle">
                10 engångskoder. Använd en istället för TOTP om du tappar telefonen.
                <strong> Visas bara den här gången.</strong> Spara i lösenordshanterare eller skriv ut.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4 font-mono">
            {shownRecoveryCodes.map((c) => (
              <code
                key={c}
                className="block p-2.5 rounded-lg text-center text-sm font-semibold"
                style={{ backgroundColor: "var(--bg-panel-muted)", color: "var(--text-primary)" }}
              >
                {c}
              </code>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="secondary"
              onClick={() => {
                navigator.clipboard.writeText(shownRecoveryCodes.join("\n"));
                alert("Kopierat till urklipp");
              }}
            >
              Kopiera alla
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                const blob = new Blob([shownRecoveryCodes.join("\n")], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `levera-recovery-codes-${new Date().toISOString().slice(0, 10)}.txt`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              Ladda ner .txt
            </Button>
            <Button variant="primary" onClick={() => setShownRecoveryCodes(null)}>
              Klar — jag har sparat dem
            </Button>
          </div>
        </div>
      )}

      {/* Setup-flow */}
      {!isEnabled && !setupData && (
        <Surface className="px-6 py-6">
          <h3 className="section-title mb-3">Aktivera 2FA</h3>
          <ol className="text-sm space-y-2 mb-5" style={{ color: "var(--text-secondary)" }}>
            <li>1. Klicka <strong>Starta setup</strong></li>
            <li>2. Scanna QR-koden i Google Authenticator (eller Authy/1Password)</li>
            <li>3. Ange den 6-siffriga koden från appen för att bekräfta</li>
            <li>4. Spara de 10 recovery codes du får — backup om du tappar telefonen</li>
          </ol>
          <Button variant="primary" onClick={() => setupMut.mutate()} disabled={setupMut.isPending}>
            {setupMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
            Starta setup
          </Button>
        </Surface>
      )}

      {setupData && (
        <Surface className="px-6 py-6">
          <h3 className="section-title mb-3">Scanna QR-koden</h3>
          <div className="flex flex-wrap gap-6 items-start mb-5">
            <img
              src={setupData.qrDataUrl}
              alt="2FA QR-kod"
              className="w-48 h-48 rounded-xl border"
              style={{ borderColor: "var(--border-subtle)" }}
            />
            <div className="flex-1 min-w-[200px]">
              <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
                Kan inte scanna? Skriv in detta secret manuellt:
              </p>
              <code
                className="block p-3 rounded-lg text-xs break-all"
                style={{ backgroundColor: "var(--bg-panel-muted)", color: "var(--text-primary)" }}
              >
                {setupData.secret}
              </code>
            </div>
          </div>
          <Field label="Ange 6-siffrig kod från appen">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              maxLength={6}
              inputMode="numeric"
              autoFocus
            />
          </Field>
          <div className="flex gap-3 mt-4">
            <Button
              variant="primary"
              onClick={() => verifyMut.mutate()}
              disabled={code.length !== 6 || verifyMut.isPending}
            >
              {verifyMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              Bekräfta + aktivera
            </Button>
            <Button variant="secondary" onClick={() => { setSetupData(null); setCode(""); }}>
              Avbryt
            </Button>
          </div>
        </Surface>
      )}

      {/* När 2FA är aktivt: recovery codes status + trusted devices + disable */}
      {isEnabled && !setupData && (
        <>
          {/* Recovery codes status */}
          <Surface className="px-6 py-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-start gap-3">
                <KeyRound size={20} className="text-[var(--accent)] mt-0.5" />
                <div>
                  <h3 className="section-title">Recovery codes</h3>
                  <p className="section-subtitle">
                    {remainingCodes > 0
                      ? `${remainingCodes} av 10 oanvända kvar`
                      : "Inga koder kvar — generera nya nu"}
                  </p>
                </div>
              </div>
              {remainingCodes <= 3 && remainingCodes > 0 && (
                <span className="text-amber-500 text-xs font-semibold">⚠ Få kvar</span>
              )}
            </div>
            <Field label="Ange TOTP-kod för att generera nya 10 koder">
              <Input
                value={regenerateCode}
                onChange={(e) => setRegenerateCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                maxLength={6}
                inputMode="numeric"
              />
            </Field>
            <Button
              variant="secondary"
              className="mt-3"
              onClick={() => regenerateMut.mutate()}
              disabled={regenerateCode.length !== 6 || regenerateMut.isPending}
            >
              {regenerateMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Generera nya recovery codes (invaliderar gamla)
            </Button>
          </Surface>

          {/* Trusted devices */}
          <Surface className="px-6 py-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-start gap-3">
                <Monitor size={20} className="text-[var(--accent)] mt-0.5" />
                <div>
                  <h3 className="section-title">Trusted devices</h3>
                  <p className="section-subtitle">
                    Enheter som slipper TOTP-prompt i 30 dagar. Revoka om du tappat eller sålt en.
                  </p>
                </div>
              </div>
              {(devices.data?.length || 0) > 0 && (
                <Button
                  variant="danger"
                  onClick={() => {
                    if (window.confirm("Revoka ALLA enheter? Du måste ange TOTP-kod nästa login överallt.")) {
                      revokeAllMut.mutate();
                    }
                  }}
                  disabled={revokeAllMut.isPending}
                >
                  Revoka alla
                </Button>
              )}
            </div>
            {devices.isLoading ? (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Laddar…</p>
            ) : (devices.data?.length || 0) === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Inga trusted devices än. Vid första TOTP-verifierade login skapas en automatiskt.
              </p>
            ) : (
              <div className="grid gap-2">
                {(devices.data || []).map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg"
                    style={{ backgroundColor: "var(--bg-panel-muted)" }}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{d.deviceLabel}</p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                        {d.ipAddress ? `${d.ipAddress} · ` : ""}
                        Senast använd {new Date(d.lastSeenAt).toLocaleString("sv-SE")}
                      </p>
                    </div>
                    <Button
                      variant="danger"
                      onClick={() => revokeDeviceMut.mutate(d.id)}
                      disabled={revokeDeviceMut.isPending}
                    >
                      <Trash2 size={13} /> Glöm
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Surface>

          {/* Disable 2FA */}
          <Surface className="px-6 py-6">
            <h3 className="section-title mb-3">Stäng av 2FA</h3>
            <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
              Kräver TOTP-kod så att en angripare som har session-cookien inte kan stänga av.
            </p>
            <Field label="Ange aktuell 6-siffrig kod">
              <Input
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                maxLength={6}
                inputMode="numeric"
              />
            </Field>
            <Button
              variant="danger"
              className="mt-4"
              onClick={() => {
                if (window.confirm("Stäng av 2FA? Detta tar även bort alla recovery codes.")) disableMut.mutate();
              }}
              disabled={disableCode.length !== 6 || disableMut.isPending}
            >
              {disableMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <ShieldOff size={14} />}
              Stäng av 2FA
            </Button>
          </Surface>
        </>
      )}
    </div>
  );
}
