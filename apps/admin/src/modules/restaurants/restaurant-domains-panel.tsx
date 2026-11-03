"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, Globe, Star, Trash2 } from "lucide-react";
import { getStoredAdmin } from "@/shared/auth/storage";
import { Badge, Button, Input, Toggle } from "@/shared/components/ui";
import {
  createRestaurantDomain,
  deleteRestaurantDomain,
  getRestaurantDomains,
  restaurantDomainsQueryKey,
  updateRestaurantDomain,
  type RestaurantDomain,
} from "@/modules/restaurants/api";

/**
 * Restaurangens egna domäner (fas 3). En aktiv domän släpps igenom för
 * menyn i iframen, kassan och betalningsreturen, utan kodändring och deploy.
 * Backend: packages/api/src/routes/restaurantDomains.ts. Bara superadmin.
 */
export function RestaurantDomainsPanel({ restaurantId, restaurantSlug }: { restaurantId: string; restaurantSlug?: string | null }) {
  const queryClient = useQueryClient();
  const isSuperAdmin = getStoredAdmin()?.role === "SUPER_ADMIN";
  const [host, setHost] = useState("");
  const [menuPath, setMenuPath] = useState("/meny");
  const [copied, setCopied] = useState(false);
  const key = restaurantDomainsQueryKey(restaurantId);

  const domains = useQuery({
    queryKey: key,
    queryFn: () => getRestaurantDomains(restaurantId),
    enabled: isSuperAdmin,
    retry: false,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const add = useMutation({
    meta: { successMessage: "Domänen är tillagd" },
    mutationFn: () => createRestaurantDomain({ restaurantId, host: host.trim(), menuPath: menuPath.trim() || "/meny" }),
    onSuccess: async () => {
      setHost("");
      await refresh();
    },
  });

  const update = useMutation({
    meta: { successMessage: "Domänen är uppdaterad" },
    mutationFn: ({ id, patch }: { id: string; patch: { isPrimary?: true; embedEnabled?: boolean } }) =>
      updateRestaurantDomain(id, patch),
    onSuccess: refresh,
  });

  const remove = useMutation({
    meta: { successMessage: "Domänen är borttagen" },
    mutationFn: (id: string) => deleteRestaurantDomain(id),
    onSuccess: refresh,
  });

  if (!isSuperAdmin) return null;

  const list: RestaurantDomain[] = domains.data || [];
  const tableMissing = (domains.error as { response?: { status?: number } } | null)?.response?.status === 503;

  // Samma kod som sites/_kit/menu-page.html. Den ersätter den gamla sidan
  // "Meny på egen hemsida", som gav kod till det pensionerade /partner/embed.js.
  const snippet = restaurantSlug
    ? `<div data-viaeats-menu="${restaurantSlug}" data-viaeats-back="/"></div>\n<script src="https://www.viaeats.se/embed.js" defer></script>`
    : "";
  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { /* urklipp blockerat: koden går att markera i rutan */ }
  };

  const confirmRemove = (domain: RestaurantDomain) => {
    if (window.confirm(`Ta bort ${domain.host}? Menyn och kassan slutar fungera på den domänen inom en minut.`)) {
      remove.mutate(domain.id);
    }
  };

  return (
    <div className="grid gap-3 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel-muted)] p-3">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-[var(--text-secondary)]">
        <Globe size={14} /> Domäner
        {list.length > 0 ? <span className="text-[var(--text-muted)]">({list.length})</span> : null}
      </div>
      <p className="text-xs text-[var(--text-muted)]">
        Restaurangens egna sajter. Lägg till varje adress för sig, även www. Ändringar gäller inom en minut.
      </p>

      {tableMissing ? (
        <p className="text-xs text-[var(--warning)]">
          Domäntabellen är inte skapad i databasen än. Tills dess gäller listorna i koden.
        </p>
      ) : (
        <>
          <form
            className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              if (host.trim() && !add.isPending) add.mutate();
            }}
          >
            <Input
              value={host}
              onChange={(event) => setHost(event.target.value)}
              placeholder="fredspizza.se"
              aria-label="Domän"
              autoComplete="off"
              spellCheck={false}
            />
            <Input
              value={menuPath}
              onChange={(event) => setMenuPath(event.target.value)}
              placeholder="/meny"
              aria-label="Menysida"
              title="Sidan där menyn ligger. Betalningar återvänder hit."
              spellCheck={false}
            />
            <Button variant="secondary" type="submit" loading={add.isPending} disabled={!host.trim()}>
              Lägg till
            </Button>
          </form>

          {domains.isLoading ? (
            <p className="text-xs text-[var(--text-muted)]">Laddar…</p>
          ) : list.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">Inga domäner. Menyn kan inte bäddas in på någon egen sajt.</p>
          ) : (
            <ul className="grid gap-2">
              {list.map((domain) => (
                <li
                  key={domain.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2"
                >
                  <a
                    href={`https://${domain.host}${domain.menuPath}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text-primary)] hover:underline"
                  >
                    {domain.host}
                    <span className="text-[var(--text-muted)]">{domain.menuPath}</span>
                  </a>
                  {domain.isPrimary ? (
                    <Badge tone="success">Huvuddomän</Badge>
                  ) : (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      onClick={() => update.mutate({ id: domain.id, patch: { isPrimary: true } })}
                      disabled={update.isPending}
                    >
                      <Star size={12} /> Gör till huvuddomän
                    </button>
                  )}
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                    <Toggle
                      checked={domain.embedEnabled}
                      onChange={(value) => update.mutate({ id: domain.id, patch: { embedEnabled: value } })}
                      disabled={update.isPending}
                      ariaLabel={`Aktiv för ${domain.host}`}
                    />
                    Aktiv
                  </label>
                  <button
                    type="button"
                    className="inline-flex items-center text-[var(--text-muted)] hover:text-rose-400"
                    onClick={() => confirmRemove(domain)}
                    disabled={remove.isPending}
                    aria-label={`Ta bort ${domain.host}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {snippet ? (
        <div className="grid gap-2 border-t border-[var(--row-divider)] pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[var(--text-secondary)]">Embed-kod till sajtens menysida</p>
            <div className="flex items-center gap-3">
              <a
                href={`https://www.viaeats.se/embed/${encodeURIComponent(restaurantSlug || "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <ExternalLink size={12} /> Förhandsgranska
              </a>
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                onClick={() => void copySnippet()}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Kopierad" : "Kopiera"}
              </button>
            </div>
          </div>
          <pre className="overflow-x-auto rounded-xl bg-[#17130f] p-3 text-[11px] leading-relaxed text-white"><code>{snippet}</code></pre>
          <p className="text-[11px] text-[var(--text-muted)]">
            Koden fungerar bara på domäner som står i listan ovan.
          </p>
        </div>
      ) : null}
    </div>
  );
}
