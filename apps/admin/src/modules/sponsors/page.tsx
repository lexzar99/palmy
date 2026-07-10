"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, Link2, Plus, Trash2 } from "lucide-react";
import {
  adsQueryKey,
  createAd,
  createSponsor,
  deleteAd,
  deleteSponsor,
  getAds,
  getSponsors,
  sponsorsQueryKey,
  updateAd,
  updateSponsor,
  type SponsorRecord,
  type TrackingAdRecord,
} from "@/modules/sponsors/api";
import { getRestaurantOverview, restaurantsQueryKey } from "@/modules/restaurants/api";
import { dealsQueryKey, getAutomaticDeals } from "@/modules/deals/api";
import { ShowcaseTab } from "@/modules/sponsors/ShowcaseTab";
import type { ShowcaseSurface } from "@/modules/sponsors/showcase-api";
import { Button, ConfirmDialog, EmptyState, ErrorPanel, Field, Input, Select, Textarea } from "@/shared/components/ui";
import { ImageUploadField } from "@/shared/components/image-upload";
import { useToast } from "@/shared/components/toast";
import { cn } from "@/shared/utils/cn";
import { contentPlacementsQueryKey } from "@/modules/homepage/api";

export type PlacementEditorTab = "champion" | "discounts" | "trending" | "new" | "sponsors" | "ads";

type SponsorDraft = Partial<SponsorRecord> & {
  name: string;
  imageUrl: string;
  isActive: boolean;
  isClickable: boolean;
  linkType: NonNullable<SponsorRecord["linkType"]>;
  showName: boolean;
  imageOnly: boolean;
};

type AdDraft = Partial<TrackingAdRecord> & {
  brand: string;
  title: string;
  subtitle: string;
  isActive: boolean;
  imageOnly: boolean;
};

const orange = "#F04F1A";
const orangeInk = "#B23C12";
const pageBg = "#FAF7F1";
const sponsorThemes = [
  { value: "sunrise", label: "Sunrise", gradient: "linear-gradient(135deg,#F04F1A 0%,#FF9B5C 48%,#FFE3BA 100%)" },
  { value: "fresh", label: "Fresh green", gradient: "linear-gradient(135deg,#0F8A4B 0%,#32C879 52%,#D9F7E7 100%)" },
  { value: "sky", label: "Sky blue", gradient: "linear-gradient(135deg,#1769D1 0%,#59B8FF 55%,#DDF2FF 100%)" },
  { value: "berry", label: "Berry", gradient: "linear-gradient(135deg,#7A1D68 0%,#E24A8D 54%,#FFE0EF 100%)" },
  { value: "charcoal", label: "Charcoal", gradient: "linear-gradient(135deg,#151518 0%,#3A3A40 55%,#8D8D96 100%)" },
  { value: "gold", label: "Gold", gradient: "linear-gradient(135deg,#8A5A00 0%,#D89B1D 48%,#FFE4A1 100%)" },
];

function sponsorGradient(value?: string) {
  const match = sponsorThemes.find((theme) => theme.value === value);
  return match?.gradient || value || sponsorThemes[0].gradient;
}

function sponsorThemeLabel(value?: string) {
  return sponsorThemes.find((theme) => theme.value === value)?.label || "Egen färg";
}

function isoDateInput(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatPeriod(start?: string, end?: string) {
  if (!start && !end) return "Utkast · ej publicerad";
  const fmt = (v?: string) => {
    if (!v) return "";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
  };
  return [fmt(start), fmt(end)].filter(Boolean).join(" - ") || "Pågående";
}

function initials(value?: string) {
  const words = (value || "AD").trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function colorFromText(value?: string) {
  const palette = ["#E61A27", "#0C7F42", "#1F3F8C", "#9F1D22", "#5B2A86", "#111113", "#D96B19"];
  const seed = (value || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return palette[seed % palette.length];
}

function sponsorToDraft(sponsor?: SponsorRecord | null): SponsorDraft {
  return {
    id: sponsor?.id,
    name: sponsor?.name || "",
    imageUrl: sponsor?.imageUrl || "",
    category: sponsor?.category || "",
    tier: sponsor?.tier || "Partner",
    tagline: sponsor?.tagline || sponsor?.infoText || "",
    color: sponsor?.color || "sunrise",
    ctaText: sponsor?.ctaText || "",
    ctaLink: sponsor?.ctaLink || "",
    linkTarget: sponsor?.linkTarget || "",
    linkType: sponsor?.linkType || "EXTERNAL",
    cardType: sponsor?.cardType || "RESTAURANT",
    dealId: sponsor?.dealId || "",
    isActive: sponsor?.isActive ?? true,
    isClickable: sponsor?.isClickable ?? true,
    imageOnly: sponsor?.imageOnly ?? (sponsor?.showName === false),
    showName: sponsor?.showName ?? true,
    sortOrder: sponsor?.sortOrder,
    startsAt: isoDateInput(sponsor?.startsAt),
    endsAt: isoDateInput(sponsor?.endsAt),
    placement: sponsor?.placement || "HOME_FEATURED",
    layout: sponsor?.layout || "LARGE_CARD",
  };
}

function adToDraft(ad?: TrackingAdRecord | null): AdDraft {
  return {
    id: ad?.id,
    brand: ad?.brand || "",
    title: ad?.title || "",
    subtitle: ad?.subtitle || "",
    imageUrl: ad?.imageUrl || "",
    url: ad?.url || "",
    startsAt: isoDateInput(ad?.startsAt),
    endsAt: isoDateInput(ad?.endsAt),
    isActive: ad?.isActive ?? true,
    imageOnly: ad?.imageOnly ?? false,
    sortOrder: ad?.sortOrder,
    placement: ad?.placement || "ORDER_TRACKING",
    layout: ad?.layout || "BANNER",
  };
}

function statusForActive(isActive?: boolean, startsAt?: string, endsAt?: string) {
  if (!isActive) return { label: "Pausad", className: "bg-[#EEEDE8] text-[#6b6b73]" };
  if (startsAt && new Date(startsAt).getTime() > Date.now()) return { label: "Planerad", className: "bg-[#FFF3DC] text-[#9A5A00]" };
  if (endsAt && new Date(endsAt).getTime() < Date.now()) return { label: "Avslutad", className: "bg-[#FDECEC] text-[#9F1D22]" };
  return { label: "Aktiv", className: "bg-[#EAF7EF] text-[#1F6B41]" };
}

function StatusPill({ label, className }: { label: string; className: string }) {
  return <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-extrabold", className)}>{label}</span>;
}

function ActiveToggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={cn("relative h-6 w-[42px] rounded-full border-0 transition-colors", checked ? "bg-[#2E7D4F]" : "bg-[#d8d8d2]")}
      aria-pressed={checked}
    >
      <span
        className={cn("absolute left-[3px] top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform", checked && "translate-x-[18px]")}
      />
    </button>
  );
}

function ListRow({
  selected,
  title,
  subtitle,
  color,
  status,
  onClick,
}: {
  selected: boolean;
  title: string;
  subtitle: string;
  color: string;
  status: { label: string; className: string };
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl bg-white px-3 py-3 text-left transition",
        selected ? "shadow-[inset_0_0_0_1.5px_#F04F1A,0_6px_16px_rgba(240,79,26,0.12)]" : "shadow-[inset_0_0_0_1px_rgba(20,20,22,0.07)] hover:shadow-[inset_0_0_0_1px_rgba(20,20,22,0.13)]",
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span
          className="grid h-10 w-10 flex-none place-items-center rounded-[10px] text-[12px] font-black text-white"
          style={{ background: color }}
        >
          {initials(title)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-black tracking-[-0.01em] text-[#141416]">{title || "Namnlös"}</span>
          <span className="mt-0.5 block truncate text-[12px] font-semibold text-[#6b6b73]">{subtitle}</span>
        </span>
      </span>
      <StatusPill {...status} />
    </button>
  );
}

function UploadHint({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-[rgba(240,79,26,0.32)] bg-[#FFF4E9] p-3">
      <div className="grid h-11 w-14 flex-none place-items-center rounded-lg bg-white text-[#B23C12] shadow-[inset_0_0_0_1px_rgba(20,20,22,0.07)]">
        <ImageIcon size={18} />
      </div>
      <div className="min-w-0">
        <strong className="block text-[13px] font-black text-[#141416]">{title}</strong>
        <span className="mt-0.5 block text-[11.5px] font-semibold leading-snug text-[#6b6b73]">{description}</span>
      </div>
    </div>
  );
}

function AdPreview({ draft }: { draft: AdDraft }) {
  return (
    <div className="px-[15px] pt-3">
      <div className="rounded-[22px] border border-[rgba(240,79,26,0.18)] bg-white p-3.5 shadow-[0_12px_24px_rgba(20,20,22,0.06)]">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[9px] font-black tracking-[0.06em] text-[#F04F1A]">ORDER #A1B2C3</div>
            <div className="mt-0.5 text-[17px] font-extrabold tracking-[-0.02em] text-[#141416]">Budet är på väg</div>
          </div>
          <div className="flex-none text-right">
            <div className="text-[16px] font-extrabold text-[#F04F1A]">ca 25 min</div>
            <div className="text-[9.5px] font-bold tracking-[0.04em] text-[#6b6b73]">TRACKING</div>
          </div>
        </div>
        <div className="mt-3 h-[9px] overflow-hidden rounded-full bg-[#F0F0EC]">
          <div className="h-full w-[66%] rounded-full bg-[#F04F1A]" />
        </div>
        <div className="mt-2 flex justify-between">
          <span className="text-[10.5px] font-bold text-[#141416]">Mottagen</span>
          <span className="text-[10.5px] font-bold text-[#141416]">Tillagas</span>
          <span className="text-[10.5px] font-black text-[#B23C12]">På väg</span>
        </div>
      </div>
      <div className="mx-0.5 mb-2 mt-[15px] text-[9px] font-black uppercase tracking-[0.1em] text-[#9a9aa2]">Annons · liten banner under order</div>
      <article
        className="relative flex h-[138px] flex-col justify-between overflow-hidden rounded-[18px] bg-[#cdb49f] p-3.5"
        style={{
          backgroundImage: draft.imageUrl
            ? `linear-gradient(180deg, rgba(12,10,8,0.03) 0%, rgba(12,10,8,0.16) 46%, rgba(12,10,8,0.64) 100%), url(${draft.imageUrl})`
            : "linear-gradient(180deg, rgba(12,10,8,0.03) 0%, rgba(12,10,8,0.16) 46%, rgba(12,10,8,0.64) 100%), repeating-linear-gradient(135deg,#cdb49f 0 16px,#c4a890 16px 32px)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {!draft.imageOnly ? (
          <>
            <span className="relative w-fit rounded-md bg-white/95 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-[#F04F1A]">Annons</span>
            <div className="relative">
              <div className="text-[17px] font-extrabold leading-[1.05] tracking-[-0.03em] text-white">{draft.title || "Din rubrik här"}</div>
              <div className="mt-0.5 text-[11.5px] font-semibold text-white/90">{draft.subtitle || "Kort slogan om erbjudandet"}</div>
            </div>
          </>
        ) : <span aria-hidden="true" />}
      </article>
      <div className="mt-2 flex gap-1.5">
        <div className="h-0.5 flex-1 rounded bg-[#F04F1A]" />
        <div className="h-0.5 flex-1 rounded bg-[#e3ddd2]" />
        <div className="h-0.5 flex-1 rounded bg-[#e3ddd2]" />
      </div>
    </div>
  );
}

function SponsorPreview({ draft, sponsors }: { draft: SponsorDraft; sponsors: SponsorRecord[] }) {
  const cards = [
    {
      id: draft.id || "draft",
      name: draft.name || "Partner",
      imageUrl: draft.imageUrl,
      color: draft.color || "sunrise",
      imageOnly: draft.imageOnly,
      cardType: draft.cardType,
      tagline: draft.tagline,
      infoText: draft.infoText,
      ctaText: draft.ctaText,
      selected: true,
    },
    ...sponsors.filter((s) => s.id !== draft.id).slice(0, 2).map((s) => ({
      id: s.id,
      name: s.name,
      imageUrl: s.imageUrl,
      color: s.color || "sunrise",
      imageOnly: s.imageOnly ?? (s.showName === false),
      cardType: s.cardType,
      tagline: s.tagline || s.bodyText,
      infoText: s.infoText,
      ctaText: s.ctaText,
      selected: false,
    })),
  ];

  return (
    <div>
      <div className="mb-3 flex items-end justify-between px-[15px] pt-3">
        <div>
          <div className="text-[18px] font-extrabold tracking-[-0.03em] text-[#141416]">För dig</div>
          <div className="mt-0.5 text-[11.5px] font-semibold text-[#6b6b73]">Sponsrat innehåll</div>
        </div>
      </div>
      <div className="overflow-hidden pl-[15px]">
        <div className="flex gap-3">
          {cards.map((card) => (
            <div
              key={card.id}
              className="relative aspect-[1.9] w-64 flex-none overflow-hidden rounded-2xl"
              style={{
                boxShadow: card.selected
                  ? "0 0 0 2px #F04F1A, 0 14px 30px rgba(240,79,26,0.22)"
                  : "0 6px 18px rgba(20,20,22,0.10), inset 0 0 0 1px rgba(20,20,22,0.05)",
                background: sponsorGradient(card.color),
              }}
            >
              {/* Editor-preview av valfri extern kampanjbild. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {card.imageUrl ? <img src={card.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
              {!card.imageUrl ? <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.34),transparent_34%),linear-gradient(to_top,rgba(0,0,0,0.26),rgba(0,0,0,0))]" /> : null}
              <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.08)_0_16px,rgba(255,255,255,0)_16px_32px)]" />
              {!card.imageOnly ? (
                <>
                  <div className="absolute inset-x-0 bottom-0 h-[76%] bg-gradient-to-b from-black/0 to-black/85" />
                  <div className="absolute inset-x-0 bottom-0 p-3.5">
                    <span className="mb-2 inline-block rounded-md border border-white/30 bg-black/60 px-2 py-1 text-[10px] font-bold text-white">{card.cardType === "TEXT" ? sponsorThemeLabel(card.color) : "Partner"}</span>
                    <div className="line-clamp-1 text-[19px] font-extrabold tracking-[-0.02em] text-white">{card.name}</div>
                    {card.tagline ? <div className="mt-1 line-clamp-1 text-[11.5px] font-bold text-white/92">{card.tagline}</div> : null}
                    {card.cardType === "TEXT" && card.infoText ? <div className="mt-1.5 line-clamp-1 text-[10.5px] font-semibold text-white/78">{card.infoText}</div> : null}
                    {card.cardType === "TEXT" && card.ctaText ? <div className="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-[10.5px] font-black text-[#141416]">{card.ctaText}</div> : null}
                  </div>
                </>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex gap-1.5 px-[15px]">
        {cards.map((card, index) => <div key={card.id} className={cn("h-0.5 flex-1 rounded", index === 0 ? "bg-[#F04F1A]" : "bg-[#e3ddd2]")} />)}
      </div>
    </div>
  );
}

function PhonePreview({ tab, adDraft, sponsorDraft, sponsors }: { tab: PlacementEditorTab; adDraft: AdDraft; sponsorDraft: SponsorDraft; sponsors: SponsorRecord[] }) {
  return (
    <div className="sticky top-6 rounded-2xl border border-[rgba(20,20,22,0.06)] bg-white p-[18px] shadow-[0_18px_44px_rgba(20,20,22,0.06)]">
      <div className="mb-3 text-center text-[10px] font-black uppercase tracking-[0.08em] text-[#9a9aa2]">Live i appen</div>
      <div className="flex justify-center">
        <div className="w-[318px] rounded-[44px] bg-[#1a1a1c] p-[11px] shadow-[0_30px_60px_rgba(20,20,22,0.24)]">
          <div className="relative h-[624px] overflow-hidden rounded-[34px] bg-[#FFF8EF]">
            <div className="absolute left-1/2 top-0 z-10 h-[25px] w-[116px] -translate-x-1/2 rounded-b-[15px] bg-[#1a1a1c]" />
            <div className="rounded-b-[24px] bg-[#F04F1A] px-4 pb-3.5 pt-3">
              <div className="flex items-center justify-between px-1 pb-2 text-[11px] font-bold text-white">
                <span>9:41</span><span className="h-2.5 w-4 rounded-sm border border-white/90" />
              </div>
              <div className="flex items-center justify-between gap-2.5">
                <div className="min-w-0">
                  <div className="text-[9px] font-extrabold uppercase tracking-[0.08em] text-white/85">Hemleverans</div>
                  <div className="text-[15px] font-extrabold tracking-[-0.02em] text-white">Lund</div>
                </div>
                <div className="inline-flex flex-none items-center gap-1.5 rounded-full bg-white px-3 py-1.5">
                  <span className="h-2 w-2 rotate-45 rounded-sm bg-[#F04F1A]" />
                  <span className="text-[12px] font-extrabold text-[#141416]">Kundprofil</span>
                </div>
              </div>
              <div className="mt-2.5 flex h-10 items-center gap-2 rounded-[13px] bg-white px-3">
                <span className="h-3 w-3 rounded-full border-2 border-[#9a9aa2]" />
                <span className="text-[12.5px] font-semibold text-[#9a9aa2]">Sök restaurang eller kök</span>
              </div>
            </div>
            <div className="h-[500px] overflow-hidden">
              {tab === "ads" ? <AdPreview draft={adDraft} /> : <SponsorPreview draft={sponsorDraft} sponsors={sponsors} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SponsorsPage({
  embedded = false,
  initialTab = "discounts",
}: {
  embedded?: boolean;
  initialTab?: PlacementEditorTab;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [tab, setTab] = useState<PlacementEditorTab>(initialTab);
  const sponsors = useQuery({ queryKey: sponsorsQueryKey, queryFn: getSponsors });
  const ads = useQuery({ queryKey: adsQueryKey, queryFn: getAds });
  const restaurants = useQuery({ queryKey: restaurantsQueryKey, queryFn: getRestaurantOverview });
  const appDeals = useQuery({ queryKey: dealsQueryKey, queryFn: getAutomaticDeals });

  const [selectedSponsorId, setSelectedSponsorId] = useState<string | null>(null);
  const [selectedAdId, setSelectedAdId] = useState<string | null>(null);
  const [sponsorDraft, setSponsorDraft] = useState<SponsorDraft>(() => sponsorToDraft(null));
  const [adDraft, setAdDraft] = useState<AdDraft>(() => adToDraft(null));
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "sponsor" | "ad"; id: string; label: string } | null>(null);

  const isShowcase = tab === "champion" || tab === "discounts" || tab === "trending" || tab === "new";
  const activeList = tab === "ads" ? ads.data || [] : sponsors.data || [];
  const isLoading = sponsors.isLoading || ads.isLoading;
  const isError = sponsors.isError || ads.isError;

  const saveSponsorMutation = useMutation({
    mutationFn: async (draft: SponsorDraft) => {
      const payload: Partial<SponsorRecord> = {
        name: draft.name,
        imageUrl: draft.imageUrl || "",
        category: draft.category,
        tier: draft.tier,
        tagline: draft.tagline,
        headline: draft.name,
        bodyText: draft.tagline,
        infoText: draft.infoText,
        color: draft.color,
        ctaText: draft.ctaText,
        ctaLink: draft.ctaLink,
        linkTarget: draft.linkTarget,
        linkType: draft.linkType,
        cardType: draft.cardType,
        dealId: draft.cardType === "DEAL" ? draft.dealId : undefined,
        isActive: draft.isActive,
        isClickable: draft.linkType !== "NONE" && draft.isClickable,
        imageOnly: draft.cardType === "TEXT" ? false : draft.imageOnly,
        showName: draft.cardType === "TEXT" ? true : (draft.imageOnly ? false : draft.showName),
        placement: draft.placement || "HOME_FEATURED",
        layout: draft.layout || "LARGE_CARD",
        startsAt: draft.startsAt || undefined,
        endsAt: draft.endsAt || undefined,
      };
      return draft.id ? updateSponsor(draft.id, payload) : createSponsor(payload);
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: sponsorsQueryKey });
      await queryClient.invalidateQueries({ queryKey: contentPlacementsQueryKey });
      setSelectedSponsorId(saved.id);
      setSponsorDraft(sponsorToDraft(saved));
      showToast({ type: "success", message: "Partner sparad" });
    },
    onError: (e: any) => {
      showToast({ type: "error", message: e?.response?.data?.error || "Kunde inte spara partner." });
    },
  });

  const saveAdMutation = useMutation({
    mutationFn: async (draft: AdDraft) => {
      const payload: Partial<TrackingAdRecord> = {
        brand: draft.brand,
        title: draft.title,
        subtitle: draft.subtitle,
        imageUrl: draft.imageUrl,
        url: draft.url,
        startsAt: draft.startsAt || undefined,
        endsAt: draft.endsAt || undefined,
        isActive: draft.isActive,
        imageOnly: draft.imageOnly,
        placement: draft.placement || "ORDER_TRACKING",
        layout: draft.layout || "BANNER",
      };
      return draft.id ? updateAd(draft.id, payload) : createAd(payload);
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: adsQueryKey });
      await queryClient.invalidateQueries({ queryKey: contentPlacementsQueryKey });
      setSelectedAdId(saved.id);
      setAdDraft(adToDraft(saved));
    },
  });

  const deleteSponsorMutation = useMutation({
    mutationFn: (id: string) => deleteSponsor(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sponsorsQueryKey });
      await queryClient.invalidateQueries({ queryKey: contentPlacementsQueryKey });
      setSelectedSponsorId(null);
      setSponsorDraft(sponsorToDraft(null));
    },
  });

  const deleteAdMutation = useMutation({
    mutationFn: (id: string) => deleteAd(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adsQueryKey });
      await queryClient.invalidateQueries({ queryKey: contentPlacementsQueryKey });
      setSelectedAdId(null);
      setAdDraft(adToDraft(null));
    },
  });

  const headerAction = tab === "ads" ? "+ Ny annons" : "+ Ny partner";
  const counts = useMemo(() => ({ sponsors: sponsors.data?.length || 0, ads: ads.data?.length || 0 }), [ads.data?.length, sponsors.data?.length]);

  if (isLoading) {
    return <div className="rounded-2xl bg-white px-6 py-12 text-sm font-semibold text-[#6b6b73]">Laddar sponsorer och annonser...</div>;
  }

  if (isError) {
    return <ErrorPanel title="Kunde inte ladda sponsorer och annonser" action={<Button onClick={() => { void sponsors.refetch(); void ads.refetch(); }}>Försök igen</Button>} />;
  }

  return (
    <div className={embedded ? "" : "-m-6 min-h-[calc(100vh-72px)] px-6 py-8"} style={embedded ? undefined : { background: pageBg }}>
      <div className="mx-auto max-w-[1200px]">
        <div className={cn("mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between", embedded && "rounded-2xl border border-[rgba(20,20,22,0.06)] bg-white p-5")}>
          <div>
            <div className="mb-2 text-[11px] font-black uppercase tracking-[0.13em]" style={{ color: orangeInk }}>Marknad</div>
            <h1 className="m-0 text-[27px] font-black leading-tight tracking-[-0.04em] text-[#141416]">Aktuellt</h1>
            <p className="mt-2 max-w-[560px] text-[13.5px] font-medium leading-relaxed text-[#6b6b73]">
              Hemskärmens kort styrs här. <strong className="font-black text-[#141416]">Rabatter</strong>, <strong className="font-black text-[#141416]">Trendar</strong> och <strong className="font-black text-[#141416]">Ny i stan</strong> fylls dynamiskt och kan finjusteras manuellt. Sponsorer och annonser är manuella kort.
            </p>
          </div>
          {isShowcase ? null : (
            <Button
              variant="primary"
              onClick={() => {
                if (tab === "ads") {
                  setSelectedAdId(null);
                  setAdDraft(adToDraft(null));
                } else {
                  setSelectedSponsorId(null);
                  setSponsorDraft(sponsorToDraft(null));
                }
              }}
            >
              <Plus size={14} /> {headerAction}
            </Button>
          )}
        </div>

        <div className="mb-[18px] inline-flex flex-wrap rounded-xl bg-[rgba(20,20,22,0.05)] p-1">
          {([
            ["champion", "Veckans favorit"],
            ["discounts", "Rabatter"],
            ["trending", "Trendar"],
            ["new", "Ny i stan"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn("inline-flex items-center gap-2 rounded-[10px] px-[15px] py-[9px] text-[13px] font-black transition", tab === key ? "bg-white text-[#141416] shadow-[0_2px_6px_rgba(20,20,22,0.1)]" : "text-[#6b6b73]")}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setTab("sponsors")}
            className={cn("inline-flex items-center gap-2 rounded-[10px] px-[15px] py-[9px] text-[13px] font-black transition", tab === "sponsors" ? "bg-white text-[#141416] shadow-[0_2px_6px_rgba(20,20,22,0.1)]" : "text-[#6b6b73]")}
          >
            Sponsorer <span className="rounded-full bg-[rgba(20,20,22,0.07)] px-2 py-0.5 text-[10.5px] font-black">{counts.sponsors}</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("ads")}
            className={cn("inline-flex items-center gap-2 rounded-[10px] px-[15px] py-[9px] text-[13px] font-black transition", tab === "ads" ? "bg-white text-[#141416] shadow-[0_2px_6px_rgba(20,20,22,0.1)]" : "text-[#6b6b73]")}
          >
            Annonser <span className="rounded-full bg-[rgba(20,20,22,0.07)] px-2 py-0.5 text-[10.5px] font-black">{counts.ads}</span>
          </button>
        </div>

        {isShowcase ? (
          <ShowcaseTab surface={tab as ShowcaseSurface} />
        ) : (

        <div className="grid gap-[18px] lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="grid gap-[18px]">
            <section className="rounded-2xl border border-[rgba(20,20,22,0.06)] bg-white p-4 shadow-[0_18px_44px_rgba(20,20,22,0.06)]">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[16px] font-black tracking-[-0.02em] text-[#141416]">{tab === "ads" ? "Annonser" : "Sponsorer"}</h2>
                  <p className="mt-1 text-[12px] font-semibold text-[#6b6b73]">{tab === "ads" ? "Lokala företag · visas under order" : "Stora partners · alltid synliga"}</p>
                </div>
              </div>

              {activeList.length === 0 ? (
                <EmptyState
                  title={tab === "ads" ? "Inga annonser ännu" : "Inga sponsorer ännu"}
                  description={tab === "ads" ? "Skapa den första tracking-annonsen som visas under aktiva ordrar." : "Skapa första stora partnerkortet för För dig-raden."}
                />
              ) : (
                <div className="grid gap-2.5">
                  {tab === "ads"
                    ? (ads.data || []).map((ad) => {
                        const selected = selectedAdId === ad.id;
                        const live = selected ? adDraft : adToDraft(ad);
                        return (
                          <ListRow
                            key={ad.id}
                            selected={selected}
                            title={live.brand || ad.brand}
                            subtitle={`${formatPeriod(ad.startsAt, ad.endsAt)}${live.imageOnly ? " · Endast bild" : ""}`}
                            color={colorFromText(live.brand)}
                            status={statusForActive(ad.isActive, ad.startsAt, ad.endsAt)}
                            onClick={() => { setSelectedAdId(ad.id); setAdDraft(adToDraft(ad)); }}
                          />
                        );
                      })
                    : (sponsors.data || []).map((sponsor) => {
                        const selected = selectedSponsorId === sponsor.id;
                        const live = selected ? sponsorDraft : sponsorToDraft(sponsor);
                        return (
                          <ListRow
                            key={sponsor.id}
                            selected={selected}
                            title={live.name || sponsor.name}
                            subtitle={`${live.cardType === "TEXT" ? "Textkort" : (live.category || "Partner")} · ${live.tier || "Partner"}${live.imageOnly ? " · Endast bild" : ""}`}
                            color={sponsorGradient(live.color)}
                            status={statusForActive(sponsor.isActive, sponsor.startsAt, sponsor.endsAt)}
                            onClick={() => { setSelectedSponsorId(sponsor.id); setSponsorDraft(sponsorToDraft(sponsor)); }}
                          />
                        );
                      })}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  if (tab === "ads") {
                    setSelectedAdId(null);
                    setAdDraft(adToDraft(null));
                  } else {
                    setSelectedSponsorId(null);
                    setSponsorDraft(sponsorToDraft(null));
                  }
                }}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[rgba(240,79,26,0.34)] bg-[#FFF4E9] px-4 py-3 text-[13px] font-black text-[#B23C12]"
              >
                <Plus size={14} /> {headerAction}
              </button>
            </section>

            <section className="rounded-2xl border border-[rgba(20,20,22,0.06)] bg-white p-4 shadow-[0_18px_44px_rgba(20,20,22,0.06)]">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-[16px] font-black tracking-[-0.02em] text-[#141416]">{tab === "ads" ? "Annons" : "Partner"}</h2>
                  <p className="mt-1 text-[12px] font-semibold text-[#6b6b73]">{tab === "ads" ? "Liten banner som visas under kundens order." : "Stort kort i För dig-raden på hem."}</p>
                </div>
                {(tab === "ads" ? adDraft.id : sponsorDraft.id) ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (tab === "ads" && adDraft.id) setDeleteTarget({ kind: "ad", id: adDraft.id, label: adDraft.title || adDraft.brand });
                      if (tab === "sponsors" && sponsorDraft.id) setDeleteTarget({ kind: "sponsor", id: sponsorDraft.id, label: sponsorDraft.name });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[rgba(220,38,38,0.18)] bg-[rgba(220,38,38,0.05)] px-3 py-2 text-[12px] font-black text-[#B91C1C]"
                  >
                    <Trash2 size={13} /> Radera
                  </button>
                ) : null}
              </div>

              {tab === "ads" ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Företagsnamn"><Input value={adDraft.brand} onChange={(e) => setAdDraft((d) => ({ ...d, brand: e.target.value }))} /></Field>
                  <Field label="Länk / URL"><Input value={adDraft.url || ""} onChange={(e) => setAdDraft((d) => ({ ...d, url: e.target.value }))} /></Field>
                  <Field label="Placement">
                    <Select value={adDraft.placement || "ORDER_TRACKING"} onChange={(e) => setAdDraft((d) => ({ ...d, placement: e.target.value as TrackingAdRecord["placement"] }))}>
                      <option value="ORDER_TRACKING">Under ordertracking</option>
                      <option value="POST_ORDER">Efter genomförd order</option>
                    </Select>
                  </Field>
                  <Field label="Layout">
                    <Select value={adDraft.layout || "BANNER"} onChange={(e) => setAdDraft((d) => ({ ...d, layout: e.target.value as TrackingAdRecord["layout"] }))}>
                      <option value="BANNER">Banner</option>
                      <option value="COMPACT_CARD">Kompakt kort</option>
                    </Select>
                  </Field>
                  <div className="md:col-span-2"><Field label="Rubrik"><Input value={adDraft.title} onChange={(e) => setAdDraft((d) => ({ ...d, title: e.target.value }))} /></Field></div>
                  <div className="md:col-span-2"><Field label="Kort text / slogan"><Input value={adDraft.subtitle} onChange={(e) => setAdDraft((d) => ({ ...d, subtitle: e.target.value }))} /></Field></div>
                  <Field label="Visas från"><Input type="date" value={adDraft.startsAt || ""} onChange={(e) => setAdDraft((d) => ({ ...d, startsAt: e.target.value }))} /></Field>
                  <Field label="Visas till"><Input type="date" value={adDraft.endsAt || ""} onChange={(e) => setAdDraft((d) => ({ ...d, endsAt: e.target.value }))} /></Field>
                  <div className="md:col-span-2">
                    <ImageUploadField label="Bannerbild" kind="misc" value={adDraft.imageUrl || ""} onChange={(url) => setAdDraft((d) => ({ ...d, imageUrl: url }))} />
                    <div className="mt-2"><UploadHint title="Bannerformat" description="Liten annons under order. Designa för 343 x 156 px." /></div>
                  </div>
                  <div className="md:col-span-2 flex items-center justify-between rounded-xl border border-[rgba(20,20,22,0.08)] bg-[#FBFAF7] p-3">
                    <div><div className="text-[12.5px] font-black">Endast bild</div><div className="mt-0.5 text-[11px] font-semibold text-[#6b6b73]">Döljer annons-chip, rubrik och slogan i kundvyn.</div></div>
                    <ActiveToggle checked={!!adDraft.imageOnly} onChange={() => setAdDraft((d) => ({ ...d, imageOnly: !d.imageOnly }))} />
                  </div>
                  <div className="md:col-span-2 flex items-center justify-between rounded-xl border border-[rgba(20,20,22,0.08)] bg-[#FBFAF7] p-3">
                    <div><div className="text-[12.5px] font-black">Aktiv</div><div className="mt-0.5 text-[11px] font-semibold text-[#6b6b73]">{adDraft.isActive ? "Visas i appen nu" : "Dold för kunder"}</div></div>
                    <ActiveToggle checked={!!adDraft.isActive} onChange={() => setAdDraft((d) => ({ ...d, isActive: !d.isActive }))} />
                  </div>
                  <div className="md:col-span-2 flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => setAdDraft(adToDraft(ads.data?.find((ad) => ad.id === selectedAdId) || null))}>Återställ</Button>
                    <Button variant="primary" disabled={saveAdMutation.isPending} onClick={() => saveAdMutation.mutate(adDraft)}>Publicera annons</Button>
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="md:col-span-2"><Field label="Titel"><Input value={sponsorDraft.name} placeholder="20% på Palmyra Pizzeria" onChange={(e) => setSponsorDraft((d) => ({ ...d, name: e.target.value }))} /></Field></div>
                  <div className="md:col-span-2"><Field label="Brödtext"><Input value={sponsorDraft.tagline || ""} placeholder="Fredagsmat hos Palmyra" onChange={(e) => setSponsorDraft((d) => ({ ...d, tagline: e.target.value }))} /></Field></div>
                  <Field label="CTA-text"><Input value={sponsorDraft.ctaText || ""} placeholder="Se meny" onChange={(e) => setSponsorDraft((d) => ({ ...d, ctaText: e.target.value }))} /></Field>
                  <Field label="Korttyp">
                    <Select
                      value={sponsorDraft.cardType || "RESTAURANT"}
                      onChange={(e) => setSponsorDraft((d) => ({
                        ...d,
                        cardType: e.target.value as SponsorRecord["cardType"],
                        imageOnly: e.target.value === "TEXT" ? false : d.imageOnly,
                        showName: e.target.value === "TEXT" ? true : d.showName,
                      }))}
                    >
                      <option value="RESTAURANT">Partner/Restaurang</option>
                      <option value="DEAL">Deal (claim i kortet)</option>
                      <option value="TEXT">Text/Kampanj</option>
                    </Select>
                  </Field>
                  <Field label="Placement">
                    <Select value={sponsorDraft.placement || "HOME_FEATURED"} onChange={(e) => setSponsorDraft((d) => ({ ...d, placement: e.target.value as SponsorRecord["placement"] }))}>
                      <option value="HOME_FEATURED">Hem · featured-kort</option>
                      <option value="HOME_INLINE">Hem · inline-kort</option>
                      <option value="POST_ORDER">Efter genomförd order</option>
                    </Select>
                  </Field>
                  <Field label="Layout">
                    <Select value={sponsorDraft.layout || "LARGE_CARD"} onChange={(e) => setSponsorDraft((d) => ({ ...d, layout: e.target.value as SponsorRecord["layout"] }))}>
                      <option value="LARGE_CARD">Stort kort</option>
                      <option value="COMPACT_CARD">Kompakt kort</option>
                    </Select>
                  </Field>
                  <Field label="Visas från">
                    <Input type="date" value={sponsorDraft.startsAt || ""} onChange={(e) => setSponsorDraft((d) => ({ ...d, startsAt: e.target.value }))} />
                  </Field>
                  <Field label="Visas till">
                    <Input type="date" value={sponsorDraft.endsAt || ""} onChange={(e) => setSponsorDraft((d) => ({ ...d, endsAt: e.target.value }))} />
                  </Field>
                  {sponsorDraft.cardType === "DEAL" ? (
                    <div className="md:col-span-2">
                      <Field label="Koppla deal">
                        <Select value={sponsorDraft.dealId || ""} onChange={(e) => setSponsorDraft((d) => ({ ...d, dealId: e.target.value }))}>
                          <option value="">Välj app-deal</option>
                          {(appDeals.data || []).filter((deal) => deal.appEnabled && deal.isActive).map((deal) => (
                            <option key={deal.id} value={deal.id}>{deal.title}</option>
                          ))}
                        </Select>
                      </Field>
                      <p className="mt-1.5 text-[11px] font-semibold text-[#6b6b73]">Kortet visar dealens värde och en Hämta-knapp direkt.</p>
                    </div>
                  ) : null}
                  {sponsorDraft.cardType === "TEXT" ? (
                    <div className="md:col-span-2 rounded-xl border border-[rgba(240,79,26,0.18)] bg-[#FFF4E9] p-3 text-[12px] font-semibold leading-relaxed text-[#7A4315]">
                      Textkort kan publiceras utan bild. Det använder valt gradienttema, titel, brödtext och info direkt i sponsorraden.
                    </div>
                  ) : null}
                  <Field label="Länktyp"><Select value={sponsorDraft.linkType} onChange={(e) => setSponsorDraft((d) => ({ ...d, linkType: e.target.value as SponsorDraft["linkType"] }))}><option value="NONE">Ingen</option><option value="RESTAURANT">Restaurang</option><option value="EXTERNAL">Extern länk</option></Select></Field>
                  {sponsorDraft.linkType === "RESTAURANT" ? (
                    <div className="md:col-span-2">
                      <Field label="Restaurang">
                        <Select
                          value={sponsorDraft.linkTarget || ""}
                          onChange={(e) => setSponsorDraft((d) => ({ ...d, linkTarget: e.target.value }))}
                        >
                          <option value="">Välj restaurang</option>
                          {(restaurants.data || []).map((restaurant) => (
                            <option key={restaurant.id} value={restaurant.slug}>{restaurant.name}</option>
                          ))}
                        </Select>
                      </Field>
                      {restaurants.isLoading ? (
                        <p className="mt-1.5 text-[11px] font-semibold text-[#6b6b73]">Laddar restauranger...</p>
                      ) : sponsorDraft.linkTarget && !(restaurants.data || []).some((r) => r.slug === sponsorDraft.linkTarget) ? (
                        <p className="mt-1.5 text-[11px] font-semibold text-[#B23C12]">Sparad slug: {sponsorDraft.linkTarget}</p>
                      ) : null}
                    </div>
                  ) : null}
                  {sponsorDraft.linkType === "EXTERNAL" ? (
                    <div className="md:col-span-2"><Field label="Extern länk"><Input value={sponsorDraft.ctaLink || ""} placeholder="https://" onChange={(e) => setSponsorDraft((d) => ({ ...d, ctaLink: e.target.value }))} /></Field></div>
                  ) : null}
                  <Field label="Kategori"><Input value={sponsorDraft.category || ""} onChange={(e) => setSponsorDraft((d) => ({ ...d, category: e.target.value }))} /></Field>
                  <Field label="Nivå"><Select value={sponsorDraft.tier || "Partner"} onChange={(e) => setSponsorDraft((d) => ({ ...d, tier: e.target.value }))}><option>Huvudpartner</option><option>Partner</option></Select></Field>
                  <Field label="Tema / gradient">
                    <Select value={sponsorDraft.color || "sunrise"} onChange={(e) => setSponsorDraft((d) => ({ ...d, color: e.target.value }))}>
                      {sponsorThemes.map((theme) => <option key={theme.value} value={theme.value}>{theme.label}</option>)}
                    </Select>
                  </Field>
                  <div className="md:col-span-2">
                    <Field label="Info / liten text"><Textarea rows={3} value={sponsorDraft.infoText || ""} placeholder="Exempel: Gäller hela helgen eller Fri leverans vid 199 kr" onChange={(e) => setSponsorDraft((d) => ({ ...d, infoText: e.target.value }))} /></Field>
                  </div>
                  <div className="md:col-span-2">
                    <ImageUploadField label="Kortbild / helbild" kind="misc" value={sponsorDraft.imageUrl || ""} onChange={(url) => setSponsorDraft((d) => ({ ...d, imageUrl: url }))} />
                    <div className="mt-2"><UploadHint title="Sponsorkort" description={sponsorDraft.cardType === "TEXT" ? "Valfritt för textkort. Utan bild används gradienttemat istället." : "Liggande ca 1.9:1. Namn och partner-chip läggs ovanpå längst ner."} /></div>
                  </div>
                  {sponsorDraft.cardType !== "TEXT" ? (
                    <div className="md:col-span-2 flex items-center justify-between rounded-xl border border-[rgba(20,20,22,0.08)] bg-[#FBFAF7] p-3">
                      <div><div className="text-[12.5px] font-black">Endast bild</div><div className="mt-0.5 text-[11px] font-semibold text-[#6b6b73]">Döljer Partner-chip, namn och all text på kortet.</div></div>
                      <ActiveToggle checked={!!sponsorDraft.imageOnly} onChange={() => setSponsorDraft((d) => ({ ...d, imageOnly: !d.imageOnly, showName: d.imageOnly ? true : false }))} />
                    </div>
                  ) : null}
                  <div className="md:col-span-2 flex items-center justify-between rounded-xl border border-[rgba(20,20,22,0.08)] bg-[#FBFAF7] p-3">
                    <div><div className="text-[12.5px] font-black">Aktiv</div><div className="mt-0.5 text-[11px] font-semibold text-[#6b6b73]">{sponsorDraft.isActive ? "Visas i appen nu" : "Dold för kunder"}</div></div>
                    <ActiveToggle checked={!!sponsorDraft.isActive} onChange={() => setSponsorDraft((d) => ({ ...d, isActive: !d.isActive }))} />
                  </div>
                  <div className="md:col-span-2 flex justify-end gap-2">
                    <Button variant="secondary" onClick={() => setSponsorDraft(sponsorToDraft(sponsors.data?.find((s) => s.id === selectedSponsorId) || null))}>Återställ</Button>
                    <Button variant="primary" disabled={saveSponsorMutation.isPending} onClick={() => saveSponsorMutation.mutate(sponsorDraft)}>Spara partner</Button>
                  </div>
                </div>
              )}
            </section>
          </div>

          <PhonePreview tab={tab} adDraft={adDraft} sponsorDraft={sponsorDraft} sponsors={sponsors.data || []} />
        </div>
        )}

        <div className="mt-4 flex items-center gap-2 text-[12px] font-bold text-[#9a9aa2]">
          <Link2 size={13} />
          Rabatter, Trendar och Ny i stan fylls dynamiskt. Sponsorer och annonser är manuella kort.
        </div>
        <ConfirmDialog
          open={Boolean(deleteTarget)}
          title={deleteTarget?.kind === "ad" ? "Radera annons?" : "Radera sponsor?"}
          description={deleteTarget ? `“${deleteTarget.label || "Namnlöst kort"}” tas bort permanent från placement-systemet.` : undefined}
          confirmLabel="Radera permanent"
          danger
          loading={deleteAdMutation.isPending || deleteSponsorMutation.isPending}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => {
            if (!deleteTarget) return;
            if (deleteTarget.kind === "ad") deleteAdMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
            else deleteSponsorMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
          }}
        />
      </div>
    </div>
  );
}
