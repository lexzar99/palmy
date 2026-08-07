"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { economyQueryKey, getEconomy, updateEconomyRates, type EconomyRates } from "@/modules/finance/api";
import { invalidateEconomyDomain } from "@/shared/api/invalidate-economy-domain";
import { Button, ErrorPanel, Field, Input, PageHeader, Surface } from "@/shared/components/ui";

type EconomyRateForm = Record<keyof EconomyRates, string>;

const toForm = (rates: EconomyRates): EconomyRateForm => ({
  commissionSelfPct: String(rates.commissionSelfPct),
  commissionPlatformPct: String(rates.commissionPlatformPct),
  vatCustomerPct: String(rates.vatCustomerPct),
  vatPlatformFeePct: String(rates.vatPlatformFeePct),
  tierGoldFee: String(rates.tierGoldFee),
  tierSilverFee: String(rates.tierSilverFee),
  tierStandardFee: String(rates.tierStandardFee),
});

const parseValue = (value: string) => {
  const normalized = value.trim().replace(",", ".");
  return normalized === "" ? Number.NaN : Number(normalized);
};

const mutationErrorMessage = (error: unknown) => {
  const value = error as { response?: { data?: { error?: string } }; message?: string } | null;
  return value?.response?.data?.error || value?.message || "Satserna kunde inte sparas.";
};

function validateForm(form: EconomyRateForm): string | null {
  const percentageFields: Array<[keyof EconomyRates, string]> = [
    ["commissionSelfPct", "Provision vid egen leverans"],
    ["commissionPlatformPct", "Provision när ViaEats levererar"],
    ["vatCustomerPct", "Matmoms"],
    ["vatPlatformFeePct", "Moms på ViaEats avgifter"],
  ];
  for (const [key, label] of percentageFields) {
    const value = parseValue(form[key]);
    if (!Number.isFinite(value) || value < 0 || value > 100) return `${label} måste vara 0–100 %.`;
  }
  const priceFields: Array<[keyof EconomyRates, string]> = [
    ["tierGoldFee", "Guld"],
    ["tierSilverFee", "Silver"],
    ["tierStandardFee", "Standard"],
  ];
  for (const [key, label] of priceFields) {
    const value = parseValue(form[key]);
    if (!Number.isFinite(value) || value < 0) return `${label} måste vara 0 kr eller mer.`;
  }
  return null;
}

const toPayload = (form: EconomyRateForm): EconomyRates => ({
  commissionSelfPct: parseValue(form.commissionSelfPct),
  commissionPlatformPct: parseValue(form.commissionPlatformPct),
  vatCustomerPct: parseValue(form.vatCustomerPct),
  vatPlatformFeePct: parseValue(form.vatPlatformFeePct),
  tierGoldFee: parseValue(form.tierGoldFee),
  tierSilverFee: parseValue(form.tierSilverFee),
  tierStandardFee: parseValue(form.tierStandardFee),
});

export function FinanceSettingsPage({ embedded = false }: { embedded?: boolean } = {}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EconomyRateForm | null>(null);

  const economy = useQuery({ queryKey: economyQueryKey, queryFn: getEconomy });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (economy.data) setForm(toForm(economy.data));
  }, [economy.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const save = useMutation({
    mutationFn: async () => {
      if (!form) throw new Error("Satserna har inte laddats.");
      const validationError = validateForm(form);
      if (validationError) throw new Error(validationError);
      return updateEconomyRates(toPayload(form));
    },
    onSuccess: async () => {
      await invalidateEconomyDomain(queryClient);
    },
  });

  const setValue = (key: keyof EconomyRates) => (event: React.ChangeEvent<HTMLInputElement>) => {
    if (save.isError || save.isSuccess) save.reset();
    setForm((current) => current ? { ...current, [key]: event.target.value } : current);
  };
  const validationError = form ? validateForm(form) : null;
  const loadFailed = economy.isError && !economy.data;
  const saveError = save.isError ? mutationErrorMessage(save.error) : null;
  const saveMessage = validationError || saveError || (save.isSuccess
    ? "Sparat. Nya och upplåsta underlag använder satserna."
    : "Ändringar påverkar nya och upplåsta underlag. Låsta rapporter ändras aldrig.");

  return (
    <div className="page-stack">
      {!embedded ? (
        <PageHeader
          breadcrumb="Restaurangekonomi"
          title="Globala satser"
          actions={
            <Link href="/finance/restauranger" className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-3.5 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
              <ArrowLeft size={15} /> Tillbaka
            </Link>
          }
        />
      ) : null}

      {loadFailed ? (
        <ErrorPanel
          title="Satserna kunde inte laddas"
          description="Inga reservvärden visas eller kan sparas. Försök hämta de riktiga värdena igen."
          action={
            <Button onClick={() => void economy.refetch()} disabled={economy.isFetching}>
              <RefreshCw size={15} className={economy.isFetching ? "animate-spin" : undefined} /> Försök igen
            </Button>
          }
        />
      ) : economy.isLoading || !form ? (
        <Surface className="flex items-center gap-2 px-6 py-12 text-sm text-[var(--text-secondary)]">
          <Loader2 size={16} className="animate-spin" /> Hämtar sparade satser…
        </Surface>
      ) : (
        <>
          {economy.isError ? (
            <Surface className="border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-3 text-sm font-semibold text-[var(--text-secondary)]">
              Senaste uppdateringen misslyckades. Spara är avstängt tills de aktuella värdena har hämtats igen.
            </Surface>
          ) : null}

          <Surface className="overflow-hidden p-0">
            <div className="grid gap-5 px-5 py-5 lg:grid-cols-[180px_1fr]">
              <div>
                <p className="text-sm font-black text-[var(--text-primary)]">Provision</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Standard när restaurangen saknar eget avtal.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Restaurangen levererar">
                  <Input type="number" min={0} max={100} step={1} value={form.commissionSelfPct} onChange={setValue("commissionSelfPct")} />
                </Field>
                <Field label="ViaEats levererar">
                  <Input type="number" min={0} max={100} step={1} value={form.commissionPlatformPct} onChange={setValue("commissionPlatformPct")} />
                </Field>
              </div>
            </div>

            <div className="grid gap-5 border-t border-[var(--border-subtle)] px-5 py-5 lg:grid-cols-[180px_1fr]">
              <div>
                <p className="text-sm font-black text-[var(--text-primary)]">Moms</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Används när nya underlag beräknas.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Mat / kund">
                  <Input type="number" min={0} max={100} step={1} value={form.vatCustomerPct} onChange={setValue("vatCustomerPct")} />
                </Field>
                <Field label="ViaEats avgifter">
                  <Input type="number" min={0} max={100} step={1} value={form.vatPlatformFeePct} onChange={setValue("vatPlatformFeePct")} />
                </Field>
              </div>
            </div>

            <div className="grid gap-5 border-t border-[var(--border-subtle)] px-5 py-5 lg:grid-cols-[180px_1fr]">
              <div>
                <p className="text-sm font-black text-[var(--text-primary)]">Abonnemang</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">Pris per kalendermånad.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Guld">
                  <Input type="number" min={0} step="0.01" value={form.tierGoldFee} onChange={setValue("tierGoldFee")} />
                </Field>
                <Field label="Silver">
                  <Input type="number" min={0} step="0.01" value={form.tierSilverFee} onChange={setValue("tierSilverFee")} />
                </Field>
                <Field label="Standard">
                  <Input type="number" min={0} step="0.01" value={form.tierStandardFee} onChange={setValue("tierStandardFee")} />
                </Field>
              </div>
            </div>
          </Surface>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p
              role={saveError ? "alert" : "status"}
              aria-live="polite"
              className={`text-xs font-semibold ${
                validationError || saveError
                  ? "text-[var(--danger)]"
                  : save.isSuccess
                    ? "text-[var(--success-text)]"
                    : "text-[var(--text-muted)]"
              }`}
            >
              {saveMessage}
            </p>
            <Button
              variant="primary"
              disabled={Boolean(validationError) || economy.isError || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <Loader2 size={16} className="animate-spin" /> : null}
              Spara satser
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
