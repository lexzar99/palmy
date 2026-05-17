"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Building2, Save, Check, Briefcase, AlertCircle } from "lucide-react";
import { Button, Field, Input, PageHeader, Surface, Textarea } from "@/shared/components/ui";
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
  });

  const [savedFlash, setSavedFlash] = useState(false);

  // Sync state när data laddats — bara första gången
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (settings.data && !hydrated) {
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

      <Surface className="px-6 py-5">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Här hanterar du <strong>FoodGo-företagets</strong> kontaktinfo som visas på <code>/kontakt</code> och <code>/om-oss</code> på web-sajten.
          Inget med enskilda restauranger att göra — det här är plattformens egna uppgifter.
        </p>
      </Surface>

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
        <p className="text-xs mb-5" style={{ color: "var(--text-secondary)" }}>
          Visas i Terms, Privacy och support-flöden i web + RN-appen. Lämna tomt för fallback-värden (<code>FoodGo AB</code>, <code>support@matgo.se</code>, osv).
        </p>

        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Företagsnamn">
            <Input
              value={form.companyName || ""}
              onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))}
              placeholder="FoodGo AB"
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
              placeholder={"FoodGo AB\nKungsgatan 1\n111 22 Stockholm"}
              rows={3}
            />
          </Field>

          <Field label="Support-email">
            <Input
              type="email"
              value={form.supportEmail || ""}
              onChange={(e) => setForm((p) => ({ ...p, supportEmail: e.target.value }))}
              placeholder="support@matgo.se"
            />
          </Field>

          <Field label="Privacy / DPO-email">
            <Input
              type="email"
              value={form.privacyEmail || ""}
              onChange={(e) => setForm((p) => ({ ...p, privacyEmail: e.target.value }))}
              placeholder="privacy@matgo.se"
            />
          </Field>

          <Field label="No-reply email (avsändare för system-mejl)">
            <Input
              type="email"
              value={form.noReplyEmail || ""}
              onChange={(e) => setForm((p) => ({ ...p, noReplyEmail: e.target.value }))}
              placeholder="no-reply@matgo.se"
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
              placeholder="info@matgo.se"
            />
          </Field>

          <Field label="Postadress (flera rader OK)">
            <Textarea
              value={form.contactAddress || ""}
              onChange={(e) => setForm((p) => ({ ...p, contactAddress: e.target.value }))}
              placeholder={"FoodGo AB\nKungsgatan 1\n111 22 Stockholm"}
              rows={3}
            />
          </Field>
        </div>
      </Surface>

      <Surface className="px-6 py-6">
        <h2 className="text-base font-black uppercase tracking-tight mb-2">Om oss-text</h2>
        <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
          Texten som visas på <code>/om-oss</code>-sidan. Lämna tomt för att använda default-text om plattformen. Separera stycken med blankrader.
        </p>
        <Textarea
          value={form.aboutBody || ""}
          onChange={(e) => setForm((p) => ({ ...p, aboutBody: e.target.value }))}
          placeholder="FoodGo är en plattform som..."
          rows={10}
        />
      </Surface>
    </div>
  );
}
