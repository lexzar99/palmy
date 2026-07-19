"use client";

import { useMemo, useState } from "react";
import { Check, Code2, Copy, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/shared/api/client";
import { Button, EmptyState, Input, LoadingPanel, PageHeader, Select, Surface } from "@/shared/components/ui";

type RestaurantRef = { id: string; name: string; slug: string; city?: string | null; draft?: boolean };

const restaurantsQueryKey = ["partner-embeds", "restaurants"] as const;

function getRestaurants() {
  return apiGet<RestaurantRef[]>("/restaurants");
}

export function EmbedsPage() {
  const restaurants = useQuery({ queryKey: restaurantsQueryKey, queryFn: getRestaurants });
  const [restaurantId, setRestaurantId] = useState("");
  const [siteOrigin, setSiteOrigin] = useState("https://palmyrapizzeria.se");
  const [copied, setCopied] = useState(false);

  const available = useMemo(
    () => (restaurants.data || []).filter((restaurant) => !restaurant.draft),
    [restaurants.data],
  );
  const selected = available.find((restaurant) => restaurant.id === restaurantId) || available[0] || null;
  const selectedId = selected?.id || "";
  const selectedSlug = selected?.slug || "restaurant-slug";
  const normalizedOrigin = siteOrigin.trim().replace(/\/$/, "") || "https://example.com";
  const snippet = `<div data-viaeats-menu="${selectedSlug}"></div>\n<script src="https://www.viaeats.se/partner/embed.js" defer></script>`;
  const previewUrl = `https://www.viaeats.se/embed/${encodeURIComponent(selectedSlug)}`;

  const copySnippet = async () => {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  if (restaurants.isLoading) return <LoadingPanel label="Laddar restauranger…" />;
  if (restaurants.isError || !restaurants.data) {
    return <EmptyState title="Kunde inte ladda restauranger" description="Försök igen när restauranglistan är tillgänglig." />;
  }

  return (
    <div className="page-stack">
      <PageHeader
        breadcrumb="Partners"
        title="Partner-embeds"
      />
      <p className="-mt-4 max-w-3xl text-sm text-[var(--text-secondary)]">
        Skapa en restaurangbunden kiosk-embed för en extern hemsida. Meny, öppettider, cart, betalning och tracking hämtas live från ViaEats.
      </p>

      <Surface className="max-w-4xl space-y-6">
        <div className="grid gap-5 md:grid-cols-2">
          <label className="space-y-2 text-sm font-semibold">
            Restaurang
            <Select value={selectedId} onChange={(event) => setRestaurantId(event.target.value)}>
              {available.map((restaurant) => (
                <option key={restaurant.id} value={restaurant.id}>
                  {restaurant.name}{restaurant.city ? ` · ${restaurant.city}` : ""}
                </option>
              ))}
            </Select>
          </label>
          <label className="space-y-2 text-sm font-semibold">
            Partnerdomän
            <Input value={siteOrigin} onChange={(event) => setSiteOrigin(event.target.value)} placeholder="https://example.com" />
          </label>
        </div>

        <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel-soft)] p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold"><Code2 size={16} /> Embed-kod</div>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Lägg koden där menyn ska visas på partnerns hemsida.</p>
            </div>
            <Button variant="secondary" onClick={() => void copySnippet()}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? "Kopierad" : "Kopiera"}
            </Button>
          </div>
          <pre className="overflow-x-auto rounded-xl bg-[#17130f] p-4 text-xs leading-relaxed text-white"><code>{snippet}</code></pre>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--text-secondary)]">
          <a href={previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-semibold text-[var(--text-primary)] hover:underline">
            <ExternalLink size={15} /> Förhandsgranska kiosk-läge
          </a>
          <span className="text-xs">Tillåten partnerdomän: {normalizedOrigin}</span>
        </div>
      </Surface>
    </div>
  );
}
