"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Surface, Button, Input, LoadingPanel, Toggle } from "@/shared/components/ui";
import { dpointsKeys, getConfig, updateConfig, type EarnRule } from "../api";

// Belöningar = hur många Vpoints varje handling ger. Toggle + poäng per handling.
// Sparas som dpointsEarnRules i config. Reglerna driver kundens "Tjäna Vpoints"
// + reward-hooks (invite, recension, ny restaurang, streak).

// Hur ofta varje regel kan tjänas (läs-bar indikator, matchar backend-logiken).
const REPEAT: Record<string, string> = {
  invite: "Upp till 5 per 30 dagar",
  review_rating: "Varje recension",
  review_text: "Varje recension",
  new_restaurant: "Varje ny restaurang",
  order_streak: "Repeterbar var 7:e dag",
};

export default function RewardsTab() {
  const qc = useQueryClient();
  const config = useQuery({ queryKey: dpointsKeys.config, queryFn: getConfig });
  const save = useMutation({
    mutationFn: (payload: { dpointsEarnRules: EarnRule[]; dpointsStreakTarget: number }) => updateConfig(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: dpointsKeys.config }),
  });

  const [rules, setRules] = useState<EarnRule[]>([]);
  const [streakTarget, setStreakTarget] = useState(3);
  useEffect(() => {
    if (config.data?.dpointsEarnRules) setRules(config.data.dpointsEarnRules);
    if (config.data?.dpointsStreakTarget) setStreakTarget(config.data.dpointsStreakTarget);
  }, [config.data]);

  if (config.isLoading || !config.data) return <LoadingPanel />;

  const setPoints = (key: string, points: number) =>
    setRules((r) => r.map((x) => (x.key === key ? { ...x, points } : x)));
  const setEnabled = (key: string, enabled: boolean) =>
    setRules((r) => r.map((x) => (x.key === key ? { ...x, enabled } : x)));

  const dirty =
    JSON.stringify(rules) !== JSON.stringify(config.data.dpointsEarnRules) ||
    streakTarget !== config.data.dpointsStreakTarget;

  return (
    <Surface>
      <div className="flex flex-col gap-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Belöningar</h2>
            <p className="text-sm text-[var(--text-secondary)]">Hur många Vpoints varje handling ger. Stäng av eller ändra poäng.</p>
          </div>
          <Button variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate({ dpointsEarnRules: rules, dpointsStreakTarget: streakTarget })}>
            {save.isPending ? <Loader2 className="animate-spin" size={16} /> : "Spara"}
          </Button>
        </div>

        <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)]">
          {rules.map((rule, i) => (
            <div key={rule.key} className={`px-4 py-3.5 ${i > 0 ? "border-t border-[var(--border-subtle)]" : ""}`}>
              <div className="flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold" style={{ color: rule.enabled ? "var(--text-primary)" : "var(--text-muted)" }}>
                    {rule.label}
                  </p>
                  {REPEAT[rule.key] && <p className="text-xs text-[var(--text-muted)]">{REPEAT[rule.key]}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    className="w-24"
                    value={rule.points}
                    disabled={!rule.enabled}
                    onChange={(e) => setPoints(rule.key, Math.max(0, Math.round(Number(e.target.value) || 0)))}
                  />
                  <span className="text-sm text-[var(--text-secondary)]">p</span>
                </div>
                <Toggle checked={rule.enabled} onChange={(v) => setEnabled(rule.key, v)} />
              </div>

              {/* Streak-mål: hur många betalda ordrar inom 7 dagar som krävs. */}
              {rule.key === "order_streak" && rule.enabled && (
                <div className="mt-3 flex items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
                  <span className="text-sm text-[var(--text-secondary)]">Kräver</span>
                  <Input
                    type="number"
                    min="2"
                    className="w-20"
                    value={streakTarget}
                    onChange={(e) => setStreakTarget(Math.max(2, Math.round(Number(e.target.value) || 3)))}
                  />
                  <span className="text-sm text-[var(--text-secondary)]">betalda ordrar inom 7 dagar</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {dirty && <p className="text-xs text-[var(--text-secondary)]">Osparade ändringar.</p>}
      </div>
    </Surface>
  );
}
