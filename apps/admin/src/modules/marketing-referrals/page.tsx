"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  Gift,
  List,
  Loader2,
  Save,
  ShieldAlert,
  Sparkles,
  Trophy,
  UserPlus,
} from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Surface,
} from "@/shared/components/ui";
import { formatCurrency, formatNumber } from "@/shared/utils/format";
import {
  createPersonalDeal,
  getReferralStats,
  getWelcomeDealSettings,
  referralStatsQueryKey,
  updateWelcomeDealSettings,
  welcomeDealQueryKey,
  type CreatePersonalDealPayload,
  type PersonalDealType,
  type WelcomeDealSettings,
} from "@/modules/marketing-referrals/api";

// Format-helper för deal-display. discountType + freeDelivery kan stacka:
//   "25%" / "50 kr" / "Fri leverans" / "25% + Fri leverans".
type DealForLabel = {
  discountType: string;
  discountValue: number;
  freeDelivery?: boolean;
  title: string;
};

function rewardParts(d: DealForLabel): string[] {
  const parts: string[] = [];
  if (d.discountType === "PERCENTAGE" && d.discountValue > 0) {
    parts.push(`${d.discountValue}%`);
  } else if ((d.discountType === "FIXED" || d.discountType === "FIXED_PRICE") && d.discountValue > 0) {
    parts.push(`${d.discountValue} kr`);
  } else if (d.discountType === "FREE_DELIVERY") {
    // Legacy: gamla deals lagras med discountType=FREE_DELIVERY.
    parts.push("Fri leverans");
    return parts;
  }
  if (d.freeDelivery) parts.push("Fri leverans");
  return parts;
}

function formatDealLabel(d: DealForLabel): string {
  const parts = rewardParts(d);
  return parts.length > 0 ? `${d.title} (${parts.join(" + ")})` : d.title;
}

function formatDealHint(d: DealForLabel): string {
  const parts = rewardParts(d);
  if (parts.length === 0) return "Ingen rabatt";
  // För hint: lägg "rabatt" efter procent/kr men inte efter "Fri leverans".
  return parts
    .map((p) => (p === "Fri leverans" ? p : `${p} rabatt`))
    .join(" + ");
}

// ────────────────────────────────────────────────────────────────────────────
// Toggle row — gemensam pattern: ikon + label + på/av-knapp.
// Identisk look som DiscountedRailToggle i categories/page.tsx så användaren
// känner igen sig.
// ────────────────────────────────────────────────────────────────────────────
function ToggleRow({
  icon,
  title,
  description,
  value,
  onChange,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)" }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-black text-sm tracking-tight" style={{ color: "var(--text-primary)" }}>
            {title}
          </p>
          <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            {description}
          </p>
        </div>
      </div>
      <Button
        variant={value ? "secondary" : "primary"}
        onClick={() => onChange(!value)}
        disabled={disabled}
      >
        {value ? "Stäng av" : "Aktivera"}
      </Button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// PersonalDealCreateForm — quick-create för en personal-template-deal
// som referral-systemet kan koppla. Sparar isPersonalTemplate=true så
// dealen inte syns publikt och inte kan claimas via popup.
// ────────────────────────────────────────────────────────────────────────────
function PersonalDealCreateForm() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreatePersonalDealPayload>({
    title: "",
    discountType: "PERCENTAGE",
    discountValue: 25,
    freeDelivery: false,
    minOrder: 0,
    validUntil: null,
  });
  const [createdFlash, setCreatedFlash] = useState(false);

  const resetForm = () => setForm({
    title: "",
    discountType: "PERCENTAGE",
    discountValue: 25,
    freeDelivery: false,
    minOrder: 0,
    validUntil: null,
  });

  const mutation = useMutation({
    mutationFn: (payload: CreatePersonalDealPayload) => createPersonalDeal(payload),
    onSuccess: async () => {
      setCreatedFlash(true);
      setTimeout(() => setCreatedFlash(false), 2500);
      await queryClient.invalidateQueries({ queryKey: welcomeDealQueryKey });
      resetForm();
      setOpen(false);
    },
  });

  if (!open) {
    return (
      <Surface className="px-6 py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-black text-sm mb-1">Skapa personlig deal-mall</p>
            <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
              Mallen syns inte publikt — den tilldelas användare via referral-systemet.
            </p>
          </div>
          <Button variant="primary" onClick={() => setOpen(true)}>
            + Ny mall
          </Button>
        </div>
        {createdFlash && (
          <p className="text-[11px] mt-3 text-emerald-500 font-bold">
            ✓ Mallen skapades. Välj den i dropdownen nedan.
          </p>
        )}
      </Surface>
    );
  }

  return (
    <Surface className="px-6 py-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-black uppercase tracking-tight">Ny personlig deal-mall</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs hover:underline"
          style={{ color: "var(--text-secondary)" }}
        >
          Avbryt
        </button>
      </div>

      {mutation.isError && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">
          <div className="font-bold mb-0.5 flex items-center gap-2">
            <AlertCircle size={14} /> Kunde inte skapa
          </div>
          <div style={{ color: "var(--text-secondary)" }}>
            {(mutation.error as { response?: { data?: { error?: string } }; message?: string } | undefined)
              ?.response?.data?.error
              || (mutation.error as { message?: string } | undefined)?.message
              || "Okänt fel"}
          </div>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Titel (intern, syns ej för kund)">
          <Input
            type="text"
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            placeholder="t.ex. Referral 25% + fri leverans"
          />
        </Field>
        <Field label="Rabatt-typ (subtotal)">
          <select
            value={form.discountType}
            onChange={(e) => {
              const next = e.target.value as PersonalDealType;
              setForm((p) => ({
                ...p,
                discountType: next,
                // NONE → värde 0 (bara fri leverans). PERCENT/FIXED → default 25.
                discountValue: next === "NONE" ? 0 : p.discountValue || 25,
              }));
            }}
            className="w-full rounded-lg border border-[var(--border-muted)] bg-[var(--bg-secondary)] px-3 py-2 text-sm"
          >
            <option value="PERCENTAGE">Procent (%)</option>
            <option value="FIXED">Fast belopp (kr)</option>
            <option value="NONE">Ingen subtotal-rabatt</option>
          </select>
        </Field>
        {form.discountType !== "NONE" && (
          <Field
            label={
              form.discountType === "PERCENTAGE"
                ? "Rabatt-procent (1-100)"
                : "Rabatt-belopp (kr)"
            }
          >
            <Input
              type="number"
              min={1}
              max={form.discountType === "PERCENTAGE" ? 100 : 10000}
              value={form.discountValue}
              onChange={(e) =>
                setForm((p) => ({ ...p, discountValue: Number(e.target.value) || 0 }))
              }
            />
          </Field>
        )}
        <Field label="Min ordervärde (kr) — valfritt">
          <Input
            type="number"
            min={0}
            value={form.minOrder ?? 0}
            onChange={(e) =>
              setForm((p) => ({ ...p, minOrder: Number(e.target.value) || 0 }))
            }
          />
        </Field>
        <Field label="Giltigt till (valfritt)">
          <Input
            type="date"
            value={form.validUntil ?? ""}
            onChange={(e) =>
              setForm((p) => ({ ...p, validUntil: e.target.value || null }))
            }
          />
        </Field>
      </div>

      {/* Fri-leverans-checkbox — stackbar med discountType */}
      <div className="mt-5">
        <label
          className="flex items-center gap-3 cursor-pointer select-none rounded-lg border border-[var(--border-muted)] bg-[var(--bg-secondary)] px-4 py-3"
        >
          <input
            type="checkbox"
            checked={form.freeDelivery}
            onChange={(e) =>
              setForm((p) => ({ ...p, freeDelivery: e.target.checked }))
            }
            className="h-4 w-4 cursor-pointer"
          />
          <div className="flex-1">
            <span className="text-sm font-bold">Fri leverans</span>
            <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
              Stackbar — kombineras med procent/kr-rabatten ovan. Bocka av om
              kunden bara ska ha subtotal-rabatt.
            </p>
          </div>
        </label>
      </div>

      {/* Förhandsvisning av vad kunden får */}
      <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs">
        <strong>Kunden får:</strong>{" "}
        {(() => {
          const parts: string[] = [];
          if (form.discountType === "PERCENTAGE" && form.discountValue > 0) parts.push(`${form.discountValue}% rabatt`);
          if (form.discountType === "FIXED" && form.discountValue > 0) parts.push(`${form.discountValue} kr rabatt`);
          if (form.freeDelivery) parts.push("fri leverans");
          return parts.length > 0 ? parts.join(" + ") : "Inget — bocka i något ovan";
        })()}
      </div>

      <div className="mt-6 flex gap-3">
        <Button
          variant="primary"
          onClick={() => {
            if (!form.title.trim()) {
              alert("Ange en titel");
              return;
            }
            mutation.mutate(form);
          }}
          disabled={mutation.isPending}
        >
          {mutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {mutation.isPending ? "Skapar…" : "Skapa mall"}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          Avbryt
        </Button>
      </div>
    </Surface>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tab 3 — Statistik (funnel + top inviters + suspicious patterns)
// ────────────────────────────────────────────────────────────────────────────
function FunnelBox({
  label,
  count,
  highlight,
}: {
  label: string;
  count: number;
  highlight?: boolean;
}) {
  return (
    <div
      className="flex-1 min-w-[120px] rounded-2xl px-5 py-5 text-center"
      style={{
        backgroundColor: highlight ? "var(--accent-soft)" : "var(--bg-deep)",
        border: `1px solid ${highlight ? "var(--accent)" : "var(--border-muted)"}`,
      }}
    >
      <p
        className="text-[10px] font-black uppercase tracking-[0.18em]"
        style={{ color: highlight ? "var(--accent)" : "var(--text-muted)" }}
      >
        {label}
      </p>
      <p
        className="mt-2 text-3xl font-semibold tracking-[-0.03em]"
        style={{ color: highlight ? "var(--accent)" : "var(--text-primary)" }}
      >
        {formatNumber(count)}
      </p>
    </div>
  );
}

function ConversionArrow({ from, to }: { from: number; to: number }) {
  const pct = from > 0 ? Math.round((to / from) * 100) : 0;
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-2 shrink-0">
      <ArrowRight size={20} className="text-[var(--text-muted)]" />
      <span className="text-[11px] font-black text-[var(--text-secondary)]">{pct}%</span>
    </div>
  );
}

export function StatsTab() {
  const stats = useQuery({
    queryKey: referralStatsQueryKey,
    queryFn: getReferralStats,
  });

  if (stats.isLoading) {
    return (
      <Surface className="px-6 py-12 text-sm flex items-center gap-3 text-[var(--text-secondary)]">
        <Loader2 size={14} className="animate-spin" /> Laddar statistik…
      </Surface>
    );
  }

  if (stats.isError || !stats.data) {
    return (
      <Surface className="px-6 py-8 text-sm text-[var(--text-secondary)]">
        Kunde inte ladda statistik.
      </Surface>
    );
  }

  const { funnel, topInviters, suspiciousPatterns } = stats.data;

  return (
    <div className="space-y-5">
      <Surface className="px-6 py-6">
        <div className="flex items-center gap-3 mb-5">
          <Sparkles size={18} className="text-[var(--accent)]" />
          <h2 className="text-base font-black uppercase tracking-tight">Konverterings-funnel</h2>
        </div>
        <div className="flex flex-wrap items-stretch gap-2">
          <FunnelBox label="Invited" count={funnel.invited} />
          <ConversionArrow from={funnel.invited} to={funnel.registered} />
          <FunnelBox label="Registered" count={funnel.registered} />
          <ConversionArrow from={funnel.registered} to={funnel.ordered} />
          <FunnelBox label="Ordered" count={funnel.ordered} />
          <ConversionArrow from={funnel.ordered} to={funnel.rewarded} />
          <FunnelBox label="Rewarded" count={funnel.rewarded} highlight />
        </div>
      </Surface>

      <Surface className="px-6 py-6">
        <div className="flex items-center gap-3 mb-5">
          <Trophy size={18} className="text-[var(--accent)]" />
          <h2 className="text-base font-black uppercase tracking-tight">Topp-inviters</h2>
        </div>
        {topInviters.length === 0 ? (
          <EmptyState title="Inga inviters än" />
        ) : (
          <div className="table-shell">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>#</th>
                  <th>Namn</th>
                  <th>Antal lyckade</th>
                  <th>Intjänat</th>
                </tr>
              </thead>
              <tbody>
                {topInviters.map((row, i) => (
                  <tr key={row.userId}>
                    <td className="font-black">{i + 1}</td>
                    <td className="font-black">{row.name}</td>
                    <td>{formatNumber(row.count)}</td>
                    <td>{formatCurrency(row.earnedKr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>

      <Surface className="px-6 py-6">
        <div className="flex items-center gap-3 mb-5">
          <ShieldAlert size={18} className="text-[var(--accent)]" />
          <h2 className="text-base font-black uppercase tracking-tight">Misstänkta mönster</h2>
        </div>
        {suspiciousPatterns.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Inga misstänkta mönster upptäckta.</p>
        ) : (
          <ul className="space-y-2">
            {suspiciousPatterns.map((p) => (
              <li
                key={p.pattern}
                className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
                style={{ backgroundColor: "var(--bg-deep)", border: "1px solid var(--border-muted)" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                  <span className="text-sm font-bold">{p.pattern}</span>
                </div>
                <Badge tone="warning">{formatNumber(p.count)}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Huvudsida — EN unified vy (tidigare 3 tabbar). Statistik flyttad till
// /marketing-referrals/stats. En enda toggle och en enda mall som styr
// både welcome-deal-flow och referral-flow simultant.
// ────────────────────────────────────────────────────────────────────────────
export function MarketingReferralsPage() {
  const settings = useQuery({
    queryKey: welcomeDealQueryKey,
    queryFn: getWelcomeDealSettings,
  });

  return (
    <div className="page-stack">
      <PageHeader
        title="Marketing & Referrals"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/marketing-referrals/stats">
              <Button variant="secondary">Statistik</Button>
            </Link>
            <Link href="/marketing-referrals/list">
              <Button variant="secondary">
                <List size={14} /> Alla referrals
              </Button>
            </Link>
          </div>
        }
      />

      <UnifiedMarketingTab settings={settings.data} isLoading={settings.isLoading} />
    </div>
  );
}

/**
 * En enda vy som hanterar både welcome-deal och referral. Admin väljer
 * EN deal-mall som används för båda flöden. Toggle aktiverar/deaktiverar
 * båda samtidigt och sparas omedelbart (ingen separat Spara-knapp för
 * just toggeln — buggen tidigare var att toggle bara uppdaterade local
 * state och försvann om man lämnade sidan utan att klicka Spara).
 */
function UnifiedMarketingTab({
  settings,
  isLoading,
}: {
  settings: WelcomeDealSettings | undefined;
  isLoading: boolean;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<{
    dealId: string | null;
    couponsPerSide: number;
    maxRewardsPerInviter: number;
  }>({
    dealId: null,
    couponsPerSide: 1,
    maxRewardsPerInviter: 20,
  });
  const [hydrated, setHydrated] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  // active = båda welcome OCH referral aktiva. Vi visar EN toggle men
  // sätter två fält i backend.
  const active =
    settings != null && settings.welcomeDealActive && settings.referralEnabled;

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (settings && !hydrated) {
      // Använd referralDealId som primär (mest sannolikt satt eftersom
      // det är vad referral-flödet kräver). Faller tillbaka till welcomeDealId.
      setForm({
        dealId: settings.referralDealId ?? settings.welcomeDealId ?? null,
        couponsPerSide: settings.referralCouponsPerSide ?? 1,
        maxRewardsPerInviter: settings.referralMaxRewardsPerInviter ?? 20,
      });
      setHydrated(true);
    }
  }, [settings, hydrated]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const mutation = useMutation({
    mutationFn: (payload: Partial<WelcomeDealSettings>) => updateWelcomeDealSettings(payload),
    onSuccess: async () => {
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2500);
      await queryClient.invalidateQueries({ queryKey: welcomeDealQueryKey });
    },
  });

  if (isLoading) {
    return (
      <Surface className="px-6 py-12 text-sm flex items-center gap-3 text-[var(--text-secondary)]">
        <Loader2 size={14} className="animate-spin" /> Laddar inställningar…
      </Surface>
    );
  }

  const availableDeals = settings?.availableDeals ?? [];
  const selectedDeal = availableDeals.find((d) => d.id === form.dealId);
  const dealHint = selectedDeal ? formatDealHint(selectedDeal) : null;

  // Toggle sparar OMEDELBART vid klick — sätter både welcome och referral.
  const handleToggleActive = (next: boolean) => {
    mutation.mutate({
      welcomeDealActive: next,
      referralEnabled: next,
    });
  };

  // Spara-knapp persisterar resten (dropdown + kuponger + tak). Sätter
  // BÅDA welcomeDealId och referralDealId till samma värde så båda flöden
  // använder samma mall.
  const handleSaveConfig = () => {
    mutation.mutate({
      welcomeDealId: form.dealId,
      referralDealId: form.dealId,
      referralCouponsPerSide: form.couponsPerSide,
      referralMaxRewardsPerInviter: form.maxRewardsPerInviter,
    });
  };

  return (
    <div className="space-y-5">
      <Surface className="px-6 py-5">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          <strong>Marknadsföring</strong> — välj EN deal-mall som ges automatiskt
          till nya användare vid registrering (welcome) OCH till båda parter när
          någon använder en referral-kod. En toggle, en mall, samma rabatt
          överallt.
        </p>
      </Surface>

      {mutation.isError && (
        <Surface className="px-6 py-4">
          <div className="flex items-start gap-3">
            <AlertCircle size={18} className="text-red-500 mt-0.5 shrink-0" />
            <div className="text-sm">
              <div className="font-bold mb-0.5">Kunde inte spara</div>
              <div style={{ color: "var(--text-secondary)" }}>
                {(mutation.error as { response?: { data?: { error?: string } }; message?: string } | undefined)
                  ?.response?.data?.error
                  || (mutation.error as { message?: string } | undefined)?.message
                  || "Okänt fel"}
              </div>
            </div>
          </div>
        </Surface>
      )}

      <Surface className="px-6 py-6">
        <ToggleRow
          icon={<Gift size={16} className="text-[var(--accent)]" />}
          title="Marknadsföring aktiv"
          description="Slå PÅ för att aktivera både welcome-deal och referral-system. Sparas direkt."
          value={active}
          onChange={handleToggleActive}
          disabled={mutation.isPending}
        />
      </Surface>

      <PersonalDealCreateForm />

      <Surface className="px-6 py-6">
        <h2 className="text-base font-black uppercase tracking-tight mb-5">Vilken mall ska användas?</h2>

        {availableDeals.length === 0 && (
          <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
            <p className="font-bold mb-1">Inga personliga mallar finns</p>
            <p style={{ color: "var(--text-secondary)" }}>
              Skapa en mall ovan (t.ex. &quot;Welcome 25%&quot; med PERCENTAGE och 25). När den
              finns dyker den upp i dropdownen.
            </p>
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Personlig deal-mall">
            <select
              value={form.dealId ?? ""}
              onChange={(e) =>
                setForm((p) => ({ ...p, dealId: e.target.value || null }))
              }
              className="w-full rounded-lg border border-[var(--border-muted)] bg-[var(--bg-secondary)] px-3 py-2 text-sm"
              disabled={mutation.isPending || availableDeals.length === 0}
            >
              <option value="">— Välj mall —</option>
              {availableDeals.map((d) => (
                <option key={d.id} value={d.id}>
                  {formatDealLabel(d)}
                </option>
              ))}
            </select>
            {dealHint && (
              <p className="text-xs mt-1.5" style={{ color: "var(--text-secondary)" }}>
                ✓ Alla får: <strong>{dealHint}</strong>
              </p>
            )}
          </Field>

          <Field label="Antal kuponger per part (referral)">
            <Input
              type="number"
              min={1}
              max={10}
              value={form.couponsPerSide}
              onChange={(e) =>
                setForm((p) => ({ ...p, couponsPerSide: Number(e.target.value) || 1 }))
              }
            />
            <p className="text-xs mt-1.5" style={{ color: "var(--text-secondary)" }}>
              1 = klassisk. 3 = invitee kan använda rabatten på 3 ordrar.
            </p>
          </Field>
        </div>

        <div className="mt-5">
          <Field label="Tak per inviter / 30 dagar (anti-fusk)">
            <Input
              type="number"
              min={0}
              max={1000}
              value={form.maxRewardsPerInviter}
              onChange={(e) =>
                setForm((p) => ({ ...p, maxRewardsPerInviter: Number(e.target.value) || 0 }))
              }
            />
            <p className="text-xs mt-1.5" style={{ color: "var(--text-secondary)" }}>
              Skyddar mot fake-konton som spammar referrals.
            </p>
          </Field>
        </div>

        <div className="mt-6">
          <Button
            variant="primary"
            onClick={handleSaveConfig}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? (
              <Loader2 size={16} className="animate-spin" />
            ) : savedFlash ? (
              <Check size={16} />
            ) : (
              <Save size={16} />
            )}
            {mutation.isPending ? "Sparar…" : savedFlash ? "Sparat!" : "Spara"}
          </Button>
        </div>
      </Surface>
    </div>
  );
}
