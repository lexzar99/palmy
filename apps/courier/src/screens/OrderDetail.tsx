import { useEffect, useState, type ChangeEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Camera, Check, Info, Store } from "lucide-react";
import { api } from "../lib/api";
import { useGeo } from "../lib/geoctx";
import type { ActiveDelivery } from "../lib/types";
import { km, kr } from "../lib/format";
import { LiveMap } from "../map";
import { AddressRow, AppBar, Card, Checkbox, GoldButton, MapsButton, Pill, Spinner, SwipeButton } from "../ui";

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

  if (active === undefined) {
    return (
      <div className="flex justify-center pt-24">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (done && active) {
    return (
      <div className="flex min-h-[88vh] flex-col items-center justify-center px-6 text-center">
        <div className="animate-pop flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-200">
          <Check size={48} strokeWidth={2.5} />
        </div>
        <h1 className="mt-6 text-2xl font-black tracking-tight">Levererad!</h1>
        <p className="mt-1 text-sm text-muted">Bra jobbat — leveransen är klar.</p>
        <div className="mt-6 rounded-2xl bg-emerald-50 px-7 py-3">
          <p className="text-3xl font-black text-emerald-600">+{kr(active.payout)}</p>
        </div>
        <div className="mt-8 w-full max-w-xs">
          <GoldButton onClick={() => nav("/aktiv", { replace: true })}>Klar</GoldButton>
        </div>
      </div>
    );
  }

  if (active === null) {
    return (
      <div className="px-5 pb-28">
        <AppBar title="Order" onBack={() => nav("/aktiv")} />
        <Card className="mt-4 p-8 text-center text-sm text-muted">Ordern hittades inte.</Card>
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
    const checkedCount = active.items.filter((_, i) => checked[i]).length;
    return (
      <div className="px-5 pb-28">
        <AppBar title={active.restaurantName} onBack={() => nav("/aktiv")} right={<Pill tone="blue">Hämtning</Pill>} />
        <div className="mt-4">
          <LiveMap me={me} pickup={active.pickup} height={200} accent="blue" />
        </div>

        <Card className="mt-3 flex items-center gap-3 bg-blue-50 p-4">
          <Info size={20} className="shrink-0 text-blue-600" />
          <div>
            <p className="text-sm font-black">Hämta från restaurangen</p>
            <p className="text-xs text-blue-600">Visa denna skärm för personalen.</p>
          </div>
        </Card>

        <Card className="mt-3 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Order #{active.orderNumber}</p>
          <p className="flex items-center gap-1.5 text-[15px] font-black">
            <Store size={16} className="text-gold-deep" /> {active.restaurantName}
          </p>
          <AddressRow address={active.pickupAddress} />
          <div className="mt-3">
            <MapsButton address={active.pickupAddress} />
          </div>
        </Card>

        <Card className="mt-3 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Bocka av alla artiklar</p>
            <span className={`text-[11px] font-black ${allChecked ? "text-emerald-600" : "text-blue-600"}`}>{checkedCount}/{active.items.length}</span>
          </div>
          <div className="space-y-0.5">
            {active.items.map((it, i) => (
              <button key={i} onClick={() => setChecked((c) => ({ ...c, [i]: !c[i] }))} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition active:bg-blue-50">
                <Checkbox checked={!!checked[i]} tone="blue" />
                <span className={`text-[14px] font-semibold transition ${checked[i] ? "text-muted line-through decoration-blue-300" : "text-ink"}`}>{it.qty}× {it.name}</span>
              </button>
            ))}
          </div>
        </Card>

        <div className="mt-4">
          {busy ? (
            <GoldButton disabled tone="blue">
              <Spinner />
            </GoldButton>
          ) : (
            <SwipeButton tone="blue" label={allChecked ? "Swipe för att markera som hämtad" : "Bocka av alla artiklar först"} onConfirm={pickedUp} disabled={!allChecked} />
          )}
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------ ON THE WAY
  return (
    <div className="px-5 pb-28">
      <AppBar title={active.dropoffName} onBack={() => nav("/aktiv")} right={<Pill tone="green">{kr(active.payout)}</Pill>} />
      <div className="mt-4">
        <LiveMap me={me} dropoff={active.dropoff} height={260} accent="green" />
      </div>

      <Card className="mt-3 border-emerald-200 bg-emerald-50/40 p-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">Leverera till</p>
          <Pill tone="green">{km(active.distanceKm)} kvar</Pill>
        </div>
        <p className="mt-1 text-[16px] font-black">{active.dropoffName}</p>
        <AddressRow address={active.dropoffAddress} />
        <div className="mt-3">
          <MapsButton address={active.dropoffAddress} />
        </div>
      </Card>

      <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--color-line)] bg-white py-3 text-[13px] font-bold text-muted">
        {photo ? <img src={photo} alt="" className="h-6 w-6 rounded-md object-cover" /> : <Camera size={16} />}
        {photo ? "Foto tillagt — byt" : "Lägg till leveransfoto (valfritt)"}
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
      </label>

      <div className="mt-4">
        {busy ? (
          <GoldButton disabled tone="green">
            <Spinner />
          </GoldButton>
        ) : (
          <SwipeButton tone="green" label="Swipe för att slutföra leverans" onConfirm={deliver} />
        )}
      </div>
    </div>
  );
}
