"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Building2, Save, Check, Briefcase, AlertCircle } from "lucide-react";
import { Button, Field, Input, PageHeader, Surface, Textarea } from "@/shared/components/ui";
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
        title="Företagsinställningar"
        actions={
          <Button variant="primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : savedFlash ? <Check size={16} /> : <Save size={16} />}
            {saveMutation.isPending ? "Sparar..." : savedFlash ? "Sparat!" : "Spara"}
          </Button>
        }
      />

      {saveMutation.isError && (
        <Surface className="px-6 py-4">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="text-red-500 mt-0.5 shrink-0" />
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
        </Surface>
      )}

      <Surface className="px-6 py-6">
        <div className="flex items-center gap-3 mb-5">
          <Briefcase size={18} className="text-[var(--accent)]" />
          <h2 className="text-base font-black uppercase tracking-tight">Företagsidentitet</h2>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Företagsnamn">
            <Input
              value={form.companyName || ""}
              onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))}
              placeholder="Delívera AB"
            />
          </Field>

          <Field label="Organisationsnummer">
            <Input
              value={form.organizationNumber || ""}
              onChange={(e) => setForm((p) => ({ ...p, organizationNumber: e.target.value }))}
              placeholder="559123-4567"
            />
          </Field>

          <Field label="Företagsadress (postal, flera rader OK)">
            <Textarea
              value={form.companyAddress || ""}
              onChange={(e) => setForm((p) => ({ ...p, companyAddress: e.target.value }))}
              placeholder={"Delívera AB\nKungsgatan 1\n111 22 Stockholm"}
              rows={3}
            />
          </Field>

          <Field label="Support-email">
            <Input
              type="email"
              value={form.supportEmail || ""}
              onChange={(e) => setForm((p) => ({ ...p, supportEmail: e.target.value }))}
              placeholder="support@delivera.se"
            />
          </Field>

          <Field label="Privacy / DPO-email">
            <Input
              type="email"
              value={form.privacyEmail || ""}
              onChange={(e) => setForm((p) => ({ ...p, privacyEmail: e.target.value }))}
              placeholder="privacy@delivera.se"
            />
          </Field>

          <Field label="No-reply email (avsändare för system-mejl)">
            <Input
              type="email"
              value={form.noReplyEmail || ""}
              onChange={(e) => setForm((p) => ({ ...p, noReplyEmail: e.target.value }))}
              placeholder="no-reply@delivera.se"
            />
          </Field>
        </div>
      </Surface>

      <Surface className="px-6 py-6">
        <div className="flex items-center gap-3 mb-5">
          <Building2 size={18} className="text-[var(--accent)]" />
          <h2 className="text-base font-black uppercase tracking-tight">Kontaktinfo</h2>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Telefonnummer">
            <Input
              value={form.contactPhone || ""}
              onChange={(e) => setForm((p) => ({ ...p, contactPhone: e.target.value }))}
              placeholder="+46 8 123 45 67"
            />
          </Field>

          <Field label="Telefontider">
            <Input
              value={form.contactPhoneHours || ""}
              onChange={(e) => setForm((p) => ({ ...p, contactPhoneHours: e.target.value }))}
              placeholder="Mån–Fre 09:00 – 17:00"
            />
          </Field>

          <Field label="E-postadress">
            <Input
              type="email"
              value={form.contactEmail || ""}
              onChange={(e) => setForm((p) => ({ ...p, contactEmail: e.target.value }))}
              placeholder="info@delivera.se"
            />
          </Field>

          <Field label="Postadress (flera rader OK)">
            <Textarea
              value={form.contactAddress || ""}
              onChange={(e) => setForm((p) => ({ ...p, contactAddress: e.target.value }))}
              placeholder={"Delívera AB\nKungsgatan 1\n111 22 Stockholm"}
              rows={3}
            />
          </Field>
        </div>
      </Surface>

      <Surface className="px-6 py-6">
        <h2 className="text-base font-black uppercase tracking-tight mb-2">Om oss-text</h2>
        <Textarea
          value={form.aboutBody || ""}
          onChange={(e) => setForm((p) => ({ ...p, aboutBody: e.target.value }))}
          placeholder="Delívera är en plattform som..."
          rows={10}
        />
      </Surface>

      {/* A14 — Hero / brand CMS for the customer website */}
      <Surface className="px-6 py-6">
        <h2 className="text-base font-black uppercase tracking-tight mb-2">Hero på startsidan</h2>
        <div className="grid gap-5 md:grid-cols-2">
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
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-2">Preview</div>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="text-2xl font-black">{form.heroTitle || "Hungrig?"}</div>
                <div className="text-xl font-bold text-[var(--accent)]">{form.heroSubtitle || "Vi fixar resten."}</div>
                {form.heroCtaLabel && (
                  <div className="mt-2 inline-block px-3 py-1.5 rounded-full bg-[var(--accent)]/20 text-xs font-bold">
                    {form.heroCtaLabel}
                  </div>
                )}
              </div>
              <img
                src={form.heroImageUrl}
                alt=""
                className="h-20 w-20 object-cover rounded-lg border border-[var(--border)]"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          </div>
        )}
      </Surface>
    </div>
  );
}
