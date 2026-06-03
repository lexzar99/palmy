"use client";

import { useEffect, useState } from "react";
import { Coins, Loader2, Check, Ticket } from "lucide-react";
import {
  fetchDpointsMe,
  fetchDpointsRewards,
  redeemDpoints,
  claimDpointsSignup,
  txLabel,
  type DpointsMe,
  type DpointsReward,
} from "@/lib/dpoints";

// Dpoints-panel i profilen: saldo, historik och inlösen-katalog.
export default function DpointsPanel() {
  const [me, setMe] = useState<DpointsMe | null>(null);
  const [rewards, setRewards] = useState<DpointsReward[]>([]);
  const [loading, setLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);

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
      setRewards(rewardData.rewards || []);
      // Anti-farming: markera att enheten haft ett konto → utloggat signup-
      // erbjudande göms framöver.
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

  async function handleRedeem(reward: DpointsReward) {
    setError(null);
    setRedeeming(reward.id);
    try {
      const res = await redeemDpoints(reward.id);
      setCodes((c) => ({ ...c, [reward.id]: res.code }));
      setMe((m) => (m ? { ...m, balance: res.balanceAfter } : m));
      // ladda om historiken i bakgrunden
      fetchDpointsMe().then(setMe).catch(() => {});
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || "Kunde inte lösa in just nu");
    } finally {
      setRedeeming(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-3xl bg-zinc-50 py-10">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  // Dpoints av eller ej tillgängligt → visa inget.
  if (!me || !me.enabled) return null;

  const valueKr = me.valuePerKr > 0 ? Math.floor(me.balance / me.valuePerKr) : 0;

  return (
    <div className="space-y-5">
      {/* Claima välkomstbonus (nytt konto, ej hämtad än) */}
      {me.signup?.claimable && (
        <button
          onClick={handleClaim}
          disabled={claiming}
          className="w-full rounded-3xl border-2 border-dashed border-gold-500 bg-gold-500/10 p-4 text-left transition hover:bg-gold-500/15"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-black text-zinc-900">Hämta din välkomstbonus</p>
              <p className="text-sm text-zinc-600">+{me.signup.bonusPoints} Dpoints väntar på dig</p>
            </div>
            <span className="shrink-0 rounded-full bg-gold-500 px-5 py-2.5 text-sm font-black text-zinc-950">
              {claiming ? "…" : "Hämta"}
            </span>
          </div>
        </button>
      )}

      {/* Saldo-kort */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-gold-500 to-gold-600 p-6 text-zinc-950 shadow-lg">
        <div className="flex items-center gap-2 text-sm font-semibold opacity-80">
          <Coins className="h-4 w-4" /> Dpoints
        </div>
        <div className="mt-2 text-4xl font-black tracking-tight">{me.balance.toLocaleString("sv-SE")}</div>
        <div className="mt-1 text-sm font-medium opacity-80">≈ {valueKr} kr i värde</div>
      </div>

      {/* Inlösen-katalog */}
      {rewards.length > 0 && (
        <div>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-900">
            <Ticket className="h-4 w-4 text-gold-600" /> Lös in poäng
          </h3>
          <div className="space-y-2">
            {rewards.map((r) => {
              const code = codes[r.id];
              const affordable = me.balance >= r.pointsCost;
              return (
                <div key={r.id} className="rounded-2xl border border-zinc-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-zinc-900">{r.title}</p>
                      {r.description && <p className="text-xs text-zinc-500">{r.description}</p>}
                      {r.minOrderKr > 0 && <p className="text-xs text-zinc-400">Min. order {r.minOrderKr} kr</p>}
                    </div>
                    {code ? (
                      <div className="text-right">
                        <p className="text-[10px] uppercase tracking-wide text-zinc-400">Din kod</p>
                        <p className="font-mono text-lg font-black text-gold-600">{code}</p>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleRedeem(r)}
                        disabled={!affordable || redeeming === r.id}
                        className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${
                          affordable
                            ? "bg-gold-500 text-zinc-950 hover:bg-gold-400"
                            : "cursor-not-allowed bg-zinc-100 text-zinc-400"
                        }`}
                      >
                        {redeeming === r.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          `${r.pointsCost} p`
                        )}
                      </button>
                    )}
                  </div>
                  {code && (
                    <p className="mt-2 flex items-center gap-1 text-xs text-emerald-600">
                      <Check className="h-3 w-3" /> Använd koden i kassan — den funkar bara på ditt konto.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        </div>
      )}

      {/* Historik */}
      {me.transactions.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-bold text-zinc-900">Historik</h3>
          <div className="space-y-1">
            {me.transactions.slice(0, 15).map((t) => (
              <div key={t.id} className="flex items-center justify-between border-b border-zinc-100 py-2 text-sm">
                <span className="text-zinc-600">{txLabel(t)}</span>
                <span className={t.amount >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-zinc-500"}>
                  {t.amount >= 0 ? "+" : ""}
                  {t.amount}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
