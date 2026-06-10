import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Bike, Car, Clock, MapPin, Store } from "lucide-react";
import { api } from "../lib/api";
import { useGeo } from "../lib/geoctx";
import type { Job } from "../lib/types";
import { kr } from "../lib/format";
import { LiveMap } from "../map";
import { AddressRow, AppBar, Card, GoldButton, Spinner } from "../ui";

export function JobPreview() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const me = useGeo();
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getJobById(id).then(setJob).catch(() => setJob(null));
  }, [id]);

  if (job === undefined) {
    return (
      <div className="flex justify-center pt-24">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (job === null) {
    return (
      <div className="px-5 pb-28">
        <AppBar title="Order" onBack={() => nav("/")} />
        <Card className="mt-4 p-8 text-center text-sm text-muted">Ordern är inte längre tillgänglig.</Card>
      </div>
    );
  }

  const Vehicle = job.vehicle === "CAR" ? Car : Bike;

  const accept = async () => {
    setBusy(true);
    try {
      await api.acceptJob(job.id);
      nav("/aktiv");
    } catch (e) {
      alert((e as Error).message);
      nav("/");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-5 pb-28">
      <AppBar title={job.restaurantName} onBack={() => nav("/")} />

      <div className="pt-4">
        <LiveMap me={me} pickup={job.pickup} dropoff={job.dropoff} height={210} />

        <Card className="mt-3 flex items-center justify-between p-4">
          <div className="flex items-center gap-3 text-[13px] font-bold text-ink">
            <span className="flex items-center gap-1.5">
              <Vehicle size={16} className="text-gold-deep" /> {job.distanceKm.toFixed(1).replace(".", ",")} km
            </span>
            <span className="flex items-center gap-1.5 text-muted">
              <Clock size={15} /> {job.etaMin} min
            </span>
          </div>
          <span className="text-xl font-black">{kr(job.payout)}</span>
        </Card>

        <Card className="mt-3 divide-y divide-[var(--color-line)]">
          <div className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
              <Store size={14} /> Hämta
            </p>
            <p className="text-[15px] font-black">{job.restaurantName}</p>
            <AddressRow address={job.pickupAddress} />
          </div>
          <div className="p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
              <MapPin size={14} /> Leverera till
            </p>
            <p className="text-[15px] font-black">{job.dropoffName}</p>
            <AddressRow address={job.dropoffAddress} />
          </div>
        </Card>

        <div className="mt-4">
          <GoldButton onClick={accept} disabled={busy}>
            {busy ? <Spinner /> : "Acceptera order"}
          </GoldButton>
        </div>
      </div>
    </div>
  );
}
