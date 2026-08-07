"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil, RefreshCw } from "lucide-react";
import { economyQueryKey, getEconomy, updateEconomyRates, type EconomyRates } from "@/modules/finance/api";
import { FinanceWorkspace } from "@/modules/finance/finance-workspace";
import styles from "@/modules/finance/finance-workspace.module.css";
import { invalidateEconomyDomain } from "@/shared/api/invalidate-economy-domain";
import { Badge, Button, ErrorPanel, Field, MoneyInput, PercentInput, Surface } from "@/shared/components/ui";
import { formatCurrencyExact as formatCurrency } from "@/shared/utils/format";

type RateForm = Record<keyof EconomyRates, string>;
type SettingsSection = "rates" | "subscriptions";

const toForm = (rates: EconomyRates): RateForm => Object.fromEntries(
  Object.entries(rates).map(([key, value]) => [key, String(value)]),
) as RateForm;

const parse = (value: string) => Number(value.trim().replace(",", "."));
const toPayload = (form: RateForm): EconomyRates => Object.fromEntries(
  Object.entries(form).map(([key, value]) => [key, parse(value)]),
) as unknown as EconomyRates;

function validate(form: RateForm) {
  const percentages: Array<[keyof EconomyRates, string]> = [
    ["commissionPlatformPct", "Provision när ViaEats levererar"],
    ["commissionSelfPct", "Provision vid egen leverans"],
    ["vatCustomerPct", "Matmoms"],
    ["vatPlatformFeePct", "Moms på ViaEats avgifter"],
  ];
  for (const [key, label] of percentages) {
    const value = parse(form[key]);
    if (!Number.isFinite(value) || value < 0 || value > 100) return `${label} måste vara 0–100 %.`;
  }
  const prices: Array<[keyof EconomyRates, string]> = [
    ["tierGoldFee", "Guld"], ["tierSilverFee", "Silver"], ["tierStandardFee", "Standard"],
  ];
  for (const [key, label] of prices) {
    const value = parse(form[key]);
    if (!Number.isFinite(value) || value < 0) return `${label} måste vara 0 kr eller mer.`;
  }
  return null;
}

const errorMessage = (error: unknown) => {
  const value = error as { response?: { data?: { error?: string } }; message?: string } | null;
  return value?.response?.data?.error || value?.message || "Reglerna kunde inte sparas.";
};

function ValueCard({ label, value, detail }: { label: string; value: React.ReactNode; detail: string }) {
  return (
    <article className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5">
      <p className={styles.microLabel}>{label}</p>
      <p className="mt-2 text-[28px] font-black tracking-[-0.04em] tabular-nums text-[var(--text-primary)]">{value}</p>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-muted)]">{detail}</p>
    </article>
  );
}

export function FinanceSettingsPage({
  embedded = false,
  section = "rates",
}: {
  embedded?: boolean;
  section?: SettingsSection;
} = {}) {
  const queryClient = useQueryClient();
  const economy = useQuery({ queryKey: economyQueryKey, queryFn: getEconomy });
  const [form, setForm] = useState<RateForm | null>(null);
  const [editing, setEditing] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => { if (economy.data && !editing) setForm(toForm(economy.data)); }, [economy.data, editing]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const save = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error("Reglerna har inte laddats.");
      const problem = validate(form);
      if (problem) throw new Error(problem);
      return updateEconomyRates(toPayload(form));
    },
    onSuccess: async () => {
      await invalidateEconomyDomain(queryClient);
      setEditing(false);
    },
  });

  const changed = useMemo(() => Boolean(form && economy.data && JSON.stringify(toPayload(form)) !== JSON.stringify(economy.data)), [economy.data, form]);
  const validationError = form ? validate(form) : null;
  const setValue = (key: keyof EconomyRates) => (value: string) => {
    if (save.isError || save.isSuccess) save.reset();
    setForm((current) => current ? { ...current, [key]: value } : current);
  };
  const content = economy.data;

  const body = economy.isError && !content ? (
    <ErrorPanel title="Reglerna kunde inte laddas" description="Inga reservsatser visas eller kan sparas." action={<Button onClick={() => void economy.refetch()}><RefreshCw size={14} /> Försök igen</Button>} />
  ) : economy.isLoading || !content || !form ? (
    <Surface className="flex items-center gap-2 px-6 py-14 text-sm text-[var(--text-secondary)]"><Loader2 size={16} className="animate-spin" /> Hämtar regler och priser…</Surface>
  ) : (
    <>
      {section === "rates" ? (
        <>
          {!editing ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <ValueCard label="ViaEats levererar" value={`${content.commissionPlatformPct} %`} detail="Global provision när ViaEats ansvarar för leveransen." />
              <ValueCard label="Egen leverans" value={`${content.commissionSelfPct} %`} detail="Global provision när restaurangen levererar själv." />
              <ValueCard label="Moms · mat" value={`${content.vatCustomerPct} %`} detail="Fallback för matmoms när ordersnapshot saknas." />
              <ValueCard label="Moms · ViaEats" value={`${content.vatPlatformFeePct} %`} detail="Moms på provision och abonnemang." />
            </div>
          ) : (
            <Surface className="grid gap-5 p-5 md:grid-cols-2">
              <Field label="Provision · ViaEats levererar" hint="0 % är tillåtet som global sats."><PercentInput min={0} max={100} step={1} value={form.commissionPlatformPct} onValueChange={setValue("commissionPlatformPct")} /></Field>
              <Field label="Provision · egen leverans" hint="Restaurangens eget avtal har alltid företräde."><PercentInput min={0} max={100} step={1} value={form.commissionSelfPct} onValueChange={setValue("commissionSelfPct")} /></Field>
              <Field label="Matmoms"><PercentInput min={0} max={100} step={1} value={form.vatCustomerPct} onValueChange={setValue("vatCustomerPct")} /></Field>
              <Field label="Moms på ViaEats avgifter"><PercentInput min={0} max={100} step={1} value={form.vatPlatformFeePct} onValueChange={setValue("vatPlatformFeePct")} /></Field>
            </Surface>
          )}
        </>
      ) : !editing ? (
        <div className="grid gap-3 md:grid-cols-3">
          <ValueCard label="Guld" value={formatCurrency(content.tierGoldFee)} detail="Globalt månadspris för Guld." />
          <ValueCard label="Silver" value={formatCurrency(content.tierSilverFee)} detail="Globalt månadspris för Silver." />
          <ValueCard label="Standard" value={formatCurrency(content.tierStandardFee)} detail="Globalt månadspris för Standard." />
        </div>
      ) : (
        <Surface className="grid gap-5 p-5 md:grid-cols-3">
          <Field label="Guld · per månad"><MoneyInput min={0} step="0.01" value={form.tierGoldFee} onValueChange={setValue("tierGoldFee")} /></Field>
          <Field label="Silver · per månad"><MoneyInput min={0} step="0.01" value={form.tierSilverFee} onValueChange={setValue("tierSilverFee")} /></Field>
          <Field label="Standard · per månad"><MoneyInput min={0} step="0.01" value={form.tierStandardFee} onValueChange={setValue("tierStandardFee")} /></Field>
        </Surface>
      )}

      {!editing ? (
        <div className="flex justify-end"><Button variant="primary" onClick={() => setEditing(true)}><Pencil size={14} /> Redigera {section === "rates" ? "satser" : "priser"}</Button></div>
      ) : (
        <div className={styles.saveBar}>
          <div className={styles.saveSummary}>
            <strong>{changed ? "Ändringar väntar" : "Inga ändringar"}</strong>
            Låsta rapporter påverkas aldrig.
            {validationError ? <span className="mt-1 block text-[var(--danger)]">{validationError}</span> : null}
            {save.isError ? <span className="mt-1 block text-[var(--danger)]">{errorMessage(save.error)}</span> : null}
          </div>
          <div className="flex gap-2">
            <Button onClick={() => { setForm(toForm(content)); setEditing(false); save.reset(); }}>Avbryt</Button>
            <Button variant="primary" disabled={!changed || Boolean(validationError)} loading={save.isPending} onClick={() => save.mutate()}><Check size={14} /> Spara</Button>
          </div>
        </div>
      )}
      {save.isSuccess ? <p role="status" className="text-right text-xs font-semibold text-[var(--success-text)]">Reglerna är sparade och aktiva för nya upplåsta underlag.</p> : null}
    </>
  );

  if (embedded) return <div className="grid gap-5">{body}</div>;
  return (
    <FinanceWorkspace
      title={section === "rates" ? "Provision" : "Abonnemang"}
      description={section === "rates"
        ? "Globala satser. Ett restaurangavtal kan ersätta dem."
        : "Globala månadspriser. Ett restaurangavtal kan ersätta dem."}
    >
      {body}
    </FinanceWorkspace>
  );
}
