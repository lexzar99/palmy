"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, ImageIcon, LayoutGrid, Megaphone, Rows3, Sparkles } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { CategoriesPage } from "@/modules/categories/page";
import { SponsorsPage, type PlacementEditorTab } from "@/modules/sponsors/page";
import {
  contentPlacementsQueryKey,
  getContentPlacements,
  type ContentPlacement,
  type ContentPlacementRecord,
  type ContentStatus,
} from "@/modules/homepage/api";
import {
  getPlatformSettings,
  platformSettingsQueryKey,
  updatePlatformSettings,
  type PlatformSettings,
} from "@/modules/platform-settings/api";
import { ImageUploadField } from "@/shared/components/image-upload";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, PageHeader, Select, Surface, Textarea } from "@/shared/components/ui";
import { useToast } from "@/shared/components/toast";
import { cn } from "@/shared/utils/cn";

type HomepageTab = "overview" | "hero" | "rails" | "cards";

const tabItems: Array<{ id: HomepageTab; label: string; icon: typeof Eye }> = [
  { id: "overview", label: "Översikt", icon: Eye },
  { id: "hero", label: "Hero", icon: Sparkles },
  { id: "rails", label: "Rails", icon: Rows3 },
  { id: "cards", label: "Kort", icon: LayoutGrid },
];

const placementLabels: Record<ContentPlacement, string> = {
  HOME_HERO: "Hem · hero",
  HOME_FEATURED: "Hem · featured",
  HOME_INLINE: "Hem · inline",
  HOME_RAIL: "Hem · rail",
  ORDER_TRACKING: "Ordertracking",
  POST_ORDER: "Efter order",
};

const typeLabels: Record<ContentPlacementRecord["type"], string> = {
  HERO: "Hero",
  CATEGORY_RAIL: "Rail",
  SHOWCASE: "Dynamiskt kort",
  SPONSOR: "Sponsor",
  ADVERTISEMENT: "Annons",
};

const statusTone: Record<ContentStatus, "success" | "warning" | "neutral" | "info" | "danger"> = {
  LIVE: "success",
  SCHEDULED: "info",
  PAUSED: "warning",
  DRAFT: "neutral",
  ENDED: "danger",
};

const statusLabels: Record<ContentStatus, string> = {
  LIVE: "Live",
  SCHEDULED: "Planerad",
  PAUSED: "Pausad",
  DRAFT: "Utkast",
  ENDED: "Avslutad",
};

type HeroDraft = {
  heroTitle: string;
  heroSubtitle: string;
  heroImageUrl: string;
  heroCtaLabel: string;
  heroCtaUrl: string;
};

function heroDraftFromSettings(settings: PlatformSettings & Record<string, unknown>): HeroDraft {
  const nested = (settings.hero || {}) as Record<string, unknown>;
  return {
    heroTitle: String(nested.title ?? settings.heroTitle ?? ""),
    heroSubtitle: String(nested.subtitle ?? settings.heroSubtitle ?? ""),
    heroImageUrl: String(nested.imageUrl ?? settings.heroImageUrl ?? ""),
    heroCtaLabel: String(nested.ctaLabel ?? settings.heroCtaLabel ?? ""),
    heroCtaUrl: String(nested.ctaUrl ?? settings.heroCtaUrl ?? ""),
  };
}

function HeroEditor({ initial }: { initial: HeroDraft }) {
  const [draft, setDraft] = useState(initial);
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const mutation = useMutation({
    mutationFn: () => updatePlatformSettings(draft),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: platformSettingsQueryKey }),
        queryClient.invalidateQueries({ queryKey: contentPlacementsQueryKey }),
      ]);
      showToast({ type: "success", message: "Hero sparad" });
    },
    onError: () => showToast({ type: "error", message: "Kunde inte spara hero." }),
  });

  const hasContent = Boolean(draft.heroTitle || draft.heroSubtitle || draft.heroImageUrl);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Surface className="p-5 sm:p-6">
        <div className="mb-5">
          <h2 className="text-lg font-black tracking-[-0.03em]">Hero på hemskärmen</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Samma innehåll används av kundytorna som läser plattformens hero-kontrakt.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Field label="Rubrik" required>
              <Input value={draft.heroTitle} onChange={(event) => setDraft((current) => ({ ...current, heroTitle: event.target.value }))} placeholder="Hungrig?" />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Field label="Underrubrik">
              <Textarea rows={3} value={draft.heroSubtitle} onChange={(event) => setDraft((current) => ({ ...current, heroSubtitle: event.target.value }))} placeholder="Vi fixar resten." />
            </Field>
          </div>
          <Field label="CTA-text">
            <Input value={draft.heroCtaLabel} onChange={(event) => setDraft((current) => ({ ...current, heroCtaLabel: event.target.value }))} placeholder="Utforska restauranger" />
          </Field>
          <Field label="CTA-länk">
            <Input value={draft.heroCtaUrl} onChange={(event) => setDraft((current) => ({ ...current, heroCtaUrl: event.target.value }))} placeholder="/restaurants" />
          </Field>
          <div className="md:col-span-2">
            <ImageUploadField label="Hero-bild" kind="misc" value={draft.heroImageUrl} onChange={(heroImageUrl) => setDraft((current) => ({ ...current, heroImageUrl }))} />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => setDraft(initial)}>Återställ</Button>
          <Button variant="primary" loading={mutation.isPending} onClick={() => mutation.mutate()}>Spara hero</Button>
        </div>
      </Surface>

      <Surface className="overflow-hidden">
        <div className="border-b border-[var(--border-subtle)] px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-black">Förhandsvisning</h2>
            <Badge tone={hasContent ? "success" : "neutral"}>{hasContent ? "Live-innehåll" : "Utkast"}</Badge>
          </div>
        </div>
        <div className="p-4">
          <div
            className="relative flex min-h-[360px] flex-col justify-end overflow-hidden rounded-[24px] bg-[var(--bg-deep)] p-6"
            style={draft.heroImageUrl ? {
              backgroundImage: `linear-gradient(180deg,rgba(11,20,31,.08),rgba(11,20,31,.78)),url(${draft.heroImageUrl})`,
              backgroundPosition: "center",
              backgroundSize: "cover",
            } : undefined}
          >
            {!draft.heroImageUrl ? <ImageIcon className="absolute right-6 top-6 text-white/25" size={48} /> : null}
            <div className="relative">
              <p className="text-3xl font-black tracking-[-0.05em] text-white">{draft.heroTitle || "Hero-rubrik"}</p>
              <p className="mt-2 max-w-sm text-sm font-semibold leading-relaxed text-white/78">{draft.heroSubtitle || "Underrubriken visas här."}</p>
              {draft.heroCtaLabel ? <span className="mt-5 inline-flex rounded-full bg-[#F04F1A] px-4 py-2 text-sm font-black text-white">{draft.heroCtaLabel}</span> : null}
            </div>
          </div>
        </div>
      </Surface>
    </div>
  );
}

function PlacementsOverview() {
  const router = useRouter();
  const placements = useQuery({ queryKey: contentPlacementsQueryKey, queryFn: getContentPlacements });
  const [filter, setFilter] = useState<ContentPlacement | "ALL">("ALL");

  const records = useMemo(
    () => (placements.data?.records || []).filter((record) => filter === "ALL" || record.placement === filter),
    [filter, placements.data?.records],
  );

  if (placements.isLoading) return <Surface className="px-6 py-12 text-sm text-[var(--text-muted)]">Laddar placements...</Surface>;
  if (placements.isError || !placements.data) {
    return <ErrorPanel title="Placements kunde inte hämtas" action={<Button onClick={() => void placements.refetch()}>Försök igen</Button>} />;
  }

  const summary = placements.data.summary;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {[
          ["Totalt", summary.total],
          ["Live", summary.live],
          ["Planerade", summary.scheduled],
          ["Pausade", summary.paused],
          ["Utkast", summary.draft],
        ].map(([label, value]) => (
          <Surface key={label} className="px-5 py-4">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--text-muted)]">{label}</p>
            <p className="mt-2 text-3xl font-black tracking-[-0.05em]">{value}</p>
          </Surface>
        ))}
      </div>

      <Surface className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[var(--border-subtle)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-black">Alla innehållsplaceringar</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">En statusmodell och ett gemensamt ytkontrakt, oavsett innehållstyp.</p>
          </div>
          <Field label="Filtrera yta" className="min-w-[220px]">
            <Select value={filter} onChange={(event) => setFilter(event.target.value as ContentPlacement | "ALL")}>
              <option value="ALL">Alla ytor</option>
              {Object.entries(placementLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </Field>
        </div>

        {records.length === 0 ? (
          <div className="p-6"><EmptyState title="Inget innehåll på ytan" description="Byt filter eller skapa ett nytt kort." /></div>
        ) : (
          <div className="divide-y divide-[var(--row-divider)]">
            {records.map((record) => (
              <button
                key={record.id}
                type="button"
                onClick={() => router.push(record.editTarget)}
                className="grid w-full gap-3 px-5 py-4 text-left transition hover:bg-[var(--bg-hover)] sm:grid-cols-[minmax(0,1fr)_150px_140px_100px] sm:items-center"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-black">{record.title}</span>
                    <Badge tone="neutral">{typeLabels[record.type]}</Badge>
                  </span>
                  <span className="mt-1 block truncate text-sm text-[var(--text-muted)]">{record.subtitle || record.layout.replace(/_/g, " ").toLowerCase()}</span>
                </span>
                <span className="text-sm font-bold text-[var(--text-secondary)]">{placementLabels[record.placement]}</span>
                <span className="text-sm text-[var(--text-muted)]">{record.layout.replace(/_/g, " ").toLowerCase()}</span>
                <span><Badge tone={statusTone[record.status]}>{statusLabels[record.status]}</Badge></span>
              </button>
            ))}
          </div>
        )}
      </Surface>
    </div>
  );
}

export function HomepagePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const activeTab: HomepageTab = rawTab === "hero" || rawTab === "rails" || rawTab === "cards" ? rawTab : "overview";
  const platformSettings = useQuery({
    queryKey: platformSettingsQueryKey,
    queryFn: getPlatformSettings,
    enabled: activeTab === "hero",
  });

  const surface = searchParams.get("surface");
  const type = searchParams.get("type");
  const cardTab: PlacementEditorTab =
    surface === "champion" || surface === "discounts" || surface === "trending" || surface === "new"
      ? surface
      : type === "ads"
        ? "ads"
        : type === "sponsors"
          ? "sponsors"
          : "discounts";

  const setTab = (tab: HomepageTab) => router.replace(`/homepage?tab=${tab}`);

  return (
    <div className="page-stack">
      <PageHeader
        breadcrumb="Tillväxt"
        title="Hemskärm"
        actions={<Badge tone="info">Bas #F04F1A</Badge>}
      />
      <p className="-mt-3 max-w-3xl text-sm leading-relaxed text-[var(--text-muted)]">
        Hero, rails, dynamiska showcase-kort, sponsorer och annonser i ett gemensamt placement-system.
      </p>

      <div className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-1.5" role="tablist" aria-label="Hemskärmsinnehåll">
        {tabItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={activeTab === item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                "inline-flex min-h-10 flex-none items-center gap-2 rounded-xl px-4 text-sm font-black transition",
                activeTab === item.id ? "bg-[var(--accent)] text-white shadow-sm" : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]",
              )}
            >
              <Icon size={15} /> {item.label}
            </button>
          );
        })}
      </div>

      {activeTab === "overview" ? <PlacementsOverview /> : null}
      {activeTab === "hero" ? (
        platformSettings.isLoading ? (
          <Surface className="px-6 py-12 text-sm text-[var(--text-muted)]">Laddar hero...</Surface>
        ) : platformSettings.isError || !platformSettings.data ? (
          <ErrorPanel title="Hero kunde inte hämtas" action={<Button onClick={() => void platformSettings.refetch()}>Försök igen</Button>} />
        ) : (
          <HeroEditor key={JSON.stringify(heroDraftFromSettings(platformSettings.data))} initial={heroDraftFromSettings(platformSettings.data)} />
        )
      ) : null}
      {activeTab === "rails" ? <CategoriesPage embedded /> : null}
      {activeTab === "cards" ? <SponsorsPage embedded initialTab={cardTab} /> : null}

      <div className="flex items-start gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] p-4 text-sm text-[var(--text-secondary)]">
        <Megaphone size={17} className="mt-0.5 flex-none text-[var(--accent)]" />
        <p><strong className="text-[var(--text-primary)]">Sponsor och annons är separata typer.</strong> De delar placement, schema, status och layoutregler men behåller olika märkning och kundpresentation.</p>
      </div>
    </div>
  );
}
