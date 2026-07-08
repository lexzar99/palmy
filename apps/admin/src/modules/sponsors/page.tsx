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
import { Button, EmptyState, ErrorPanel, Field, Input, Select } from "@/shared/components/ui";
import { ImageUploadField } from "@/shared/components/image-upload";
import { useToast } from "@/shared/components/toast";
import { cn } from "@/shared/utils/cn";

type Tab = "discounts" | "trending" | "new" | "sponsors" | "ads";

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

const orange = "#F47721";
const orangeInk = "#B23C12";
const pageBg = "#FAF7F1";

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
    color: sponsor?.color || colorFromText(sponsor?.name),
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
  };
}

function statusForActive(isActive?: boolean, startsAt?: string) {
  if (!isActive) return { label: "Pausad", className: "bg-[#EEEDE8] text-[#6b6b73]" };
  if (startsAt && new Date(startsAt).getTime() > Date.now()) return { label: "Planerad", className: "bg-[#FFF3DC] text-[#9A5A00]" };
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
        selected ? "shadow-[inset_0_0_0_1.5px_#F47721,0_6px_16px_rgba(244,119,33,0.12)]" : "shadow-[inset_0_0_0_1px_rgba(20,20,22,0.07)] hover:shadow-[inset_0_0_0_1px_rgba(20,20,22,0.13)]",
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
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-[rgba(244,119,33,0.32)] bg-[#FFF4E9] p-3">
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
      <div className="rounded-[22px] border border-[rgba(244,119,33,0.18)] bg-white p-3.5 shadow-[0_12px_24px_rgba(20,20,22,0.06)]">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[9px] font-black tracking-[0.06em] text-[#F47721]">ORDER #A1B2C3</div>
            <div className="mt-0.5 text-[17px] font-extrabold tracking-[-0.02em] text-[#141416]">Budet är på väg</div>
          </div>
          <div className="flex-none text-right">
            <div className="text-[16px] font-extrabold text-[#F47721]">ca 25 min</div>
            <div className="text-[9.5px] font-bold tracking-[0.04em] text-[#6b6b73]">TRACKING</div>
          </div>
        </div>
        <div className="mt-3 h-[9px] overflow-hidden rounded-full bg-[#F0F0EC]">
          <div className="h-full w-[66%] rounded-full bg-[#F47721]" />
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
            <span className="relative w-fit rounded-md bg-white/95 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-[#F47721]">Annons</span>
            <div className="relative">
              <div className="text-[17px] font-extrabold leading-[1.05] tracking-[-0.03em] text-white">{draft.title || "Din rubrik här"}</div>
              <div className="mt-0.5 text-[11.5px] font-semibold text-white/90">{draft.subtitle || "Kort slogan om erbjudandet"}</div>
            </div>
          </>
        ) : <span aria-hidden="true" />}
      </article>
      <div className="mt-2 flex gap-1.5">
        <div className="h-0.5 flex-1 rounded bg-[#F47721]" />
        <div className="h-0.5 flex-1 rounded bg-[#e3ddd2]" />
        <div className="h-0.5 flex-1 rounded bg-[#e3ddd2]" />
      </div>
    </div>
  );
}

function SponsorPreview({ draft, sponsors }: { draft: SponsorDraft; sponsors: SponsorRecord[] }) {
  const cards = [
    { id: draft.id || "draft", name: draft.name || "Partner", imageUrl: draft.imageUrl, color: draft.color || colorFromText(draft.name), imageOnly: draft.imageOnly, selected: true },
    ...sponsors.filter((s) => s.id !== draft.id).slice(0, 2).map((s) => ({ id: s.id, name: s.name, imageUrl: s.imageUrl, color: s.color || colorFromText(s.name), imageOnly: s.imageOnly ?? (s.showName === false), selected: false })),
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
                  ? "0 0 0 2px #F47721, 0 14px 30px rgba(244,119,33,0.22)"
                  : "0 6px 18px rgba(20,20,22,0.10), inset 0 0 0 1px rgba(20,20,22,0.05)",
                background: card.color,
              }}
            >
              {card.imageUrl ? <img src={card.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
              <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.09)_0_16px,rgba(255,255,255,0)_16px_32px)]" />
              {!card.imageOnly ? (
                <>
                  <div className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-b from-black/0 to-black/90" />
                  <div className="absolute inset-x-0 bottom-0 p-3.5">
                    <span className="mb-2 inline-block rounded-md border border-white/30 bg-black/70 px-2 py-1 text-[10px] font-bold text-white">Partner</span>
                    <div className="truncate text-[19px] font-extrabold tracking-[-0.02em] text-white">{card.name}</div>
                  </div>
                </>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex gap-1.5 px-[15px]">
        {cards.map((card, index) => <div key={card.id} className={cn("h-0.5 flex-1 rounded", index === 0 ? "bg-[#F47721]" : "bg-[#e3ddd2]")} />)}
      </div>
    </div>
  );
}

function PhonePreview({ tab, adDraft, sponsorDraft, sponsors }: { tab: Tab; adDraft: AdDraft; sponsorDraft: SponsorDraft; sponsors: SponsorRecord[] }) {
  return (
    <div className="sticky top-6 rounded-2xl border border-[rgba(20,20,22,0.06)] bg-white p-[18px] shadow-[0_18px_44px_rgba(20,20,22,0.06)]">
      <div className="mb-3 text-center text-[10px] font-black uppercase tracking-[0.08em] text-[#9a9aa2]">Live i appen</div>
      <div className="flex justify-center">
        <div className="w-[318px] rounded-[44px] bg-[#1a1a1c] p-[11px] shadow-[0_30px_60px_rgba(20,20,22,0.24)]">
          <div className="relative h-[624px] overflow-hidden rounded-[34px] bg-[#FFF8EF]">
            <div className="absolute left-1/2 top-0 z-10 h-[25px] w-[116px] -translate-x-1/2 rounded-b-[15px] bg-[#1a1a1c]" />
            <div className="rounded-b-[24px] bg-[#F47721] px-4 pb-3.5 pt-3">
              <div className="flex items-center justify-between px-1 pb-2 text-[11px] font-bold text-white">
                <span>9:41</span><span className="h-2.5 w-4 rounded-sm border border-white/90" />
              </div>
              <div className="flex items-center justify-between gap-2.5">
                <div className="min-w-0">
                  <div className="text-[9px] font-extrabold uppercase tracking-[0.08em] text-white/85">Hemleverans</div>
                  <div className="text-[15px] font-extrabold tracking-[-0.02em] text-white">Lund</div>
                </div>
                <div className="inline-flex flex-none items-center gap-1.5 rounded-full bg-white px-3 py-1.5">
                  <span className="h-2 w-2 rotate-45 rounded-sm bg-[#F47721]" />
                  <span className="text-[12px] font-extrabold text-[#141416]">1 240 p</span>
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

export function SponsorsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>("discounts");
  const sponsors = useQuery({ queryKey: sponsorsQueryKey, queryFn: getSponsors });
  const ads = useQuery({ queryKey: adsQueryKey, queryFn: getAds });
  const restaurants = useQuery({ queryKey: restaurantsQueryKey, queryFn: getRestaurantOverview });
  const appDeals = useQuery({ queryKey: dealsQueryKey, queryFn: getAutomaticDeals });

  const [selectedSponsorId, setSelectedSponsorId] = useState<string | null>(null);
  const [selectedAdId, setSelectedAdId] = useState<string | null>(null);
  const [sponsorDraft, setSponsorDraft] = useState<SponsorDraft>(() => sponsorToDraft(null));
  const [adDraft, setAdDraft] = useState<AdDraft>(() => adToDraft(null));

  const isShowcase = tab === "discounts" || tab === "trending" || tab === "new";
  const activeList = tab === "ads" ? ads.data || [] : sponsors.data || [];
  const isLoading = sponsors.isLoading || ads.isLoading;
  const isError = sponsors.isError || ads.isError;

  const saveSponsorMutation = useMutation({
    mutationFn: async (draft: SponsorDraft) => {
      const payload: Partial<SponsorRecord> = {
        name: draft.name,
        imageUrl: draft.imageUrl,
        category: draft.category,
        tier: draft.tier,
        tagline: draft.tagline,
        infoText: draft.tagline,
        color: draft.color,
        ctaText: draft.ctaText,
        ctaLink: draft.ctaLink,
        linkTarget: draft.linkTarget,
        linkType: draft.linkType,
        cardType: draft.cardType,
        dealId: draft.cardType === "DEAL" ? draft.dealId : undefined,
        isActive: draft.isActive,
        isClickable: draft.linkType !== "NONE" && draft.isClickable,
        imageOnly: draft.imageOnly,
        showName: draft.imageOnly ? false : draft.showName,
      };
      return draft.id ? updateSponsor(draft.id, payload) : createSponsor(payload);
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: sponsorsQueryKey });
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
      };
      return draft.id ? updateAd(draft.id, payload) : createAd(payload);
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: adsQueryKey });
      setSelectedAdId(saved.id);
      setAdDraft(adToDraft(saved));
    },
  });

  const deleteSponsorMutation = useMutation({
    mutationFn: (id: string) => deleteSponsor(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sponsorsQueryKey });
      setSelectedSponsorId(null);
      setSponsorDraft(sponsorToDraft(null));
    },
  });

  const deleteAdMutation = useMutation({
    mutationFn: (id: string) => deleteAd(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adsQueryKey });
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
    <div className="-m-6 min-h-[calc(100vh-72px)] px-6 py-8" style={{ background: pageBg }}>
      <div className="mx-auto max-w-[1200px]">
        <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
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
                            status={statusForActive(ad.isActive, ad.startsAt)}
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
                            subtitle={`${live.category || "Partner"} · ${live.tier || "Partner"}${live.imageOnly ? " · Endast bild" : ""}`}
                            color={live.color || colorFromText(live.name)}
                            status={statusForActive(sponsor.isActive)}
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
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[rgba(244,119,33,0.34)] bg-[#FFF4E9] px-4 py-3 text-[13px] font-black text-[#B23C12]"
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
                      if (tab === "ads" && adDraft.id) deleteAdMutation.mutate(adDraft.id);
                      if (tab === "sponsors" && sponsorDraft.id) deleteSponsorMutation.mutate(sponsorDraft.id);
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
                    <Select value={sponsorDraft.cardType || "RESTAURANT"} onChange={(e) => setSponsorDraft((d) => ({ ...d, cardType: e.target.value as SponsorRecord["cardType"] }))}>
                      <option value="RESTAURANT">Partner/Restaurang</option>
                      <option value="DEAL">Deal (claim i kortet)</option>
                      <option value="AD">Annons (märks)</option>
                      <option value="TEXT">Text/Kampanj</option>
                    </Select>
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
                  <Field label="Färg"><Input value={sponsorDraft.color || ""} onChange={(e) => setSponsorDraft((d) => ({ ...d, color: e.target.value }))} /></Field>
                  <div className="md:col-span-2">
                    <ImageUploadField label="Kortbild / helbild" kind="misc" value={sponsorDraft.imageUrl || ""} onChange={(url) => setSponsorDraft((d) => ({ ...d, imageUrl: url }))} />
                    <div className="mt-2"><UploadHint title="Sponsorkort" description="Liggande ca 1.9:1. Namn och partner-chip läggs ovanpå längst ner." /></div>
                  </div>
                  <div className="md:col-span-2 flex items-center justify-between rounded-xl border border-[rgba(20,20,22,0.08)] bg-[#FBFAF7] p-3">
                    <div><div className="text-[12.5px] font-black">Endast bild</div><div className="mt-0.5 text-[11px] font-semibold text-[#6b6b73]">Döljer Partner-chip, namn och all text på kortet.</div></div>
                    <ActiveToggle checked={!!sponsorDraft.imageOnly} onChange={() => setSponsorDraft((d) => ({ ...d, imageOnly: !d.imageOnly, showName: d.imageOnly ? true : false }))} />
                  </div>
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
      </div>
    </div>
  );
}
