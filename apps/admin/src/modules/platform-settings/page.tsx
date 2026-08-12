"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Building2, Check, CreditCard, FileText, Headset, Loader2, Save, Smartphone } from "lucide-react";
import { Button, Field, Input, PageHeader, Surface, Textarea, Toggle } from "@/shared/components/ui";
import {
  checkoutPaymentMethodsQueryKey,
  getCheckoutPaymentMethods,
  getPlatformSettings,
  platformSettingsQueryKey,
  updatePlatformSettings,
  type PlatformSettings,
} from "@/modules/platform-settings/api";

const PROVIDER_LABELS: Record<string, string> = {
  swish: "Swish",
  stripe: "Stripe",
  mollie: "Mollie",
  adyen: "Adyen",
};

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

  // Läs den faktiska uppsättningen ur kassans egen endpoint i stället för att
  // påstå en leverantör i koden — den blir fel så fort PAYMENT_PROVIDERS ändras.
  const checkoutMethods = useQuery({
    queryKey: checkoutPaymentMethodsQueryKey,
    queryFn: getCheckoutPaymentMethods,
    staleTime: 60_000,
  });
  const activeProviderLabels = (checkoutMethods.data?.methods || [])
    .map((method) => PROVIDER_LABELS[method.id] || method.id)
    .filter((label, index, all) => all.indexOf(label) === index);

  const saveMutation = useMutation({
    mutationFn: () => updatePlatformSettings(form),
    onSuccess: async () => {
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
      await queryClient.invalidateQueries({ queryKey: platformSettingsQueryKey });
    },
  });

  const saveError = saveMutation.isError
    ? (saveMutation.error as { response?: { data?: { error?: string } }; message?: string } | undefined)?.response?.data?.error
      || (saveMutation.error as { message?: string } | undefined)?.message
      || "Okänt fel"
    : null;

  return (
    <div className="page-stack">
      <PageHeader breadcrumb="System" title="Plattform" />

      {/* Navy hero — identitet + spara i ett */}
      <section className="hero-card flex flex-wrap items-center gap-5" style={{ padding: "20px 24px" }}>
        <span className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-[15px] bg-[rgba(254,247,240,0.12)] text-[var(--brand-cream)]">
          <Building2 size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] font-extrabold tracking-[-0.02em] text-white">
            {form.companyName?.trim() || "Plattformsinställningar"}
          </h2>
          <p className="mt-0.5 text-[12.5px] font-medium text-[rgba(254,247,240,0.62)]">
            {form.organizationNumber?.trim()
              ? `Org.nr ${form.organizationNumber}`
              : "Används i appen, supportflöden och systemutskick"}
          </p>
        </div>
        <Button variant="primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : savedFlash ? <Check size={16} /> : <Save size={16} />}
          {saveMutation.isPending ? "Sparar…" : savedFlash ? "Sparat!" : "Spara"}
        </Button>
      </section>

      {saveError && (
        <Surface className="flex items-start gap-3 px-5 py-4">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-[var(--danger)]" />
          <div className="text-sm">
            <p className="font-bold">Kunde inte spara</p>
            <p className="text-[var(--text-secondary)]">{saveError}</p>
          </div>
        </Surface>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-2">
        {/* Företagsuppgifter */}
        <SettingsCard icon={<Building2 size={16} />} title="Företagsuppgifter" hint="Juridiskt namn och registrering">
          <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
            <Field label="Juridiskt namn">
              <Input
                value={form.companyName || ""}
                onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))}
                placeholder="ViaEats AB"
              />
            </Field>
            <Field label="Org.nr">
              <Input
                value={form.organizationNumber || ""}
                onChange={(e) => setForm((p) => ({ ...p, organizationNumber: e.target.value }))}
                placeholder="559123-4567"
              />
            </Field>
            <Field label="Företagsadress" className="sm:col-span-2">
              <Textarea
                value={form.companyAddress || ""}
                onChange={(e) => setForm((p) => ({ ...p, companyAddress: e.target.value }))}
                placeholder={"ViaEats AB\nKungsgatan 1\n111 22 Stockholm"}
                rows={3}
              />
            </Field>
          </div>
        </SettingsCard>

        {/* Betalning & systemavsändare */}
        <SettingsCard icon={<CreditCard size={16} />} title="Betalning & utskick" hint="Betalleverantör och systemavsändare">
          <div className="mb-4 flex items-center justify-between gap-3 rounded-[11px] bg-[var(--bg-panel-soft)] px-4 py-3">
            <span className="text-[13px] font-semibold">Betalleverantör</span>
            <span className="flex flex-wrap justify-end gap-1.5">
              {checkoutMethods.isLoading ? (
                <span className="badge">Hämtar…</span>
              ) : activeProviderLabels.length > 0 ? (
                activeProviderLabels.map((label) => (
                  <span key={label} className="badge badge-success">{label}</span>
                ))
              ) : (
                <span className="badge badge-danger">Ingen aktiv</span>
              )}
            </span>
          </div>
          <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2">
            <Field label="No-reply (avsändare)">
              <Input
                type="email"
                value={form.noReplyEmail || ""}
                onChange={(e) => setForm((p) => ({ ...p, noReplyEmail: e.target.value }))}
                placeholder="no-reply@viaeats.se"
              />
            </Field>
            <Field label="Privacy / DPO-mejl">
              <Input
                type="email"
                value={form.privacyEmail || ""}
                onChange={(e) => setForm((p) => ({ ...p, privacyEmail: e.target.value }))}
                placeholder="privacy@viaeats.se"
              />
            </Field>
          </div>
        </SettingsCard>

        {/* Support & kontakt */}
        <SettingsCard icon={<Headset size={16} />} title="Support & kontakt" hint="Visas för kunder i appen och i kvitton" className="xl:col-span-2">
          <div className="grid gap-x-4 gap-y-3.5 sm:grid-cols-2 xl:grid-cols-4">
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
            <Field label="Postadress" className="sm:col-span-2 xl:col-span-4">
              <Textarea
                value={form.contactAddress || ""}
                onChange={(e) => setForm((p) => ({ ...p, contactAddress: e.target.value }))}
                placeholder={"ViaEats AB\nKungsgatan 1\n111 22 Stockholm"}
                rows={2}
              />
            </Field>
          </div>
        </SettingsCard>

        {/* Om oss */}
        <SettingsCard icon={<FileText size={16} />} title="Om oss" hint="Texten på Om oss-sidan">
          <Textarea
            value={form.aboutBody || ""}
            onChange={(e) => setForm((p) => ({ ...p, aboutBody: e.target.value }))}
            placeholder="ViaEats är en plattform som…"
            rows={7}
          />
        </SettingsCard>

        {/* Appinnehåll */}
        <SettingsCard icon={<Smartphone size={16} />} title="Appinnehåll" hint="Styr vad som lyfts på startsidan">
          <div className="flex items-center justify-between gap-4 rounded-[11px] bg-[var(--bg-panel-soft)] px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-[var(--text-primary)]">Rabatterade raden</p>
              <p className="mt-0.5 text-[11.5px] leading-[1.4] text-[var(--text-muted)]">Visa karusellen med nedsatta priser i appen.</p>
            </div>
            <Toggle
              checked={form.showDiscountedRail ?? true}
              onChange={(v) => setForm((p) => ({ ...p, showDiscountedRail: v }))}
            />
          </div>
          <p className="mt-4 text-[11.5px] leading-[1.45] text-[var(--text-muted)]">
            Ändringar publiceras när du sparar.
          </p>
        </SettingsCard>
      </div>
    </div>
  );
}

/** Kort med navy ikonplatta — samma mönster som dashboard och 2FA. */
function SettingsCard({
  icon,
  title,
  hint,
  className,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Surface className={`px-5 py-5 ${className ?? ""}`}>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] bg-[var(--brand-navy-soft)] text-[var(--brand-navy-ink)]">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-extrabold tracking-[-0.3px]">{title}</p>
          <p className="text-xs text-[var(--text-muted)]">{hint}</p>
        </div>
      </div>
      {children}
    </Surface>
  );
}
