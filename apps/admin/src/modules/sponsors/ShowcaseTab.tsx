"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, EyeOff, Pin, Plus, RotateCw } from "lucide-react";
import {
  getShowcase,
  patchShowcase,
  showcaseQueryKey,
  type ShowcaseResponse,
  type ShowcaseSurface,
  type ShowcaseSurfaceData,
} from "@/modules/sponsors/showcase-api";
import { Button, EmptyState, ErrorPanel, Field, Select } from "@/shared/components/ui";
import { useToast } from "@/shared/components/toast";

const COPY: Record<ShowcaseSurface, { title: string; sub: string; empty: string }> = {
  discounts: {
    title: "Rabatter",
    sub: "Restauranger med aktiv rabatt visas automatiskt i sponsorkorten, högsta rabatten avgör. Max 5, prioritet guld, silver, standard, sen ordrar.",
    empty: "Inga aktiva rabatter just nu. Skapa en deal så dyker restaurangen upp här.",
  },
  trending: {
    title: "Trendar",
    sub: "Restauranger med flest ordrar just nu, antal visas aldrig för kunden. Ett kort visas i sponsorkorten: den översta som inte redan har ett rabattkort.",
    empty: "Inga ordrar att ranka ännu.",
  },
  new: {
    title: "Ny i stan",
    sub: "Nyöppnade restauranger. Ett kort visas i sponsorkorten: den översta som inte redan har ett rabatt eller trendar-kort.",
    empty: "Inga nyöppnade restauranger i fönstret.",
  },
};

function FeaturedTag({ featuredClass }: { featuredClass: number }) {
  if (featuredClass !== 1 && featuredClass !== 2) return null;
  const gold = featuredClass === 1;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-black"
      style={{ background: gold ? "rgba(184,128,20,0.12)" : "rgba(133,138,148,0.14)", color: gold ? "#8a6510" : "#585c63" }}
    >
      <Crown size={11} /> Utvald
    </span>
  );
}

export function ShowcaseTab({ surface }: { surface: ShowcaseSurface }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const query = useQuery({ queryKey: showcaseQueryKey, queryFn: getShowcase });
  const [pickId, setPickId] = useState("");
  const [hoursDraft, setHoursDraft] = useState<string>("");

  const data: ShowcaseSurfaceData | undefined = useMemo(
    () => query.data?.surfaces.find((s) => s.surface === surface),
    [query.data, surface],
  );

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof patchShowcase>[1]) => patchShowcase(surface, payload),
    onSuccess: (res) => {
      queryClient.setQueryData<ShowcaseResponse>(showcaseQueryKey, (prev) =>
        prev ? { ...prev, surfaces: res.surfaces } : prev,
      );
      void queryClient.invalidateQueries({ queryKey: showcaseQueryKey });
    },
    onError: () => showToast({ type: "error", message: "Kunde inte spara" }),
  });

  if (query.isLoading) return <div className="p-8 text-[13px] font-semibold text-[#6b6b73]">Laddar...</div>;
  if (query.isError || !data) {
    return <ErrorPanel title="Kunde inte ladda" action={<Button onClick={() => void query.refetch()}>Försök igen</Button>} />;
  }

  const copy = COPY[surface];
  const shownIds = new Set(data.shown.map((s) => s.restaurantId));
  // Rabatter: bara restauranger med deal (kandidatlistan). Trend/ny: alla restauranger.
  const pickOptions =
    surface === "discounts"
      ? data.candidates.filter((c) => !shownIds.has(c.restaurantId))
      : (query.data?.restaurants || [])
          .filter((r) => !shownIds.has(r.id))
          .map((r) => ({ restaurantId: r.id, name: r.name, slug: r.slug, label: r.name, featuredClass: r.featuredClass }));

  const rotatedLabel = data.rotatedAt
    ? new Date(data.rotatedAt).toLocaleString("sv-SE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "aldrig";

  return (
    <section className="rounded-2xl border border-[rgba(20,20,22,0.06)] bg-white p-5 shadow-[0_18px_44px_rgba(20,20,22,0.06)]">
      <div className="mb-4">
        <h2 className="text-[16px] font-black tracking-[-0.02em] text-[#141416]">{copy.title}</h2>
        <p className="mt-1 max-w-[620px] text-[12.5px] font-medium leading-relaxed text-[#6b6b73]">{copy.sub}</p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl bg-[rgba(20,20,22,0.03)] p-3">
        <Field label="Rotationstid (timmar)">
          <input
            type="number"
            min={1}
            defaultValue={data.rotationHours}
            onChange={(e) => setHoursDraft(e.target.value)}
            className="h-9 w-28 rounded-lg border border-[rgba(20,20,22,0.12)] bg-white px-3 text-[13px] font-bold text-[#141416]"
          />
        </Field>
        <Button
          variant="secondary"
          onClick={() => {
            const n = Number(hoursDraft);
            if (Number.isFinite(n) && n > 0) mutation.mutate({ rotationHours: Math.round(n) });
          }}
        >
          <RotateCw size={13} /> Spara tid
        </Button>
        <div className="ml-auto text-[11.5px] font-semibold text-[#9a9aa2]">Senaste rotation: {rotatedLabel}</div>
      </div>

      {data.shown.length === 0 ? (
        <EmptyState title="Inget visas" description={copy.empty} />
      ) : (
        <div className="grid gap-2">
          {data.shown.map((item) => (
            <div
              key={item.restaurantId}
              className="flex items-center gap-3 rounded-xl border border-[rgba(20,20,22,0.07)] bg-white px-3.5 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13.5px] font-black text-[#141416]">{item.label}</span>
                  <FeaturedTag featuredClass={item.featuredClass} />
                  {item.pinned ? (
                    <span className="rounded-full bg-[rgba(20,20,22,0.06)] px-2 py-0.5 text-[10px] font-black text-[#6b6b73]">Fäst</span>
                  ) : null}
                </div>
                {surface === "discounts" ? <div className="mt-0.5 truncate text-[11.5px] font-semibold text-[#9a9aa2]">{item.name}</div> : null}
              </div>
              {item.pinned ? (
                <button
                  type="button"
                  onClick={() => mutation.mutate({ unpin: item.restaurantId })}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-black text-[#6b6b73] hover:bg-[rgba(20,20,22,0.05)]"
                >
                  <Pin size={12} /> Lossa
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => mutation.mutate({ hide: item.restaurantId })}
                  className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-black text-[#B23C12] hover:bg-[#FFF4E9]"
                >
                  <EyeOff size={12} /> Dölj
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-[rgba(20,20,22,0.06)] pt-4">
        <Field label="Lägg till manuellt">
          <Select value={pickId} onChange={(e) => setPickId(e.target.value)}>
            <option value="">Välj restaurang</option>
            {pickOptions.map((o) => (
              <option key={o.restaurantId} value={o.restaurantId}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button
          variant="primary"
          disabled={!pickId}
          onClick={() => {
            if (pickId) {
              mutation.mutate({ pin: pickId });
              setPickId("");
            }
          }}
        >
          <Plus size={13} /> Lägg till
        </Button>
        <div className="ml-auto text-[11.5px] font-semibold text-[#9a9aa2]">Manuella ändringar gäller tills nästa rotation.</div>
      </div>
    </section>
  );
}
