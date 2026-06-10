import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bike, Car, ChevronRight, Clock, MapPin, Store, Wallet } from "lucide-react";
import { api } from "../lib/api";
import { MAX_ACTIVE, type Job } from "../lib/types";
import { kr, secondsLeft } from "../lib/format";
import { Card, GoldButton, Pill, Spinner } from "../ui";

function JobCard({ job, atMax, accepting, onAccept }: { job: Job; atMax: boolean; accepting: boolean; onAccept: () => void }) {
  const left = secondsLeft(job.expiresAt);
  const Vehicle = job.vehicle === "CAR" ? Car : Bike;
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[15px] font-black leading-tight">
          <Store size={16} className="text-gold-deep" />
          {job.restaurantName}
        </span>
        <span className="text-xs font-semibold text-muted">{left}s</span>
      </div>

      <div className="mt-3 rounded-2xl bg-canvas p-3">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Leverans till</p>
        <p className="text-[14px] font-bold leading-tight">{job.dropoffName}</p>
        <p className="mt-0.5 flex items-start gap-1.5 text-[13px] leading-snug text-muted">
          <MapPin size={14} className="mt-0.5 shrink-0" />
          {job.dropoffAddress}
        </p>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-3 text-[13px] font-bold text-ink">
          <span className="flex items-center gap-1.5">
            <Vehicle size={16} className="text-gold-deep" /> {job.distanceKm.toFixed(1).replace(".", ",")} km
          </span>
          <span className="flex items-center gap-1.5 text-muted">
            <Clock size={15} /> {job.etaMin} min
          </span>
        </div>
        <span className="text-lg font-black">{kr(job.payout)}</span>
      </div>

      <div className="mt-3">
        <GoldButton onClick={onAccept} disabled={atMax || accepting || left <= 0}>
          {accepting ? <Spinner /> : atMax ? `Max ${MAX_ACTIVE} ordrar` : "Acceptera order"}
        </GoldButton>
      </div>
    </Card>
  );
}

export function Jobs() {
  const nav = useNavigate();
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [activeCount, setActiveCount] = useState(0);
  const [todayKr, setTodayKr] = useState(0);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    const [j, a, h] = await Promise.all([api.listJobs(), api.getActiveList(), api.getHistory()]);
    setJobs(j);
    setActiveCount(a.length);
    const today = new Date().toDateString();
    setTodayKr(h.filter((o) => new Date(o.deliveredAt).toDateString() === today).reduce((s, o) => s + o.payout, 0));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  const atMax = activeCount >= MAX_ACTIVE;

  return (
    <div className="px-5 pt-3 pb-28">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-black tracking-tight">Tillgängliga uppdrag</h1>
        <Pill tone="green">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Online
        </Pill>
      </div>

      <Card className="mb-4 flex items-center justify-between p-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Intjänat idag</p>
          <p className="text-2xl font-black">{kr(todayKr)}</p>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-soft text-gold-deep">
          <Wallet size={20} />
        </div>
      </Card>

      {activeCount > 0 && (
        <button onClick={() => nav("/aktiv")} className="mb-4 w-full">
          <Card className="flex items-center justify-between border-gold/40 bg-gold-soft p-4 text-left">
            <p className="text-sm font-black">
              {activeCount} pågående {activeCount === 1 ? "leverans" : "leveranser"}
            </p>
            <ChevronRight size={18} className="text-gold-deep" />
          </Card>
        </button>
      )}

      {jobs === null ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : jobs.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm font-semibold">Inga uppdrag just nu</p>
          <p className="mt-1 text-xs text-muted">Du får en notis när nästa order kommer in i din stad.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {atMax && (
            <p className="px-1 text-xs font-semibold text-muted">Du har {MAX_ACTIVE} aktiva ordrar — slutför en innan du tar en ny.</p>
          )}
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} atMax={atMax} accepting={accepting === job.id} onAccept={() => accept(job.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
