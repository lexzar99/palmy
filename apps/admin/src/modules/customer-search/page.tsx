"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Phone, Mail, Clock, Download, ExternalLink } from "lucide-react";
import { Badge, Button, EmptyState, Field, Input, PageHeader, Surface } from "@/shared/components/ui";
import { searchCustomers, getCustomerOrders, type CustomerHit } from "@/modules/customer-search/api";

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

  return (
    <div className="page-stack">
      <PageHeader
        title="Sök kund"
        actions={
          <Button
            variant="primary"
            onClick={() => setActiveQuery(query.trim())}
            disabled={query.trim().length < 2}
          >
            <Search size={14} /> Sök
          </Button>
        }
      />

      <Surface className="px-6 py-5">
        <Field label="Sökterm (minst 2 tecken)">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim().length >= 2) setActiveQuery(query.trim());
            }}
            placeholder="Anna, anna@.., +4670..."
            autoFocus
          />
        </Field>
      </Surface>

      {activeQuery && (
        <Surface className="px-6 py-5">
          <h3 className="text-xs font-black uppercase tracking-widest mb-4" style={{ color: "var(--text-secondary)" }}>
            Resultat för &quot;{activeQuery}&quot;
          </h3>
          {search.isLoading ? (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Söker...</p>
          ) : !search.data?.users.length ? (
            <EmptyState title="Inga träffar" />
          ) : (
            <div className="grid gap-2">
              {search.data.users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setActiveCustomer(u)}
                  className={`surface-muted px-5 py-4 text-left transition-all hover:border-[var(--accent)] ${activeCustomer?.id === u.id ? "ring-2 ring-[var(--accent)]" : ""}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-black text-sm tracking-tight" style={{ color: "var(--text-primary)" }}>
                        {u.name || "(namn saknas)"}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                        {u.email && (
                          <span className="flex items-center gap-1.5"><Mail size={11} /> {u.email}</span>
                        )}
                        {u.phone && (
                          <span className="flex items-center gap-1.5"><Phone size={11} /> {u.phone}</span>
                        )}
                      </div>
                    </div>
                    {u.isActive === false && <Badge tone="danger">Inaktiverad</Badge>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Surface>
      )}

      {activeCustomer && (
        <Surface className="px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: "var(--text-secondary)" }}>Kund</p>
              <h3 className="text-lg font-black tracking-tight">{activeCustomer.name}</h3>
            </div>
            <a
              href={`/api/admin/customers/${activeCustomer.id}/gdpr-export`}
              download
              className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest px-3 py-2 rounded-lg border transition-all hover:border-[var(--accent)]"
              style={{ borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
            >
              <Download size={12} /> GDPR-export
            </a>
          </div>

          <h4 className="text-[10px] font-black uppercase tracking-widest mt-6 mb-3" style={{ color: "var(--text-secondary)" }}>
            Orderhistorik ({orders.data?.orders.length ?? "..."})
          </h4>
          {orders.isLoading ? (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Laddar...</p>
          ) : !orders.data?.orders.length ? (
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Inga beställningar än.</p>
          ) : (
            <div className="grid gap-2">
              {orders.data.orders.map((o) => (
                <div key={o.id} className="surface-muted px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-black text-sm tracking-tight">{o.orderNumber}</p>
                    <div className="flex items-center gap-2 mt-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--text-secondary)" }}>
                      <Badge tone="neutral">{o.status}</Badge>
                      <Badge tone="info">{o.type}</Badge>
                      {o.restaurantName && <span>{o.restaurantName}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-secondary)" }}>
                    <span className="flex items-center gap-1"><Clock size={11} /> {new Date(o.createdAt).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}</span>
                    <span className="font-black" style={{ color: "var(--text-primary)" }}>{o.total.toFixed(0)} kr</span>
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
