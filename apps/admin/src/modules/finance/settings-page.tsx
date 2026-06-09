"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { economyQueryKey, getEconomy, updateEconomyRates, type EconomyRates } from "@/modules/finance/api";
import { Button, Field, Input, PageHeader, Surface } from "@/shared/components/ui";

const FALLBACK: EconomyRates = {
  commissionSelfPct: 10,
  commissionPlatformPct: 20,
  vatCustomerPct: 6,
  vatPlatformFeePct: 25,
  tierGoldFee: 1000,
  tierSilverFee: 700,
  tierStandardFee: 0,
};

export function FinanceSettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EconomyRates>(FALLBACK);

  const economy = useQuery({ queryKey: economyQueryKey, queryFn: getEconomy });

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (economy.data) setForm(economy.data);
  }, [economy.data]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const save = useMutation({
    mutationFn: () => updateEconomyRates(form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["finance"] });
      router.push("/finance");
    },
  });

  const num = (k: keyof EconomyRates) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: Number(e.target.value) }));

  return (
    <div className="page-stack">
      <PageHeader
        title="Provision, moms & abonnemang"
        actions={
          <Link href="/finance" className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-3.5 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
            <ArrowLeft size={15} /> Tillbaka
          </Link>
        }
      />

      {economy.isLoading ? (
        <Surface className="flex items-center gap-2 px-6 py-12 text-sm text-[var(--text-secondary)]">
          <Loader2 size={16} className="animate-spin" /> Laddar satser…
        </Surface>
      ) : (
        <>
          <Surface className="px-6 py-6">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Provision (%)</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Global standard. Per restaurang kan satsen åsidosättas på utbetalningssidan.</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <Field label="Levererar själv"><Input type="number" value={form.commissionSelfPct} onChange={num("commissionSelfPct")} /></Field>
              <Field label="Vi levererar"><Input type="number" value={form.commissionPlatformPct} onChange={num("commissionPlatformPct")} /></Field>
            </div>
          </Surface>

          <Surface className="px-6 py-6">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Moms (%)</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              <Field label="Kund / mat (6 → 12)"><Input type="number" value={form.vatCustomerPct} onChange={num("vatCustomerPct")} /></Field>
              <Field label="Våra avgifter (B2B, 25)"><Input type="number" value={form.vatPlatformFeePct} onChange={num("vatPlatformFeePct")} /></Field>
            </div>
          </Surface>

          <Surface className="px-6 py-6">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Abonnemang (kr/mån)</p>
            <div className="mt-3 grid gap-4 md:grid-cols-3">
              <Field label="Guld"><Input type="number" value={form.tierGoldFee} onChange={num("tierGoldFee")} /></Field>
              <Field label="Silver"><Input type="number" value={form.tierSilverFee} onChange={num("tierSilverFee")} /></Field>
              <Field label="Standard"><Input type="number" value={form.tierStandardFee} onChange={num("tierStandardFee")} /></Field>
            </div>
          </Surface>

          <div className="flex justify-end gap-2">
            <Link href="/finance" className="inline-flex items-center rounded-xl border border-[var(--border-subtle)] px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Avbryt</Link>
            <Button variant="primary" onClick={() => save.mutate()}>
              {save.isPending ? <Loader2 size={16} className="animate-spin" /> : "Spara satser"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
