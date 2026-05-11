"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, ShieldCheck, ShieldOff, Loader2 } from "lucide-react";
import { apiGet, apiPost } from "@/shared/api/client";
import { Button, Field, Input, PageHeader, Surface } from "@/shared/components/ui";

export function TwoFAPage() {
  const queryClient = useQueryClient();
  const [setupData, setSetupData] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [disableCode, setDisableCode] = useState("");

  const status = useQuery({
    queryKey: ["2fa-status"],
    queryFn: () => apiGet<{ enabled: boolean }>("/auth/2fa/status"),
  });

  const setupMut = useMutation({
    mutationFn: () => apiPost<{ secret: string; qrDataUrl: string; otpauthUrl: string }>("/auth/2fa/setup"),
    onSuccess: (data) => setSetupData({ qrDataUrl: data.qrDataUrl, secret: data.secret }),
  });

  const verifyMut = useMutation({
    mutationFn: () => apiPost<{ success: boolean }>("/auth/2fa/verify", { totp: code }),
    onSuccess: async () => {
      alert("✅ 2FA är aktiverat! Du kommer att behöva en kod vid nästa inloggning.");
      setSetupData(null);
      setCode("");
      await queryClient.invalidateQueries({ queryKey: ["2fa-status"] });
    },
    onError: (err: any) => alert(`❌ ${err?.response?.data?.error || "Verifiering misslyckades"}`),
  });

  const disableMut = useMutation({
    mutationFn: () => apiPost<{ success: boolean }>("/auth/2fa/disable", { totp: disableCode }),
    onSuccess: async () => {
      alert("✅ 2FA är avstängt.");
      setDisableCode("");
      await queryClient.invalidateQueries({ queryKey: ["2fa-status"] });
    },
    onError: (err: any) => alert(`❌ ${err?.response?.data?.error || "Avstängning misslyckades"}`),
  });

  const isEnabled = Boolean(status.data?.enabled);

  return (
    <div className="page-stack">
      <PageHeader title="2-faktorsautentisering" />

      <Surface className="px-6 py-5">
        <div className="flex items-start gap-3">
          {isEnabled ? <ShieldCheck size={20} className="text-emerald-500 mt-0.5" /> : <Shield size={20} className="text-amber-500 mt-0.5" />}
          <div>
            <h2 className="text-base font-black uppercase tracking-tight">
              {isEnabled ? "2FA är AKTIVT" : "2FA är AVSTÄNGT"}
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              {isEnabled
                ? "Vid inloggning behöver du ange en kod från Google Authenticator (eller liknande app)."
                : "Aktivera för extra säkerhet — kräver Google Authenticator-app på din telefon."}
            </p>
          </div>
        </div>
      </Surface>

      {!isEnabled && !setupData && (
        <Surface className="px-6 py-6">
          <h3 className="text-base font-black uppercase tracking-tight mb-3">Aktivera 2FA</h3>
          <ol className="text-sm space-y-2 mb-5" style={{ color: "var(--text-secondary)" }}>
            <li>1. Klicka <strong>Starta setup</strong> nedan</li>
            <li>2. Scanna QR-koden i Google Authenticator (eller Authy/1Password)</li>
            <li>3. Ange den 6-siffriga koden från appen för att bekräfta</li>
          </ol>
          <Button variant="primary" onClick={() => setupMut.mutate()} disabled={setupMut.isPending}>
            {setupMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
            Starta setup
          </Button>
        </Surface>
      )}

      {setupData && (
        <Surface className="px-6 py-6">
          <h3 className="text-base font-black uppercase tracking-tight mb-3">Scanna QR-koden</h3>
          <div className="flex flex-wrap gap-6 items-start mb-5">
            <img src={setupData.qrDataUrl} alt="2FA QR-kod" className="w-48 h-48 rounded-xl border" style={{ borderColor: "var(--border-muted)" }} />
            <div className="flex-1 min-w-[200px]">
              <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>
                Kan inte scanna? Skriv in detta secret manuellt i appen:
              </p>
              <code className="block p-3 rounded-lg text-xs break-all" style={{ backgroundColor: "var(--bg-deep)", color: "var(--text-primary)" }}>
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
            <Button variant="primary" onClick={() => verifyMut.mutate()} disabled={code.length !== 6 || verifyMut.isPending}>
              {verifyMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
              Bekräfta + aktivera
            </Button>
            <Button variant="secondary" onClick={() => { setSetupData(null); setCode(""); }}>
              Avbryt
            </Button>
          </div>
        </Surface>
      )}

      {isEnabled && (
        <Surface className="px-6 py-6">
          <h3 className="text-base font-black uppercase tracking-tight mb-3">Stäng av 2FA</h3>
          <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
            För säkerhet krävs en aktuell 2FA-kod för att stänga av (så att en angripare som tagit ditt session-cookie inte kan deaktivera).
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
              if (window.confirm("Stäng av 2FA?")) disableMut.mutate();
            }}
            disabled={disableCode.length !== 6 || disableMut.isPending}
          >
            {disableMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <ShieldOff size={14} />}
            Stäng av 2FA
          </Button>
        </Surface>
      )}
    </div>
  );
}
