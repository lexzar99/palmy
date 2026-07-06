"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import axios from "axios";
import {
  Check,
  ChevronRight,
  Copy,
  Diamond,
  Flag,
  History,
  Loader2,
  Lock,
  Repeat,
  Share2,
  Star,
  Store,
  UserPlus,
  Users,
} from "lucide-react";
import {
  claimDpointsSignup,
  fetchDpointsMe,
  fetchDpointsRewards,
  fetchRewardProducts,
  fetchSponsorCard,
  txLabel,
  type DpointsMe,
  type EarnRule,
  type RewardRestaurant,
  type SponsorCardData,
} from "@/lib/dpoints";

const EARN_ICON: Record<string, typeof UserPlus> = {
  invite: UserPlus,
  order_streak: Repeat,
  new_restaurant: Store,
  review_rating: Star,
  review_text: Star,
};

const nf = (n: number) => n.toLocaleString("sv-SE");
const REWARDS_CACHE_KEY = "viaeats_rewards_cache_v1";

// Deal-kortens blå (Swift: dealBlue → dealBlueDeep).
const DEAL_BLUE_GRADIENT = "linear-gradient(135deg, #1287F5, #0A54D9)";

// Uppdrag från REWARDS-placement-feeden (GET /api/deals/app?placement=REWARDS).
// Servern äger all copy och progress; klienten renderar bara.
type MissionProgress = {
  target: number;
  count: number;
  remaining: number;
  completed: boolean;
  windowDays: number;
  rewardPoints: number;
  claimed: boolean;
};

type AppMission = {
  id: string;
  title: string;
  subtitle?: string | null;
  ctaLabel?: string | null;
  dpointsBonus?: number | null;
  missionType?: string | null;
  userDealId?: string | null;
  missionProgress?: MissionProgress | null;
};

type ReferralStatus = {
  locked: boolean;
  code?: string | null;
  shareUrl?: string | null;
  enabled: boolean;
  rewardLabel?: string | null;
  deal?: { title?: string | null } | null;
  stats?: { invited: number; registered: number; ordered: number } | null;
};

// Bjud in en vän-kortet (Swift RewardsView 11.6). Kod + dela-länk
// (viaeats.se/i/<kod>), låst tills första betalda ordern, statistik.
function ReferralInviteCard({ referral }: { referral: ReferralStatus }) {
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    if (!referral.code) return;
    try {
      await navigator.clipboard.writeText(referral.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* noop */
    }
  };

  const share = async () => {
    const code = referral.code || "";
    const reward = referral.rewardLabel || referral.deal?.title || "en belöning";
    const message = `Testa ViaEats! Använd min kod ${code} i kassan så får vi båda ${reward.toLowerCase()}.${referral.shareUrl ? ` ${referral.shareUrl}` : ""}`;
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ text: message, url: referral.shareUrl || undefined });
        return;
      } catch (e: any) {
        if (e?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* noop */
    }
  };

  const stats = referral.stats;

  return (
    <div className="rounded-[20px] border p-4" style={{ borderColor: "var(--border-muted)", backgroundColor: "var(--bg-secondary)" }}>
      <div className="flex items-center gap-3">
        <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-full text-white" style={{ backgroundColor: "#111113" }}>
          <Users size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-black" style={{ color: "var(--text-primary)" }}>Bjud in en vän</p>
          <p className="truncate text-[12px] font-bold" style={{ color: "var(--text-secondary)" }}>
            {referral.rewardLabel ? `Ni får båda ${referral.rewardLabel.toLowerCase()}` : "Din vän anger koden i kassan"}
          </p>
        </div>
      </div>

      {referral.locked ? (
        <div className="mt-3 flex items-center gap-2 rounded-[14px] p-3" style={{ backgroundColor: "rgba(17,17,19,0.035)" }}>
          <Lock size={14} className="shrink-0" style={{ color: "var(--text-secondary)" }} />
          <p className="text-[13px] font-bold" style={{ color: "var(--text-secondary)" }}>
            Gör din första beställning så låser du upp din kod.
          </p>
        </div>
      ) : referral.code ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={copyCode}
            className="flex h-[50px] flex-1 items-center justify-center gap-2.5 rounded-[14px] active:scale-[0.99]"
            style={{ backgroundColor: "rgba(17,17,19,0.035)" }}
          >
            <span className="font-mono text-[19px] font-black tracking-[0.12em]" style={{ color: "var(--text-primary)" }}>{referral.code}</span>
            {copied ? <Check size={14} style={{ color: "#2E7D4F" }} /> : <Copy size={13} style={{ color: "var(--text-secondary)" }} />}
          </button>
          <button
            type="button"
            onClick={share}
            className="flex h-[50px] items-center gap-2 rounded-[14px] px-4 text-[14px] font-black text-white active:scale-[0.99]"
            style={{ backgroundColor: "var(--color-gold-500, #F0531C)" }}
          >
            <Share2 size={15} /> Dela
          </button>
        </div>
      ) : null}

      {!referral.locked && stats && stats.invited > 0 && (
        <div className="mt-3 flex gap-3.5">
          {([[stats.invited, "inbjudna"], [stats.registered, "registrerade"], [stats.ordered, "har beställt"]] as const).map(([value, label]) => (
            <p key={label} className="text-[11px] font-bold" style={{ color: "var(--text-secondary)" }}>
              <span className="text-[14px] font-black" style={{ color: "var(--text-primary)" }}>{nf(value)}</span> {label}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// Uppdragskort (Swift MissionCard, 11.6). Progress + claim; servern spårar
// framsteg och betalar ut poängen automatiskt efter betald order.
function MissionCard({
  mission,
  claiming,
  onClaim,
}: {
  mission: AppMission;
  claiming: boolean;
  onClaim: (mission: AppMission) => void;
}) {
  const progress = mission.missionProgress;
  const points = progress?.rewardPoints ?? mission.dpointsBonus ?? 0;
  const isStarted = Boolean(mission.userDealId);
  const fraction = progress?.target ? Math.min(1, progress.count / progress.target) : 0;

  return (
    <div className="rounded-[18px] border p-3.5" style={{ borderColor: "var(--border-muted)", backgroundColor: "var(--bg-secondary)" }}>
      <div className="flex items-start gap-3">
        <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[14px] text-white" style={{ background: DEAL_BLUE_GRADIENT }}>
          <Flag size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-black" style={{ color: "var(--text-primary)" }}>{mission.title}</p>
          {mission.subtitle && <p className="line-clamp-2 text-[12px] font-bold" style={{ color: "var(--text-secondary)" }}>{mission.subtitle}</p>}
        </div>
        {points > 0 && (
          <span className="shrink-0 rounded-full px-[11px] py-1.5 text-[12px] font-black text-white" style={{ backgroundColor: "#111113" }}>
            +{nf(points)} p
          </span>
        )}
      </div>

      {isStarted && progress ? (
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: "rgba(17,17,19,0.06)" }}>
            <div className="h-full min-w-2 rounded-full" style={{ width: `${Math.max(4, fraction * 100)}%`, background: DEAL_BLUE_GRADIENT }} />
          </div>
          <p className="mt-1.5 text-[11px] font-bold" style={{ color: progress.completed ? "#2E7D4F" : "var(--text-secondary)" }}>
            {progress.completed
              ? "Klart! Poängen läggs till på ditt saldo."
              : progress.windowDays > 0
                ? `${progress.count} av ${progress.target} · ${progress.remaining} kvar inom ${progress.windowDays} dagar`
                : `${progress.count} av ${progress.target} beställningar`}
          </p>
        </div>
      ) : !isStarted ? (
        <button
          type="button"
          disabled={claiming}
          onClick={() => onClaim(mission)}
          className="mt-3 flex h-[42px] w-full items-center justify-center gap-2 rounded-[14px] text-[13px] font-black text-white active:scale-[0.99] disabled:opacity-60"
          style={{ backgroundColor: "#111113" }}
        >
          {claiming && <Loader2 size={14} className="animate-spin" />}
          {mission.ctaLabel || "Starta uppdraget"}
        </button>
      ) : null}
    </div>
  );
}

type RewardsCache = {
  me?: DpointsMe | null;
  earnRules?: EarnRule[];
  rewardRestaurants?: RewardRestaurant[];
  ts?: number;
};

function readRewardsCache(): RewardsCache | null {
  try {
    return JSON.parse(localStorage.getItem(REWARDS_CACHE_KEY) || "null");
  } catch {
    return null;
  }
}

function writeRewardsCache(next: RewardsCache) {
  try {
    const current = readRewardsCache() || {};
    localStorage.setItem(REWARDS_CACHE_KEY, JSON.stringify({ ...current, ...next, ts: Date.now() }));
  } catch {
    /* noop */
  }
}

function RewardsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="skeleton h-40 rounded-3xl" />
      <div className="skeleton h-7 w-44 rounded-xl" />
      <div className="flex gap-3 overflow-hidden">
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton h-56 w-36 shrink-0 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

function SponsorBanner({ onRegister }: { onRegister: () => void }) {
  const [card, setCard] = useState<SponsorCardData | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem("dp_hadAccount")) return;
    } catch {
      /* noop */
    }
    fetchSponsorCard().then(setCard).catch(() => {});
  }, []);

  if (!card) return null;

  return (
    <div
      className="rounded-3xl p-4 sm:p-5"
      style={{ backgroundColor: "#141416", border: "1px solid rgba(240,83,28,0.45)" }}
    >
      <div className="flex items-center gap-3.5">
        <Diamond size={30} strokeWidth={1.9} style={{ color: "var(--color-gold-500)" }} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-extrabold leading-tight text-white">{card.title}</p>
          {card.description && (
            <p className="mt-0.5 text-[12px] font-semibold leading-snug text-white/80">{card.description}</p>
          )}
          {card.sponsorName && <p className="mt-0.5 text-[11px] text-white/60">{card.sponsorName}</p>}
        </div>
        <span
          className="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-extrabold text-white"
          style={{ backgroundColor: "var(--color-gold-500)", fontVariantNumeric: "tabular-nums" }}
        >
          +{nf(card.bonusPoints)} p
        </span>
      </div>
      <button
        type="button"
        onClick={onRegister}
        className="mt-3 w-full text-center text-[13px] font-bold"
        style={{ color: "#FFB199" }}
      >
        Få {nf(card.bonusPoints)} Vpoints när du skapar ett konto
      </button>
    </div>
  );
}

function GuestRewards({ rewardRestaurants, loading }: { rewardRestaurants: RewardRestaurant[]; loading: boolean }) {
  const router = useRouter();
  const previewRewards = useMemo(
    () =>
      rewardRestaurants
        .flatMap((restaurant) =>
          restaurant.products.slice(0, 4).map((product) => ({
            id: product.id,
            restaurantName: restaurant.name,
            title: product.name,
            imageUrl: product.imageUrl,
            meta: `${nf(product.pointsPrice)} p`,
          })),
        )
        .slice(0, 10),
    [rewardRestaurants],
  );

  return (
    <div className="space-y-4">
      <SponsorBanner onRegister={() => router.push("/register")} />

      <section
        className="relative overflow-hidden rounded-3xl p-5 sm:p-6 text-white"
        style={{
          backgroundColor: "var(--color-gold-500)",
          boxShadow: "0 18px 40px rgba(240,83,28,0.22)",
        }}
      >
        <div className="absolute -right-9 -top-9 h-36 w-36 rounded-full bg-white/15" />
        <Diamond size={30} strokeWidth={1.9} />
        <h2 className="mt-4 text-[30px] font-black leading-[34px] tracking-tight">Poäng som blir mat</h2>
        <p className="mt-2 max-w-sm text-[13.5px] font-medium leading-5 text-white/85">
          Samla Vpoints på beställningar, uppdrag och deals från ViaEats.
        </p>
        <Link
          href="/register"
          className="mt-5 flex h-12 items-center justify-center rounded-xl bg-white px-4 text-[15px] font-extrabold"
          style={{ color: "var(--color-gold-500)" }}
        >
          Registrera dig och börja samla
        </Link>
      </section>

      <section className="space-y-2.5">
        <h2 className="text-[18px] font-extrabold" style={{ color: "var(--text-primary)" }}>Lös in</h2>
        <p className="text-[12.5px] leading-[18px]" style={{ color: "var(--text-secondary)" }}>
          Logga in för att låsa upp produkter som kan betalas med Vpoints.
        </p>

        {loading ? (
          <div className="-mx-4 flex gap-3 overflow-hidden px-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-[148px] shrink-0 overflow-hidden rounded-[18px] border" style={{ borderColor: "var(--border-muted)", backgroundColor: "var(--bg-secondary)" }}>
                <div className="skeleton h-[88px]" />
                <div className="space-y-2 p-3">
                  <div className="skeleton h-3 w-24 rounded-full" />
                  <div className="skeleton h-2.5 w-16 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {previewRewards.map((reward) => (
              <div
                key={reward.id}
                className="w-[148px] shrink-0 overflow-hidden rounded-[18px] border opacity-50"
                style={{ borderColor: "var(--border-muted)", backgroundColor: "var(--bg-secondary)" }}
              >
                <div className="relative h-[88px]" style={{ backgroundColor: "var(--bg-deep)" }}>
                  {reward.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={reward.imageUrl} alt="" className="h-full w-full object-cover" />
                  )}
                  <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-zinc-950/75 text-white">
                    <Lock size={12} />
                  </span>
                </div>
                <div className="p-3">
                  <p className="truncate text-[14.5px] font-extrabold" style={{ color: "var(--text-primary)" }}>{reward.title}</p>
                  <p className="mt-1 truncate text-[12.5px] font-medium" style={{ color: "var(--text-secondary)" }}>{reward.meta}</p>
                  <p className="mt-0.5 truncate text-[11.5px]" style={{ color: "var(--text-secondary)" }}>{reward.restaurantName}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-[18px] font-bold" style={{ color: "var(--text-primary)" }}>{title}</h2>
      {subtitle && <p className="mt-0.5 text-[13px]" style={{ color: "var(--text-secondary)" }}>{subtitle}</p>}
    </div>
  );
}

function MemberRewards({
  me,
  earnRules,
  rewardRestaurants,
  missions,
  referral,
  claimingMissionId,
  onClaimMission,
  initialHistoryOpen = false,
  loading,
  onClaimed,
}: {
  me: DpointsMe;
  earnRules: EarnRule[];
  rewardRestaurants: RewardRestaurant[];
  missions: AppMission[];
  referral: ReferralStatus | null;
  claimingMissionId: string | null;
  onClaimMission: (mission: AppMission) => void;
  initialHistoryOpen?: boolean;
  loading: boolean;
  onClaimed: (me: DpointsMe) => void;
}) {
  const [claiming, setClaiming] = useState(false);
  const [showHistory, setShowHistory] = useState(initialHistoryOpen);
  const [showEarnTasks, setShowEarnTasks] = useState(false);
  const rewardProductCount = rewardRestaurants.reduce((sum, restaurant) => sum + restaurant.products.length, 0);
  const streakProgress = me.streak ? Math.min(100, Math.round((me.streak.count / Math.max(1, me.streak.target)) * 100)) : 0;
  const historyTransactions = me.transactions.slice(0, 10);

  useEffect(() => {
    if (initialHistoryOpen) {
      setShowHistory(true);
      setShowEarnTasks(false);
    }
  }, [initialHistoryOpen]);

  const claimSignup = async () => {
    setClaiming(true);
    try {
      await claimDpointsSignup();
      const nextMe = await fetchDpointsMe();
      onClaimed(nextMe);
    } catch {
      /* noop */
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="space-y-[18px]">
      {me.signup?.claimable && (
        <button
          type="button"
          onClick={claimSignup}
          disabled={claiming}
          className="relative w-full overflow-hidden rounded-[18px] bg-[#2E7D4F] p-4 text-left active:scale-[0.99]"
        >
          <div className="absolute -right-4 -top-5 h-16 w-16 rounded-full bg-white/15" />
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-bold text-white">Hämta din välkomstbonus</p>
              <p className="mt-0.5 text-[13px] text-white/80">+{nf(me.signup.bonusPoints)} Vpoints väntar på dig</p>
            </div>
            <span className="rounded-full bg-white/20 px-5 py-2.5 text-[13px] font-bold text-white">
              {claiming ? "..." : "Hämta"}
            </span>
          </div>
        </button>
      )}

      <section
        className="relative overflow-hidden rounded-[18px] p-[17px] text-white"
        style={{
          backgroundColor: "var(--color-gold-500)",
          boxShadow: "0 14px 28px rgba(240,83,28,0.19)",
        }}
      >
        <div className="absolute -right-6 -top-7 h-28 w-28 rounded-full bg-white/15" />
        <p className="text-[12px] font-semibold text-white/70">Vpoints</p>
        <p className="mt-0.5 text-[35px] font-extrabold leading-none" style={{ fontVariantNumeric: "tabular-nums" }}>
          {nf(me.balance)}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => { setShowEarnTasks((v) => !v); setShowHistory(false); }}
            className="flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-xl border p-2 text-white"
            style={{
              backgroundColor: showEarnTasks ? "#111113" : "rgba(255,255,255,0.13)",
              borderColor: showEarnTasks ? "rgba(17,17,19,0.26)" : "rgba(255,255,255,0.20)",
            }}
          >
            <Diamond size={17} />
            <span className="text-[11.5px] font-extrabold">Tjäna poäng</span>
          </button>
          <button
            type="button"
            onClick={() => { setShowHistory((v) => !v); setShowEarnTasks(false); }}
            className="flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-xl border p-2 text-white"
            style={{
              backgroundColor: showHistory ? "#111113" : "rgba(255,255,255,0.13)",
              borderColor: showHistory ? "rgba(17,17,19,0.26)" : "rgba(255,255,255,0.20)",
            }}
          >
            <History size={17} />
            <span className="text-[11.5px] font-extrabold">Historik</span>
          </button>
        </div>
      </section>

      {showEarnTasks && (
        <section className="space-y-3">
          <SectionTitle title="Tjäna poäng" />
          <p className="px-0.5 text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
            Varje köp ger poäng: <span className="font-bold" style={{ color: "var(--text-primary)" }}>10% tillbaka i Vpoints</span>. Gör tasks för extra.
          </p>

          {/* Bjud in en vän — kod, dela-länk, låst/olåst + statistik
              (GET /api/account/referral, Swift ReferralInviteCard). */}
          {referral?.enabled && <ReferralInviteCard referral={referral} />}

          {/* Uppdrag med progress + claim (REWARDS-placement-feeden). */}
          {missions.length > 0 && (
            <>
              <SectionTitle title="Uppdrag" subtitle="Så tjänar du extra Vpoints" />
              <div className="space-y-2.5">
                {missions.map((mission) => (
                  <MissionCard
                    key={mission.id}
                    mission={mission}
                    claiming={claimingMissionId === mission.id}
                    onClaim={onClaimMission}
                  />
                ))}
              </div>
            </>
          )}

          {earnRules.length === 0 ? (
            missions.length === 0 ? (
              <div className="rounded-[18px] border p-4 text-[13px]" style={{ borderColor: "var(--border-muted)", backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
                Inga uppdrag är aktiva just nu.
              </div>
            ) : null
          ) : (
            <div className="overflow-hidden rounded-[18px] border" style={{ borderColor: "var(--border-muted)", backgroundColor: "var(--bg-secondary)" }}>
              {earnRules.map((rule, i) => {
                const Icon = EARN_ICON[rule.key] ?? Diamond;
                const ready = rule.key === "order_streak" && !!me.streak?.ready;
                const caption =
                  rule.key === "order_streak" && me.streak
                    ? me.streak.ready
                      ? `${me.streak.count}/${me.streak.target} på 7 dagar`
                      : `Klar, redo om ${me.streak.readyInDays} ${me.streak.readyInDays === 1 ? "dag" : "dagar"}`
                    : rule.repeat;
                const row = (
                  <div className="relative flex items-center gap-3 px-4 py-[15px]" style={{ borderTop: i > 0 ? "1px solid var(--border-muted)" : "none" }}>
                    <Icon size={21} style={{ color: ready ? "#FFFFFF" : "var(--text-primary)" }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-bold" style={{ color: ready ? "#FFFFFF" : "var(--text-primary)" }}>{rule.label}</p>
                      {caption && <p className="mt-0.5 truncate text-[12.5px]" style={{ color: ready ? "rgba(255,255,255,0.78)" : "var(--text-secondary)" }}>{caption}</p>}
                      {rule.key === "order_streak" && me.streak && (
                        <div className="mt-2 h-0.5 overflow-hidden rounded-full" style={{ backgroundColor: ready ? "rgba(255,255,255,0.24)" : "var(--bg-deep)" }}>
                          <div className="h-full" style={{ width: `${streakProgress}%`, backgroundColor: ready ? "#FFFFFF" : "var(--color-gold-500)" }} />
                        </div>
                      )}
                    </div>
                    <span className="rounded-full px-3 py-1.5 text-[12px] font-bold text-white" style={{ backgroundColor: ready ? "rgba(255,255,255,0.18)" : "#111113" }}>
                      +{nf(rule.points)} p
                    </span>
                    {rule.key === "invite" && <ChevronRight size={15} style={{ color: ready ? "#FFFFFF" : "var(--text-secondary)" }} />}
                  </div>
                );
                return rule.key === "invite" ? (
                  <Link key={rule.key} href="/invite" className={ready ? "block bg-[#2E7D4F]" : "block"}>
                    {row}
                  </Link>
                ) : (
                  <div key={rule.key} className={ready ? "bg-[#2E7D4F]" : ""}>{row}</div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {showHistory && (
        <section className="space-y-3">
          <SectionTitle title="Historik" subtitle="Dina 10 senaste Vpoints-rörelser." />
          <div className="overflow-hidden rounded-[18px] border" style={{ borderColor: "var(--border-muted)", backgroundColor: "var(--bg-secondary)" }}>
            {historyTransactions.length === 0 ? (
              <p className="px-4 py-4 text-[13px]" style={{ color: "var(--text-secondary)" }}>Ingen Vpoints-historik än.</p>
            ) : (
              historyTransactions.map((tx, i) => (
                <div key={tx.id} className="flex items-center justify-between gap-3 px-4 py-3.5" style={{ borderTop: i > 0 ? "1px solid var(--border-muted)" : "none" }}>
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold" style={{ color: "var(--text-secondary)" }}>{txLabel(tx)}</span>
                  <span className="text-[13.5px] font-extrabold" style={{ color: tx.amount >= 0 ? "var(--text-primary)" : "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                    {tx.amount >= 0 ? "+" : ""}{nf(tx.amount)}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <SectionTitle
          title="Köp med poäng"
          subtitle={rewardProductCount > 0 ? `${rewardProductCount} produkter från restaurangerna` : "Rewardable produkter visas här när de är aktiva."}
        />
        {rewardRestaurants.length === 0 ? (
          loading ? (
            <div className="-mx-4 flex gap-3 overflow-hidden px-4">
              {[0, 1, 2].map((item) => (
                <div key={item} className="skeleton h-[218px] w-[146px] shrink-0 rounded-[18px]" />
              ))}
            </div>
          ) : (
            <div className="rounded-[18px] border p-[18px]" style={{ borderColor: "var(--border-muted)", backgroundColor: "var(--bg-secondary)" }}>
              <p className="text-[14.5px] font-bold" style={{ color: "var(--text-primary)" }}>Inga produkter ännu</p>
              <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
                När en restaurang markerar produkter som rewardable i admin visas de här.
              </p>
            </div>
          )
        ) : (
          <div className="space-y-5">
            {rewardRestaurants.map((restaurant) => (
              <div key={restaurant.id} className="space-y-2.5">
                <Link href={`/restaurants/${restaurant.slug}`} className="flex items-center gap-2.5 active:opacity-80">
                  <div className="h-[34px] w-[34px] overflow-hidden rounded-[10px]" style={{ backgroundColor: "var(--bg-deep)" }}>
                    {(restaurant.logoUrl || restaurant.imageUrl) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={restaurant.logoUrl || restaurant.imageUrl || ""} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-extrabold" style={{ color: "var(--text-primary)" }}>{restaurant.name}</p>
                    <p className="truncate text-[12.5px]" style={{ color: "var(--text-secondary)" }}>
                      {restaurant.cuisine || "Rewards"} · välj produkt i menyn
                    </p>
                  </div>
                  <ChevronRight size={16} style={{ color: "var(--text-secondary)" }} />
                </Link>

                <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                  {restaurant.products.map((product) => {
                    const affordable = me.balance >= product.pointsPrice;
                    return (
                      <Link
                        key={product.id}
                        href={`/restaurants/${restaurant.slug}`}
                        className="w-[146px] shrink-0 overflow-hidden rounded-[18px] border active:opacity-85"
                        style={{
                          borderColor: affordable ? "var(--border-muted)" : "var(--border-muted)",
                          backgroundColor: "var(--bg-secondary)",
                          opacity: affordable ? 1 : 0.58,
                        }}
                      >
                        <div className="relative h-[132px] bg-white">
                          {product.imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={product.imageUrl} alt="" className="h-full w-full object-contain" />
                          )}
                          {!affordable && (
                            <span className="absolute right-2 top-2 grid h-[26px] w-[26px] place-items-center rounded-full bg-zinc-950/75 text-white">
                              <Lock size={13} />
                            </span>
                          )}
                        </div>
                        <div className="space-y-1.5 p-[11px]">
                          <p className="truncate text-[13.5px] font-extrabold" style={{ color: "var(--text-primary)" }}>{product.name}</p>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[12.5px] font-extrabold" style={{ color: "#B23C12", fontVariantNumeric: "tabular-nums" }}>
                              {nf(product.pointsPrice)} p
                            </span>
                            <span className="text-[11.5px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                              {Math.round(product.price)} kr
                            </span>
                          </div>
                          {product.tier?.label && (
                            <p className="truncate text-[11.5px]" style={{ color: "var(--text-secondary)" }}>{product.tier.label}</p>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  );
}

export default function OrdersPage() {
  const [loadingMe, setLoadingMe] = useState(true);
  const [me, setMe] = useState<DpointsMe | null>(null);
  const [earnRules, setEarnRules] = useState<EarnRule[]>([]);
  const [rewardRestaurants, setRewardRestaurants] = useState<RewardRestaurant[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [initialHistoryOpen, setInitialHistoryOpen] = useState(false);
  // Uppdrag + referral (Swift RewardsView "Tjäna"). Fel sväljs tyst — panelen
  // göms om anropen inte går igenom (t.ex. utloggad).
  const [missions, setMissions] = useState<AppMission[]>([]);
  const [referral, setReferral] = useState<ReferralStatus | null>(null);
  const [claimingMissionId, setClaimingMissionId] = useState<string | null>(null);

  const claimMission = useCallback(async (mission: AppMission) => {
    setClaimingMissionId(mission.id);
    try {
      const res = await axios.post(`/api/platform/deals/app/${mission.id}/claim`, {});
      const updated = res.data?.deal;
      // Svarets deal ersätter uppdraget i listan (nu med userDealId + progress).
      if (updated?.id) setMissions((current) => current.map((m) => (m.id === updated.id ? updated : m)));
    } catch {
      /* tyst — servern validerar, kunden kan försöka igen */
    } finally {
      setClaimingMissionId(null);
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    try {
      let data = await fetchRewardProducts();
      if (data.restaurants.length === 0) data = await fetchRewardProducts(true);
      const restaurants = Array.isArray(data.restaurants) ? data.restaurants : [];
      setRewardRestaurants(restaurants);
      writeRewardsCache({ rewardRestaurants: restaurants });
    } catch {
      setRewardRestaurants([]);
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    try {
      setInitialHistoryOpen(new URLSearchParams(window.location.search).get("history") === "1");
    } catch {
      /* noop */
    }
    const cached = readRewardsCache();
    if (cached) {
      if (cached.me !== undefined) {
        setMe(cached.me ?? null);
        setLoadingMe(false);
      }
      if (Array.isArray(cached.earnRules)) setEarnRules(cached.earnRules);
      if (Array.isArray(cached.rewardRestaurants)) {
        setRewardRestaurants(cached.rewardRestaurants);
        setCatalogLoading(false);
      }
    }

    fetchDpointsMe()
      .then((data) => {
        if (!active) return;
        setMe(data);
        writeRewardsCache({ me: data });
        try { localStorage.setItem("dp_hadAccount", "1"); } catch { /* noop */ }
      })
      .catch(() => {
        if (active) setMe(null);
      })
      .finally(() => {
        if (active) setLoadingMe(false);
      });

    // Uppdrag: GET /api/deals/app?placement=REWARDS ger missions med
    // missionProgress för inloggad kund. Referral: GET /api/account/referral.
    // Båda är tysta (Swift: try?) — utloggad nollas de.
    axios
      .get(`/api/platform/deals/app`, { params: { placement: "REWARDS", limit: 8, _t: Date.now() } })
      .then((res) => {
        if (active) setMissions(Array.isArray(res.data?.deals) ? res.data.deals : []);
      })
      .catch(() => {
        if (active) setMissions([]);
      });
    axios
      .get(`/api/platform/account/referral`)
      .then((res) => {
        if (active) setReferral(res.data && typeof res.data === "object" ? res.data : null);
      })
      .catch(() => {
        if (active) setReferral(null);
      });

    fetchDpointsRewards()
      .then((data) => {
        if (!active) return;
        const rules = data.earnRules || [];
        setEarnRules(rules);
        writeRewardsCache({ earnRules: rules });
      })
      .catch(() => {
        if (active) setEarnRules([]);
      });

    void loadCatalog();
    return () => { active = false; };
  }, [loadCatalog]);

  const loggedIn = !!me;

  return (
    <div className="min-h-screen md:pt-20 pb-32" style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-primary)" }}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-[18px] px-5 pt-8 sm:px-6 lg:px-10">
        <header className="space-y-1">
          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[30px] font-black leading-tight tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            Rewards
          </motion.h1>
          <p className="text-[13.5px] leading-[19px]" style={{ color: "var(--text-secondary)" }}>
            {loggedIn
              ? "Tjäna poäng, köp reward-produkter och följ din historik."
              : "Se vilka rewards du kan låsa upp när du loggar in."}
          </p>
        </header>

        {loadingMe ? (
          <RewardsSkeleton />
        ) : loggedIn && me.enabled ? (
          <MemberRewards
            me={me}
            earnRules={earnRules}
            rewardRestaurants={rewardRestaurants}
            missions={missions}
            referral={referral}
            claimingMissionId={claimingMissionId}
            onClaimMission={claimMission}
            initialHistoryOpen={initialHistoryOpen}
            loading={catalogLoading}
            onClaimed={(nextMe) => {
              setMe(nextMe);
              writeRewardsCache({ me: nextMe });
            }}
          />
        ) : !loggedIn ? (
          <GuestRewards rewardRestaurants={rewardRestaurants} loading={catalogLoading} />
        ) : (
          <div className="rounded-2xl border p-4 text-[13px]" style={{ borderColor: "var(--border-muted)", backgroundColor: "var(--bg-secondary)", color: "var(--text-secondary)" }}>
            Rewards är inte aktivt just nu.
          </div>
        )}
      </div>
    </div>
  );
}
