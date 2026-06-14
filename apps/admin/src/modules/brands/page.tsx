"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Network, Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  brandsQueryKey,
  brandRestaurantsQueryKey,
  createBrand,
  deleteBrand,
  getAllRestaurants,
  getBrands,
  setBrandRestaurants,
  syncBrand,
  updateBrand,
  type BrandRecord,
  type BrandSyncResponse,
  type RestaurantRef,
} from "@/modules/brands/api";
import { Badge, Button, EmptyState, ErrorPanel, Input, Modal, PageHeader, Select, Surface } from "@/shared/components/ui";
import { useToast } from "@/shared/components/toast";

function extractError(e: any): string {
  return e?.response?.data?.error || e?.message || "Okänt fel.";
}

// ── Hantera platser (vilka restauranger som tillhör kedjan) ──────────────────
function ManageLocationsModal({ brand, allRestaurants, open, onClose }: {
  brand: BrandRecord; allRestaurants: RestaurantRef[]; open: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(brand.restaurants.map((r) => r.id)));

  const save = useMutation({ meta: { toast: false },
    mutationFn: () => setBrandRestaurants(brand.id, [...selected]),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: brandsQueryKey });
      await qc.invalidateQueries({ queryKey: brandRestaurantsQueryKey });
      showToast({ type: "success", message: `${selected.size} platser i ${brand.name}` });
      onClose();
    },
    onError: (e) => showToast({ type: "error", message: extractError(e) }),
  });

  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <Modal
      open={open}
      onClose={() => { if (!save.isPending) onClose(); }}
      title={`Platser i ${brand.name}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} disabled={save.isPending}>Avbryt</Button>
          <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 size={14} className="animate-spin" /> : null} Spara ({selected.size})
          </Button>
        </div>
      }
    >
      <div className="grid gap-1 max-h-[55vh] overflow-y-auto">
        {allRestaurants.map((r) => {
          const otherBrand = r.brandId && r.brandId !== brand.id;
          return (
            <label key={r.id} className="surface-muted flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm">
              <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="h-4 w-4 accent-[var(--accent)]" />
              <span className="flex-1">{r.name}{r.city ? <span className="text-[var(--text-muted)]"> · {r.city}</span> : null}</span>
              {otherBrand ? <Badge tone="warning">i annan kedja</Badge> : null}
            </label>
          );
        })}
      </div>
    </Modal>
  );
}

// ── Synka alla platser (dry-run → apply) ─────────────────────────────────────
function SyncModal({ brand, open, onClose }: { brand: BrandRecord; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [result, setResult] = useState<BrandSyncResponse | null>(null);

  const preview = useMutation({ meta: { toast: false },
    mutationFn: () => syncBrand(brand.id, false),
    onSuccess: (d) => setResult(d),
    onError: (e) => showToast({ type: "error", message: extractError(e) }),
  });
  const apply = useMutation({ meta: { toast: false },
    mutationFn: () => syncBrand(brand.id, true),
    onSuccess: async (d) => {
      setResult(d);
      await qc.invalidateQueries({ queryKey: ["menu"] });
      const tot = d.results.reduce((a, r) => a + r.summary.productsCreated + r.summary.productsUpdated, 0);
      showToast({ type: "success", message: `Synk klar: ${d.results.length} platser, ${tot} produkter` });
    },
    onError: (e) => showToast({ type: "error", message: extractError(e) }),
  });
  const busy = preview.isPending || apply.isPending;

  const nameById = useMemo(() => new Map(brand.restaurants.map((r) => [r.id, r.name])), [brand.restaurants]);

  return (
    <Modal
      open={open}
      onClose={() => { if (!busy) { setResult(null); onClose(); } }}
      title={`Synka ${brand.name} → alla platser`}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={() => preview.mutate()} disabled={busy}>
            {preview.isPending ? <Loader2 size={14} className="animate-spin" /> : null} Förhandsvisa
          </Button>
          <Button variant="primary" onClick={() => apply.mutate()} disabled={busy || !result || result.dryRun === false}>
            {apply.isPending ? <Loader2 size={14} className="animate-spin" /> : null} {apply.isPending ? "Synkar…" : "Synka"}
          </Button>
        </div>
      }
    >
      {result ? (
        <div className="grid gap-2">
          {result.results.map((r) => {
            const s = r.summary;
            return (
              <div key={r.targetRestaurantId} className="surface-muted px-4 py-3 text-sm">
                <div className="mb-1 font-semibold">{nameById.get(r.targetRestaurantId) ?? r.targetRestaurantId}</div>
                <div className="text-[12px] text-[var(--text-secondary)]">
                  Produkter: <b className="text-[var(--text-primary)]">+{s.productsCreated}</b> nya, {s.productsUpdated} uppdaterade
                  {s.priceLocked > 0 ? <> · <span className="text-[var(--warning)]">{s.priceLocked} lokala priser bevarade</span></> : null}
                  {" "}· Kategorier: +{s.categoriesCreated}/{s.categoriesUpdated} · Pålägg: +{s.groupsCreated}/{s.groupsReused} återanv.
                </div>
              </div>
            );
          })}
          <p className={`text-xs ${result.dryRun ? "text-[var(--text-secondary)]" : "text-emerald-400"}`}>
            {result.dryRun ? "Förhandsvisning — inget har skrivits. Klicka Synka för att köra." : "✓ Klart — platsernas menyer uppdaterade."}
          </p>
        </div>
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">Klicka Förhandsvisa för att se vad som skulle synkas.</p>
      )}
    </Modal>
  );
}

// ── Ett kedjekort ────────────────────────────────────────────────────────────
function BrandCard({ brand, allRestaurants }: { brand: BrandRecord; allRestaurants: RestaurantRef[] }) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [manageOpen, setManageOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);

  const setMaster = useMutation({ meta: { toast: false },
    mutationFn: (masterRestaurantId: string | null) => updateBrand(brand.id, { masterRestaurantId }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: brandsQueryKey }); },
    onError: (e) => showToast({ type: "error", message: extractError(e) }),
  });
  const remove = useMutation({ meta: { toast: false },
    mutationFn: () => deleteBrand(brand.id),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: brandsQueryKey }); showToast({ type: "success", message: `${brand.name} borttagen` }); },
    onError: (e) => showToast({ type: "error", message: extractError(e) }),
  });

  const canSync = Boolean(brand.masterRestaurantId) && brand.restaurants.length > 1;

  return (
    <Surface className="px-6 py-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-[-0.01em]">{brand.name}</h2>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{brand.locationCount} {brand.locationCount === 1 ? "plats" : "platser"}</p>
        </div>
        <button
          type="button"
          onClick={() => { if (window.confirm(`Ta bort kedjan "${brand.name}"? Platserna kopplas bort men raderas inte.`)) remove.mutate(); }}
          className="shrink-0 rounded-lg p-2 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--danger)]"
          aria-label="Ta bort kedja"
        >
          {remove.isPending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
        </button>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Master-plats (menyns källa)</label>
          <Select
            value={brand.masterRestaurantId ?? ""}
            onChange={(e) => setMaster.mutate(e.target.value || null)}
            disabled={brand.restaurants.length === 0 || setMaster.isPending}
          >
            <option value="">Välj master…</option>
            {brand.restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setManageOpen(true)}>Hantera platser</Button>
          <Button variant="primary" onClick={() => setSyncOpen(true)} disabled={!canSync}>
            <RefreshCw size={14} /> Synka alla
          </Button>
        </div>
      </div>

      {brand.restaurants.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {brand.restaurants.map((r) => (
            <Badge key={r.id} tone={r.id === brand.masterRestaurantId ? "info" : "neutral"}>
              {r.id === brand.masterRestaurantId ? "★ " : ""}{r.name}
            </Badge>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-[var(--text-muted)]">Inga platser än — klicka &ldquo;Hantera platser&rdquo;.</p>
      )}

      {!canSync && brand.restaurants.length > 1 ? (
        <p className="mt-3 text-xs text-[var(--warning)]">Välj en master-plats för att kunna synka.</p>
      ) : null}

      {manageOpen ? <ManageLocationsModal brand={brand} allRestaurants={allRestaurants} open={manageOpen} onClose={() => setManageOpen(false)} /> : null}
      {syncOpen ? <SyncModal brand={brand} open={syncOpen} onClose={() => setSyncOpen(false)} /> : null}
    </Surface>
  );
}

export function BrandsPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const brands = useQuery({ queryKey: brandsQueryKey, queryFn: getBrands });
  const restaurants = useQuery({ queryKey: brandRestaurantsQueryKey, queryFn: getAllRestaurants });
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const create = useMutation({ meta: { toast: false },
    mutationFn: () => createBrand(newName.trim()),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: brandsQueryKey });
      showToast({ type: "success", message: `Kedjan "${newName.trim()}" skapad` });
      setNewName(""); setCreateOpen(false);
    },
    onError: (e) => showToast({ type: "error", message: extractError(e) }),
  });

  if (brands.isError) {
    return <ErrorPanel title="Kunde inte ladda kedjor" action={<Button onClick={() => void brands.refetch()}>Försök igen</Button>} />;
  }

  const list = brands.data ?? [];
  const allRestaurants = restaurants.data ?? [];

  return (
    <div className="page-stack">
      <PageHeader
        title="Kedjor"
        actions={<Button variant="primary" onClick={() => setCreateOpen(true)}><Plus size={14} /> Skapa kedja</Button>}
      />

      {brands.isLoading ? (
        <div className="grid gap-3">{[0, 1].map((i) => <div key={i} className="metric-card animate-pulse" style={{ minHeight: 160 }} />)}</div>
      ) : list.length === 0 ? (
        <EmptyState title="Inga kedjor än" action={<Button variant="primary" onClick={() => setCreateOpen(true)}><Plus size={14} /> Skapa kedja</Button>} />
      ) : (
        <div className="grid gap-3">
          {list.map((b) => <BrandCard key={b.id} brand={b} allRestaurants={allRestaurants} />)}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => { if (!create.isPending) setCreateOpen(false); }}
        title="Skapa kedja"
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setCreateOpen(false)} disabled={create.isPending}>Avbryt</Button>
            <Button variant="primary" onClick={() => create.mutate()} disabled={create.isPending || !newName.trim()}>
              {create.isPending ? <Loader2 size={14} className="animate-spin" /> : null} Skapa
            </Button>
          </div>
        }
      >
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Kedjans namn" autoFocus onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) create.mutate(); }} />
      </Modal>
    </div>
  );
}
