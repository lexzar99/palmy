"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Copy, Loader2, Upload } from "lucide-react";
import {
  copyCategory,
  copyExtraGroup,
  copyProduct,
  createCategory,
  createExtraGroup,
  createProduct,
  deleteCategory,
  deleteExtraGroup,
  deleteProduct,
  duplicateExtraGroup,
  getCategories,
  getProducts,
  menuCategoriesQueryKey,
  menuGroupsQueryKey,
  menuProductsQueryKey,
  r2AutoMatch,
  menuBulkImport,
  menuSync,
  type MenuSyncResponse,
  type MenuImportResult,
  r2PathsTemplate,
  updateCategory,
  updateExtraGroup,
  updateProduct,
  type CategoryRecord,
  type ExtraGroupRecord,
  type ProductRecord,
  type R2AutoMatchResult,
  type R2PathsTemplate,
  type RestaurantRef,
} from "@/modules/menu/api";
import {
  Badge,
  Button,
  CheckboxField,
  ConfirmDialog,
  EmptyState,
  ErrorPanel,
  Field,
  Input,
  IntegerInput,
  Modal,
  MoneyInput,
  PercentInput,
  Select,
  Surface,
  SwitchField,
  Textarea,
  Toggle,
} from "@/shared/components/ui";
import { useToast } from "@/shared/components/toast";
import { apiErrorMessage } from "@/modules/menu/utils";

const BULK_IMPORT_TEMPLATE = `# Pålägg (definieras EN gång, återanvänds av produkter)
extraGroups:
  - name: Sås
    type: radio          # radio = max 1 | checkbox = flera
    required: false      # true => Min 1
    options:
      - { name: Vitlökssås, price: 0 }   # price i KRONOR (0 = ingår)
      - { name: Stark sås, price: 0 }
  - name: Tillbehör
    type: radio
    required: true
    options:
      - { name: Pommes, price: 0 }
      - { name: Ris, price: 0 }

# Meny (kategorier → produkter)
categories:
  - name: Kyckling
    description: "Krispig friterad kyckling"   # valfri
    products:
      - name: Crispy tallrik
        description: "5 bitar med sås & pommes" # valfri
        price: 139                              # KRONOR
        extras: [Sås, Tillbehör]                # grupp-namn ovan / i DB
`;

/**
 * Bulk-import: klistra in YAML/JSON → förhandsvisa (dry-run) → importera.
 * Idempotent upsert per restaurang. Pålägg som redan finns globalt lämnas orörda
 * men återanvänds för koppling. Priser i kronor → öre.
 */
export function BulkImportButton({ restaurantId }: { restaurantId: string }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [result, setResult] = useState<MenuImportResult | null>(null);

  const extractError = (e: any): string =>
    e?.response?.data?.error || e?.message || "Okänt fel, kolla nätverk eller serverloggar.";

  const previewMutation = useMutation({ meta: { toast: false },
    mutationFn: () => menuBulkImport({ restaurantId, content, apply: false }),
    onSuccess: (data) => setResult(data),
    onError: (e) => showToast({ type: "error", message: extractError(e) }),
  });

  const applyMutation = useMutation({ meta: { toast: false },
    mutationFn: () => menuBulkImport({ restaurantId, content, apply: true }),
    onSuccess: async (data) => {
      setResult(data);
      await queryClient.invalidateQueries({ queryKey: ["menu"] });
      const s = data.summary;
      showToast({
        type: "success",
        message: `Import klar: +${s.categoriesCreated} kat, +${s.productsCreated} prod, ${s.links} kopplingar`,
      });
    },
    onError: (e) => showToast({ type: "error", message: extractError(e) }),
  });

  const isBusy = previewMutation.isPending || applyMutation.isPending;
  const s = result?.summary;

  return (
    <>
      <Button variant="secondary" onClick={() => { setOpen(true); setResult(null); }}>
        <Upload size={14} /> Bulk-import
      </Button>

      <Modal
        open={open}
        onClose={() => { if (!isBusy) { setOpen(false); } }}
        title="Massimport av meny (YAML / JSON)"
        size="xl"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button onClick={() => setContent(BULK_IMPORT_TEMPLATE)} disabled={isBusy}>Infoga mall</Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="secondary" loading={previewMutation.isPending} onClick={() => previewMutation.mutate()} disabled={isBusy || !content.trim()}>
                Förhandsvisa
              </Button>
              <Button
                variant="primary"
                loading={applyMutation.isPending}
                onClick={() => applyMutation.mutate()}
                disabled={isBusy || !content.trim() || !result || result.dryRun === false}
              >
                {applyMutation.isPending ? "Importerar…" : "Importera"}
              </Button>
            </div>
          </div>
        }
      >
        <div className="grid gap-4">
          <Textarea
            value={content}
            onChange={(e) => { setContent(e.target.value); setResult(null); }}
            placeholder="YAML eller JSON"
            rows={14}
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}
          />

          {result ? (
            <div className="grid gap-3">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
                {[
                  { n: s!.categoriesCreated, l: "Nya kat." },
                  { n: s!.categoriesUpdated, l: "Uppd. kat." },
                  { n: s!.productsCreated, l: "Nya prod." },
                  { n: s!.productsUpdated, l: "Uppd. prod." },
                  { n: s!.extraGroupsCreated, l: "Nya pålägg" },
                  { n: s!.extraGroupsUpdated, l: "Uppd. pålägg" },
                  { n: s!.links, l: "Kopplingar" },
                ].map((c) => (
                  <div key={c.l} className="surface-muted px-2 py-3 text-center">
                    <div className="text-xl font-black">{c.n}</div>
                    <div className="mt-1 text-[9px] uppercase tracking-widest text-[var(--text-secondary)]">{c.l}</div>
                  </div>
                ))}
              </div>

              {result.dryRun ? (
                <p className="text-xs text-[var(--text-secondary)]">Förhandsvisning, inget har skrivits. Klicka <b>Importera</b> för att köra.</p>
              ) : (
                <p className="text-xs font-semibold text-[var(--text-primary)]">Importen är klar och menyn uppdaterad.</p>
              )}

              {result.warnings.length > 0 ? (
                <div>
                  <p className="mb-1 text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)]">Varningar ({result.warnings.length})</p>
                  <div className="surface-muted max-h-40 overflow-y-auto px-3 py-2 text-xs text-[var(--text-secondary)]">
                    {result.warnings.map((w, i) => <div key={i} className="border-b border-[var(--border-subtle)] py-1 last:border-0">{w}</div>)}
                  </div>
                </div>
              ) : null}

              {result.examples.length > 0 ? (
                <div>
                  <p className="mb-1 text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)]">Plan</p>
                  <div className="surface-muted max-h-48 overflow-y-auto px-3 py-2 text-xs">
                    {result.examples.map((ex, i) => <div key={i} className="py-0.5">{ex}</div>)}
                  </div>
                </div>
              ) : null}

              {result.errors.length > 0 ? (
                <div className="surface-muted px-3 py-2 text-xs font-semibold text-[var(--text-primary)]">
                  {result.errors.map((er, i) => <div key={i}>{er}</div>)}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
}

/**
 * MenuSyncButton — kedjesynk (steg 3). Kopierar den valda (master-)restaurangens
 * meny till en eller flera valda platser. Dry-run först (visar created/updated),
 * sedan Synka. Idempotent, och varje plats lokala isActive (slutsålt) bevaras.
 */
export function MenuSyncButton({ sourceRestaurantId, restaurants }: { sourceRestaurantId: string; restaurants: RestaurantRef[] }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<MenuSyncResponse | null>(null);

  const targetOptions = restaurants.filter((r) => r.id !== sourceRestaurantId);
  const sourceName = restaurants.find((r) => r.id === sourceRestaurantId)?.name ?? "vald restaurang";
  const extractError = (e: any): string => e?.response?.data?.error || e?.message || "Okänt fel.";

  const run = (apply: boolean) =>
    menuSync({ sourceRestaurantId, targetRestaurantIds: [...targets], apply });

  const previewMutation = useMutation({ meta: { toast: false },
    mutationFn: () => run(false),
    onSuccess: (data) => setResult(data),
    onError: (e) => showToast({ type: "error", message: extractError(e) }),
  });
  const applyMutation = useMutation({ meta: { toast: false },
    mutationFn: () => run(true),
    onSuccess: async (data) => {
      setResult(data);
      await queryClient.invalidateQueries({ queryKey: ["menu"] });
      const tot = data.results.reduce((a, r) => a + r.summary.productsCreated + r.summary.productsUpdated, 0);
      showToast({ type: "success", message: `Synk klar: ${data.results.length} platser, ${tot} produkter` });
    },
    onError: (e) => showToast({ type: "error", message: extractError(e) }),
  });

  const isBusy = previewMutation.isPending || applyMutation.isPending;
  const toggle = (id: string) => setTargets((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <>
      <Button variant="secondary" onClick={() => { setOpen(true); setResult(null); setTargets(new Set()); }}>
        <Copy size={14} /> Synka till platser
      </Button>

      <Modal
        open={open}
        onClose={() => { if (!isBusy) setOpen(false); }}
        title="Synka meny till platser"
        size="lg"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" loading={previewMutation.isPending} onClick={() => previewMutation.mutate()} disabled={isBusy || targets.size === 0}>
              Förhandsvisa
            </Button>
            <Button variant="primary" loading={applyMutation.isPending} onClick={() => applyMutation.mutate()} disabled={isBusy || targets.size === 0 || !result || result.dryRun === false}>
              {applyMutation.isPending ? "Synkar…" : "Synka"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4">
          {targetOptions.length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">Det finns inga andra restauranger att synka till.</p>
          ) : (
            <div className="grid gap-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">Målplatser ({targets.size} valda)</p>
              <div className="grid gap-1 max-h-56 overflow-y-auto">
                {targetOptions.map((r) => (
                  <CheckboxField
                    key={r.id}
                    label={r.name}
                    checked={targets.has(r.id)}
                    onChange={() => { toggle(r.id); setResult(null); }}
                    className="surface-muted px-3 py-2.5"
                  />
                ))}
              </div>
            </div>
          )}

          {result ? (
            <div className="grid gap-2">
              {result.results.map((r) => {
                const name = restaurants.find((x) => x.id === r.targetRestaurantId)?.name ?? r.targetRestaurantId;
                const s = r.summary;
                return (
                  <div key={r.targetRestaurantId} className="surface-muted px-4 py-3 text-sm">
                    <div className="mb-1 font-semibold">{name}</div>
                    <div className="text-[12px] text-[var(--text-secondary)]">
                      Produkter: <b className="text-[var(--text-primary)]">+{s.productsCreated}</b> nya, {s.productsUpdated} uppdaterade ·
                      {" "}Kategorier: +{s.categoriesCreated}/{s.categoriesUpdated} · Pålägg: +{s.groupsCreated}/{s.groupsReused} återanv. · {s.links} kopplingar
                    </div>
                  </div>
                );
              })}
              <p className={`text-xs ${result.dryRun ? "text-[var(--text-secondary)]" : "font-semibold text-[var(--text-primary)]"}`}>
                {result.dryRun ? "Förhandsvisning, inget har skrivits. Klicka Synka för att köra." : "Synken är klar, platsernas menyer uppdaterade."}
              </p>
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
}

/**
 * R2 Auto-match-knapp: scannar Cloudflare R2-bucketen för restaurangen och
 * binder automatiskt bilder till produkter/kategorier baserat
 * på slug-konventionen. Visar alltid dry-run-resultat först så admin kan se
 * vad som kommer hända innan något skrivs till DB.
 */
export function R2AutoMatchButton({ restaurantId }: { restaurantId: string }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [dryRun, setDryRun] = useState<R2AutoMatchResult | null>(null);

  const extractError = (e: any): string => {
    if (e?.response?.status === 401 || e?.response?.status === 403) return 'Saknar behörighet';
    if (e?.response?.status === 503) return e?.response?.data?.error || 'R2 är inte konfigurerat';
    if (e?.response?.data?.error) return e.response.data.error;
    if (e?.message) return e.message;
    return 'Okänt fel';
  };

  const dryMutation = useMutation({ meta: { toast: false },
    mutationFn: () => r2AutoMatch(restaurantId, true),
    onSuccess: (data) => { setDryRun(data); setOpen(true); },
    onError: (e) => {
      showToast({ type: 'error', message: `Auto-match dry-run misslyckades: ${extractError(e)}` });
    },
  });

  const applyMutation = useMutation({ meta: { toast: false },
    mutationFn: () => r2AutoMatch(restaurantId, false),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: menuProductsQueryKey(restaurantId) });
      await queryClient.invalidateQueries({ queryKey: menuCategoriesQueryKey(restaurantId) });
      setOpen(false);
      setDryRun(null);
      const total = (data.matched.hero ? 1 : 0) + (data.matched.logo ? 1 : 0) + data.matched.categories + data.matched.products;
      showToast({ type: 'success', message: `Auto-match klar: ${total} bilder kopplade` });
    },
    onError: (e) => {
      showToast({ type: 'error', message: `Auto-match misslyckades: ${extractError(e)}` });
    },
  });

  const error = apiErrorMessage(dryMutation.error) || apiErrorMessage(applyMutation.error);

  return (
    <>
      <Button variant="secondary" loading={dryMutation.isPending} onClick={() => dryMutation.mutate()}>
        Matcha bilder från R2
      </Button>

      <Modal
        open={open && !!dryRun}
        onClose={() => { setOpen(false); setDryRun(null); }}
        title="R2 auto-match"
        size="lg"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={() => { setOpen(false); setDryRun(null); }}>Avbryt</Button>
            <Button variant="primary" loading={applyMutation.isPending} onClick={() => applyMutation.mutate()}>
              Skriv till databasen
            </Button>
          </div>
        }
      >
        {dryRun ? (
          <div className="grid gap-4">
            <div className="surface-muted px-4 py-3 text-xs">
              <div className="text-[var(--text-secondary)]">Bucket-prefix</div>
              <code className="text-sm">{dryRun.prefix}</code>
              <div className="mt-2 text-[var(--text-secondary)]">{dryRun.totalObjectsInPrefix} object i bucketen</div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="surface-muted px-3 py-3 text-center">
                <div className="text-2xl font-black">{dryRun.matched.hero ? "✓" : "—"}</div>
                <div className="mt-1 text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">Hero</div>
              </div>
              <div className="surface-muted px-3 py-3 text-center">
                <div className="text-2xl font-black">{dryRun.matched.logo ? "✓" : "—"}</div>
                <div className="mt-1 text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">Logo</div>
              </div>
              <div className="surface-muted px-3 py-3 text-center">
                <div className="text-2xl font-black">{dryRun.matched.categories}</div>
                <div className="mt-1 text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">Kategorier</div>
              </div>
              <div className="surface-muted px-3 py-3 text-center">
                <div className="text-2xl font-black">{dryRun.matched.products}</div>
                <div className="mt-1 text-[10px] uppercase tracking-widest text-[var(--text-secondary)]">Produkter</div>
              </div>
            </div>
            {dryRun.updates.length > 0 ? (
              <div>
                <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)]">Exempel på vad som kommer kopplas</p>
                <div className="surface-muted max-h-64 overflow-y-auto px-3 py-2 text-xs">
                  {dryRun.updates.map((u) => (
                    <div key={u.key} className="border-b border-[var(--border-subtle)] py-1.5 last:border-b-0">
                      <Badge tone="neutral">{u.kind}</Badge>
                      <code className="ml-2 break-all">{u.key}</code>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">Inga matchningar hittades.</p>
            )}
            {error ? <p className="text-sm font-semibold text-[var(--text-primary)]">{error}</p> : null}
          </div>
        ) : null}
      </Modal>
    </>
  );
}

/**
 * R2 Bulk-upload-knapp: visar mappar + exakta filnamn admin ska använda.
 * Workflow: kopiera mapp-path, gå till R2-dashboard, döp filerna enligt listan,
 * dra in i mappen. Klicka sen "Matcha bilder från R2" så uppdateras DB.
 */
const basenameOf = (key: string) => key.split('/').pop() || key;
const folderOf = (key: string) => {
  const i = key.lastIndexOf('/');
  return i >= 0 ? key.slice(0, i + 1) : '';
};

export function R2PathsButton({ restaurantId }: { restaurantId: string }) {
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);

  const query = useQuery({
    queryKey: ["r2-paths-template", restaurantId],
    queryFn: () => r2PathsTemplate(restaurantId),
    enabled: open,
    staleTime: 60_000,
  });

  const copyToClipboard = async (text: string, label = 'Kopierat') => {
    try {
      await navigator.clipboard.writeText(text);
      showToast({ type: 'success', message: label });
    } catch {
      showToast({ type: 'error', message: 'Kunde inte kopiera' });
    }
  };

  const totalProducts = query.data?.categories.reduce((s, c) => s + c.products.length, 0) || 0;

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        R2 bulk-upload mall
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Bulk-upload mall"
        size="xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setOpen(false)}>Stäng</Button>
          </div>
        }
      >
        {query.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin" />
          </div>
        ) : query.error ? (
          <p className="text-sm font-semibold text-[var(--text-primary)]">Kunde inte ladda mall. Försök igen.</p>
        ) : query.data ? (
          <div className="grid gap-4">
            <div className="surface-muted px-4 py-3 text-[11px]">
              <div className="flex items-baseline gap-2">
                <span className="font-bold text-[var(--text-primary)]">{query.data.restaurant.name}</span>
                <span className="text-[var(--text-secondary)]">·</span>
                <span className="text-[var(--text-secondary)]">
                  {query.data.categories.length} kategorier · {totalProducts} produkter
                </span>
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
                Format: WebP rekommenderas. Andra format (jpg, png) funkar men endpoints konverterar bara via admin-upload, inte vid direkt-upload till R2.
              </div>
            </div>

            <_R2Section
              title="Rot-filer"
              folder={query.data.prefix}
              rows={[
                { filename: basenameOf(query.data.hero.key), label: query.data.hero.label },
                { filename: basenameOf(query.data.logo.key), label: query.data.logo.label },
              ]}
              onCopy={copyToClipboard}
            />

            {query.data.categories.length ? (
              <div>
                <p className="mb-2 text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)]">
                  Kategorier, produkter ({totalProducts})
                </p>
                <div className="grid gap-3">
                  {query.data.categories.map((c) => (
                    <_R2Section
                      key={c.id}
                      title={c.name}
                      subtitle={`slug: ${c.slug}`}
                      folder={c.folder}
                      rows={c.products.map((p) => ({ filename: basenameOf(p.key), label: p.name }))}
                      onCopy={copyToClipboard}
                      empty="Inga produkter"
                      compact
                    />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </>
  );
}

export function MenuToolsDropdown({ restaurantId, restaurants }: { restaurantId: string; restaurants: RestaurantRef[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button variant="secondary" onClick={() => setOpen((v) => !v)}>
        <Upload size={14} /> Verktyg <ChevronDown size={14} />
      </Button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 grid w-[260px] gap-2 rounded-[12px] border border-[var(--border-strong)] bg-[var(--surface)] p-2 shadow-[0_18px_45px_rgba(15,23,42,0.14)]">
          <BulkImportButton restaurantId={restaurantId} />
          <MenuSyncButton sourceRestaurantId={restaurantId} restaurants={restaurants} />
          <R2PathsButton restaurantId={restaurantId} />
          <R2AutoMatchButton restaurantId={restaurantId} />
        </div>
      )}
    </div>
  );
}

/**
 * R2-sektion = en mapp + lista av filer som ska in i den mappen.
 * Visar mapp-path med kopieringsknapp och varje fil med basename + produktnamn.
 * Kopierings-actions: hela sektionen, bara filnamn, eller fil-för-fil.
 */
function _R2Section({ title, subtitle, folder, rows, onCopy, empty, compact }: {
  title: string;
  subtitle?: string;
  folder: string;
  rows: Array<{ filename: string; label: string }>;
  onCopy: (text: string, label?: string) => void;
  empty?: string;
  compact?: boolean;
}) {
  const filenamesOnly = rows.map((r) => r.filename).join('\n');
  const mapping = rows.map((r) => `${r.filename}\t${r.label}`).join('\n');
  return (
    <div className="surface-muted overflow-hidden">
      <div className="flex items-start justify-between gap-2 border-b border-[var(--border-subtle)] px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">{title}</div>
          {subtitle ? (
            <div className="text-[10px] text-[var(--text-muted)]">{subtitle}</div>
          ) : null}
          <div className="mt-1 flex items-center gap-2">
            <code className="break-all text-[10px] text-[var(--text-secondary)]">{folder}</code>
            <button
              type="button"
              onClick={() => onCopy(folder, 'Mapp kopierad')}
              className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Kopiera mapp
            </button>
          </div>
        </div>
        {rows.length ? (
          <div className="flex shrink-0 flex-col items-end gap-1">
            <button
              type="button"
              onClick={() => onCopy(filenamesOnly, `${rows.length} filnamn kopierade`)}
              className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Kopiera filnamn ({rows.length})
            </button>
            <button
              type="button"
              onClick={() => onCopy(mapping, 'Filnamn → produkt CSV kopierat')}
              className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Kopiera CSV
            </button>
          </div>
        ) : null}
      </div>
      <div className={compact ? "max-h-60 overflow-y-auto px-3 py-2 text-xs" : "px-3 py-2 text-xs"}>
        {rows.length ? rows.map((r) => (
          <div key={r.filename} className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] py-1.5 last:border-b-0">
            <div className="min-w-0 flex-1">
              <code className="block break-all text-[12px] font-semibold text-[var(--text-primary)]">{r.filename}</code>
              <div className="text-[10px] text-[var(--text-muted)]">→ {r.label}</div>
            </div>
            <button
              type="button"
              onClick={() => onCopy(r.filename, `${r.filename} kopierat`)}
              className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Kopiera
            </button>
          </div>
        )) : <p className="text-[var(--text-muted)]">{empty || '—'}</p>}
      </div>
    </div>
  );
}
