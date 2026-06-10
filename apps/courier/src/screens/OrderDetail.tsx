import { useEffect, useState, type ChangeEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Camera, Check, Info, Store } from "lucide-react";
import { api } from "../lib/api";
import { useGeo } from "../lib/geoctx";
import type { ActiveDelivery } from "../lib/types";
import { km, kr } from "../lib/format";
import { LiveMap } from "../map";
import { AddressRow, Card, GoldButton, MapsButton, Pill, Spinner, SwipeButton } from "../ui";

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-line)] bg-white active:scale-95">
        <ArrowLeft size={18} />
      </button>
      <h1 className="truncate text-lg font-black tracking-tight">{title}</h1>
    </div>
  );
}

export function OrderDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const me = useGeo();
  const [active, setActive] = useState<ActiveDelivery | null | undefined>(undefined);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api.getActiveById(id).then(setActive);
  }, [id]);

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => nav("/aktiv", { replace: true }), 2000);
    return () => clearTimeout(t);
  }, [done, nav]);

  if (active === undefined) {
    return (
      <div className="flex justify-center pt-24">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (done && active) {
    return (
      <div className="flex min-h-[80vh] flex-col items-center justify-center px-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg">
          <Check size={40} strokeWidth={2.5} />
        </div>
        <h1 className="mt-5 text-2xl font-black tracking-tight">Levererad</h1>
        <p className="mt-1 text-sm text-muted">Tack för din leverans.</p>
        <p className="mt-5 text-4xl font-black text-gold-deep">+{kr(active.payout)}</p>
      </div>
    );
  }

  if (active === null) {
    return (
      <div className="px-5 pt-3">
        <Header title="Order" onBack={() => nav("/aktiv")} />
        <Card className="p-8 text-center text-sm text-muted">Ordern hittades inte.</Card>
      </div>
    );
  }

  const onPhoto = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  };

  const pickedUp = async () => {
    setBusy(true);
    try {
      setActive(await api.markPickedUp(active.id));
    } finally {
      setBusy(false);
    }
  };

  const deliver = async () => {
    setBusy(true);
    try {
      await api.completeDelivery(active.id, { method: photo ? "LEFT_AT_DOOR" : "HANDED", photoDataUrl: photo });
      setDone(true);
    } finally {
      setBusy(false);
    }
  };

  // --------------------------------------------------------------- PICKUP
  if (active.status === "EN_ROUTE_PICKUP") {
    const allChecked = active.items.every((_, i) => checked[i]);
    return (
      <div className="px-5 pt-3 pb-28">
        <Header title={active.restaurantName} onBack={() => nav("/aktiv")} />
        <LiveMap me={me} pickup={active.pickup} height={200} />

        <Card className="mt-3 flex items-center gap-3 bg-gold-soft p-4">
          <Info size={20} className="shrink-0 text-gold-deep" />
          <div>
            <p className="text-sm font-black">Hämta från restaurangen</p>
            <p className="text-xs text-gold-deep">Visa denna skärm för personalen.</p>
          </div>
        </Card>

        <Card className="mt-3 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Order #{active.orderNumber}</p>
          <p className="flex items-center gap-1.5 text-[15px] font-black">
            <Store size={16} className="text-gold-deep" /> {active.restaurantName}
          </p>
          <AddressRow address={active.pickupAddress} />
          <div className="mt-3">
            <MapsButton to={active.pickup} label={active.restaurantName} />
          </div>
        </Card>

        <Card className="mt-3 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">{active.items.length} artiklar</p>
          <p className="mb-2 text-xs text-muted">Bocka av alla innan du hämtar</p>
          <div className="space-y-1">
            {active.items.map((it, i) => (
              <button key={i} onClick={() => setChecked((c) => ({ ...c, [i]: !c[i] }))} className="flex w-full items-center gap-3 rounded-xl py-1.5 text-left">
                <span className={`flex h-6 w-6 items-center justify-center rounded-md transition ${checked[i] ? "bg-gold text-ink" : "border border-[var(--color-line)]"}`}>
                  {checked[i] && <Check size={15} strokeWidth={3} />}
                </span>
                <span className="text-[14px] font-semibold">{it.qty}× {it.name}</span>
              </button>
            ))}
          </div>
        </Card>

        <div className="mt-4">
          {busy ? (
            <GoldButton disabled>
              <Spinner />
            </GoldButton>
          ) : (
            <SwipeButton label={allChecked ? "Swipe för att markera som hämtad" : "Bocka av alla artiklar först"} onConfirm={pickedUp} disabled={!allChecked} />
          )}
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------ ON THE WAY
  return (
    <div className="px-5 pt-3 pb-28">
      <div className="mb-3 flex items-center justify-between">
        <Header title={active.dropoffName} onBack={() => nav("/aktiv")} />
        <Pill>{kr(active.payout)}</Pill>
      </div>
      <LiveMap me={me} dropoff={active.dropoff} height={210} />

      <Card className="mt-3 p-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Leverera till</p>
        <p className="text-[15px] font-black">{active.dropoffName}</p>
        <AddressRow address={active.dropoffAddress} />
        <p className="mt-1 text-xs font-semibold text-gold-deep">{km(active.distanceKm)} kvar</p>
        <div className="mt-3">
          <MapsButton to={active.dropoff} label={active.dropoffName} />
        </div>
      </Card>

      <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--color-line)] bg-white py-3 text-sm font-bold text-muted">
        {photo ? <img src={photo} alt="" className="h-7 w-7 rounded-md object-cover" /> : <Camera size={17} />}
        {photo ? "Foto tillagt — byt" : "Lägg till leveransfoto (valfritt)"}
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
      </label>

      <div className="mt-4">
        {busy ? (
          <GoldButton disabled>
            <Spinner />
          </GoldButton>
        ) : (
          <SwipeButton label="Swipe för att slutföra leverans" onConfirm={deliver} />
        )}
      </div>
    </div>
  );
}
