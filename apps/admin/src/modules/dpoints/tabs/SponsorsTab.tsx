"use client";

import { useState } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Surface,
  Button,
  Badge,
  Field,
  Input,
  Textarea,
  Modal,
  EmptyState,
  LoadingPanel,
  Toggle,
} from "@/shared/components/ui";
import {
  dpointsKeys,
  getSponsors,
  createSponsor,
  updateSponsor,
  deleteSponsor,
  type SponsorCard,
} from "../api";

const emptySponsor: Partial<SponsorCard> = {
  title: "",
  sponsorName: "",
  description: "",
  bonusPoints: 100,
  ctaLabel: "",
  imageUrl: "",
  isActive: true,
};

export default function SponsorsTab() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: dpointsKeys.sponsors, queryFn: getSponsors });
  const [editing, setEditing] = useState<Partial<SponsorCard> | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: dpointsKeys.sponsors });

  const saveMut = useMutation({
    mutationFn: (s: Partial<SponsorCard>) => (s.id ? updateSponsor(s.id, s) : createSponsor(s)),
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
  });
  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateSponsor(id, { isActive }),
    onSuccess: invalidate,
  });
  const delMut = useMutation({ mutationFn: deleteSponsor, onSuccess: invalidate });

  const cards = list.data ?? [];

  return (
    <Surface>
      <div className="flex items-center justify-between p-6">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Bonuskort</h2>
          <p className="text-sm text-[var(--text-secondary)]">Poäng-bonuskort för utloggade besökare. Partnerkorten i appen styrs under Sponsorer.</p>
        </div>
        <Button variant="primary" onClick={() => setEditing({ ...emptySponsor })}>
          <Plus size={16} /> Nytt bonuskort
        </Button>
      </div>

      <div className="px-6 pb-6">
        {list.isLoading ? (
          <LoadingPanel />
        ) : cards.length === 0 ? (
          <EmptyState
            title="Inga bonuskort"
            description="Bonuskort visas som poäng-bonus för utloggade besökare."
            action={
              <Button variant="primary" onClick={() => setEditing({ ...emptySponsor })}>
                <Plus size={16} /> Nytt bonuskort
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {cards.map((s) => (
              <div key={s.id} className="surface-muted flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--text-primary)]">{s.title}</span>
                    <Badge tone="info">+{s.bonusPoints} p</Badge>
                  </div>
                  {s.sponsorName && <p className="text-xs text-[var(--text-muted)]">{s.sponsorName}</p>}
                </div>
                <div className="flex items-center gap-3">
                  <Toggle checked={s.isActive} onChange={(v) => toggleMut.mutate({ id: s.id, isActive: v })} />
                  <Button onClick={() => setEditing(s)}>
                    <Pencil size={15} /> Redigera
                  </Button>
                  <Button variant="danger" onClick={() => delMut.mutate(s.id)}>
                    <Trash2 size={15} /> Ta bort
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={!!editing}
        title={editing?.id ? "Redigera bonuskort" : "Nytt bonuskort"}
        onClose={() => setEditing(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setEditing(null)}>Avbryt</Button>
            <Button
              variant="primary"
              disabled={saveMut.isPending}
              onClick={() => editing && saveMut.mutate(editing)}
            >
              {saveMut.isPending ? "Sparar..." : "Spara"}
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <Field label="Titel">
              <Input
                value={editing.title ?? ""}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
            </Field>
            <Field label="Sponsor (valfritt)">
              <Input
                value={editing.sponsorName ?? ""}
                onChange={(e) => setEditing({ ...editing, sponsorName: e.target.value })}
              />
            </Field>
            <Field label="Beskrivning">
              <Textarea
                value={editing.description ?? ""}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Bonuspoäng">
                <Input
                  type="number"
                  value={editing.bonusPoints ?? 0}
                  onChange={(e) => setEditing({ ...editing, bonusPoints: Number(e.target.value) })}
                />
              </Field>
              <Field label="CTA-text (valfritt)">
                <Input
                  value={editing.ctaLabel ?? ""}
                  onChange={(e) => setEditing({ ...editing, ctaLabel: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Bild-URL (valfritt)">
              <Input
                value={editing.imageUrl ?? ""}
                onChange={(e) => setEditing({ ...editing, imageUrl: e.target.value })}
              />
            </Field>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--text-primary)]">Aktiv</span>
              <Toggle
                checked={editing.isActive ?? true}
                onChange={(v) => setEditing({ ...editing, isActive: v })}
              />
            </div>
          </div>
        )}
      </Modal>
    </Surface>
  );
}
