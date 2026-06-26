"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Plus } from "lucide-react";
import { createSponsor, deleteSponsor, getSponsors, sponsorsQueryKey, updateSponsor, type SponsorRecord } from "@/modules/sponsors/api";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, Modal, PageHeader, Select, Surface, Textarea, Toggle } from "@/shared/components/ui";
import { ImageUploadField } from "@/shared/components/image-upload";
import { formatDate, formatNumber } from "@/shared/utils/format";
import { getConfig as getDpointsConfig, updateConfig as updateDpointsConfig, dpointsKeys } from "@/modules/dpoints/api";

// Toggle på sponsor-sidan för att visa/dölja Dpoints-registreringskortet bland
// sponsorerna på hemsidan. Själva kortets innehåll hanteras under Dpoints.
function DpointsHomeToggle() {
  const qc = useQueryClient();
  const config = useQuery({ queryKey: dpointsKeys.config, queryFn: getDpointsConfig });
  const save = useMutation({
    mutationFn: (v: boolean) => updateDpointsConfig({ dpointsCardOnHome: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: dpointsKeys.config }),
  });
  const c = config.data;
  if (!c) return null;
  return (
    <Surface className="px-6 py-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold">Dpoints-registreringskort på hemsidan</p>
          <p className="text-sm text-[var(--text-secondary)]">
            Visas bland sponsorerna för utloggade besökare och leder till registrering. Innehåll/bonus hanteras under Dpoints → Sponsorkort.
          </p>
        </div>
        <Button variant={c.dpointsCardOnHome ? "primary" : "secondary"} onClick={() => save.mutate(!c.dpointsCardOnHome)}>
          {c.dpointsCardOnHome ? "Visas: PÅ" : "Visas: AV"}
        </Button>
      </div>
    </Surface>
  );
}

function SponsorModal({ open, sponsor, onClose }: { open: boolean; sponsor: SponsorRecord | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<{
    name: string;
    imageUrl: string;
    isActive: boolean;
    isClickable: boolean;
    infoText: string;
    ctaText: string;
    ctaLink: string;
    linkType: NonNullable<SponsorRecord["linkType"]>;
    linkTarget: string;
    showName: boolean;
  }>({
    name: "",
    imageUrl: "",
    isActive: true,
    isClickable: true,
    infoText: "",
    ctaText: "",
    ctaLink: "",
    linkType: "EXTERNAL",
    linkTarget: "",
    showName: true,
  });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setForm(sponsor ? { name: sponsor.name, imageUrl: sponsor.imageUrl, isActive: sponsor.isActive, isClickable: sponsor.isClickable, infoText: sponsor.infoText || "", ctaText: sponsor.ctaText || "", ctaLink: sponsor.ctaLink || "", linkType: sponsor.linkType || "EXTERNAL", linkTarget: sponsor.linkTarget || "", showName: sponsor.showName ?? true } : { name: "", imageUrl: "", isActive: true, isClickable: true, infoText: "", ctaText: "", ctaLink: "", linkType: "EXTERNAL", linkTarget: "", showName: true });
  }, [open, sponsor]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({
    mutationFn: () => sponsor ? updateSponsor(sponsor.id, form) : createSponsor(form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sponsorsQueryKey });
      onClose();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!sponsor) return { ok: true as const };
      return deleteSponsor(sponsor.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sponsorsQueryKey });
      onClose();
    },
  });

  return (
    <Modal open={open} onClose={onClose} title={sponsor ? sponsor.name : "New sponsor"} footer={<div className="flex items-center justify-between gap-2"><div>{sponsor ? <Button variant="danger" onClick={() => deleteMutation.mutate()}>Delete</Button> : null}</div><div className="flex gap-2"><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={() => saveMutation.mutate()}>Save</Button></div></div>}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name"><Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></Field>
        <ImageUploadField label="Sponsor-bild" kind="misc" value={form.imageUrl} onChange={(url) => setForm((current) => ({ ...current, imageUrl: url }))} />
        <Field label="Status"><Select value={form.isActive ? "active" : "inactive"} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.value === "active" }))}><option value="active">Active</option><option value="inactive">Inactive</option></Select></Field>
        <Field label="Clickable"><Select value={form.isClickable ? "yes" : "no"} onChange={(event) => setForm((current) => ({ ...current, isClickable: event.target.value === "yes" }))}><option value="yes">Yes</option><option value="no">No</option></Select></Field>
        <Field label="Link type"><Select value={form.linkType} onChange={(event) => setForm((current) => ({ ...current, linkType: event.target.value as NonNullable<SponsorRecord["linkType"]> }))}><option value="EXTERNAL">EXTERNAL</option><option value="DEAL">DEAL</option><option value="RESTAURANT">RESTAURANT</option></Select></Field>
        <Field label="Show name"><Select value={form.showName ? "yes" : "no"} onChange={(event) => setForm((current) => ({ ...current, showName: event.target.value === "yes" }))}><option value="yes">Yes</option><option value="no">No</option></Select></Field>
        <Field label="CTA text"><Input value={form.ctaText} onChange={(event) => setForm((current) => ({ ...current, ctaText: event.target.value }))} /></Field>
        <Field label="CTA link"><Input value={form.ctaLink} onChange={(event) => setForm((current) => ({ ...current, ctaLink: event.target.value }))} /></Field>
        <Field label="Link target"><Input value={form.linkTarget} onChange={(event) => setForm((current) => ({ ...current, linkTarget: event.target.value }))} /></Field>
        <div className="md:col-span-2"><Field label="Info text"><Textarea value={form.infoText} onChange={(event) => setForm((current) => ({ ...current, infoText: event.target.value }))} /></Field></div>
      </div>
    </Modal>
  );
}

// Mappar sponsorns linkType till en läsbar placeringsetikett i tabellen.
const PLACEMENT_LABELS: Record<NonNullable<SponsorRecord["linkType"]>, string> = {
  EXTERNAL: "Hem-carousel",
  DEAL: "Banner (flöde)",
  RESTAURANT: "Kategori-topp",
};

function placementLabel(linkType?: SponsorRecord["linkType"]) {
  return PLACEMENT_LABELS[linkType ?? "EXTERNAL"];
}

function SponsorRow({ sponsor, onOpen }: { sponsor: SponsorRecord; onOpen: () => void }) {
  const queryClient = useQueryClient();
  const toggleStatus = useMutation({
    mutationFn: (next: boolean) => updateSponsor(sponsor.id, { isActive: next }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sponsorsQueryKey }),
  });

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="grid cursor-pointer items-center gap-3 border-b border-[var(--row-divider)] px-[18px] py-[13px] text-[13px] transition-colors last:border-b-0 hover:bg-[var(--bg-hover)]"
      style={{ gridTemplateColumns: "1.6fr 1.2fr 1fr 90px 50px" }}
    >
      <span className="flex items-center gap-[11px]">
        <span
          className="h-9 w-9 flex-none rounded-[9px] bg-cover bg-center"
          style={{
            backgroundImage: sponsor.imageUrl
              ? `url(${sponsor.imageUrl})`
              : "linear-gradient(150deg,#F0D4A8,#DCB070)",
          }}
        />
        <span className="min-w-0">
          <span className="block truncate font-bold text-[var(--text-primary)]">{sponsor.name}</span>
          <span className="mt-0.5 block">
            <Badge tone={sponsor.isClickable ? "info" : "neutral"}>{sponsor.isClickable ? "Klickbar" : "Statisk"}</Badge>
          </span>
        </span>
      </span>

      <span className="text-[var(--text-secondary)]">{placementLabel(sponsor.linkType)}</span>

      <span className="text-[var(--text-secondary)]">{formatDate(sponsor.createdAt)}</span>

      <span className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
        <Toggle
          checked={sponsor.isActive}
          disabled={toggleStatus.isPending}
          onChange={(next) => toggleStatus.mutate(next)}
        />
      </span>

      <span className="flex justify-end text-[var(--text-muted)]">
        <ChevronRight size={18} />
      </span>
    </div>
  );
}

export function SponsorsPage() {
  const [activeSponsor, setActiveSponsor] = useState<SponsorRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const sponsors = useQuery({ queryKey: sponsorsQueryKey, queryFn: getSponsors });

  if (sponsors.isLoading) {
    return <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Laddar sponsorplaceringar...</Surface>;
  }

  if (sponsors.isError || !sponsors.data) {
    return <ErrorPanel title="Sponsorer kunde inte laddas" description="Sponsor-endpointen är otillgänglig." action={<Button onClick={() => void sponsors.refetch()}>Försök igen</Button>} />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        breadcrumb="Katalog"
        title="Sponsorer"
        actions={<Button variant="primary" onClick={() => setCreateOpen(true)}><Plus size={13} /> Ny sponsor</Button>}
      />

      <DpointsHomeToggle />

      <Surface className="px-6 py-6">
        {sponsors.data.length === 0 ? (
          <EmptyState title="Inga sponsorer ännu" description="Lägg till en betald placering så visas den i kund-appens flöde." />
        ) : (
          <div className="overflow-hidden rounded-[14px] border border-[var(--border-subtle)]">
            <div
              className="grid gap-3 border-b border-[var(--border-subtle)] px-[18px] py-[11px] text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-muted)]"
              style={{ gridTemplateColumns: "1.6fr 1.2fr 1fr 90px 50px" }}
            >
              <span>Sponsor</span>
              <span>Placering</span>
              <span>Tillagd</span>
              <span>Status</span>
              <span />
            </div>
            {sponsors.data.map((sponsor) => (
              <SponsorRow key={sponsor.id} sponsor={sponsor} onOpen={() => setActiveSponsor(sponsor)} />
            ))}
          </div>
        )}
        <p className="mt-3 text-[12px] font-semibold text-[var(--text-muted)]">
          Placeringar matchar kund-appens sponsrat-kort och annonsbanner. Max sponsrade per vy styrs i Inställningar.
        </p>
      </Surface>

      <SponsorModal open={Boolean(activeSponsor)} sponsor={activeSponsor} onClose={() => setActiveSponsor(null)} />
      <SponsorModal open={createOpen} sponsor={null} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
