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
  Tabs,
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

type Tab = "welcome" | "referral" | "stats";

// Format-helper för deal-display i dropdowns + hints. Visar typen
// (Procent / Kr / Fri leverans) tillsammans med värdet.
function formatDealLabel(d: { discountType: string; discountValue: number; title: string }): string {
  if (d.discountType === "FREE_DELIVERY") return `${d.title} (Fri leverans)`;
  if (d.discountType === "PERCENTAGE") return `${d.title} (${d.discountValue}%)`;
  return `${d.title} (${d.discountValue} kr)`;
}

function formatDealHint(d: { discountType: string; discountValue: number }): string {
  if (d.discountType === "FREE_DELIVERY") return "Fri leverans";
  if (d.discountType === "PERCENTAGE") return `${d.discountValue}% rabatt`;
  return `${d.discountValue} kr rabatt`;
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
// Tab 1 — Welcome-deal form (aktiv-toggle + belopp + min-order + expires-dagar)
// ────────────────────────────────────────────────────────────────────────────
function WelcomeDealTab({
  settings,
  isLoading,
}: {
  settings: WelcomeDealSettings | undefined;
  isLoading: boolean;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<{
    welcomeDealActive: boolean;
    welcomeDealId: string | null;
  }>({
    welcomeDealActive: false,
    welcomeDealId: null,
  });
  const [hydrated, setHydrated] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (settings && !hydrated) {
      setForm({
        welcomeDealActive: settings.welcomeDealActive,
        welcomeDealId: settings.welcomeDealId,
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
  const selectedDeal = availableDeals.find((d) => d.id === form.welcomeDealId);
  const dealHint = selectedDeal ? formatDealHint(selectedDeal) : null;

  return (
    <div className="space-y-5">
      <Surface className="px-6 py-5">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          <strong>Welcome-deal</strong> är rabatten som ges automatiskt till nya kunder vid
          registrering. Kopplar en <strong>personlig deal-mall</strong> (samma typ som referral
          använder) — admin skapar mallen i Referral Settings-fliken och pekar den hit.
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
          title="Welcome-deal aktiv"
          description="Slå på för att skapa welcome-deals automatiskt vid registrering."
          value={form.welcomeDealActive}
          onChange={(next) => setForm((p) => ({ ...p, welcomeDealActive: next }))}
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

        <Field label="Personlig deal-mall">
          <select
            value={form.welcomeDealId ?? ""}
            onChange={(e) =>
              setForm((p) => ({ ...p, welcomeDealId: e.target.value || null }))
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
              ✓ Nya användare får: <strong>{dealHint}</strong> vid registrering
            </p>
          )}
        </Field>

        <div className="mt-6">
          <Button
            variant="primary"
            onClick={() => mutation.mutate(form)}
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

// ────────────────────────────────────────────────────────────────────────────
// Tab 2 — Referral-settings (aktiv-toggle + belöning + min-order)
// ────────────────────────────────────────────────────────────────────────────
function ReferralSettingsTab({
  settings,
  isLoading,
}: {
  settings: WelcomeDealSettings | undefined;
  isLoading: boolean;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<{
    referralEnabled: boolean;
    referralDealId: string | null;
    referralCouponsPerSide: number;
    referralMaxRewardsPerInviter: number;
  }>({
    referralEnabled: false,
    referralDealId: null,
    referralCouponsPerSide: 1,
    referralMaxRewardsPerInviter: 20,
  });
  const [hydrated, setHydrated] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (settings && !hydrated) {
      setForm({
        referralEnabled: settings.referralEnabled,
        referralDealId: settings.referralDealId,
        referralCouponsPerSide: settings.referralCouponsPerSide ?? 1,
        referralMaxRewardsPerInviter: settings.referralMaxRewardsPerInviter ?? 20,
      });
      setHydrated(true);
    }
  }, [settings, hydrated]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const availableDeals = settings?.availableDeals ?? [];
  const selectedDeal = availableDeals.find((d) => d.id === form.referralDealId);
  const dealHint = selectedDeal ? formatDealHint(selectedDeal) : null;

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

  return (
    <div className="space-y-5">
      <Surface className="px-6 py-5">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          <strong>Referral-systemet</strong> kopplar en <strong>personlig deal-mall</strong> som
          tilldelas per-användare (inte en publik kupong-kod). Skapa en mall nedan
          med önskad procent/kronor och välj den i dropdownen. Båda parter
          (inviter + invitee) får automatiskt kupongen — invitee vid registrering,
          inviter när invitee gjort sin första betalda order.
        </p>
      </Surface>

      <PersonalDealCreateForm />


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
          icon={<UserPlus size={16} className="text-[var(--accent)]" />}
          title="Referral-system aktivt"
          description="Slå på för att låta användare bjuda in vänner och få belöning vid första order."
          value={form.referralEnabled}
          onChange={(next) => setForm((p) => ({ ...p, referralEnabled: next }))}
          disabled={mutation.isPending}
        />
      </Surface>

      <Surface className="px-6 py-6">
        <h2 className="text-base font-black uppercase tracking-tight mb-5">Belöning från Deal</h2>

        {availableDeals.length === 0 && (
          <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
            <p className="font-bold mb-1">Inga aktiva Deals hittades</p>
            <p style={{ color: "var(--text-secondary)" }}>
              Skapa en Deal i <Link href="/deals" className="underline">/deals</Link> först — t.ex.
              &quot;Referral 25% rabatt&quot; med discountType=PERCENTAGE och discountValue=25.
              Aktivera den, sen dyker den upp här.
            </p>
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Vilken Deal ska användas?">
            <select
              value={form.referralDealId ?? ""}
              onChange={(e) =>
                setForm((p) => ({ ...p, referralDealId: e.target.value || null }))
              }
              className="w-full rounded-lg border border-[var(--border-muted)] bg-[var(--bg-secondary)] px-3 py-2 text-sm"
              disabled={mutation.isPending || availableDeals.length === 0}
            >
              <option value="">— Välj Deal —</option>
              {availableDeals.map((d) => (
                <option key={d.id} value={d.id}>
                  {formatDealLabel(d)}
                </option>
              ))}
            </select>
            {dealHint && (
              <p className="text-xs mt-1.5" style={{ color: "var(--text-secondary)" }}>
                ✓ Båda parter får: <strong>{dealHint}</strong>
              </p>
            )}
          </Field>
          <Field label="Antal kuponger per part">
            <Input
              type="number"
              min={1}
              max={10}
              value={form.referralCouponsPerSide}
              onChange={(e) =>
                setForm((p) => ({ ...p, referralCouponsPerSide: Number(e.target.value) || 1 }))
              }
            />
            <p className="text-xs mt-1.5" style={{ color: "var(--text-secondary)" }}>
              1 = klassisk. 3 = invitee kan använda rabatten på sina 3 första ordrar.
            </p>
          </Field>
        </div>

        <div className="mt-5">
          <Field label="Tak per inviter / 30 dagar (anti-fusk)">
            <Input
              type="number"
              min={0}
              max={1000}
              value={form.referralMaxRewardsPerInviter}
              onChange={(e) =>
                setForm((p) => ({ ...p, referralMaxRewardsPerInviter: Number(e.target.value) || 0 }))
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
            onClick={() => mutation.mutate(form)}
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

      <Surface className="px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <List size={16} className="text-[var(--accent)]" />
            <div>
              <p className="font-black text-sm">Alla referrals</p>
              <p className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
                Lista med detaljer, filter, fraud-flags och revert-möjlighet.
              </p>
            </div>
          </div>
          <Link href="/marketing-referrals/list">
            <Button variant="secondary">
              Visa lista <ArrowRight size={14} />
            </Button>
          </Link>
        </div>
      </Surface>
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
    minOrder: 0,
    validUntil: null,
  });
  const [createdFlash, setCreatedFlash] = useState(false);

  const mutation = useMutation({
    mutationFn: (payload: CreatePersonalDealPayload) => createPersonalDeal(payload),
    onSuccess: async () => {
      setCreatedFlash(true);
      setTimeout(() => setCreatedFlash(false), 2500);
      await queryClient.invalidateQueries({ queryKey: welcomeDealQueryKey });
      // Reseta formuläret men låt dropdown-värdet uppdateras automatiskt
      // via parent-refetch
      setForm({ title: "", discountType: "PERCENTAGE", discountValue: 25, minOrder: 0, validUntil: null });
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
            placeholder={
              form.discountType === "FREE_DELIVERY"
                ? "t.ex. Referral Fri Leverans"
                : form.discountType === "FIXED"
                  ? "t.ex. Referral 50 kr off"
                  : "t.ex. Referral 25%"
            }
          />
        </Field>
        <Field label="Rabatt-typ">
          <select
            value={form.discountType}
            onChange={(e) => {
              const next = e.target.value as PersonalDealType;
              setForm((p) => ({
                ...p,
                discountType: next,
                // FREE_DELIVERY behöver inget värde — sätt till 0 så
                // backend inte validerar mot percent-range.
                discountValue: next === "FREE_DELIVERY" ? 0 : p.discountValue || 25,
              }));
            }}
            className="w-full rounded-lg border border-[var(--border-muted)] bg-[var(--bg-secondary)] px-3 py-2 text-sm"
          >
            <option value="PERCENTAGE">Procent (%)</option>
            <option value="FIXED">Fast belopp (kr)</option>
            <option value="FREE_DELIVERY">Fri leverans</option>
          </select>
        </Field>
        {form.discountType !== "FREE_DELIVERY" && (
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

      {form.discountType === "FREE_DELIVERY" && (
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs">
          <strong>Fri leverans</strong> — användaren får leveransavgiften
          gratis (0 kr) på den ordern kupongen appliceras. Inget rabatt-
          belopp behövs.
        </div>
      )}

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

function StatsTab() {
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
// Huvudsida — 3 tabbar
// ────────────────────────────────────────────────────────────────────────────
export function MarketingReferralsPage() {
  const [tab, setTab] = useState<Tab>("welcome");

  const settings = useQuery({
    queryKey: welcomeDealQueryKey,
    queryFn: getWelcomeDealSettings,
  });

  return (
    <div className="page-stack">
      <PageHeader
        title="Marketing & Referrals"
        actions={
          <Link href="/marketing-referrals/list">
            <Button variant="secondary">
              <List size={14} /> Alla referrals
            </Button>
          </Link>
        }
      />

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "welcome", label: "Welcome Deal" },
          { value: "referral", label: "Referral Settings" },
          { value: "stats", label: "Statistik" },
        ]}
      />

      {tab === "welcome" ? (
        <WelcomeDealTab settings={settings.data} isLoading={settings.isLoading} />
      ) : null}

      {tab === "referral" ? (
        <ReferralSettingsTab settings={settings.data} isLoading={settings.isLoading} />
      ) : null}

      {tab === "stats" ? <StatsTab /> : null}
    </div>
  );
}
