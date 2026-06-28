"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Coins, Loader2, History, ChevronDown,
  UserPlus, Repeat, Store, Star,
} from "lucide-react";
import {
  fetchDpointsMe,
  fetchDpointsRewards,
  claimDpointsSignup,
  txLabel,
  type DpointsMe,
  type EarnRule,
} from "@/lib/dpoints";

// Ikon + ev. länk per regel-nyckel. Label + poäng + på/av kommer från admin.
const EARN_ICON: Record<string, typeof UserPlus> = {
  invite: UserPlus,
  order_streak: Repeat,
  new_restaurant: Store,
  review_rating: Star,
  review_text: Star,
};
const EARN_HREF: Record<string, string> = { invite: "/invite" };

// Dpoints-panel i profilen: saldo, historik (bakom knapp) och sätt att tjäna.
// Monokromt/ink-tema — sparsamt med färg.
export default function DpointsPanel() {
  const [me, setMe] = useState<DpointsMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [earnRules, setEarnRules] = useState<EarnRule[]>([]);

  async function handleClaim() {
    setClaiming(true);
    try {
      await claimDpointsSignup();
      setMe(await fetchDpointsMe());
    } catch {
      /* tyst */
    } finally {
      setClaiming(false);
    }
  }

  async function load() {
    try {
      const [meData, rewardData] = await Promise.all([fetchDpointsMe(), fetchDpointsRewards()]);
      setMe(meData);
      setEarnRules(rewardData.earnRules || []);
      try { localStorage.setItem("dp_hadAccount", "1"); } catch { /* noop */ }
    } catch {
      // tyst — panelen göms om Dpoints är av/otillgängligt
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-3xl bg-zinc-50 py-10">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  // Endast om panelen inte kunde laddas alls → visa inget.
  if (!me) return null;

  const valueKr = me.valuePerKr > 0 ? Math.floor(me.balance / me.valuePerKr) : 0;

  return (
    <div className="space-y-5">
      {/* Claima välkomstbonus (nytt konto, ej hämtad än) */}
      {me.signup?.claimable && (
        <button
          onClick={handleClaim}
          disabled={claiming}
          className="w-full rounded-3xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-left transition hover:bg-zinc-100"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-black text-zinc-900">Hämta din välkomstbonus</p>
              <p className="text-sm text-zinc-600">+{me.signup.bonusPoints} Dpoints väntar på dig</p>
            </div>
            <span className="shrink-0 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-black text-white">
              {claiming ? "…" : "Hämta"}
            </span>
          </div>
        </button>
      )}

      {/* Saldo-kort — kompakt ink med guld-highlight på poäng + ikon */}
      <div className="rounded-3xl bg-zinc-950 px-5 py-4 text-white">
        <div className="flex items-center gap-2 text-xs font-semibold text-zinc-400">
          <Coins className="h-4 w-4" style={{ color: "var(--color-gold-500, #F0531C)" }} /> Dpoints
        </div>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="text-3xl font-black tracking-tight" style={{ color: "var(--color-gold-500, #F0531C)" }}>
            {me.balance.toLocaleString("sv-SE")}
          </span>
          <span className="text-sm font-medium text-zinc-400">≈ {valueKr} kr i värde</span>
        </div>
      </div>

      {/* Historik bakom en knapp — senaste 7 */}
      <div>
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="flex w-full items-center justify-between rounded-2xl border border-zinc-200 px-4 py-3.5 text-sm font-bold text-zinc-900 transition hover:bg-zinc-50"
        >
          <span className="flex items-center gap-2">
            <History className="h-4 w-4 text-zinc-500" /> Historik
          </span>
          <ChevronDown className={`h-4 w-4 text-zinc-400 transition-transform ${showHistory ? "rotate-180" : ""}`} />
        </button>
        {showHistory && (
          <div className="mt-2 space-y-1 px-1">
            {me.transactions.length === 0 ? (
              <p className="py-2 text-sm text-zinc-500">Ingen historik än.</p>
            ) : (
              me.transactions.slice(0, 7).map((t) => (
                <div key={t.id} className="flex items-center justify-between border-b border-zinc-100 py-2 text-sm last:border-none">
                  <span className="text-zinc-600">{txLabel(t)}</span>
                  <span className={`font-semibold ${t.amount >= 0 ? "text-zinc-900" : "text-zinc-400"}`}>
                    {t.amount >= 0 ? "+" : ""}
                    {t.amount}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Tjäna Dpoints — styrs från admin (label + poäng + på/av). */}
      {earnRules.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-zinc-900">Tjäna Dpoints</h3>
          <p className="mb-3 mt-0.5 text-xs text-zinc-500">Poäng läggs till automatiskt.</p>
          <div className="overflow-hidden rounded-2xl border border-zinc-200">
            {earnRules.map((rule, i) => {
              const Icon = EARN_ICON[rule.key] ?? Coins;
              const href = EARN_HREF[rule.key];
              const cls = `flex items-center gap-3 px-4 py-3.5 ${i > 0 ? "border-t border-zinc-100" : ""}`;
              // Sub-caption: hur ofta regeln kan tjänas. För streak visas live-läget
              // (framsteg, eller förbrukad + redo om X dagar).
              const caption =
                rule.key === "order_streak" && me.streak
                  ? me.streak.ready
                    ? `${me.streak.count}/${me.streak.target} på 7 dagar`
                    : `Klar, redo om ${me.streak.readyInDays} ${me.streak.readyInDays === 1 ? "dag" : "dagar"}`
                  : rule.repeat;
              const inner = (
                <>
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-zinc-900">{rule.label}</p>
                    {caption && <p className="text-xs text-zinc-500">{caption}</p>}
                  </div>
                  <span className="shrink-0 rounded-full bg-zinc-900 px-3 py-1 text-xs font-bold text-white">+{rule.points} p</span>
                </>
              );
              return href ? (
                <Link key={rule.key} href={href} className={`${cls} transition hover:bg-zinc-50`}>
                  {inner}
                </Link>
              ) : (
                <div key={rule.key} className={cls}>{inner}</div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
