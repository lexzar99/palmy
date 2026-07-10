"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, ChevronRight, Loader2, Plus, Tag, Trash2, X } from "lucide-react";
import {
  cityHierarchyQueryKey,
  getCityHierarchy,
  mergeCityUnder,
  updateCityAliases,
  type CityHierarchyNode,
} from "@/modules/zones/api";
import { Badge, Button, Field, Input, Modal, Surface } from "@/shared/components/ui";
import { useToast } from "@/shared/components/toast";

/**
 * CityHierarchyManager — admin-UI för att hantera städer som auto-skapats
 * från Google Places. Visar hierarkin (parent → barn), antal restauranger
 * per stad, aliases, och låter admin manuellt slå ihop städer.
 *
 * Manuell merge är default — INGEN distans-baserad auto-suggest. Admin vet
 * bäst om Arlöv ska under Malmö och Lund ska vara separat (även om båda
 * är < 15 km från Malmö centrum).
 */

export function CityHierarchyManager() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [mergeModal, setMergeModal] = useState<{ child: CityHierarchyNode; candidates: CityHierarchyNode[] } | null>(null);
  const [aliasModal, setAliasModal] = useState<{ city: CityHierarchyNode } | null>(null);

  const hierarchyQuery = useQuery({
    queryKey: cityHierarchyQueryKey,
    queryFn: getCityHierarchy,
  });

  const allRoots = useMemo(() => hierarchyQuery.data || [], [hierarchyQuery.data]);

  // Beräkna fristående städer (rotnoder utan barn + < 2 restauranger) som
  // troliga merge-kandidater. Användaren ser de markerade med varning för
  // att de ska kunna slås ihop manuellt.
  const orphans = useMemo(() => {
    return allRoots.filter((c) => c.children.length === 0 && c.restaurantCount < 2);
  }, [allRoots]);

  const mergeMutation = useMutation({ meta: { toast: false },
    mutationFn: async ({ childId, parentCityId }: { childId: string; parentCityId: string | null }) => {
      return mergeCityUnder(childId, parentCityId);
    },
    onSuccess: async (_data, vars) => {
      await queryClient.invalidateQueries({ queryKey: cityHierarchyQueryKey });
      setMergeModal(null);
      showToast({ type: "success", message: vars.parentCityId ? "Städer sammanslagna" : "Stad lossad" });
    },
    onError: (e: any) => {
      showToast({ type: "error", message: e?.response?.data?.error || "Kunde inte slå ihop städer" });
    },
  });

  const aliasMutation = useMutation({ meta: { toast: false },
    mutationFn: async ({ cityId, aliases }: { cityId: string; aliases: string[] }) => {
      return updateCityAliases(cityId, aliases);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: cityHierarchyQueryKey });
      setAliasModal(null);
      showToast({ type: "success", message: "Aliases uppdaterade" });
    },
    onError: (e: any) => {
      showToast({ type: "error", message: e?.response?.data?.error || "Kunde inte uppdatera aliases" });
    },
  });

  if (hierarchyQuery.isLoading) {
    return (
      <Surface className="px-6 py-6 text-sm text-[var(--text-secondary)] flex items-center gap-2">
        <Loader2 size={14} className="animate-spin" /> Hämtar städer…
      </Surface>
    );
  }

  return (
    <Surface className="px-6 py-6">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Städer</p>
          <h3 className="mt-1.5 text-xl font-black tracking-[-0.02em]">Hantera städer och hierarki</h3>
        </div>
        <Badge tone="info">{allRoots.length} städer</Badge>
      </div>

      {orphans.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs">
            <p className="font-bold text-amber-700 dark:text-amber-300 mb-0.5">{orphans.length} fristående stad{orphans.length !== 1 ? "er" : ""} med få restauranger</p>
            <p className="text-amber-600/80 dark:text-amber-400/80">
              {orphans.map((o) => o.name).join(", ")}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {allRoots.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border-subtle)] px-6 py-12 text-center">
            <Building2 size={28} className="mx-auto text-[var(--text-muted)] mb-3" />
            <p className="text-sm font-bold text-[var(--text-secondary)]">Inga städer än</p>
          </div>
        ) : (
          allRoots.map((root) => (
            <CityRow
              key={root.id}
              node={root}
              depth={0}
              isOrphan={orphans.some((o) => o.id === root.id)}
              allCandidates={allRoots.filter((c) => c.id !== root.id && c.parentCityId === null && c.children.length === 0)}
              onMerge={(node) => setMergeModal({
                child: node,
                candidates: allRoots.filter((c) => c.id !== node.id && c.parentCityId === null),
              })}
              onAliases={(node) => setAliasModal({ city: node })}
              onUnlink={(node) => mergeMutation.mutate({ childId: node.id, parentCityId: null })}
            />
          ))
        )}
      </div>

      {/* Merge modal */}
      <Modal
        open={!!mergeModal}
        onClose={() => setMergeModal(null)}
        title={mergeModal ? `Slå ihop ${mergeModal.child.name} under en huvudstad` : "Slå ihop"}
      >
        {mergeModal && (
          <div className="space-y-2">
            {mergeModal.candidates.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">Det finns inga andra huvudstäder att slå ihop med.</p>
            ) : (
              mergeModal.candidates.map((cand) => (
                <button
                  key={cand.id}
                  type="button"
                  onClick={() => mergeMutation.mutate({ childId: mergeModal.child.id, parentCityId: cand.id })}
                  disabled={mergeMutation.isPending}
                  className="w-full surface-muted px-4 py-3 flex items-center justify-between rounded-xl hover:border-[rgba(231,178,75,0.4)] transition-all text-left"
                >
                  <div>
                    <p className="font-bold text-sm">{cand.name}</p>
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                      {cand.restaurantCount} restaurang{cand.restaurantCount !== 1 ? "er" : ""}
                      {cand.children.length > 0 ? ` · ${cand.children.length} barn` : ""}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-[var(--text-muted)]" />
                </button>
              ))
            )}
          </div>
        )}
      </Modal>

      {/* Alias modal */}
      <AliasEditor
        city={aliasModal?.city || null}
        onSave={(aliases) => aliasMutation.mutate({ cityId: aliasModal!.city.id, aliases })}
        onClose={() => setAliasModal(null)}
        isPending={aliasMutation.isPending}
      />
    </Surface>
  );
}

function CityRow({
  node, depth, isOrphan, allCandidates, onMerge, onAliases, onUnlink,
}: {
  node: CityHierarchyNode;
  depth: number;
  isOrphan: boolean;
  allCandidates: CityHierarchyNode[];
  onMerge: (n: CityHierarchyNode) => void;
  onAliases: (n: CityHierarchyNode) => void;
  onUnlink: (n: CityHierarchyNode) => void;
}) {
  const hasParent = node.parentCityId !== null;
  return (
    <>
      <div
        className={`surface-muted px-4 py-3 rounded-xl flex items-center justify-between gap-3 transition-all ${isOrphan ? "border border-amber-500/30" : ""}`}
        style={{ marginLeft: depth > 0 ? depth * 24 : 0 }}
      >
        <div className="min-w-0 flex items-center gap-2 flex-1">
          {depth > 0 && <ChevronRight size={13} className="text-[var(--text-muted)] shrink-0" />}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-black text-sm truncate">{node.name}</p>
              <Badge tone="neutral">{node.restaurantCount} {node.restaurantCount === 1 ? "rest" : "rest."}</Badge>
              {!node.isActive && <Badge tone="danger">Inaktiv</Badge>}
              {node.aliases.length > 0 && (
                <Badge tone="info">
                  <Tag size={9} className="mr-1" /> {node.aliases.join(", ")}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onAliases(node)}
            className="text-[11px] font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-1 rounded-md hover:bg-white/5 transition-all"
          >
            Aliases
          </button>
          {hasParent ? (
            <Button variant="secondary" onClick={() => onUnlink(node)}>
              <X size={13} /> Lossa
            </Button>
          ) : node.children.length === 0 ? (
            <Button variant="secondary" onClick={() => onMerge(node)} disabled={allCandidates.length === 0}>
              <Plus size={13} /> Slå ihop
            </Button>
          ) : (
            <Badge tone="success">Huvudstad</Badge>
          )}
        </div>
      </div>
      {node.children.length > 0 && (
        <div className="space-y-2">
          {node.children.map((child) => (
            <CityRow
              key={child.id}
              node={child}
              depth={depth + 1}
              isOrphan={false}
              allCandidates={[]}
              onMerge={onMerge}
              onAliases={onAliases}
              onUnlink={onUnlink}
            />
          ))}
        </div>
      )}
    </>
  );
}

function AliasEditor({
  city, onSave, onClose, isPending,
}: {
  city: CityHierarchyNode | null;
  onSave: (aliases: string[]) => void;
  onClose: () => void;
  isPending: boolean;
}) {
  const [draft, setDraft] = useState<string>("");
  const [list, setList] = useState<string[]>([]);

  // Synka när modal öppnas med ny city
  useMemoSync(city, () => {
    setList(city?.aliases || []);
    setDraft("");
  });

  if (!city) return null;

  return (
    <Modal
      open={!!city}
      onClose={onClose}
      title={`Aliases för ${city.name}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Avbryt</Button>
          <Button variant="primary" onClick={() => onSave(list)} disabled={isPending}>
            {isPending ? <Loader2 size={14} className="animate-spin" /> : null} Spara
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Lägg till alias">
          <div className="flex gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="t.ex. Lunds Kommun"
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.trim()) {
                  setList((current) => [...current, draft.trim()]);
                  setDraft("");
                }
              }}
            />
            <Button
              variant="secondary"
              onClick={() => {
                if (draft.trim()) {
                  setList((current) => [...current, draft.trim()]);
                  setDraft("");
                }
              }}
            >
              <Plus size={13} /> Lägg till
            </Button>
          </div>
        </Field>
        {list.length === 0 ? (
          <p className="text-xs text-[var(--text-secondary)] italic">Inga aliases än.</p>
        ) : (
          <div className="space-y-1.5">
            {list.map((alias, i) => (
              <div key={`${alias}-${i}`} className="flex items-center justify-between gap-2 surface-muted px-3 py-2 rounded-lg">
                <span className="text-sm font-bold">{alias}</span>
                <button
                  type="button"
                  onClick={() => setList((current) => current.filter((_, idx) => idx !== i))}
                  className="text-[var(--text-muted)] hover:text-rose-500 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

// Mini-hook för att synca state när en prop ändras (city byter)
function useMemoSync<T>(value: T, onChange: () => void) {
  useMemo(() => {
    onChange();
    return value;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
}
