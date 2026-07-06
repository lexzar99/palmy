"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Check, AlertCircle } from "lucide-react";
import { Button, Field, Input, PageHeader, Textarea, Toggle } from "@/shared/components/ui";
import { ImageUploadField } from "@/shared/components/image-upload";
import {
  getPlatformSettings,
  platformSettingsQueryKey,
  updatePlatformSettings,
  type PlatformSettings,
} from "@/modules/platform-settings/api";

export function PlatformSettingsPage() {
  const queryClient = useQueryClient();

  const settings = useQuery({
    queryKey: platformSettingsQueryKey,
    queryFn: getPlatformSettings,
  });

  const [form, setForm] = useState<PlatformSettings>({
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
    heroTitle: "",
    heroSubtitle: "",
    heroImageUrl: "",
    heroCtaLabel: "",
    heroCtaUrl: "",
  });

  const [savedFlash, setSavedFlash] = useState(false);

  // Sync state när data laddats — bara första gången
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (settings.data && !hydrated) {
      // GET /settings returns a `hero` object; flatten it back into form fields.
      const heroFromApi = (settings.data as { hero?: { title?: string; subtitle?: string; imageUrl?: string; ctaLabel?: string; ctaUrl?: string } | null }).hero ?? null;
      setForm({
        contactPhone: settings.data.contactPhone ?? "",
        contactPhoneHours: settings.data.contactPhoneHours ?? "",
        contactEmail: settings.data.contactEmail ?? "",
        contactAddress: settings.data.contactAddress ?? "",
        aboutBody: settings.data.aboutBody ?? "",
        showDiscountedRail: (settings.data as { showDiscountedRail?: boolean }).showDiscountedRail ?? true,
        companyName: settings.data.companyName ?? "",
        organizationNumber: settings.data.organizationNumber ?? "",
        companyAddress: settings.data.companyAddress ?? "",
        supportEmail: settings.data.supportEmail ?? "",
        privacyEmail: settings.data.privacyEmail ?? "",
        noReplyEmail: settings.data.noReplyEmail ?? "",
        heroTitle: heroFromApi?.title ?? "",
        heroSubtitle: heroFromApi?.subtitle ?? "",
        heroImageUrl: heroFromApi?.imageUrl ?? "",
        heroCtaLabel: heroFromApi?.ctaLabel ?? "",
        heroCtaUrl: heroFromApi?.ctaUrl ?? "",
      });
      setHydrated(true);
    }
  }, [settings.data, hydrated]);

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
        breadcrumb="Plattform"
        title="Inställningar"
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

      <div className="grid gap-3.5 md:grid-cols-2 items-start">
        {/* Företagsuppgifter — juridiskt namn, org.nr, momsreg.nr (companyAddress kept here) */}
        <div className="surface px-5 py-[18px]">
          <div className="text-[15px] font-extrabold tracking-[-0.3px]">Företagsuppgifter</div>
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
        <div className="surface px-5 py-[18px]">
          <div className="text-[15px] font-extrabold tracking-[-0.3px]">Betalning &amp; utbetalning</div>
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
        <div className="surface px-5 py-[18px] md:col-span-2">
          <div className="text-[15px] font-extrabold tracking-[-0.3px]">Support &amp; kontakt</div>
          <div className="text-[12px] text-[var(--text-muted)] mt-0.5">Visas för kunder i appen och i kvitton</div>

          <div className="grid gap-3 md:grid-cols-3 mt-[14px]">
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

          <div className="flex items-center justify-between border-t border-[var(--row-divider)] mt-[14px] pt-[13px]">
            <div>
              <div className="text-[13px] font-semibold">Rabatterade-raden i appen</div>
              <div className="text-[11.5px] text-[var(--text-muted)]">Visa karusellen med nedsatta priser på startsidan</div>
            </div>
            <Toggle
              checked={form.showDiscountedRail ?? true}
              onChange={(v) => setForm((p) => ({ ...p, showDiscountedRail: v }))}
            />
          </div>
        </div>

        {/* Om oss-text — span 2 */}
        <div className="surface px-5 py-[18px] md:col-span-2">
          <div className="text-[15px] font-extrabold tracking-[-0.3px]">Om oss</div>
          <div className="text-[12px] text-[var(--text-muted)] mt-0.5">Texten på Om oss-sidan</div>
          <div className="mt-[14px]">
            <Textarea
              value={form.aboutBody || ""}
              onChange={(e) => setForm((p) => ({ ...p, aboutBody: e.target.value }))}
              placeholder="ViaEats är en plattform som..."
              rows={8}
            />
          </div>
        </div>

        {/* Hero på startsidan — span 2 (brand CMS) */}
        <div className="surface px-5 py-[18px] md:col-span-2">
          <div className="text-[15px] font-extrabold tracking-[-0.3px]">Hero på startsidan</div>
          <div className="text-[12px] text-[var(--text-muted)] mt-0.5">Det första kunden ser på webben</div>

          <div className="grid gap-3 md:grid-cols-2 mt-[14px]">
            <Field label="Rubrik">
              <Input
                value={form.heroTitle || ""}
                onChange={(e) => setForm((p) => ({ ...p, heroTitle: e.target.value }))}
                placeholder="Hungrig?"
              />
            </Field>
            <Field label="Underrubrik">
              <Input
                value={form.heroSubtitle || ""}
                onChange={(e) => setForm((p) => ({ ...p, heroSubtitle: e.target.value }))}
                placeholder="Vi fixar resten."
              />
            </Field>
            <ImageUploadField
              label="Hero-bild (visas till höger)"
              kind="misc"
              value={form.heroImageUrl || ""}
              onChange={(url) => setForm((p) => ({ ...p, heroImageUrl: url }))}
            />
            <Field label="CTA-knapptext (valfritt)">
              <Input
                value={form.heroCtaLabel || ""}
                onChange={(e) => setForm((p) => ({ ...p, heroCtaLabel: e.target.value }))}
                placeholder="Beställ nu"
              />
            </Field>
            <Field label="CTA-länk (valfritt)">
              <Input
                value={form.heroCtaUrl || ""}
                onChange={(e) => setForm((p) => ({ ...p, heroCtaUrl: e.target.value }))}
                placeholder="/upptack"
              />
            </Field>
          </div>

          {form.heroImageUrl && (
            <div className="mt-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-page)] p-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">Preview</div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="text-2xl font-black">{form.heroTitle || "Hungrig?"}</div>
                  <div className="text-xl font-bold text-[var(--accent-ink)]">{form.heroSubtitle || "Vi fixar resten."}</div>
                  {form.heroCtaLabel && (
                    <div className="mt-2 inline-block px-3 py-1.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent-ink)] text-xs font-bold">
                      {form.heroCtaLabel}
                    </div>
                  )}
                </div>
                <img
                  src={form.heroImageUrl}
                  alt=""
                  className="h-20 w-20 object-cover rounded-lg border border-[var(--border-subtle)]"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </div>
            </div>
          )}
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
