"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Building2, Save, Check } from "lucide-react";
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
          Här hanterar du <strong>MatGo-företagets</strong> kontaktinfo som visas på <code>/kontakt</code> och <code>/om-oss</code> på web-sajten.
          Inget med enskilda restauranger att göra — det här är plattformens egna uppgifter.
        </p>
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
              placeholder={"MatGo AB\nKungsgatan 1\n111 22 Stockholm"}
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
          placeholder="MatGo är en plattform som..."
          rows={10}
        />
      </Surface>
    </div>
  );
}
