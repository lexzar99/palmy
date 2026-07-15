"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Check, AlertCircle } from "lucide-react";
import { Button, Field, Input, PageHeader, Textarea, Toggle } from "@/shared/components/ui";
import {
  getPlatformSettings,
  platformSettingsQueryKey,
  updatePlatformSettings,
  type PlatformSettings,
} from "@/modules/platform-settings/api";

const EMPTY_PLATFORM_SETTINGS: PlatformSettings = {
  contactPhone: "",
  contactPhoneHours: "",
  contactEmail: "",
  contactAddress: "",
  aboutBody: "",
  showDiscountedRail: true,
  companyName: "",
  organizationNumber: "",
  companyAddress: "",
  supportEmail: "",
  privacyEmail: "",
  noReplyEmail: "",
};

function mapSettingsToForm(settings: PlatformSettings & Record<string, unknown>): PlatformSettings {
  return {
    contactPhone: settings.contactPhone ?? "",
    contactPhoneHours: settings.contactPhoneHours ?? "",
    contactEmail: settings.contactEmail ?? "",
    contactAddress: settings.contactAddress ?? "",
    aboutBody: settings.aboutBody ?? "",
    showDiscountedRail: settings.showDiscountedRail ?? true,
    companyName: settings.companyName ?? "",
    organizationNumber: settings.organizationNumber ?? "",
    companyAddress: settings.companyAddress ?? "",
    supportEmail: settings.supportEmail ?? "",
    privacyEmail: settings.privacyEmail ?? "",
    noReplyEmail: settings.noReplyEmail ?? "",
  };
}

export function PlatformSettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("tab") === "kvitto") router.replace("/receipts");
  }, [router, searchParams]);

  const settings = useQuery({
    queryKey: platformSettingsQueryKey,
    queryFn: getPlatformSettings,
  });

  return (
    <PlatformSettingsEditor
      key={settings.data ? "hydrated" : "loading"}
      initialForm={settings.data ? mapSettingsToForm(settings.data) : EMPTY_PLATFORM_SETTINGS}
    />
  );
}

function PlatformSettingsEditor({ initialForm }: { initialForm: PlatformSettings }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PlatformSettings>(initialForm);

  const [savedFlash, setSavedFlash] = useState(false);

  const saveMutation = useMutation({
    mutationFn: () => updatePlatformSettings(form),
    onSuccess: async () => {
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
      await queryClient.invalidateQueries({ queryKey: platformSettingsQueryKey });
    },
  });

  return (
    <div className="page-stack">
      <PageHeader
        breadcrumb="System"
        title="Plattform"
        actions={
          <Button variant="primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : savedFlash ? <Check size={16} /> : <Save size={16} />}
            {saveMutation.isPending ? "Sparar..." : savedFlash ? "Sparat!" : "Spara ändringar"}
          </Button>
        }
      />

      {saveMutation.isError && (
        <div className="surface px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="mt-0.5 shrink-0" style={{ color: "var(--danger)" }} />
            <div className="text-sm">
              <div className="font-bold mb-0.5">Kunde inte spara</div>
              <div style={{ color: "var(--text-secondary)" }}>
                {(saveMutation.error as { response?: { data?: { error?: string } }; message?: string } | undefined)
                  ?.response?.data?.error
                  || (saveMutation.error as { message?: string } | undefined)?.message
                  || "Okänt fel"}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] px-5 py-4">
        <div>
          <p className="text-[13px] font-extrabold">Plattformens grundinställningar</p>
          <p className="mt-1 text-[12px] text-[var(--text-secondary)]">Ändringar här används i appen, supportflöden och systemutskick.</p>
        </div>
        <span className="hidden items-center gap-2 text-[12px] font-semibold text-[var(--text-secondary)] sm:flex">
          <span className="h-2 w-2 rounded-full bg-[var(--success)]" /> Aktiv
        </span>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-12">
        {/* Företagsuppgifter — juridiskt namn, org.nr, momsreg.nr (companyAddress kept here) */}
        <div className="surface px-5 py-5 lg:col-span-7">
          <div className="text-[16px] font-extrabold tracking-[-0.3px]">Företagsuppgifter</div>
          <div className="text-[12px] text-[var(--text-muted)] mt-0.5">Juridiskt namn och registrering</div>

          <SettingRow label="Juridiskt namn" first>
            <Input
              value={form.companyName || ""}
              onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))}
              placeholder="ViaEats AB"
            />
          </SettingRow>
          <SettingRow label="Org.nr">
            <Input
              value={form.organizationNumber || ""}
              onChange={(e) => setForm((p) => ({ ...p, organizationNumber: e.target.value }))}
              placeholder="559123-4567"
            />
          </SettingRow>
          <SettingRow label="Företagsadress" align="start">
            <Textarea
              value={form.companyAddress || ""}
              onChange={(e) => setForm((p) => ({ ...p, companyAddress: e.target.value }))}
              placeholder={"ViaEats AB\nKungsgatan 1\n111 22 Stockholm"}
              rows={3}
            />
          </SettingRow>
        </div>

        {/* Betalning & utbetalning — Adyen badge + system-mejl avsändare */}
        <div className="surface px-5 py-5 lg:col-span-5">
          <div className="text-[16px] font-extrabold tracking-[-0.3px]">Betalning &amp; utbetalning</div>
          <div className="text-[12px] text-[var(--text-muted)] mt-0.5">Adyen och systemavsändare</div>

          <div className="flex items-center justify-between border-t border-[var(--row-divider)] mt-[13px] pt-[14px] pb-[13px]">
            <span className="text-[13px] font-semibold">Adyen-konto</span>
            <span className="badge badge-success">Kopplat</span>
          </div>
          <SettingRow label="No-reply (avsändare)">
            <Input
              type="email"
              value={form.noReplyEmail || ""}
              onChange={(e) => setForm((p) => ({ ...p, noReplyEmail: e.target.value }))}
              placeholder="no-reply@viaeats.se"
            />
          </SettingRow>
          <SettingRow label="Privacy / DPO-mejl">
            <Input
              type="email"
              value={form.privacyEmail || ""}
              onChange={(e) => setForm((p) => ({ ...p, privacyEmail: e.target.value }))}
              placeholder="privacy@viaeats.se"
            />
          </SettingRow>
        </div>

        {/* Support & kontakt — span 2; 3-col inputs + Live-chatt toggle (reusing showDiscountedRail) */}
        <div className="surface px-5 py-5 lg:col-span-8">
          <div className="text-[16px] font-extrabold tracking-[-0.3px]">Support &amp; kontakt</div>
          <div className="text-[12px] text-[var(--text-muted)] mt-0.5">Visas för kunder i appen och i kvitton</div>

          <div className="mt-4 grid gap-x-4 gap-y-3 md:grid-cols-2">
            <Field label="Support-mejl">
              <Input
                type="email"
                value={form.supportEmail || ""}
                onChange={(e) => setForm((p) => ({ ...p, supportEmail: e.target.value }))}
                placeholder="support@viaeats.se"
              />
            </Field>
            <Field label="Support-telefon">
              <Input
                value={form.contactPhone || ""}
                onChange={(e) => setForm((p) => ({ ...p, contactPhone: e.target.value }))}
                placeholder="020-12 34 56"
              />
            </Field>
            <Field label="Telefontider">
              <Input
                value={form.contactPhoneHours || ""}
                onChange={(e) => setForm((p) => ({ ...p, contactPhoneHours: e.target.value }))}
                placeholder="Mån–Fre 09:00 – 17:00"
              />
            </Field>
            <Field label="Allmän e-post">
              <Input
                type="email"
                value={form.contactEmail || ""}
                onChange={(e) => setForm((p) => ({ ...p, contactEmail: e.target.value }))}
                placeholder="info@viaeats.se"
              />
            </Field>
            <Field label="Postadress">
              <Textarea
                value={form.contactAddress || ""}
                onChange={(e) => setForm((p) => ({ ...p, contactAddress: e.target.value }))}
                placeholder={"ViaEats AB\nKungsgatan 1\n111 22 Stockholm"}
                rows={2}
              />
            </Field>
          </div>

        </div>

        {/* Om oss-text — span 2 */}
        <div className="surface px-5 py-5 lg:col-span-8">
          <div className="text-[16px] font-extrabold tracking-[-0.3px]">Om oss</div>
          <div className="text-[12px] text-[var(--text-muted)] mt-0.5">Texten på Om oss-sidan</div>
          <div className="mt-[14px]">
            <Textarea
              value={form.aboutBody || ""}
              onChange={(e) => setForm((p) => ({ ...p, aboutBody: e.target.value }))}
              placeholder="ViaEats är en plattform som..."
              rows={7}
            />
          </div>
        </div>

        <div className="surface px-5 py-5 lg:col-span-4">
          <div className="text-[16px] font-extrabold tracking-[-0.3px]">Appinnehåll</div>
          <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">Styr vad som lyfts på startsidan</div>
          <div className="mt-4 flex items-center justify-between gap-4 border-t border-[var(--row-divider)] pt-4">
            <div>
              <div className="text-[13px] font-semibold">Rabatterade raden</div>
              <div className="mt-1 text-[11.5px] leading-[1.4] text-[var(--text-muted)]">Visa karusellen med nedsatta priser i appen.</div>
            </div>
            <Toggle
              checked={form.showDiscountedRail ?? true}
              onChange={(v) => setForm((p) => ({ ...p, showDiscountedRail: v }))}
            />
          </div>
          <div className="mt-5 rounded-xl bg-[var(--bg-panel-soft)] px-3.5 py-3 text-[11.5px] leading-[1.45] text-[var(--text-secondary)]">
            Ändringar publiceras när du sparar plattformen.
          </div>
        </div>

      </div>
    </div>
  );
}

/** A label/control row that matches the design's divider-separated card rows. */
function SettingRow({
  label,
  children,
  first = false,
  align = "center",
}: {
  label: string;
  children: React.ReactNode;
  first?: boolean;
  align?: "center" | "start";
}) {
  return (
    <div
      className={`flex justify-between gap-4 border-t border-[var(--row-divider)] pt-[14px] pb-[13px] ${first ? "mt-[13px]" : ""} ${align === "start" ? "items-start" : "items-center"}`}
    >
      <span className="text-[13px] font-semibold shrink-0 pt-1.5">{label}</span>
      <div className="min-w-0 flex-1 max-w-[260px]">{children}</div>
    </div>
  );
}
