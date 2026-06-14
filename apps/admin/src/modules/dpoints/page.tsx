"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, Plus, Trash2, Search, Loader2 } from "lucide-react";
import {
  Badge,
  Button,
  Field,
  Input,
  LoadingPanel,
  MetricCard,
  Modal,
  PageHeader,
  Select,
  Surface,
  Tabs,
  Textarea,
} from "@/shared/components/ui";
import { ImageUploadField } from "@/shared/components/image-upload";
import {
  adjustCustomer,
  createCampaign,
  createReward,
  createSponsor,
  deleteCampaign,
  deleteReward,
  deleteSponsor,
  dpointsKeys,
  getCampaigns,
  getConfig,
  getCustomer,
  getCustomers,
  getOverview,
  getRedemptions,
  getRewards,
  getSponsors,
  updateCampaign,
  updateConfig,
  updateReward,
  updateSponsor,
  type DpointsReward,
  type PointsCampaign,
  type SponsorCard,
} from "@/modules/dpoints/api";

type TabKey = "settings" | "sponsors" | "rewards" | "campaigns" | "customers";

const dtLocal = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

// Snygg toggle-switch (ersätter råa checkboxar för konsekvent admin-UI).
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-[var(--accent)]" : "bg-[var(--border-strong)]"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

// Etikett + toggle på en rad — används i modalerna.
function SwitchRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

export function DpointsPage() {
  const [tab, setTab] = useState<TabKey>("settings");
  return (
    <div className="flex flex-col gap-7">
      <PageHeader title="Dpoints" />
      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        options={[
          { value: "settings", label: "Inställningar" },
          { value: "sponsors", label: "Sponsorkort" },
          { value: "rewards", label: "Inlösen" },
          { value: "campaigns", label: "Kampanjer" },
          { value: "customers", label: "Kunder & koder" },
        ]}
      />
      {tab === "settings" && <SettingsTab />}
      {tab === "sponsors" && <SponsorsTab />}
      {tab === "rewards" && <RewardsTab />}
      {tab === "campaigns" && <CampaignsTab />}
      {tab === "customers" && <CustomersTab />}
    </div>
  );
}

// ── Inställningar + nyckeltal ───────────────────────────────────────────────
function SettingsTab() {
  const qc = useQueryClient();
  const config = useQuery({ queryKey: dpointsKeys.config, queryFn: getConfig });
  const overview = useQuery({ queryKey: dpointsKeys.overview, queryFn: getOverview });
  const save = useMutation({
    mutationFn: updateConfig,
    onSuccess: () => qc.invalidateQueries({ queryKey: dpointsKeys.config }),
  });

  const c = config.data;
  if (config.isLoading || !c) return <LoadingPanel />;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Utestående poäng" value={(overview.data?.outstanding ?? 0).toLocaleString("sv-SE")} />
        <MetricCard label="Intjänat totalt" value={(overview.data?.totalEarned ?? 0).toLocaleString("sv-SE")} />
        <MetricCard label="Inlöst totalt" value={(overview.data?.totalRedeemed ?? 0).toLocaleString("sv-SE")} />
        <MetricCard label="Kunder med poäng" value={(overview.data?.holders ?? 0).toLocaleString("sv-SE")} />
      </div>

      <Surface>
        <div className="flex flex-col gap-5 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold">Dpoints aktiverat</p>
            </div>
            <Toggle checked={c.dpointsEnabled} onChange={(v) => save.mutate({ dpointsEnabled: v })} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Intjäning — poäng per spenderad kr">
              <Input
                type="number"
                step="0.1"
                min="0"
                defaultValue={c.dpointsPerKr}
                key={`per-${c.dpointsPerKr}`}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (v !== c.dpointsPerKr) save.mutate({ dpointsPerKr: v });
                }}
              />
            </Field>
            <Field label="Värde — poäng per 1 kr (inlösen / etikett)">
              <Input
                type="number"
                min="1"
                defaultValue={c.dpointsValuePerKr}
                key={`val-${c.dpointsValuePerKr}`}
                onBlur={(e) => {
                  const v = Math.round(Number(e.target.value));
                  if (v !== c.dpointsValuePerKr) save.mutate({ dpointsValuePerKr: v });
                }}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tak för saldo (poäng) — 0 = inget tak">
              <Input
                type="number"
                min="0"
                defaultValue={c.dpointsMaxBalance}
                key={`max-${c.dpointsMaxBalance}`}
                onBlur={(e) => {
                  const v = Math.max(0, Math.round(Number(e.target.value)));
                  if (v !== c.dpointsMaxBalance) save.mutate({ dpointsMaxBalance: v });
                }}
              />
            </Field>
            <Field label="Budkostnad vid poäng-köp (kr) — endast leverans">
              <Input
                type="number"
                min="0"
                step="1"
                defaultValue={(c.dpointsCourierCost ?? 0) / 100}
                key={`courier-${c.dpointsCourierCost}`}
                onBlur={(e) => {
                  const ore = Math.max(0, Math.round(Number(e.target.value) * 100));
                  if (ore !== (c.dpointsCourierCost ?? 0)) save.mutate({ dpointsCourierCost: ore });
                }}
              />
            </Field>
          </div>
          {save.isPending && <p className="text-sm text-[var(--text-secondary)]">Sparar…</p>}
        </div>
      </Surface>
    </div>
  );
}

// ── Sponsorkort ─────────────────────────────────────────────────────────────
const emptySponsor: Partial<SponsorCard> = { title: "", sponsorName: "", description: "", bonusPoints: 100, isActive: true };

function SponsorsTab() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: dpointsKeys.sponsors, queryFn: getSponsors });
  const [editing, setEditing] = useState<Partial<SponsorCard> | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: dpointsKeys.sponsors });

  const saveMut = useMutation({
    mutationFn: (s: Partial<SponsorCard>) => (s.id ? updateSponsor(s.id, s) : createSponsor(s)),
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
  });
  const delMut = useMutation({ mutationFn: deleteSponsor, onSuccess: invalidate });

  return (
    <Surface>
      <div className="flex items-center justify-between p-6">
        <div>
          <h2 className="text-lg font-semibold">Sponsorkort</h2>
        </div>
        <Button variant="primary" onClick={() => setEditing({ ...emptySponsor })}>
          <Plus size={16} /> Nytt kort
        </Button>
      </div>
      <div className="px-6 pb-6">
        {list.isLoading ? (
          <LoadingPanel />
        ) : (list.data ?? []).length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Inga sponsorkort ännu.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {(list.data ?? []).map((s) => (
              <div key={s.id} className="surface-muted flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{s.title}</span>
                    <Badge tone={s.isActive ? "success" : "neutral"}>{s.isActive ? "Aktiv" : "Av"}</Badge>
                    <Badge tone="info">+{s.bonusPoints} p</Badge>
                  </div>
                  {s.sponsorName && <p className="text-xs text-[var(--text-secondary)]">{s.sponsorName}</p>}
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => setEditing(s)}>Redigera</Button>
                  <Button variant="danger" onClick={() => delMut.mutate(s.id)}>
                    <Trash2 size={15} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={!!editing}
        title={editing?.id ? "Redigera sponsorkort" : "Nytt sponsorkort"}
        onClose={() => setEditing(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setEditing(null)}>Avbryt</Button>
            <Button variant="primary" disabled={saveMut.isPending} onClick={() => editing && saveMut.mutate(editing)}>
              {saveMut.isPending ? <Loader2 className="animate-spin" size={16} /> : "Spara"}
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <Field label="Titel">
              <Input value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </Field>
            <Field label="Sponsor (valfritt)">
              <Input value={editing.sponsorName ?? ""} onChange={(e) => setEditing({ ...editing, sponsorName: e.target.value })} />
            </Field>
            <Field label="Beskrivning (valfritt)">
              <Textarea value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </Field>
            <ImageUploadField
              label="Bild (valfritt)"
              kind="misc"
              value={editing.imageUrl ?? ""}
              onChange={(url) => setEditing({ ...editing, imageUrl: url })}
            />
            <div className="grid grid-cols-2 gap-4">
              <Field label="Bonuspoäng">
                <Input
                  type="number"
                  value={editing.bonusPoints ?? 0}
                  onChange={(e) => setEditing({ ...editing, bonusPoints: Number(e.target.value) })}
                />
              </Field>
              <Field label="CTA-text (valfritt)">
                <Input value={editing.ctaLabel ?? ""} onChange={(e) => setEditing({ ...editing, ctaLabel: e.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Aktiv från (valfritt)">
                <Input type="date" value={dtLocal(editing.startsAt ?? null)} onChange={(e) => setEditing({ ...editing, startsAt: e.target.value || null })} />
              </Field>
              <Field label="Aktiv till (valfritt)">
                <Input type="date" value={dtLocal(editing.endsAt ?? null)} onChange={(e) => setEditing({ ...editing, endsAt: e.target.value || null })} />
              </Field>
            </div>
            <SwitchRow label="Aktiv" checked={editing.isActive ?? true} onChange={(v) => setEditing({ ...editing, isActive: v })} />
          </div>
        )}
      </Modal>
    </Surface>
  );
}

// ── Inlösen-belöningar ──────────────────────────────────────────────────────
type RewardForm = {
  id?: string;
  title: string;
  description: string;
  imageUrl: string;
  pointsCost: number;
  discountType: "FIXED" | "PERCENTAGE";
  discountValue: number; // kr för FIXED, % för PERCENTAGE (UI-enhet)
  minOrderKr: number;
  validDays: number;
  isActive: boolean;
};

const rewardToForm = (r: DpointsReward): RewardForm => ({
  id: r.id,
  title: r.title,
  description: r.description ?? "",
  imageUrl: r.imageUrl ?? "",
  pointsCost: r.pointsCost,
  discountType: r.discountType,
  discountValue: r.discountType === "PERCENTAGE" ? r.discountValue : Math.round(r.discountValue / 100),
  minOrderKr: r.minOrderKr,
  validDays: r.validDays,
  isActive: r.isActive,
});

const emptyReward: RewardForm = {
  title: "",
  description: "",
  imageUrl: "",
  pointsCost: 100,
  discountType: "FIXED",
  discountValue: 10,
  minOrderKr: 0,
  validDays: 30,
  isActive: true,
};

function RewardsTab() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: dpointsKeys.rewards, queryFn: getRewards });
  const [editing, setEditing] = useState<RewardForm | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: dpointsKeys.rewards });

  const saveMut = useMutation({
    mutationFn: (f: RewardForm) => {
      const payload = {
        title: f.title,
        description: f.description,
        imageUrl: f.imageUrl,
        pointsCost: f.pointsCost,
        discountType: f.discountType,
        discountValue: f.discountValue, // FIXED: kr (API normaliserar), PERCENTAGE: %
        minOrderKr: f.minOrderKr,
        validDays: f.validDays,
        isActive: f.isActive,
      };
      return f.id ? updateReward(f.id, payload) : createReward(payload);
    },
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
  });
  const delMut = useMutation({ mutationFn: deleteReward, onSuccess: invalidate });

  return (
    <Surface>
      <div className="flex items-center justify-between p-6">
        <div>
          <h2 className="text-lg font-semibold">Inlösen-belöningar</h2>
        </div>
        <Button variant="primary" onClick={() => setEditing({ ...emptyReward })}>
          <Plus size={16} /> Ny belöning
        </Button>
      </div>
      <div className="px-6 pb-6">
        {list.isLoading ? (
          <LoadingPanel />
        ) : (list.data ?? []).length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Inga belöningar ännu.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {(list.data ?? []).map((r) => (
              <div key={r.id} className="surface-muted flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{r.title}</span>
                    <Badge tone="info">{r.pointsCost} p</Badge>
                    <Badge tone="neutral">
                      {r.discountType === "PERCENTAGE" ? `${r.discountValue}% rabatt` : `${Math.round(r.discountValue / 100)} kr rabatt`}
                    </Badge>
                    {!r.isActive && <Badge tone="neutral">Av</Badge>}
                  </div>
                  {r.minOrderKr > 0 && <p className="text-xs text-[var(--text-secondary)]">Min. order {r.minOrderKr} kr</p>}
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => setEditing(rewardToForm(r))}>Redigera</Button>
                  <Button variant="danger" onClick={() => delMut.mutate(r.id)}>
                    <Trash2 size={15} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={!!editing}
        title={editing?.id ? "Redigera belöning" : "Ny belöning"}
        onClose={() => setEditing(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setEditing(null)}>Avbryt</Button>
            <Button variant="primary" disabled={saveMut.isPending} onClick={() => editing && saveMut.mutate(editing)}>
              {saveMut.isPending ? <Loader2 className="animate-spin" size={16} /> : "Spara"}
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <Field label="Titel (t.ex. Gratis vitlökssås)">
              <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </Field>
            <ImageUploadField
              label="Bild (valfritt)"
              kind="misc"
              value={editing.imageUrl}
              onChange={(url) => setEditing({ ...editing, imageUrl: url })}
            />
            <Field label="Beskrivning (valfritt)">
              <Textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Kostar (poäng)">
                <Input type="number" value={editing.pointsCost} onChange={(e) => setEditing({ ...editing, pointsCost: Number(e.target.value) })} />
              </Field>
              <Field label="Rabattyp">
                <Select value={editing.discountType} onChange={(e) => setEditing({ ...editing, discountType: e.target.value as RewardForm["discountType"] })}>
                  <option value="FIXED">Kr rabatt</option>
                  <option value="PERCENTAGE">% rabatt</option>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label={editing.discountType === "PERCENTAGE" ? "Rabatt (%)" : "Rabatt (kr)"}>
                <Input type="number" value={editing.discountValue} onChange={(e) => setEditing({ ...editing, discountValue: Number(e.target.value) })} />
              </Field>
              <Field label="Min. order (kr)">
                <Input type="number" value={editing.minOrderKr} onChange={(e) => setEditing({ ...editing, minOrderKr: Number(e.target.value) })} />
              </Field>
            </div>
            <Field label="Kodens giltighet (dagar)">
              <Input type="number" value={editing.validDays} onChange={(e) => setEditing({ ...editing, validDays: Number(e.target.value) })} />
            </Field>
            <SwitchRow label="Aktiv" checked={editing.isActive} onChange={(v) => setEditing({ ...editing, isActive: v })} />
          </div>
        )}
      </Modal>
    </Surface>
  );
}

// ── Kampanjer / utmaningar ──────────────────────────────────────────────────
type CampaignForm = {
  id?: string;
  name: string;
  description: string;
  type: PointsCampaign["type"];
  isActive: boolean;
  minOrderKr: number;
  multiplier: number;
  rewardPoints: number;
  targetCount: number;
  repeatable: boolean;
  startsAt: string | null;
  endsAt: string | null;
};

const campaignToForm = (c: PointsCampaign): CampaignForm => ({
  id: c.id,
  name: c.name,
  description: c.description ?? "",
  type: c.type,
  isActive: c.isActive,
  minOrderKr: c.minOrderKr,
  multiplier: c.multiplier ?? 2,
  rewardPoints: c.rewardPoints ?? 100,
  targetCount: c.targetCount ?? 3,
  repeatable: c.repeatable,
  startsAt: c.startsAt,
  endsAt: c.endsAt,
});

const emptyCampaign: CampaignForm = {
  name: "",
  description: "",
  type: "MULTIPLIER",
  isActive: true,
  minOrderKr: 0,
  multiplier: 2,
  rewardPoints: 100,
  targetCount: 3,
  repeatable: false,
  startsAt: null,
  endsAt: null,
};

const TYPE_LABEL: Record<PointsCampaign["type"], string> = {
  MULTIPLIER: "Multiplikator",
  STREAK_DAILY: "Svit – dagar",
  STREAK_WEEKLY: "Svit – veckor",
};

function CampaignsTab() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: dpointsKeys.campaigns, queryFn: getCampaigns });
  const [editing, setEditing] = useState<CampaignForm | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: dpointsKeys.campaigns });

  const saveMut = useMutation({
    mutationFn: (f: CampaignForm) => {
      const isStreak = f.type !== "MULTIPLIER";
      const payload: Record<string, unknown> = {
        name: f.name,
        description: f.description,
        type: f.type,
        isActive: f.isActive,
        minOrderKr: f.minOrderKr,
        startsAt: f.startsAt,
        endsAt: f.endsAt,
        multiplier: isStreak ? null : f.multiplier,
        rewardPoints: isStreak ? f.rewardPoints : null,
        targetCount: isStreak ? f.targetCount : null,
        repeatable: f.repeatable,
      };
      return f.id ? updateCampaign(f.id, payload) : createCampaign(payload);
    },
    onSuccess: () => {
      invalidate();
      setEditing(null);
    },
  });
  const delMut = useMutation({ mutationFn: deleteCampaign, onSuccess: invalidate });

  return (
    <Surface>
      <div className="flex items-center justify-between p-6">
        <div>
          <h2 className="text-lg font-semibold">Kampanjer & utmaningar</h2>
        </div>
        <Button variant="primary" onClick={() => setEditing({ ...emptyCampaign })}>
          <Plus size={16} /> Ny kampanj
        </Button>
      </div>
      <div className="px-6 pb-6">
        {list.isLoading ? (
          <LoadingPanel />
        ) : (list.data ?? []).length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Inga kampanjer ännu.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {(list.data ?? []).map((c) => (
              <div key={c.id} className="surface-muted flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{c.name}</span>
                    <Badge tone="info">{TYPE_LABEL[c.type]}</Badge>
                    {c.type === "MULTIPLIER" ? (
                      <Badge tone="neutral">{c.multiplier}×</Badge>
                    ) : (
                      <Badge tone="neutral">{c.targetCount} → {c.rewardPoints} p</Badge>
                    )}
                    <Badge tone={c.isActive ? "success" : "neutral"}>{c.isActive ? "Aktiv" : "Av"}</Badge>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {c._count?.progress ?? 0} deltagare{c.minOrderKr > 0 ? ` · min ${c.minOrderKr} kr` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => setEditing(campaignToForm(c))}>Redigera</Button>
                  <Button variant="danger" onClick={() => delMut.mutate(c.id)}>
                    <Trash2 size={15} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={!!editing}
        title={editing?.id ? "Redigera kampanj" : "Ny kampanj"}
        onClose={() => setEditing(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setEditing(null)}>Avbryt</Button>
            <Button variant="primary" disabled={saveMut.isPending} onClick={() => editing && saveMut.mutate(editing)}>
              {saveMut.isPending ? <Loader2 className="animate-spin" size={16} /> : "Spara"}
            </Button>
          </div>
        }
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <Field label="Namn">
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </Field>
            <Field label="Beskrivning (visas för kund)">
              <Textarea value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </Field>
            <Field label="Typ">
              <Select value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value as CampaignForm["type"] })}>
                <option value="MULTIPLIER">Multiplikator (extra poäng vid köp)</option>
                <option value="STREAK_DAILY">Svit – dagar i rad</option>
                <option value="STREAK_WEEKLY">Svit – veckor i rad</option>
              </Select>
            </Field>

            {editing.type === "MULTIPLIER" ? (
              <Field label="Multiplikator (2 = dubbla poäng)">
                <Input type="number" step="0.5" value={editing.multiplier} onChange={(e) => setEditing({ ...editing, multiplier: Number(e.target.value) })} />
              </Field>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <Field label={editing.type === "STREAK_WEEKLY" ? "Antal veckor i rad" : "Antal dagar i rad"}>
                  <Input type="number" value={editing.targetCount} onChange={(e) => setEditing({ ...editing, targetCount: Number(e.target.value) })} />
                </Field>
                <Field label="Bonus (poäng)">
                  <Input type="number" value={editing.rewardPoints} onChange={(e) => setEditing({ ...editing, rewardPoints: Number(e.target.value) })} />
                </Field>
              </div>
            )}

            <Field label="Min. ordervärde (kr) — 0 = ingen gräns">
              <Input type="number" value={editing.minOrderKr} onChange={(e) => setEditing({ ...editing, minOrderKr: Number(e.target.value) })} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Från (valfritt)">
                <Input type="date" value={dtLocal(editing.startsAt)} onChange={(e) => setEditing({ ...editing, startsAt: e.target.value || null })} />
              </Field>
              <Field label="Till (valfritt)">
                <Input type="date" value={dtLocal(editing.endsAt)} onChange={(e) => setEditing({ ...editing, endsAt: e.target.value || null })} />
              </Field>
            </div>

            {editing.type !== "MULTIPLIER" && (
              <SwitchRow
                label="Kan klaras om och om (annars en gång per kund)"
                checked={editing.repeatable}
                onChange={(v) => setEditing({ ...editing, repeatable: v })}
              />
            )}
            <SwitchRow label="Aktiv" checked={editing.isActive} onChange={(v) => setEditing({ ...editing, isActive: v })} />
          </div>
        )}
      </Modal>
    </Surface>
  );
}

// ── Kunder + koder ───────────────────────────────────────────────────────────
function CustomersTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [adjustId, setAdjustId] = useState<string | null>(null);
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");

  const customers = useQuery({ queryKey: dpointsKeys.customers(query), queryFn: () => getCustomers(query) });
  const detail = useQuery({ queryKey: dpointsKeys.customer(adjustId ?? ""), queryFn: () => getCustomer(adjustId as string), enabled: !!adjustId });
  const redemptions = useQuery({ queryKey: dpointsKeys.redemptions, queryFn: getRedemptions });

  const adjustMut = useMutation({
    mutationFn: () => adjustCustomer(adjustId as string, amount, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: dpointsKeys.customers(query) });
      qc.invalidateQueries({ queryKey: dpointsKeys.customer(adjustId ?? "") });
      setAdjustId(null);
      setAmount(0);
      setReason("");
    },
  });

  const adjustErr = (adjustMut.error as { response?: { data?: { error?: string } } } | undefined)?.response?.data?.error;

  return (
    <div className="flex flex-col gap-6">
      <Surface>
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-center gap-2">
            <Search size={16} className="text-[var(--text-secondary)]" />
            <Input
              placeholder="Sök kund (namn, e-post, telefon)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setQuery(search.trim())}
            />
            <Button onClick={() => setQuery(search.trim())}>Sök</Button>
          </div>
          {customers.isLoading ? (
            <LoadingPanel />
          ) : (customers.data ?? []).length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">{query ? "Inga träffar." : "Inga kunder med poäng ännu."}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {(customers.data ?? []).map((u) => (
                <div key={u.id} className="surface-muted flex items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-semibold">{u.name || u.phone || u.email || u.id}</p>
                    <p className="text-xs text-[var(--text-secondary)]">{[u.phone, u.email].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone="info">{u.pointsBalance.toLocaleString("sv-SE")} p</Badge>
                    <Button onClick={() => { setAdjustId(u.id); setAmount(0); setReason(""); }}>Ge / dra</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Surface>

      <Surface>
        <div className="flex flex-col gap-3 p-6">
          <h2 className="text-lg font-semibold">Utfärdade inlösen-koder</h2>
          {redemptions.isLoading ? (
            <LoadingPanel />
          ) : (redemptions.data ?? []).length === 0 ? (
            <p className="text-sm text-[var(--text-secondary)]">Inga koder utfärdade ännu.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {(redemptions.data ?? []).map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] py-2 text-sm">
                  <span className="font-mono font-semibold">{r.code ?? "—"}</span>
                  <span className="text-[var(--text-secondary)]">{r.reason}</span>
                  <span>{r.userName || r.userPhone || "—"}</span>
                  <span className="text-[var(--text-secondary)]">−{r.pointsSpent} p</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Surface>

      <Modal
        open={!!adjustId}
        title="Ge eller dra poäng"
        onClose={() => setAdjustId(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setAdjustId(null)}>Avbryt</Button>
            <Button variant="primary" disabled={adjustMut.isPending} onClick={() => adjustMut.mutate()}>
              {adjustMut.isPending ? <Loader2 className="animate-spin" size={16} /> : "Bekräfta"}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {detail.data && (
            <p className="text-sm text-[var(--text-secondary)]">
              {detail.data.customer.name || detail.data.customer.phone} har just nu{" "}
              <strong>{detail.data.customer.pointsBalance.toLocaleString("sv-SE")} p</strong>.
            </p>
          )}
          <Field label="Antal poäng (+/−)">
            <Input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </Field>
          <Field label="Anledning">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="t.ex. kompensation för försenad order" />
          </Field>
          {adjustErr && <p className="text-sm text-[var(--accent-danger,#dc2626)]">{adjustErr}</p>}
        </div>
      </Modal>
    </div>
  );
}
