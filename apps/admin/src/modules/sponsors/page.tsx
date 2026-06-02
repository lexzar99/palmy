"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { createSponsor, deleteSponsor, getSponsors, sponsorsQueryKey, updateSponsor, type SponsorRecord } from "@/modules/sponsors/api";
import { Badge, Button, EmptyState, ErrorPanel, Field, Input, Modal, PageHeader, Select, Surface, Textarea } from "@/shared/components/ui";
import { ImageUploadField } from "@/shared/components/image-upload";
import { formatDate, formatNumber } from "@/shared/utils/format";

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

export function SponsorsPage() {
  const [activeSponsor, setActiveSponsor] = useState<SponsorRecord | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const sponsors = useQuery({ queryKey: sponsorsQueryKey, queryFn: getSponsors });

  if (sponsors.isLoading) {
    return <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Loading sponsor placements...</Surface>;
  }

  if (sponsors.isError || !sponsors.data) {
    return <ErrorPanel title="Sponsors could not be loaded" description="The sponsor endpoint is unavailable." action={<Button onClick={() => void sponsors.refetch()}>Retry</Button>} />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        title="Sponsors"
        actions={<Button variant="primary" onClick={() => setCreateOpen(true)}><Plus size={13} /> New sponsor</Button>}
      />

      <Surface className="px-6 py-6">
        {sponsors.data.length === 0 ? (
          <EmptyState title="No sponsors yet" />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {sponsors.data.map((sponsor) => (
              <button key={sponsor.id} type="button" onClick={() => setActiveSponsor(sponsor)} className="surface-muted flex flex-col gap-4 px-5 py-5 text-left">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-black tracking-[-0.02em]">{sponsor.name}</p>
                      <Badge tone={sponsor.isActive ? "success" : "danger"}>{sponsor.isActive ? "Active" : "Inactive"}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">{sponsor.linkType || "EXTERNAL"} • {formatDate(sponsor.createdAt)}</p>
                  </div>
                  <Badge tone={sponsor.isClickable ? "info" : "neutral"}>{sponsor.isClickable ? "Clickable" : "Static"}</Badge>
                </div>
                <p className="text-sm text-[var(--text-secondary)] break-all">{sponsor.imageUrl}</p>
              </button>
            ))}
          </div>
        )}
      </Surface>

      <SponsorModal open={Boolean(activeSponsor)} sponsor={activeSponsor} onClose={() => setActiveSponsor(null)} />
      <SponsorModal open={createOpen} sponsor={null} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
