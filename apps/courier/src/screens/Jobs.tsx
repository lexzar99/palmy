import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useGeo } from "../lib/geoctx";
import type { ActiveDelivery, Job } from "../lib/types";
import { km, kr, secondsLeft } from "../lib/format";
import { LiveMap } from "../map";
import { Card, GoldButton, Pill, Spinner } from "../ui";

function JobCard({ job, disabled, accepting, onAccept }: { job: Job; disabled: boolean; accepting: boolean; onAccept: () => void }) {
  const left = secondsLeft(job.expiresAt);
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <Pill>Ny order</Pill>
        <span className="text-xs font-semibold text-muted">{left} sek kvar</span>
      </div>

      <div className="mt-3">
        <p className="text-[15px] font-black leading-tight">{job.restaurantName}</p>
        <p className="mt-0.5 text-[13px] text-muted">📍 {job.pickupAddress}</p>
      </div>

      <div className="my-3 flex items-center gap-2 text-[13px] font-bold text-gold-deep">
        <span>{job.vehicle === "CAR" ? "🚗" : "🚲"}</span>
        <span>{km(job.distanceKm)}</span>
        <span className="h-px flex-1 bg-[var(--color-line)]" />
      </div>

      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Kund</p>
        <p className="text-[14px] font-bold leading-tight">{job.dropoffName}</p>
        <p className="mt-0.5 text-[13px] text-muted">📍 {job.dropoffAddress}</p>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted">Total ersättning</span>
        {job.tip > 0 && <Pill tone="muted">inkl. tips</Pill>}
      </div>
      <p className="text-2xl font-black leading-tight">{kr(job.payout)}</p>

      <div className="mt-3">
        <GoldButton onClick={onAccept} disabled={disabled || accepting || left <= 0}>
          {accepting ? <Spinner /> : "Acceptera order"}
        </GoldButton>
      </div>
    </Card>
  );
}

export function Jobs() {
  const nav = useNavigate();
  const me = useGeo();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [active, setActive] = useState<ActiveDelivery | null>(null);
  const [todayKr, setTodayKr] = useState(0);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    const [j, a, h] = await Promise.all([api.listJobs(), api.getActive(), api.getHistory()]);
    setJobs(j);
    setActive(a);
    const today = new Date().toDateString();
    setTodayKr(h.filter((o) => new Date(o.deliveredAt).toDateString() === today).reduce((s, o) => s + o.payout, 0));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 1s-tick för nedräkning + auto-städa utgångna ordrar
  useEffect(() => {
    const t = setInterval(() => {
      tick((n) => n + 1);
      setJobs((cur) => (cur ? cur.filter((j) => secondsLeft(j.expiresAt) > 0) : cur));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const accept = async (id: string) => {
    setAccepting(id);
    try {
      await api.acceptJob(id);
      nav("/aktiv");
    } catch (e) {
      alert((e as Error).message);
      void load();
    } finally {
      setAccepting(null);
    }
  };

  return (
    <div className="px-5 pt-3 pb-28">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-black tracking-tight">Tillgängliga uppdrag</h1>
        <Pill tone="green">● Online</Pill>
      </div>

      <Card className="mb-4 flex items-center justify-between p-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Intjänat idag</p>
          <p className="text-2xl font-black">{kr(todayKr)}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-soft text-gold-deep">💰</div>
      </Card>

      {active && (
        <button onClick={() => nav("/aktiv")} className="mb-4 w-full">
          <Card className="flex items-center justify-between border-gold/40 bg-gold-soft p-4 text-left">
            <div>
              <p className="text-sm font-black">Du har en pågående leverans</p>
              <p className="text-xs text-gold-deep">{active.restaurantName} · #{active.orderNumber}</p>
            </div>
            <span className="text-gold-deep">→</span>
          </Card>
        </button>
      )}

      {jobs === null ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : jobs.length === 0 ? (
        <Card className="p-6 text-center">
          <LiveMap me={me} height={140} />
          <p className="mt-4 text-sm font-semibold">Inga uppdrag just nu</p>
          <p className="mt-1 text-xs text-muted">Du får en notis när nästa order kommer in.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              disabled={Boolean(active)}
              accepting={accepting === job.id}
              onAccept={() => accept(job.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
