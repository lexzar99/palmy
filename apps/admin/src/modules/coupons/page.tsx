"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Pencil } from "lucide-react";
import {
  createDiscount,
  deleteDiscount,
  discountsQueryKey,
  getDiscounts,
  updateDiscount,
  type DiscountRecord,
} from "@/modules/coupons/api";
import {
  Badge,
  Button,
  EmptyState,
  ErrorPanel,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Surface,
} from "@/shared/components/ui";
import { formatDate, formatNumber } from "@/shared/utils/format";
import { getRestaurantOverview, restaurantsQueryKey, type ControlCenterRestaurantSnapshot } from "@/modules/restaurants/api";

type FormState = {
  code: string;
  description: string;
  discountType: "percentage" | "fixed" | "free_delivery";
  discountValue: string;
  minOrderAmount: string;
  maxUses: string;
  startsAt: string;
  expiresAt: string;
  applicableRestaurantIds: string[];
  isActive: boolean;
  // Stackbar fri leverans-flagga. Endast meningsfull när discountType är
  // percentage eller fixed — för free_delivery är den redan implicit.
  freeDelivery: boolean;
};

const emptyForm = (): FormState => ({
  code: "",
  description: "",
  discountType: "percentage",
  discountValue: "",
  minOrderAmount: "",
  maxUses: "",
  startsAt: "",
  expiresAt: "",
  applicableRestaurantIds: [],
  isActive: true,
  freeDelivery: false,
});

const typeLabel: Record<DiscountRecord["discountType"], string> = {
  percentage: "Procent",
  fixed: "Fast belopp",
  free_delivery: "Fri leverans",
};

const typeTone: Record<DiscountRecord["discountType"], "info" | "warning" | "success"> = {
  percentage: "info",
  fixed: "warning",
  free_delivery: "success",
};

function toIsoDateInput(val: string | null | undefined): string {
  if (!val) return "";
  return val.slice(0, 10);
}

export function CouponsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DiscountRecord | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);

  const discounts = useQuery({ queryKey: discountsQueryKey, queryFn: getDiscounts });
  const restaurants = useQuery({ queryKey: restaurantsQueryKey, queryFn: getRestaurantOverview });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!modalOpen) return;
    if (editing) {
      setForm({
        code: editing.code,
        description: editing.description ?? "",
        discountType: editing.discountType,
        discountValue: editing.discountType === "free_delivery" ? "" : String(editing.discountValue),
        minOrderAmount: editing.minOrderAmount > 0 ? String(editing.minOrderAmount) : "",
        maxUses: editing.maxUses != null ? String(editing.maxUses) : "",
        startsAt: toIsoDateInput(editing.startsAt),
        expiresAt: toIsoDateInput(editing.expiresAt),
        applicableRestaurantIds: editing.applicableRestaurantIds?.length
          ? editing.applicableRestaurantIds
          : editing.restaurantId
            ? [editing.restaurantId]
            : [],
        isActive: editing.isActive,
        freeDelivery: editing.freeDelivery ?? false,
      });
    } else {
      setForm(emptyForm());
    }
    setFormError(null);
  }, [modalOpen, editing]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({
    mutationFn: async (f: FormState) => {
      const payload: Record<string, unknown> = {
        code: f.code.toUpperCase(),
        description: f.description || null,
        type: f.discountType === "percentage" ? "PERCENTAGE" : f.discountType === "fixed" ? "FIXED" : "FREE_DELIVERY",
        value: f.discountType === "free_delivery" ? 0 : Number(f.discountValue) || 0,
        minOrder: Number(f.minOrderAmount) || 0,
        maxUsages: f.maxUses ? Number(f.maxUses) : null,
        validFrom: f.startsAt || null,
        validUntil: f.expiresAt || null,
        applicableRestaurantIds: f.applicableRestaurantIds,
        isActive: f.isActive,
        // Stackbar fri leverans — bara meningsfull om typen INTE redan
        // är free_delivery (då är fri leverans redan kupongens huvudsyfte).
        freeDelivery: f.discountType !== "free_delivery" && f.freeDelivery,
      };
      if (editing) {
        return updateDiscount(editing.id, payload);
      }
      return createDiscount(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: discountsQueryKey });
      setModalOpen(false);
      setEditing(null);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setFormError(msg ?? "Kunde inte spara kupong.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteDiscount(editing!.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: discountsQueryKey });
      setModalOpen(false);
      setEditing(null);
    },
    onError: () => setFormError("Kunde inte radera kupong."),
  });

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (record: DiscountRecord) => {
    setEditing(record);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim()) { setFormError("Kod krävs."); return; }
    if (form.discountType !== "free_delivery" && (!form.discountValue || Number(form.discountValue) <= 0)) {
      setFormError("Värde måste vara större än 0.");
      return;
    }
    setFormError(null);
    saveMutation.mutate(form);
  };

  const restaurantMap = new Map<string, string>(
    (restaurants.data ?? []).map((r: ControlCenterRestaurantSnapshot) => [r.id, r.name])
  );

  if (discounts.isLoading) {
    return <Surface className="px-6 py-12 text-sm text-[var(--text-secondary)]">Laddar kupongkoder...</Surface>;
  }

  if (discounts.isError || !discounts.data) {
    return (
      <ErrorPanel
        title="Kunde inte ladda kupongkoder"
        description="Endpointen är inte tillgänglig."
        action={<Button onClick={() => { void discounts.refetch(); }}><RefreshCw size={16} /> Försök igen</Button>}
      />
    );
  }

  return (
    <div className="page-stack">
      <PageHeader
        breadcrumb="Tillväxt"
        title="Kupongkoder"
        actions={
          <>
            <Button variant="secondary" onClick={() => { void discounts.refetch(); }}><RefreshCw size={13} /> Uppdatera</Button>
            <Button variant="primary" onClick={openCreate}><Plus size={13} /> Ny kupong</Button>
          </>
        }
      />

      <Surface className="px-6 py-6">
        {discounts.data.length === 0 ? (
          <EmptyState title="Inga kupongkoder" description="Skapa din första kupong med knappen ovan." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="pb-3 pr-4">Kod</th>
                  <th className="pb-3 pr-4">Typ</th>
                  <th className="pb-3 pr-4">Värde</th>
                  <th className="pb-3 pr-4">Minbelopp</th>
                  <th className="pb-3 pr-4">Restaurang/Alla</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 pr-4">Använde</th>
                  <th className="pb-3 pr-4">Skapad</th>
                  <th className="pb-3"></th>
                </tr>
              </thead>
              <tbody>
                {discounts.data.map((record) => (
                  <tr key={record.id} className="border-b border-[var(--border-subtle)] last:border-0">
                    <td className="py-3 pr-4 font-mono font-semibold tracking-wide">{record.code}</td>
                    <td className="py-3 pr-4">
                      <Badge tone={typeTone[record.discountType]}>{typeLabel[record.discountType]}</Badge>
                    </td>
                    <td className="py-3 pr-4 tabular-nums">
                      {record.discountType === "free_delivery"
                        ? "—"
                        : record.discountType === "percentage"
                        ? `${formatNumber(record.discountValue)}%`
                        : `${formatNumber(record.discountValue)} kr`}
                    </td>
                    <td className="py-3 pr-4 tabular-nums">
                      {record.minOrderAmount > 0 ? `${formatNumber(record.minOrderAmount)} kr` : "—"}
                    </td>
                    <td className="py-3 pr-4 text-[var(--text-secondary)]">
                      {record.applicableRestaurantIds?.length > 0
                        ? record.applicableRestaurantIds.map((id) => restaurantMap.get(id) ?? id).join(", ")
                        : record.restaurantId
                          ? (restaurantMap.get(record.restaurantId) ?? record.restaurantId)
                          : <span className="text-[var(--text-muted)]">Alla</span>}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={record.isActive ? "success" : "neutral"}>{record.isActive ? "Aktiv" : "Inaktiv"}</Badge>
                    </td>
                    <td className="py-3 pr-4 tabular-nums text-[var(--text-secondary)]">
                      {formatNumber(record.usedCount)}{record.maxUses != null ? ` / ${formatNumber(record.maxUses)}` : ""}
                    </td>
                    <td className="py-3 pr-4 text-[var(--text-muted)]">{formatDate(record.createdAt)}</td>
                    <td className="py-3">
                      <Button variant="secondary" onClick={() => openEdit(record)}>
                        <Pencil size={12} /> Redigera
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? `Redigera ${editing.code}` : "Ny kupongkod"}
        footer={
          <div className="flex items-center justify-between gap-3">
            <div>
              {editing && (
                <Button
                  variant="danger"
                  onClick={() => {
                    if (!confirm(`Radera kupong ${editing.code}? Kan inte ångras.`)) return;
                    deleteMutation.mutate();
                  }}
                  disabled={deleteMutation.isPending}
                >
                  Radera
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={closeModal}>Avbryt</Button>
              <Button variant="primary" onClick={handleSubmit} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Sparar..." : "Spara"}
              </Button>
            </div>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="grid gap-4">
          {formError && (
            <p className="rounded-lg bg-[rgba(239,68,68,0.1)] px-4 py-3 text-sm text-red-400">{formError}</p>
          )}

          <Field label="Kod">
            <Input
              value={form.code}
              onChange={(e) => setField("code", e.target.value.toUpperCase())}
              placeholder="SOMMAR25"
              autoFocus
            />
          </Field>

          <Field label="Beskrivning (valfritt)">
            <Input
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              placeholder="Sommarkampanj 2026"
            />
          </Field>

          <Field label="Typ">
            <Select
              value={form.discountType}
              onChange={(e) => setField("discountType", e.target.value as FormState["discountType"])}
            >
              <option value="percentage">Procent</option>
              <option value="fixed">Fast belopp</option>
              <option value="free_delivery">Fri leverans</option>
            </Select>
          </Field>

          {form.discountType !== "free_delivery" && (
            <Field label={form.discountType === "percentage" ? "Värde (%)" : "Värde (kr)"}>
              <Input
                type="number"
                min="0"
                step={form.discountType === "percentage" ? "1" : "0.01"}
                value={form.discountValue}
                onChange={(e) => setField("discountValue", e.target.value)}
                placeholder={form.discountType === "percentage" ? "15" : "50"}
              />
            </Field>
          )}

          {/* Stackbar fri leverans — bara meningsfull för procent/fast.
              För free_delivery-typen är fri leverans redan huvudfunktionen
              (att slå på flaggan blir redundant). */}
          {form.discountType !== "free_delivery" && (
            <Field label="Tillägg: fri leverans">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={form.freeDelivery}
                  onChange={(e) => setField("freeDelivery", e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)] cursor-pointer"
                />
                <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Kombinera med fri leverans — kunden får rabatten OCH gratis leverans i samma kupong.
                </span>
              </label>
            </Field>
          )}

          <Field label="Min. ordervärde (kr)">
            <Input
              type="number"
              min="0"
              step="1"
              value={form.minOrderAmount}
              onChange={(e) => setField("minOrderAmount", e.target.value)}
              placeholder="0"
            />
          </Field>

          <Field label="Max antal användningar (tom = obegränsat)">
            <Input
              type="number"
              min="1"
              step="1"
              value={form.maxUses}
              onChange={(e) => setField("maxUses", e.target.value)}
              placeholder=""
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Giltig från">
              <Input
                type="date"
                value={form.startsAt}
                onChange={(e) => setField("startsAt", e.target.value)}
              />
            </Field>
            <Field label="Giltig till">
              <Input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setField("expiresAt", e.target.value)}
              />
            </Field>
          </div>

          <Field label="Restauranger (lämna tomt = gäller alla)">
            <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-2 flex flex-col gap-1">
              {(restaurants.data ?? []).map((r: ControlCenterRestaurantSnapshot) => {
                const checked = form.applicableRestaurantIds.includes(r.id);
                return (
                  <label key={r.id} className="flex items-center gap-2 cursor-pointer px-2 py-1 rounded hover:bg-[var(--bg-hover)] text-sm select-none">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setField(
                          "applicableRestaurantIds",
                          checked
                            ? form.applicableRestaurantIds.filter((id) => id !== r.id)
                            : [...form.applicableRestaurantIds, r.id]
                        );
                      }}
                      className="accent-emerald-500 h-3.5 w-3.5 shrink-0"
                    />
                    <span className="text-[var(--text-primary)]">{r.name}</span>
                  </label>
                );
              })}
              {(restaurants.data ?? []).length === 0 && (
                <span className="text-xs text-[var(--text-muted)] px-2 py-1">Inga restauranger</span>
              )}
            </div>
            {form.applicableRestaurantIds.length > 0 && (
              <button
                type="button"
                onClick={() => setField("applicableRestaurantIds", [])}
                className="mt-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] underline"
              >
                Rensa val (gäller alla)
              </button>
            )}
          </Field>

          <Field label="Status">
            <Select
              value={form.isActive ? "active" : "inactive"}
              onChange={(e) => setField("isActive", e.target.value === "active")}
            >
              <option value="active">Aktiv</option>
              <option value="inactive">Inaktiv</option>
            </Select>
          </Field>
        </form>
      </Modal>
    </div>
  );
}
