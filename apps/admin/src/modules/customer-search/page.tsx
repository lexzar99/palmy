"use client";

import { useState } from "react";
import { Search, Clock, Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button, EmptyState, PageHeader, Surface } from "@/shared/components/ui";
import { searchCustomers, getCustomerOrders, type CustomerHit } from "@/modules/customer-search/api";

function initials(name?: string | null) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function memberLine(u: CustomerHit) {
  const year = u.createdAt ? new Date(u.createdAt).getFullYear() : null;
  const bits = [u.phone, u.email].filter(Boolean) as string[];
  if (year) bits.push(`medlem sedan ${year}`);
  return bits.join(" · ");
}

export function CustomerSearchPage() {
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [activeCustomer, setActiveCustomer] = useState<CustomerHit | null>(null);

  const search = useQuery({
    queryKey: ["customer-search", activeQuery],
    queryFn: () => searchCustomers(activeQuery),
    enabled: activeQuery.length >= 2,
  });

  const orders = useQuery({
    queryKey: ["customer-orders", activeCustomer?.id],
    queryFn: () => getCustomerOrders(activeCustomer!.id),
    enabled: Boolean(activeCustomer),
  });

  const runSearch = () => {
    if (query.trim().length >= 2) setActiveQuery(query.trim());
  };

  return (
    <div className="page-stack">
      <PageHeader breadcrumb="Drift" title="Sök kund" />

      <Surface className="px-6 py-6">
        <div
          className="flex items-center gap-3 rounded-2xl bg-[var(--bg-panel)] px-4 transition-colors focus-within:border-[var(--accent)]"
          style={{ height: 54, border: "2px solid var(--border-subtle)" }}
        >
          <Search size={18} style={{ color: "var(--accent)" }} strokeWidth={2.2} className="shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch();
            }}
            placeholder="Sök på namn, telefon eller e-post"
            autoFocus
            className="w-full bg-transparent text-[15px] font-medium outline-none placeholder:font-normal"
            style={{ color: "var(--text-primary)" }}
          />
          <Button
            variant="primary"
            onClick={runSearch}
            disabled={query.trim().length < 2}
            className="shrink-0"
          >
            Sök
          </Button>
        </div>
        <p className="mt-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          Snabb-uppslag för support. Minst 2 tecken.
        </p>
      </Surface>

      {!activeQuery ? (
        <EmptyState
          title="Sök efter en kund"
          description="Skriv ett namn, telefonnummer eller en e-postadress ovan för att hitta kunden och öppna profilen."
        />
      ) : (
        <Surface className="overflow-hidden p-0">
          <div
            className="px-6 py-4"
            style={{ borderBottom: "1px solid var(--row-divider)" }}
          >
            <h3
              className="text-[11px] font-extrabold uppercase tracking-[0.08em]"
              style={{ color: "var(--text-muted)" }}
            >
              Resultat för &quot;{activeQuery}&quot;
            </h3>
          </div>

          {search.isLoading ? (
            <p className="px-6 py-8 text-sm" style={{ color: "var(--text-secondary)" }}>
              Söker...
            </p>
          ) : search.isError ? (
            <p className="px-6 py-8 text-sm" style={{ color: "var(--text-secondary)" }}>
              Något gick fel. Försök igen.
            </p>
          ) : !search.data?.users.length ? (
            <div className="px-6 py-10 text-center">
              <p className="text-base font-semibold tracking-[-0.01em]">Inga träffar</p>
              <p className="mt-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
                Inga kunder matchar &quot;{activeQuery}&quot;.
              </p>
            </div>
          ) : (
            <ul>
              {search.data.users.map((u) => {
                const selected = activeCustomer?.id === u.id;
                return (
                  <li key={u.id} style={{ borderTop: "1px solid var(--row-divider)" }}>
                    <button
                      type="button"
                      onClick={() => setActiveCustomer(u)}
                      className="group flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-[var(--bg-page)]"
                      style={selected ? { background: "var(--accent-soft)" } : undefined}
                    >
                      <span
                        className="flex shrink-0 items-center justify-center rounded-full bg-[#111113] text-white"
                        style={{ width: 48, height: 48, fontSize: 16, fontWeight: 800 }}
                      >
                        {initials(u.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span
                            className="truncate text-[17px] font-extrabold tracking-[-0.02em]"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {u.name || "(namn saknas)"}
                          </span>
                          {u.isActive === false && <Badge tone="danger">Inaktiverad</Badge>}
                        </span>
                        <span
                          className="mt-0.5 block truncate text-[12.5px]"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {memberLine(u) || "Inga kontaktuppgifter"}
                        </span>
                      </span>
                      <span
                        className="shrink-0 whitespace-nowrap text-[12.5px] font-bold"
                        style={{ color: "var(--accent-ink)" }}
                      >
                        Öppna profil ›
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Surface>
      )}

      {activeCustomer && (
        <Surface className="px-6 py-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className="flex shrink-0 items-center justify-center rounded-full bg-[#111113] text-white"
                style={{ width: 48, height: 48, fontSize: 16, fontWeight: 800 }}
              >
                {initials(activeCustomer.name)}
              </span>
              <div className="min-w-0">
                <h3 className="text-[17px] font-extrabold tracking-[-0.02em]">{activeCustomer.name}</h3>
                <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                  {memberLine(activeCustomer)}
                </p>
              </div>
            </div>
            <a
              href={`/api/admin/customers/${activeCustomer.id}/gdpr-export`}
              download
              className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] transition-colors hover:border-[var(--accent)]"
              style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
            >
              <Download size={12} /> GDPR-export
            </a>
          </div>

          <h4
            className="mb-3 mt-6 text-[11px] font-extrabold uppercase tracking-[0.08em]"
            style={{ color: "var(--text-muted)" }}
          >
            Senaste ordrar ({orders.data?.orders.length ?? "..."})
          </h4>
          {orders.isLoading ? (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Laddar...</p>
          ) : !orders.data?.orders.length ? (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Inga beställningar än.</p>
          ) : (
            <div className="grid gap-2">
              {orders.data.orders.map((o) => (
                <div
                  key={o.id}
                  className="surface-muted flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold tracking-[-0.01em]">{o.orderNumber}</p>
                    <div
                      className="mt-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.08em]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      <Badge tone="neutral">{o.status}</Badge>
                      <Badge tone="info">{o.type}</Badge>
                      {o.restaurantName && <span>{o.restaurantName}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-secondary)" }}>
                    <span className="flex items-center gap-1">
                      <Clock size={11} />{" "}
                      {new Date(o.createdAt).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}
                    </span>
                    <span className="font-extrabold" style={{ color: "var(--text-primary)" }}>
                      {o.total.toFixed(0)} kr
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Surface>
      )}
    </div>
  );
}
