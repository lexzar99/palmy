import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, MapPin, Package, Store } from "lucide-react";
import { api } from "../lib/api";
import { MAX_ACTIVE, type ActiveDelivery } from "../lib/types";
import { kr } from "../lib/format";
import { Card, Pill, Spinner } from "../ui";

export function ActiveList() {
  const nav = useNavigate();
  const [list, setList] = useState<ActiveDelivery[] | null>(null);

  useEffect(() => {
    api.getActiveList().then(setList);
  }, []);

  return (
    <div className="px-5 pt-3 pb-28">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-black tracking-tight">Pågående</h1>
        {list && <Pill tone="muted">{list.length}/{MAX_ACTIVE}</Pill>}
      </div>

      {list === null ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : list.length === 0 ? (
        <Card className="p-8 text-center">
          <Package size={28} className="mx-auto text-muted" />
          <p className="mt-3 text-sm font-semibold">Inga pågående uppdrag</p>
          <button onClick={() => nav("/")} className="mt-3 text-sm font-bold text-gold-deep">
            Till uppdrag →
          </button>
        </Card>
      ) : (
        <div className="space-y-3">
          {list.map((d) => {
            const pickup = d.status === "EN_ROUTE_PICKUP";
            return (
              <button key={d.id} onClick={() => nav(`/order/${d.id}`)} className="w-full text-left">
                <Card className="flex items-center gap-3 p-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-canvas">
                    {pickup ? <Store size={20} className="text-ink" /> : <MapPin size={20} className="text-gold-deep" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-black">{d.restaurantName}</p>
                      <Pill tone={pickup ? "blue" : "gold"}>{pickup ? "Hämta" : "Leverera"}</Pill>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {pickup ? d.pickupAddress : `${d.dropoffName} · ${d.dropoffAddress}`}
                    </p>
                  </div>
                  <span className="shrink-0 font-black text-gold-deep">{kr(d.payout)}</span>
                  <ChevronRight size={18} className="shrink-0 text-muted" />
                </Card>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
