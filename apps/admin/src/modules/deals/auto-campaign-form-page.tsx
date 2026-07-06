"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  campaignStatusLabel,
  createDealCampaign,
  createDealTemplate,
  dealCampaignByIdQueryKey,
  dealCampaignPreviewQueryKey,
  dealCampaignSegmentsQueryKey,
  dealCampaignTemplatesQueryKey,
  dealCampaignsQueryKey,
  deleteDealCampaign,
  getDealCampaign,
  getDealCampaignPreview,
  getDealCampaignSegments,
  getDealCampaignTemplates,
  runDealCampaign,
  segmentLabel,
  templateLabel,
  updateDealCampaign,
  type CampaignStatus,
  type DealCampaignInput,
  type DealTemplateInput,
  type DealCampaignVariant,
} from "@/modules/deals/campaigns-api";
import { Badge, Button, Field, Input, PageHeader, Select, Surface } from "@/shared/components/ui";
import { useToast } from "@/shared/components/toast";

const CARD_TITLE = "text-[15px] font-extrabold tracking-[-0.3px]";

type VariantRow = { dealTemplateId: string; weight: string };

type Draft = {
  title: string;
  segment: string;
  variants: VariantRow[];
  capPerCustomer: string;
  validDays: string;
  status: CampaignStatus;
  scheduledAt: string;
};

const defaultDraft = (): Draft => ({
  title: "",
  segment: "ALL",
  variants: [
    { dealTemplateId: "", weight: "1" },
    { dealTemplateId: "", weight: "1" },
  ],
  capPerCustomer: "1",
  validDays: "7",
  status: "DRAFT",
  scheduledAt: "",
});

type TemplateKind = "PERCENT" | "FIXED" | "FREE_DELIVERY" | "DPOINTS";

type TemplateForm = {
  title: string;
  kind: TemplateKind;
  value: string;
  minOrderKr: string;
};

const emptyTemplateForm = (): TemplateForm => ({ title: "", kind: "PERCENT", value: "", minOrderKr: "" });

const TEMPLATE_KIND_LABELS: Record<TemplateKind, string> = {
  PERCENT: "Procent",
  FIXED: "Fast kr",
  FREE_DELIVERY: "Fri leverans",
  DPOINTS: "Vpoints",
};

function buildTemplatePayload(f: TemplateForm): DealTemplateInput {
  const value = Number(f.value) || 0;
  const minOrderKr = f.minOrderKr ? Number(f.minOrderKr) || 0 : undefined;
  switch (f.kind) {
    case "PERCENT":
      return { title: f.title.trim(), discountType: "PERCENTAGE", discountValue: value, appTemplate: "PERCENT", minOrderKr };
    case "FIXED":
      return { title: f.title.trim(), discountType: "FIXED", discountValue: value, appTemplate: "FIXED", minOrderKr };
    case "FREE_DELIVERY":
      return { title: f.title.trim(), discountType: "NONE", discountValue: 0, freeDelivery: true, appTemplate: "FREE_DELIVERY_HERO", minOrderKr };
    case "DPOINTS":
      return { title: f.title.trim(), discountType: "NONE", discountValue: 0, appDpointsBonus: value, appTemplate: "DPOINTS", minOrderKr };
  }
}

export function AutoCampaignFormPage({ campaignId }: { campaignId?: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const isEditing = Boolean(campaignId);

  const [draft, setDraft] = useState<Draft>(defaultDraft());
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(campaignId ?? null);

  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState<TemplateForm>(emptyTemplateForm());
  const [templateError, setTemplateError] = useState<string | null>(null);

  const segments = useQuery({ queryKey: dealCampaignSegmentsQueryKey, queryFn: getDealCampaignSegments });
  const templates = useQuery({ queryKey: dealCampaignTemplatesQueryKey, queryFn: getDealCampaignTemplates });

  const existing = useQuery({
    queryKey: dealCampaignByIdQueryKey(campaignId!),
    queryFn: () => getDealCampaign(campaignId!),
    enabled: Boolean(campaignId),
  });

  // Live "~N kunder" för valt segment.
  const preview = useQuery({
    queryKey: dealCampaignPreviewQueryKey(draft.segment),
    queryFn: () => getDealCampaignPreview(draft.segment),
    enabled: Boolean(draft.segment),
  });

  useEffect(() => {
    if (existing.data && !initialized) {
      const c = existing.data;
      setDraft({
        title: c.title,
        segment: c.segment,
        variants: c.variants?.length
          ? c.variants.map((v) => ({ dealTemplateId: v.dealTemplateId, weight: String(v.weight) }))
          : defaultDraft().variants,
        capPerCustomer: String(c.capPerCustomer ?? 1),
        validDays: String(c.validDays ?? 7),
        status: c.status,
        scheduledAt: c.scheduledAt ? c.scheduledAt.slice(0, 16) : "",
      });
      setInitialized(true);
    }
  }, [existing.data, initialized]);

  const set = <K extends keyof Draft>(key: K, val: Draft[K]) => setDraft((prev) => ({ ...prev, [key]: val }));

  const setVariant = (index: number, patch: Partial<VariantRow>) =>
    setDraft((prev) => ({ ...prev, variants: prev.variants.map((v, i) => (i === index ? { ...v, ...patch } : v)) }));

  const addVariant = () =>
    setDraft((prev) => (prev.variants.length >= 4 ? prev : { ...prev, variants: [...prev.variants, { dealTemplateId: "", weight: "1" }] }));

  const removeVariant = (index: number) =>
    setDraft((prev) => (prev.variants.length <= 1 ? prev : { ...prev, variants: prev.variants.filter((_, i) => i !== index) }));

  const buildPayload = (d: Draft): DealCampaignInput => {
    const variants: DealCampaignVariant[] = d.variants
      .filter((v) => v.dealTemplateId)
      .map((v) => ({ dealTemplateId: v.dealTemplateId, weight: Math.max(1, Number(v.weight) || 1) }));
    return {
      title: d.title.trim(),
      segment: d.segment,
      variants,
      status: d.status,
      capPerCustomer: Math.max(1, Number(d.capPerCustomer) || 1),
      validDays: Math.max(1, Number(d.validDays) || 7),
      scheduledAt: d.status === "SCHEDULED" && d.scheduledAt ? new Date(d.scheduledAt).toISOString() : null,
    };
  };

  const saveMutation = useMutation({
    mutationFn: (d: Draft) => {
      const payload = buildPayload(d);
      if (savedId) return updateDealCampaign(savedId, payload);
      return createDealCampaign(payload);
    },
    onSuccess: async (campaign) => {
      await queryClient.invalidateQueries({ queryKey: dealCampaignsQueryKey });
      setSavedId(campaign.id);
      showToast({ type: "success", message: "Kampanj sparad." });
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? "Kunde inte spara kampanj.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteDealCampaign(savedId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dealCampaignsQueryKey });
      router.push("/deals?tab=auto");
    },
    onError: () => setError("Kunde inte radera kampanj."),
  });

  const runMutation = useMutation({
    mutationFn: () => runDealCampaign(savedId!),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: dealCampaignsQueryKey });
      showToast({ type: "success", message: `Tilldelade ${result.assigned}, hoppade över ${result.skipped}.` });
    },
    onError: () => showToast({ type: "error", message: "Kunde inte köra kampanj." }),
  });

  const createTemplateMutation = useMutation({
    mutationFn: (f: TemplateForm) => createDealTemplate(buildTemplatePayload(f)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: dealCampaignTemplatesQueryKey });
      setTemplateOpen(false);
      setTemplateForm(emptyTemplateForm());
      setTemplateError(null);
      showToast({ type: "success", message: "Mall skapad." });
    },
    onError: () => setTemplateError("Kunde inte skapa mall."),
  });

  const handleCreateTemplate = () => {
    if (!templateForm.title.trim()) { setTemplateError("Titel krävs."); return; }
    if ((templateForm.kind === "PERCENT" || templateForm.kind === "FIXED" || templateForm.kind === "DPOINTS") && (!templateForm.value || Number(templateForm.value) <= 0)) {
      setTemplateError("Värde måste vara > 0.");
      return;
    }
    setTemplateError(null);
    createTemplateMutation.mutate(templateForm);
  };

  const handleSave = () => {
    if (!draft.title.trim()) { setError("Titel krävs."); return; }
    const chosen = draft.variants.filter((v) => v.dealTemplateId);
    if (chosen.length === 0) { setError("Välj minst en mall i poolen."); return; }
    if (draft.status === "SCHEDULED" && !draft.scheduledAt) { setError("Välj starttid för schemalagd kampanj."); return; }
    setError(null);
    saveMutation.mutate(draft);
  };

  const templateOptions = templates.data ?? [];
  const segmentOptions = segments.data ?? [];

  const isLoading = (isEditing && existing.isLoading) || segments.isLoading || templates.isLoading;
  if (isLoading) return <div className="px-6 py-12 text-sm text-[var(--text-secondary)]">Laddar...</div>;

  const previewCount = preview.data?.count;

  return (
    <div className="page-stack">
      <PageHeader
        breadcrumb="Katalog / Deals"
        title={isEditing ? draft.title || "Redigera kampanj" : "Ny auto-kampanj"}
        onBack={() => router.push("/deals?tab=auto")}
        actions={
          <>
            {savedId && (
              <Button
                variant="danger"
                onClick={() => { if (!confirm("Radera denna kampanj? Kan inte ångras.")) return; deleteMutation.mutate(); }}
                disabled={deleteMutation.isPending}
              >
                <Trash2 size={14} /> Radera
              </Button>
            )}
            {savedId && (
              <Button variant="secondary" onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>
                {runMutation.isPending ? <><Loader2 size={14} className="animate-spin" /> Kör...</> : "Kör nu"}
              </Button>
            )}
            <Button variant="primary" onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? <><Loader2 size={14} className="animate-spin" /> Sparar...</> : savedId ? "Spara" : "Skapa"}
            </Button>
          </>
        }
      />

      {error && (
        <p className="rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--danger-text)]">{error}</p>
      )}

      {templateOptions.length === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-strong)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          <span>Inga mallar finns. Skapa en mall som poolen kan använda.</span>
          <Button variant="primary" onClick={() => { setTemplateForm(emptyTemplateForm()); setTemplateError(null); setTemplateOpen(true); }}>
            <Plus size={14} /> Skapa mall
          </Button>
        </div>
      )}

      <div className="grid gap-3.5 lg:grid-cols-[1.4fr_1fr]">
        {/* Vänster */}
        <div className="grid gap-3.5 content-start">
          <Surface className="px-5 py-5 grid gap-5">
            <p className={CARD_TITLE}>Grunduppgifter</p>
            <Field label="Titel">
              <Input value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="Winback inaktiva" autoFocus />
            </Field>
            <Field label="Segment">
              <Select value={draft.segment} onChange={(e) => set("segment", e.target.value)}>
                {segmentOptions.map((s) => <option key={s} value={s}>{segmentLabel(s)}</option>)}
              </Select>
            </Field>
            <p className="text-[13px] text-[var(--text-muted)]">
              {preview.isLoading ? "Räknar kunder..." : previewCount != null ? `~${previewCount} kunder matchar` : ""}
            </p>
          </Surface>

          <Surface className="px-5 py-5">
            <div className="flex items-center justify-between gap-2">
              <p className={CARD_TITLE}>Mall-pool</p>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => { setTemplateForm(emptyTemplateForm()); setTemplateError(null); setTemplateOpen((v) => !v); }}>
                  <Plus size={14} /> Skapa mall
                </Button>
                <Button variant="secondary" onClick={addVariant} disabled={draft.variants.length >= 4}>
                  <Plus size={14} /> Lägg till
                </Button>
              </div>
            </div>
            <p className="mt-1 text-[12px] text-[var(--text-muted)]">Kunden får en slumpad mall, viktad efter vikt.</p>

            {templateOpen && (
              <div className="mt-3.5 grid gap-3 rounded-xl border border-[var(--border-strong)] p-3.5">
                {templateError && <p className="text-[13px] text-[var(--danger-text)]">{templateError}</p>}
                <Field label="Titel">
                  <Input value={templateForm.title} onChange={(e) => setTemplateForm((p) => ({ ...p, title: e.target.value }))} placeholder="30% rabatt" autoFocus />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Typ">
                    <Select value={templateForm.kind} onChange={(e) => setTemplateForm((p) => ({ ...p, kind: e.target.value as TemplateKind, value: "" }))}>
                      {(Object.keys(TEMPLATE_KIND_LABELS) as TemplateKind[]).map((k) => (
                        <option key={k} value={k}>{TEMPLATE_KIND_LABELS[k]}</option>
                      ))}
                    </Select>
                  </Field>
                  {templateForm.kind !== "FREE_DELIVERY" && (
                    <Field label={templateForm.kind === "PERCENT" ? "Procent" : templateForm.kind === "FIXED" ? "Belopp (kr)" : "Vpoints"}>
                      <Input type="number" min="0" value={templateForm.value} onChange={(e) => setTemplateForm((p) => ({ ...p, value: e.target.value }))} placeholder={templateForm.kind === "PERCENT" ? "30" : templateForm.kind === "FIXED" ? "50" : "100"} />
                    </Field>
                  )}
                </div>
                <Field label="Min. ordervärde (kr, valfritt)">
                  <Input type="number" min="0" value={templateForm.minOrderKr} onChange={(e) => setTemplateForm((p) => ({ ...p, minOrderKr: e.target.value }))} placeholder="0" />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setTemplateOpen(false)}>Avbryt</Button>
                  <Button variant="primary" onClick={handleCreateTemplate} disabled={createTemplateMutation.isPending}>
                    {createTemplateMutation.isPending ? <><Loader2 size={14} className="animate-spin" /> Sparar...</> : "Spara mall"}
                  </Button>
                </div>
              </div>
            )}

            <div className="mt-3.5 grid gap-2.5">
              {draft.variants.map((v, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <Select
                    value={v.dealTemplateId}
                    onChange={(e) => setVariant(i, { dealTemplateId: e.target.value })}
                    aria-label="Mall"
                    className="flex-1"
                  >
                    <option value="">Välj mall...</option>
                    {templateOptions.map((t) => <option key={t.id} value={t.id}>{templateLabel(t)}</option>)}
                  </Select>
                  <Input
                    type="number"
                    min="1"
                    value={v.weight}
                    onChange={(e) => setVariant(i, { weight: e.target.value })}
                    aria-label="Vikt"
                    className="w-20 text-right"
                  />
                  <button
                    type="button"
                    onClick={() => removeVariant(i)}
                    disabled={draft.variants.length <= 1}
                    aria-label="Ta bort rad"
                    className="text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </Surface>
        </div>

        {/* Höger */}
        <div className="grid gap-3.5 content-start">
          <Surface className="px-5 py-5 grid gap-4">
            <p className={CARD_TITLE}>Regler</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Max per kund">
                <Input type="number" min="1" value={draft.capPerCustomer} onChange={(e) => set("capPerCustomer", e.target.value)} />
              </Field>
              <Field label="Giltig (dagar)">
                <Input type="number" min="1" value={draft.validDays} onChange={(e) => set("validDays", e.target.value)} />
              </Field>
            </div>
            <Field label="Status">
              <Select value={draft.status} onChange={(e) => set("status", e.target.value as CampaignStatus)}>
                <option value="DRAFT">{campaignStatusLabel("DRAFT")}</option>
                <option value="ACTIVE">{campaignStatusLabel("ACTIVE")}</option>
                <option value="SCHEDULED">{campaignStatusLabel("SCHEDULED")}</option>
              </Select>
            </Field>
            {draft.status === "SCHEDULED" && (
              <Field label="Starttid">
                <Input type="datetime-local" value={draft.scheduledAt} onChange={(e) => set("scheduledAt", e.target.value)} />
              </Field>
            )}
          </Surface>

          {savedId && (
            <Surface className="px-5 py-5 grid gap-3">
              <p className={CARD_TITLE}>Kör</p>
              <p className="text-[13px] text-[var(--text-muted)]">Tilldela deals till matchande kunder direkt.</p>
              <Button variant="secondary" onClick={() => runMutation.mutate()} disabled={runMutation.isPending}>
                {runMutation.isPending ? <><Loader2 size={14} className="animate-spin" /> Kör...</> : "Kör nu"}
              </Button>
              {existing.data?.lastRunAt && <Badge tone="info">Senast körd</Badge>}
            </Surface>
          )}
        </div>
      </div>
    </div>
  );
}
