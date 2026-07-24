"use client";

import { type ReactNode } from "react";
import { Check, ChevronDown, ChevronRight, ChevronUp, Copy, GripVertical } from "lucide-react";
import { Badge, CheckboxField, SwitchField, Toggle } from "@/shared/components/ui";
import type { ExtraGroupRecord, ProductRecord } from "@/modules/menu/api";
import { formatCurrency } from "@/shared/utils/format";
import { toggleOffClass, toggleOnClass } from "@/modules/menu/utils";

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-[7px] border px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em] ${
        active
          ? "border-transparent bg-[var(--accent-soft)] text-[var(--text-primary)]"
          : "border-[var(--border-subtle)] text-[var(--text-muted)]"
      }`}
    >
      {active ? "Aktiv" : "Dold"}
    </span>
  );
}

export function TogglePill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${active ? toggleOnClass : toggleOffClass}`}
    >
      {active ? <Check size={13} strokeWidth={3} /> : null}
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// BulkEditModal — skriv över valda fält på alla markerade produkter på en gång.
// Varje rad har en "Skriv över"-toggle (inkludera fältet?) + värdekontrollen.
// Bara påslagna fält hamnar i payloaden, så orörda inställningar lämnas ifred.
// ─────────────────────────────────────────────────────────────────────────
export function BulkRow({ label, enabled, onToggle, children }: { label: string; enabled: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="surface-muted px-4 py-4">
      <SwitchField label={label} hint="Slå på för att skriva över detta fält på alla markerade produkter." checked={enabled} onChange={onToggle} />
      {enabled ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{children}</div> : null}
    </div>
  );
}

export function RowIconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(event) => { event.stopPropagation(); onClick(); }}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-[var(--border-subtle)] disabled:hover:text-[var(--text-secondary)]"
    >
      {children}
    </button>
  );
}

// Kompakt produktrad: kryssruta, namn + statusprick, liten meta, pris, och till

export function ProductRow({
  product,
  index,
  total,
  selected,
  busy,
  canReorder,
  onToggleSelect,
  onOpen,
  onMove,
  onDuplicate,
}: {
  product: ProductRecord;
  index: number;
  total: number;
  selected: boolean;
  busy: boolean;
  canReorder: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
}) {
  const active = product.isActive !== false;
  return (
    <div className="surface-muted flex w-full items-center gap-3 px-3 py-2">
      <CheckboxField
        label={`Markera ${product.name}`}
        checked={selected}
        onChange={onToggleSelect}
        className="shrink-0 [&_.choice-label]:sr-only"
      />
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span
          aria-hidden
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]"}`}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-[14px] font-semibold tracking-[-0.01em]">{product.name}</span>
            {!active ? <span className="shrink-0 text-[11px] text-[var(--text-muted)]">dold</span> : null}
          </span>
          {product.extraGroups.length > 0 ? (
            <span className="mt-0.5 block truncate text-[11px] text-[var(--text-muted)]">
              {product.extraGroups.length} tillvalsgrupper
            </span>
          ) : null}
        </span>
        <span className="shrink-0 text-[14px] font-semibold tabular-nums">{formatCurrency(product.price)}</span>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        <RowIconButton label="Duplicera produkt" onClick={onDuplicate} disabled={busy}>
          <Copy size={14} />
        </RowIconButton>
        {canReorder ? (
          <>
            <RowIconButton label="Flytta upp" onClick={() => onMove(-1)} disabled={busy || index === 0}>
              <ChevronUp size={15} />
            </RowIconButton>
            <RowIconButton label="Flytta ner" onClick={() => onMove(1)} disabled={busy || index === total - 1}>
              <ChevronDown size={15} />
            </RowIconButton>
          </>
        ) : null}
      </div>
    </div>
  );
}

// Kompakt tillvalsrad — samma monokroma format som ProductRow. Namn + en liten
// meta-rad ({n} val · typ · obligatorisk · kopplade produkter), och till höger en
// duplicera-knapp. Hela raden (utom knappen) öppnar gruppmodalen.
export function ExtraGroupRow({ group, busy, onOpen, onDuplicate }: { group: ExtraGroupRecord; busy: boolean; onOpen: () => void; onDuplicate: () => void }) {
  const typeLabel = group.type === "RADIO" ? "radio" : "checkbox";
  const usage = group._count?.productGroups ?? 0;
  const meta = [
    `${group.extras.length} val`,
    typeLabel,
    group.required ? "obligatorisk" : null,
    `${usage} kopplade`,
  ].filter(Boolean).join(" · ");
  return (
    <div className="surface-muted flex w-full items-center gap-3 px-3 py-2">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 flex-col text-left">
        <span className="truncate text-[14px] font-semibold tracking-[-0.01em]">{group.name}</span>
        <span className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{meta}</span>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        <RowIconButton label="Duplicera tillvalsgrupp" onClick={onDuplicate} disabled={busy}>
          <Copy size={14} />
        </RowIconButton>
      </div>
    </div>
  );
}

// Rätt-rad enligt design-handoff: bild-thumb (46px, varm gradient-placeholder om
// ingen bild), namn + beskrivning, pris, tillgänglighets-toggle (orange) och en
// chevron. Slut i lager / dold = dämpad. Hela raden (utom toggeln) öppnar modalen.
export const DISH_PLACEHOLDER = "linear-gradient(150deg,#F0D4A8,#DCB070)";
export function DishRow({
  product,
  busy,
  onOpen,
  onToggleAvailability,
}: {
  product: ProductRecord;
  busy: boolean;
  onOpen: () => void;
  onToggleAvailability: (next: boolean) => void;
}) {
  const available = product.isActive !== false;
  return (
    <div
      className={`flex items-center gap-3.5 px-4 py-3.5 transition-opacity ${available ? "" : "opacity-60"}`}
    >
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3.5 text-left">
        <span
          aria-hidden
          className="h-[46px] w-[46px] shrink-0 rounded-[10px] bg-cover bg-center"
          style={product.imageUrl ? { backgroundImage: `url(${product.imageUrl})` } : { backgroundImage: DISH_PLACEHOLDER }}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-bold tracking-[-0.01em] text-[var(--text-primary)]">{product.name}</span>
          {product.description ? (
            <span className="mt-0.5 block truncate text-[12px] text-[var(--text-muted)]">{product.description}</span>
          ) : null}
        </span>
        <span className="shrink-0 text-[14px] font-extrabold tabular-nums text-[var(--text-primary)]">{formatCurrency(product.price)}</span>
      </button>
      <Toggle checked={available} onChange={onToggleAvailability} disabled={busy} />
      <ChevronRight size={18} className="shrink-0 text-[var(--text-muted)]" aria-hidden />
    </div>
  );
}
