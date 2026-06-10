import { useEffect, useState } from "react";
import { Power, Wallet } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { kr } from "../lib/format";
import { Card, GoldButton, Spinner } from "../ui";

export function SessionStart({ onStart }: { onStart: () => Promise<void> }) {
  const { courier, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const [todayKr, setTodayKr] = useState<number | null>(null);

  useEffect(() => {
    api.getHistory().then((h) => {
      const today = new Date().toDateString();
      setTodayKr(h.filter((o) => new Date(o.deliveredAt).toDateString() === today).reduce((s, o) => s + o.payout, 0));
    });
  }, []);

  const start = async () => {
    setBusy(true);
    try {
      await onStart();
    } finally {
      setBusy(false);
    }
  };

  const first = (courier?.name || "").split(" ")[0];

  return (
    <div className="flex min-h-screen flex-col justify-center px-6 pb-12" style={{ paddingTop: "max(2rem, env(safe-area-inset-top))" }}>
      <div className="mx-auto w-full max-w-sm text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-ink text-gold">
          <Power size={28} strokeWidth={2.4} />
        </div>
        <h1 className="text-2xl font-black tracking-tight">Redo att börja köra{first ? `, ${first}` : ""}?</h1>
        <p className="mt-2 text-sm text-muted">Din session är stängd. Starta den för att ta emot ordrar idag.</p>

        {todayKr !== null && todayKr > 0 && (
          <Card className="mt-6 flex items-center justify-between p-4 text-left">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Intjänat idag</p>
              <p className="text-2xl font-black">{kr(todayKr)}</p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-soft text-gold-deep">
              <Wallet size={20} />
            </div>
          </Card>
        )}

        <div className="mt-7">
          <GoldButton onClick={start} disabled={busy}>
            {busy ? <Spinner /> : "Starta session"}
          </GoldButton>
        </div>

        <button onClick={logout} className="mt-5 text-sm font-bold text-muted">
          Logga ut
        </button>
      </div>
    </div>
  );
}
