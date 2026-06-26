"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Loader2, Plus, RefreshCw, Star, Trash2 } from "lucide-react";
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
          <p className={`text-xs ${result.dryRun ? "text-[var(--text-secondary)]" : "text-[var(--success-text)]"}`}>
            {result.dryRun ? "Förhandsvisning, inget har skrivits. Klicka Synka för att köra." : "Klart. Platsernas menyer uppdaterade."}
          </p>
        </div>
      ) : (
        <p className="text-sm text-[var(--text-secondary)]">Klicka Förhandsvisa för att se vad som skulle synkas.</p>
      )}
    </Modal>
  );
}

// Distinkta städer i kedjan (för "Städer"-kolumnen).
function brandCities(brand: BrandRecord): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of brand.restaurants) {
    const c = (r.city ?? "").trim();
    if (c && !seen.has(c)) { seen.add(c); out.push(c); }
  }
  return out;
}

// ── En kedja: tabellrad + utfällbar panel (kedjans restauranger = undermeny) ──
function BrandRow({ brand, allRestaurants, expanded, onToggle }: {
  brand: BrandRecord; allRestaurants: RestaurantRef[]; expanded: boolean; onToggle: () => void;
}) {
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
  const cities = brandCities(brand);

  return (
    <>
      <tr
        className="cursor-pointer"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <td>
          <span className="flex items-center gap-3">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt="" className="h-10 w-10 flex-none rounded-[10px] object-cover" />
            ) : (
              <span
                className="h-10 w-10 flex-none rounded-[10px]"
                style={{ background: "linear-gradient(150deg,#F0D4A8,#DCB070)" }}
              />
            )}
            <span className="font-extrabold tracking-[-0.2px]">{brand.name}</span>
          </span>
        </td>
        <td className="text-[var(--text-secondary)]">
          {brand.locationCount} {brand.locationCount === 1 ? "restaurang" : "restauranger"}
        </td>
        <td className="text-[var(--text-secondary)]">
          {cities.length ? cities.join(" · ") : <span className="text-[var(--text-muted)]">–</span>}
        </td>
        <td>
          {brand.masterRestaurantId ? <Badge tone="success">Master vald</Badge> : <Badge tone="neutral">Ingen master</Badge>}
        </td>
        <td className="text-right">
          <ChevronRight
            size={16}
            className={`inline text-[var(--text-muted)] transition-transform ${expanded ? "rotate-90" : ""}`}
          />
        </td>
      </tr>

      {expanded ? (
        <tr className="brand-row-detail">
          <td colSpan={5} className="!py-0">
            <div
              className="border-t border-[var(--row-divider)] px-1 py-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <label className="mb-1.5 block text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                    Master-plats (menyns källa)
                  </label>
                  <Select
                    value={brand.masterRestaurantId ?? ""}
                    onChange={(e) => setMaster.mutate(e.target.value || null)}
                    disabled={brand.restaurants.length === 0 || setMaster.isPending}
                  >
                    <option value="">Välj master…</option>
                    {brand.restaurants.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </Select>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => setManageOpen(true)}>Hantera platser</Button>
                  <Button variant="primary" onClick={() => setSyncOpen(true)} disabled={!canSync}>
                    <RefreshCw size={14} /> Synka alla
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => { if (window.confirm(`Ta bort kedjan "${brand.name}"? Platserna kopplas bort men raderas inte.`)) remove.mutate(); }}
                    disabled={remove.isPending}
                  >
                    {remove.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Ta bort
                  </Button>
                </div>
              </div>

              {brand.restaurants.length > 0 ? (
                <div className="mt-4">
                  <div className="mb-2 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                    Kedjans restauranger
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {brand.restaurants.map((r) => {
                      const isMaster = r.id === brand.masterRestaurantId;
                      return (
                        <Badge key={r.id} tone={isMaster ? "info" : "neutral"}>
                          <span className="inline-flex items-center gap-1">
                            {isMaster ? <Star size={11} className="fill-current" /> : null}
                            {r.name}
                            {r.city ? <span className="text-[var(--text-muted)]"> · {r.city}</span> : null}
                          </span>
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="mt-4 text-sm text-[var(--text-muted)]">Inga platser än, klicka &ldquo;Hantera platser&rdquo;.</p>
              )}

              {!canSync && brand.restaurants.length > 1 ? (
                <p className="mt-3 text-xs text-[var(--warning)]">Välj en master-plats för att kunna synka.</p>
              ) : null}
            </div>
          </td>
        </tr>
      ) : null}

      {manageOpen ? <ManageLocationsModal brand={brand} allRestaurants={allRestaurants} open={manageOpen} onClose={() => setManageOpen(false)} /> : null}
      {syncOpen ? <SyncModal brand={brand} open={syncOpen} onClose={() => setSyncOpen(false)} /> : null}
    </>
  );
}

export function BrandsPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const brands = useQuery({ queryKey: brandsQueryKey, queryFn: getBrands });
  const restaurants = useQuery({ queryKey: brandRestaurantsQueryKey, queryFn: getAllRestaurants });
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
        breadcrumb="Katalog"
        title="Kedjor"
        actions={<Button variant="primary" onClick={() => setCreateOpen(true)}><Plus size={14} /> Ny kedja</Button>}
      />

      {brands.isLoading ? (
        <Surface className="p-0">
          <div className="px-6 py-5 space-y-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-[10px] bg-[var(--bg-hover)]" />)}
          </div>
        </Surface>
      ) : list.length === 0 ? (
        <EmptyState
          title="Inga kedjor än"
          description="Gruppera restauranger under en kedja för att dela meny och synka platser."
          action={<Button variant="primary" onClick={() => setCreateOpen(true)}><Plus size={14} /> Ny kedja</Button>}
        />
      ) : (
        <>
          <Surface className="overflow-hidden p-0">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Kedja</th>
                  <th>Restauranger</th>
                  <th>Städer</th>
                  <th>Status</th>
                  <th aria-hidden />
                </tr>
              </thead>
              <tbody>
                {list.map((b) => (
                  <BrandRow
                    key={b.id}
                    brand={b}
                    allRestaurants={allRestaurants}
                    expanded={expandedId === b.id}
                    onToggle={() => setExpandedId((cur) => (cur === b.id ? null : b.id))}
                  />
                ))}
              </tbody>
            </table>
          </Surface>
          <p className="text-[12px] font-semibold text-[var(--text-muted)]">
            Klicka på en kedja för att se kedjans restauranger och hantera platser.
          </p>
        </>
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
