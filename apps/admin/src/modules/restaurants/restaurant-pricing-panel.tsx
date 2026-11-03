"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Badge, Button, Field, MoneyInput, PercentInput } from "@/shared/components/ui";
import { economyQueryKey, getEconomy, saveRestaurantFinanceAgreement } from "@/modules/finance/api";
import type { RestaurantDetail } from "@/modules/restaurants/api";
import { invalidateEconomyDomain } from "@/shared/api/invalidate-economy-domain";

/**
 * Restaurangens prismodell. Alla betalar provision, och vissa betalar också en
 * fast avgift per månad.
 *
 * Sparas via samma avtal som Ekonomi → Avtal (PATCH .../finance/restaurants/:id/agreement),
 * så utbetalningarna räknar exakt som där. Den fasta avgiften lagras som
 * restaurangens pris för sin nivå (featuredClass), eftersom det är så
 * utbetalningsmodellen läser abonnemanget. "Bara provision" sparas som 0 kr, så
 * en senare höjning av en nivås standardpris inte ger restaurangen en avgift.
 */

type TierKey = "tierGoldFeeOverride" | "tierSilverFeeOverride" | "tierStandardFeeOverride";
type GlobalTierKey = "tierGoldFee" | "tierSilverFee" | "tierStandardFee";

function tierKeys(featuredClass: number | null | undefined): { key: TierKey; globalKey: GlobalTierKey } {
  if (featuredClass === 1) return { key: "tierGoldFeeOverride", globalKey: "tierGoldFee" };
  if (featuredClass === 2) return { key: "tierSilverFeeOverride", globalKey: "tierSilverFee" };
  return { key: "tierStandardFeeOverride", globalKey: "tierStandardFee" };
}

type Model = "commission" | "fixed";

const parseWhole = (value: string) => (value.trim() === "" ? null : Number(value.replace(",", ".")));

export function RestaurantPricingPanel({ restaurantId, detail }: { restaurantId: string; detail: RestaurantDetail }) {
  const queryClient = useQueryClient();
  const economy = useQuery({ queryKey: economyQueryKey, queryFn: getEconomy });
  const { key, globalKey } = tierKeys(detail.featuredClass);
  const currentFee = detail[key];
  const globalFee = economy.data ? economy.data[globalKey] : 0;
  const effectiveFee = currentFee ?? globalFee;
  const globalCommission = economy.data
    ? (detail.selfDelivery ? economy.data.commissionSelfPct : economy.data.commissionPlatformPct)
    : null;

  const initial = useMemo(() => ({
    model: (effectiveFee > 0 ? "fixed" : "commission") as Model,
    customCommission: detail.commissionPctOverride != null,
    commission: detail.commissionPctOverride != null ? String(detail.commissionPctOverride) : "",
    fee: effectiveFee > 0 ? String(effectiveFee) : "",
  }), [detail.commissionPctOverride, effectiveFee]);

  const [model, setModel] = useState<Model>(initial.model);
  const [customCommission, setCustomCommission] = useState(initial.customCommission);
  const [commission, setCommission] = useState(initial.commission);
  const [fee, setFee] = useState(initial.fee);

  // Ladda om fälten när servern har nya värden (efter sparning eller i en annan flik).
  useEffect(() => {
    setModel(initial.model);
    setCustomCommission(initial.customCommission);
    setCommission(initial.commission);
    setFee(initial.fee);
  }, [initial]);

  const commissionValue = parseWhole(commission);
  const feeValue = parseWhole(fee);
  const commissionError = customCommission && (commissionValue == null || !Number.isInteger(commissionValue) || commissionValue < 0 || commissionValue > 100)
    ? "Ange en provision mellan 0 och 100 %."
    : null;
  const feeError = model === "fixed" && (feeValue == null || !Number.isFinite(feeValue) || feeValue <= 0)
    ? "Ange den fasta avgiften i kronor per månad."
    : null;
  const effectiveCommission = customCommission ? commissionValue : globalCommission;
  const changed =
    model !== initial.model ||
    customCommission !== initial.customCommission ||
    (customCommission && commission !== initial.commission) ||
    (model === "fixed" && fee !== initial.fee);

  const save = useMutation({
    meta: { successMessage: "Prismodellen är sparad" },
    mutationFn: async () => {
      if (commissionError || feeError) throw new Error(commissionError || feeError || "Kontrollera prismodellen.");
      return saveRestaurantFinanceAgreement(restaurantId, {
        selfDelivery: detail.selfDelivery ?? false,
        commissionMode: customCommission ? "CUSTOM" : "GLOBAL",
        commissionPct: customCommission ? commissionValue : null,
        [key]: model === "fixed" ? feeValue : 0,
      });
    },
    onSuccess: () => invalidateEconomyDomain(queryClient),
  });

  return (
    <div className="grid gap-3.5 border-t border-[var(--row-divider)] pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Prismodell</p>
        <Badge tone={model === "fixed" ? "info" : "neutral"}>
          {model === "fixed"
            ? `${feeValue && feeValue > 0 ? `${feeValue} kr/mån` : "Fast avgift"} + ${effectiveCommission ?? "–"} %`
            : `${effectiveCommission ?? "–"} % provision`}
        </Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {([
          ["commission", "Bara provision", "En procentsats på varje order, ingen månadsavgift."],
          ["fixed", "Fast avgift + provision", "En fast avgift varje månad och provision på varje order."],
        ] as const).map(([value, title, sub]) => (
          <button
            key={value}
            type="button"
            onClick={() => setModel(value)}
            className={`onb-choice${model === value ? " is-selected" : ""}`}
          >
            <span className="onb-choice-title">{title}</span>
            <span className="onb-choice-sub">{sub}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Provision"
          hint={customCommission
            ? "Restaurangens egen sats. 0 % = provisionsfritt."
            : `Standard för alla: ${globalCommission ?? "–"} %. Ändras under Ekonomi → Inställningar.`}
        >
          <div className="grid gap-2">
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                className={`rounded-full border px-3 py-1 ${!customCommission ? "border-[var(--text-primary)] font-semibold" : "border-[var(--border-subtle)] text-[var(--text-muted)]"}`}
                onClick={() => setCustomCommission(false)}
              >
                Standard {globalCommission != null ? `(${globalCommission} %)` : ""}
              </button>
              <button
                type="button"
                className={`rounded-full border px-3 py-1 ${customCommission ? "border-[var(--text-primary)] font-semibold" : "border-[var(--border-subtle)] text-[var(--text-muted)]"}`}
                onClick={() => {
                  setCustomCommission(true);
                  if (!commission && globalCommission != null) setCommission(String(globalCommission));
                }}
              >
                Egen sats
              </button>
            </div>
            {customCommission ? (
              <PercentInput min={0} max={100} step={1} integer value={commission} onValueChange={setCommission} aria-label="Egen provision" />
            ) : null}
          </div>
        </Field>
        {model === "fixed" ? (
          <Field label="Fast avgift" hint="Kronor per månad, exklusive moms.">
            <MoneyInput min={0} step={1} value={fee} onValueChange={setFee} placeholder="750" aria-label="Fast avgift per månad" />
          </Field>
        ) : null}
      </div>

      {commissionError || feeError ? (
        <p className="text-xs text-[var(--danger)]">{commissionError || feeError}</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/finance/${restaurantId}/avtal`} className="text-xs text-[var(--text-muted)] hover:underline">
          Se hur det blir på utbetalningen
        </Link>
        <Button
          variant="primary"
          type="button"
          loading={save.isPending}
          disabled={!changed || Boolean(commissionError || feeError) || !economy.data}
          onClick={() => save.mutate()}
        >
          Spara prismodell
        </Button>
      </div>
    </div>
  );
}
