"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Loader2,
  Percent,
  ReceiptText,
  RefreshCw,
  Save,
  Store,
  Truck,
} from "lucide-react";
import {
  economyQueryKey,
  getEconomy,
  getPayoutSpec,
  payoutSpecQueryKey,
  saveRestaurantFinanceAgreement,
  type PayoutSpec,
} from "@/modules/finance/api";
import { FinanceWorkspace, financeQuery } from "@/modules/finance/finance-workspace";
import { RestaurantFinanceNav } from "@/modules/finance/restaurant-finance-nav";
import { invalidateEconomyDomain } from "@/shared/api/invalidate-economy-domain";
import { Badge, Button, ErrorPanel, MoneyInput, PercentInput, Surface } from "@/shared/components/ui";
import { formatCurrencyExact as formatCurrency } from "@/shared/utils/format";

type AgreementMode = "global" | "custom";
type TierOverrideKey =
  | "tierGoldFeeOverride"
  | "tierSilverFeeOverride"
  | "tierStandardFeeOverride";

const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function monthRange(from?: string, to?: string, requestedMonth?: string) {
  const monthMatch = requestedMonth?.match(/^(\d{4})-(\d{2})$/);
  const dateMatch = (from || to)?.match(/^(\d{4})-(\d{2})-\d{2}$/);
  const now = new Date();
  const year = Number(monthMatch?.[1] || dateMatch?.[1] || now.getFullYear());
  const monthIndex = Number(monthMatch?.[2] || dateMatch?.[2] || now.getMonth() + 1) - 1;
  const start = isoDate(new Date(year, monthIndex, 1));
  const end = isoDate(new Date(year, monthIndex + 1, 0));
  return {
    from: start,
    to: end,
    month: `${year}-${String(monthIndex + 1).padStart(2, "0")}`,
    label: new Intl.DateTimeFormat("sv-SE", { month: "long", year: "numeric" }).format(new Date(year, monthIndex, 1)),
  };
}

const parseNumber = (value: string) => Number(value.trim().replace(",", "."));

const mutationMessage = (error: unknown) => {
  const value = error as { response?: { data?: { error?: string } }; message?: string } | null;
  return value?.response?.data?.error || value?.message || "Avtalet kunde inte sparas.";
};

function tierContract(spec: PayoutSpec) {
  const tier = spec.restaurant.featuredClass;
  if (tier === 1) {
    return {
      key: "tierGoldFeeOverride" as TierOverrideKey,
      globalKey: "tierGoldFee" as const,
      label: spec.breakdown.tierLabel || "Guld",
    };
  }
  if (tier === 2) {
    return {
      key: "tierSilverFeeOverride" as TierOverrideKey,
      globalKey: "tierSilverFee" as const,
      label: spec.breakdown.tierLabel || "Silver",
    };
  }
  return {
    key: "tierStandardFeeOverride" as TierOverrideKey,
    globalKey: "tierStandardFee" as const,
    label: spec.breakdown.tierLabel || "Standard",
  };
}

function ChoiceCard({
  name,
  checked,
  onChange,
  title,
  description,
  icon,
  badge,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  description: ReactNode;
  icon: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <label
      className={`relative flex min-h-[94px] cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-all ${
        checked
          ? "border-[var(--brand-navy)] bg-[var(--brand-navy-soft)] shadow-[0_0_0_1px_var(--brand-navy)]"
          : "border-[var(--border-subtle)] bg-[var(--bg-panel-strong)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-hover)]"
      }`}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      <span
        className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
          checked ? "bg-[var(--brand-navy)] text-white" : "bg-[var(--bg-page)] text-[var(--text-secondary)]"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-black text-[var(--text-primary)]">{title}</span>
          {badge}
        </span>
        <span className="mt-1 block text-xs font-medium leading-5 text-[var(--text-secondary)]">{description}</span>
      </span>
      <span
        className={`mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
          checked ? "border-[var(--brand-navy)] bg-[var(--brand-navy)] text-white" : "border-[var(--border-strong)]"
        }`}
        aria-hidden
      >
        {checked ? <Check size={12} strokeWidth={3} /> : null}
      </span>
    </label>
  );
}

function ContractCard({
  index,
  icon,
  title,
  meta,
  children,
}: {
  index: string;
  icon: ReactNode;
  title: string;
  meta: ReactNode;
  children: ReactNode;
}) {
  return (
    <Surface className="overflow-hidden p-0">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--brand-navy-soft)] text-[var(--brand-navy-ink)]">
            {icon}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--text-muted)]">{index}</p>
            <h2 className="truncate text-base font-black text-[var(--text-primary)]">{title}</h2>
          </div>
        </div>
        <div className="shrink-0 text-right text-xs font-bold text-[var(--text-secondary)]">{meta}</div>
      </div>
      <div className="space-y-3 p-5">{children}</div>
    </Surface>
  );
}

function SummaryValue({ label, value, badge }: { label: string; value: ReactNode; badge?: ReactNode }) {
  return (
    <div className="min-w-0 border-white/10 px-5 py-4 sm:border-l sm:first:border-l-0">
      <p className="text-[10px] font-black uppercase tracking-[0.15em] text-white/55">{label}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-lg font-black text-white">
        {value}
        {badge}
      </div>
    </div>
  );
}

export function FinanceTermsPage({
  restaurantId,
  from,
  to,
  month,
  period,
}: {
  restaurantId: string;
  from?: string;
  to?: string;
  month?: string;
  period?: string;
}) {
  const range = useMemo(() => monthRange(from, to, month), [from, month, to]);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selfDelivery, setSelfDelivery] = useState(false);
  const [commissionMode, setCommissionMode] = useState<AgreementMode>("global");
  const [customCommission, setCustomCommission] = useState("");
  const [subscriptionMode, setSubscriptionMode] = useState<AgreementMode>("global");
  const [customSubscription, setCustomSubscription] = useState("");
  const [initializedSignature, setInitializedSignature] = useState<string | null>(null);

  const spec = useQuery({
    queryKey: payoutSpecQueryKey(restaurantId, range.from, range.to),
    queryFn: () => getPayoutSpec(restaurantId, range.from, range.to),
  });
  const economy = useQuery({ queryKey: economyQueryKey, queryFn: getEconomy });
  const data = spec.data;
  const tier = data ? tierContract(data) : null;
  const currentTierOverride = data && tier ? data.restaurant[tier.key] : null;

  const signature = data && tier
    ? [
        restaurantId,
        data.period.from,
        data.period.to,
        data.restaurant.selfDelivery,
        data.restaurant.commissionPctOverride ?? "global",
        tier.key,
        currentTierOverride ?? "global",
      ].join(":")
    : null;

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!data || !tier || !signature || initializedSignature === signature) return;
    setInitializedSignature(signature);
    setSelfDelivery(data.restaurant.selfDelivery);
    setCommissionMode(data.restaurant.commissionPctOverride == null ? "global" : "custom");
    setCustomCommission(data.restaurant.commissionPctOverride == null ? "" : String(data.restaurant.commissionPctOverride));
    setSubscriptionMode(currentTierOverride == null ? "global" : "custom");
    setCustomSubscription(currentTierOverride == null ? "" : String(currentTierOverride));
  }, [currentTierOverride, data, initializedSignature, signature, tier]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const customCommissionValue = parseNumber(customCommission);
  const customSubscriptionValue = parseNumber(customSubscription);
  const commissionError = commissionMode === "custom" && (
    customCommission.trim() === "" ||
    !Number.isFinite(customCommissionValue) ||
    !Number.isInteger(customCommissionValue) ||
    customCommissionValue < 0 ||
    customCommissionValue > 100
  )
    ? "Ange ett heltal 0–100 %. 0 % är provisionsfritt."
    : null;
  const subscriptionError = subscriptionMode === "custom" && (
    customSubscription.trim() === "" ||
    !Number.isFinite(customSubscriptionValue) ||
    customSubscriptionValue < 0
  )
    ? "Ange ett belopp på 0 kr eller mer."
    : null;

  const globalCommission = economy.data
    ? (selfDelivery ? economy.data.commissionSelfPct : economy.data.commissionPlatformPct)
    : 0;
  const nextCommission = commissionMode === "custom" ? customCommissionValue : globalCommission;
  const globalSubscription = economy.data && tier ? economy.data[tier.globalKey] : 0;
  const nextSubscription = subscriptionMode === "custom" ? customSubscriptionValue : globalSubscription;
  const nextCommissionOverride = commissionMode === "global" ? null : customCommissionValue;
  const nextSubscriptionOverride = subscriptionMode === "global" ? null : customSubscriptionValue;
  const currentCommissionOverride = data?.restaurant.commissionPctOverride ?? null;

  const changed = Boolean(data && tier && (
    selfDelivery !== data.restaurant.selfDelivery ||
    commissionMode !== (currentCommissionOverride == null ? "global" : "custom") ||
    (commissionMode === "custom" && nextCommissionOverride !== currentCommissionOverride) ||
    subscriptionMode !== (currentTierOverride == null ? "global" : "custom") ||
    (subscriptionMode === "custom" && nextSubscriptionOverride !== currentTierOverride)
  ));

  const save = useMutation({
    mutationFn: async () => {
      if (!data || !tier || !economy.data) throw new Error("Avtalet har inte laddats klart.");
      if (commissionError || subscriptionError) throw new Error(commissionError || subscriptionError || "Kontrollera avtalet.");
      const expectedCommissionOverride = commissionMode === "global" ? null : customCommissionValue;
      const result = await saveRestaurantFinanceAgreement(restaurantId, {
        selfDelivery,
        commissionMode: commissionMode === "global" ? "GLOBAL" : "CUSTOM",
        commissionPct: expectedCommissionOverride,
        [tier.key]: subscriptionMode === "global" ? null : customSubscriptionValue,
      });
      if (result.restaurant.commissionPctOverride !== expectedCommissionOverride) {
        throw new Error("Servern bekräftade inte den valda provisionssatsen.");
      }
      return result;
    },
    onSuccess: async () => {
      await invalidateEconomyDomain(queryClient);
    },
  });

  const startEdit = (edit: () => void) => {
    if (save.isError || save.isSuccess) save.reset();
    edit();
  };

  const changeMonth = (nextMonth: string) => {
    const params = new URLSearchParams(financeQuery(nextMonth));
    if (period) params.set("period", period);
    router.push(`/finance/${restaurantId}/avtal?${params.toString()}`);
  };

  const renderWorkspace = (content: ReactNode) => (
    <FinanceWorkspace
      title={data?.restaurant.name || "Restaurangavtal"}
      description={data
        ? [data.restaurant.legalName, data.restaurant.organizationNumber, "Avtalsvillkor"].filter(Boolean).join(" · ")
        : "Restaurangens ekonomiska villkor."}
      month={range.month}
      onMonthChange={changeMonth}
      onRefresh={() => void Promise.all([spec.refetch(), economy.refetch()])}
      refreshing={spec.isFetching || economy.isFetching}
      actions={data ? (
        data.restaurant.commissionPctOverride === 0
          ? <Badge tone="success">Provisionsfri · 0 %</Badge>
          : <Badge tone="info">{data.restaurant.commissionPctOverride == null ? "Standardavtal" : "Eget avtal"}</Badge>
      ) : null}
    >
      <RestaurantFinanceNav
        restaurantId={restaurantId}
        active="agreement"
        month={range.month}
        from={range.from}
        to={range.to}
        period={period}
      />
      {content}
    </FinanceWorkspace>
  );

  if ((spec.isError && !data) || (economy.isError && !economy.data)) {
    return renderWorkspace(
      <ErrorPanel
        title="Avtalet kunde inte laddas"
        description="Försök igen innan du ändrar restaurangens ekonomiska villkor."
        action={
          <Button onClick={() => void Promise.all([spec.refetch(), economy.refetch()])}>
            <RefreshCw size={15} /> Försök igen
          </Button>
        }
      />,
    );
  }

  if (!data || !tier || !economy.data || initializedSignature !== signature) {
    return renderWorkspace(
      <Surface className="flex min-h-[280px] items-center justify-center gap-2 text-sm font-semibold text-[var(--text-secondary)]">
        <Loader2 size={17} className="animate-spin" /> Hämtar avtal…
      </Surface>,
    );
  }

  const originalDelivery = data.restaurant.selfDelivery ? "Egen leverans" : "ViaEats levererar";
  const nextDelivery = selfDelivery ? "Egen leverans" : "ViaEats levererar";
  const originalCommissionContract = currentCommissionOverride == null
    ? `Standard · ${formatPercent(data.breakdown.commissionPct)}`
    : `Eget · ${formatPercent(currentCommissionOverride)}`;
  const nextCommissionContract = commissionMode === "global"
    ? `Standard · ${formatPercent(globalCommission)}`
    : `Eget · ${formatPercent(nextCommission)}`;
  const originalSubscriptionContract = currentTierOverride == null
    ? `Standard · ${formatCurrency(data.breakdown.subscription)}`
    : `Eget · ${formatCurrency(currentTierOverride)}`;
  const nextSubscriptionContract = subscriptionMode === "global"
    ? `Standard · ${formatCurrency(globalSubscription)}`
    : `Eget · ${formatCurrency(nextSubscription)}`;
  const changes = [
    originalDelivery !== nextDelivery ? { label: "Leverans", before: originalDelivery, after: nextDelivery } : null,
    originalCommissionContract !== nextCommissionContract
      ? { label: "Provision", before: originalCommissionContract, after: nextCommissionContract }
      : null,
    originalSubscriptionContract !== nextSubscriptionContract
      ? { label: "Abonnemang", before: originalSubscriptionContract, after: nextSubscriptionContract }
      : null,
  ].filter((item): item is { label: string; before: string; after: string } => Boolean(item));

  return renderWorkspace(
    <>
      <Surface className="overflow-hidden border-0 bg-[var(--brand-navy)] p-0 text-white shadow-[0_18px_42px_rgba(10,35,64,0.16)]">
        <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10"><Building2 size={19} /></span>
            <div className="min-w-0">
              <p className="truncate text-sm font-black">Aktiva avtalsvillkor</p>
              <p className="mt-0.5 capitalize text-xs font-semibold text-white/60">{range.label} · {tier.label}</p>
            </div>
          </div>
          {currentCommissionOverride === 0 ? <Badge tone="success">Provisionsfri · 0 %</Badge> : <Badge tone="info">{currentCommissionOverride == null ? "Standardavtal" : "Eget avtal"}</Badge>}
        </div>
        <div className="grid sm:grid-cols-3">
          <SummaryValue label="Leverans" value={originalDelivery} />
          <SummaryValue label="Provision" value={formatPercent(data.breakdown.commissionPct)} badge={currentCommissionOverride === 0 ? <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] text-emerald-200">Eget</span> : null} />
          <SummaryValue label={`Abonnemang · ${tier.label}`} value={formatCurrency(data.breakdown.subscription)} />
        </div>
      </Surface>

      {(spec.isError || economy.isError) ? (
        <div className="rounded-xl border border-[var(--warning)] bg-[var(--warning-soft)] px-4 py-3 text-sm font-bold text-[var(--text-secondary)]">
          Uppdateringen misslyckades. Du ser senast hämtade avtal.
        </div>
      ) : null}

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <ContractCard index="01" icon={<Truck size={18} />} title="Leveransmodell" meta={nextDelivery}>
          <ChoiceCard
            name="delivery-model"
            checked={selfDelivery}
            onChange={() => startEdit(() => setSelfDelivery(true))}
            icon={<Store size={17} />}
            title="Egen leverans"
            description={`Restaurangen kör ut. Standardsats ${formatPercent(economy.data.commissionSelfPct)}.`}
          />
          <ChoiceCard
            name="delivery-model"
            checked={!selfDelivery}
            onChange={() => startEdit(() => setSelfDelivery(false))}
            icon={<Truck size={17} />}
            title="ViaEats levererar"
            description={`ViaEats ansvarar för leveransen. Standardsats ${formatPercent(economy.data.commissionPlatformPct)}.`}
          />
        </ContractCard>

        <ContractCard
          index="02"
          icon={<Percent size={18} />}
          title="Provision"
          meta={commissionMode === "custom" && nextCommission === 0 ? <Badge tone="success">0 % · provisionsfri</Badge> : formatPercent(nextCommission)}
        >
          <ChoiceCard
            name="commission-model"
            checked={commissionMode === "global"}
            onChange={() => startEdit(() => setCommissionMode("global"))}
            icon={<Building2 size={17} />}
            title="Standardavtal"
            description={`${nextDelivery}: ${formatPercent(globalCommission)}. Följer globala satser.`}
          />
          <ChoiceCard
            name="commission-model"
            checked={commissionMode === "custom"}
            onChange={() => startEdit(() => {
              setCommissionMode("custom");
              if (customCommission.trim() === "") setCustomCommission(String(currentCommissionOverride ?? globalCommission));
            })}
            icon={<Percent size={17} />}
            title="Eget avtal"
            description="Fast sats för restaurangen. 0 % betyder provisionsfri."
            badge={commissionMode === "custom" && nextCommission === 0 ? <Badge tone="success">Provisionsfri</Badge> : null}
          />
          {commissionMode === "custom" ? (
            <div className={`rounded-2xl border p-4 ${commissionError ? "border-[var(--danger)] bg-[var(--danger-soft)]" : "border-[var(--border-subtle)] bg-[var(--bg-page)]"}`}>
              <label htmlFor="custom-commission" className="mb-2 block text-xs font-black text-[var(--text-primary)]">Egen provision</label>
              <PercentInput
                id="custom-commission"
                value={customCommission}
                onValueChange={(value) => startEdit(() => setCustomCommission(value))}
                min={0}
                max={100}
                step={1}
                integer
                autoFocus
              />
              <p className={`mt-2 text-xs font-semibold ${commissionError ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`}>
                {commissionError || (nextCommission === 0 ? "Provisionsfritt avtal sparas som exakt 0 %." : "Gäller tills avtalet återställs till standard.")}
              </p>
            </div>
          ) : null}
        </ContractCard>

        <ContractCard
          index="03"
          icon={<ReceiptText size={18} />}
          title="Abonnemang"
          meta={`${tier.label} · ${formatCurrency(nextSubscription)}`}
        >
          <ChoiceCard
            name="subscription-model"
            checked={subscriptionMode === "global"}
            onChange={() => startEdit(() => setSubscriptionMode("global"))}
            icon={<ReceiptText size={17} />}
            title="Standardpris"
            description={`${tier.label}: ${formatCurrency(globalSubscription)} per månad exkl. moms.`}
          />
          <ChoiceCard
            name="subscription-model"
            checked={subscriptionMode === "custom"}
            onChange={() => startEdit(() => {
              setSubscriptionMode("custom");
              if (customSubscription.trim() === "") setCustomSubscription(String(currentTierOverride ?? globalSubscription));
            })}
            icon={<Store size={17} />}
            title="Eget pris"
            description={`Fast månadspris för restaurangens aktuella ${tier.label}-tier.`}
          />
          {subscriptionMode === "custom" ? (
            <div className={`rounded-2xl border p-4 ${subscriptionError ? "border-[var(--danger)] bg-[var(--danger-soft)]" : "border-[var(--border-subtle)] bg-[var(--bg-page)]"}`}>
              <label htmlFor="custom-subscription" className="mb-2 block text-xs font-black text-[var(--text-primary)]">Eget månadspris · exkl. moms</label>
              <MoneyInput
                id="custom-subscription"
                value={customSubscription}
                onValueChange={(value) => startEdit(() => setCustomSubscription(value))}
                min={0}
                step={1}
              />
              <p className={`mt-2 text-xs font-semibold ${subscriptionError ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}`}>
                {subscriptionError || `Övriga tierpriser ändras inte.`}
              </p>
            </div>
          ) : null}
        </ContractCard>
      </div>

      <div className="sticky bottom-3 z-20 rounded-2xl border border-[var(--border-strong)] bg-[color:var(--bg-panel-strong)]/95 p-3 shadow-[0_16px_44px_rgba(10,35,64,0.20)] backdrop-blur-xl">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 flex-1">
            {changes.length ? (
              <div className="grid gap-2 sm:grid-cols-3">
                {changes.map((change) => (
                  <div key={change.label} className="min-w-0 rounded-xl bg-[var(--bg-page)] px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--text-muted)]">{change.label}</p>
                    <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs font-bold text-[var(--text-primary)]">
                      <span className="truncate text-[var(--text-muted)] line-through">{change.before}</span>
                      <ArrowRight size={12} className="shrink-0 text-[var(--accent)]" />
                      <span className="truncate">{change.after}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 px-2 py-1 text-sm font-bold text-[var(--text-secondary)]">
                <CheckCircle2 size={17} className="text-[var(--success)]" /> Avtalet är sparat
              </div>
            )}
            {save.isError ? <p className="mt-2 px-2 text-xs font-bold text-[var(--danger)]" role="alert">{mutationMessage(save.error)}</p> : null}
            {save.isSuccess && !changed ? <p className="mt-2 px-2 text-xs font-bold text-[var(--success)]" aria-live="polite">Ändringarna är sparade och ekonomin är uppdaterad.</p> : null}
          </div>
          <Button
            variant="primary"
            className="min-h-11 shrink-0 px-5"
            loading={save.isPending}
            disabled={!changed || Boolean(commissionError || subscriptionError) || spec.isFetching || economy.isFetching}
            onClick={() => save.mutate()}
          >
            {!save.isPending ? <Save size={16} /> : null} Spara avtal
          </Button>
        </div>
      </div>
    </>,
  );
}

function formatPercent(value: number) {
  return `${Number(value || 0).toLocaleString("sv-SE", { maximumFractionDigits: 2 })} %`;
}
