"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Phone } from "lucide-react";
import { apiGet, apiPatch } from "@/shared/api/client";
import styles from "./partner-meetings.module.css";

type RestaurantLead = { id: string; kind: string; name?: string; restaurant?: string; city?: string; phone?: string; source: string; campaign?: string; createdAt: string; status: "new" | "contacted" };
type Inbox = { items: RestaurantLead[]; total: number };

const key = ["partner-applications", "dashboard"] as const;

/** "Nya restauranger" — leads från viaeats.se/erbjudande. Kortet på översikten, bredvid Bokade möten. */
export function RestaurantLeads() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: key, queryFn: () => apiGet<Inbox>("/partner-applications/admin?page=1"), refetchInterval: 60_000 });
  const mark = useMutation({
    mutationFn: (id: string) => apiPatch(`/partner-applications/admin/${id}`, { status: "contacted" }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ["partner-applications"] }); },
  });
  const leads = (query.data?.items ?? []).filter((item) => item.kind === "restaurant");
  const open = leads.filter((item) => item.status === "new");
  return (
    <section className={styles.panel}>
      <header>
        <div>
          <small>FRÅN VIAEATS.SE/ERBJUDANDE</small>
          <h2>Nya restauranger</h2>
          <p>{query.data ? `${open.length} att ringa` : "Restauranger som vill testa viaeats."}</p>
        </div>
        <Link href="/partner-applications">Visa alla <ArrowUpRight size={16} /></Link>
      </header>
      {query.isLoading ? (
        <p role="status" className={styles.empty}>Hämtar restauranger…</p>
      ) : query.isError ? (
        <div role="alert">
          <p className={styles.empty}>Restaurangerna kunde inte hämtas.</p>
          <button className={styles.retry} onClick={() => void query.refetch()}>Försök igen</button>
        </div>
      ) : open.length === 0 ? (
        <p className={styles.empty}>Inga nya restauranger att ringa just nu.</p>
      ) : (
        <div className={styles.list}>
          {open.slice(0, 6).map((lead) => (
            <article key={lead.id} className={`${styles.item} ${styles.fresh}`}>
              <div className={styles.when}>
                {new Date(lead.createdAt).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                <span>{[lead.source, lead.campaign].filter(Boolean).join(" · ")}</span>
              </div>
              <div className={styles.who}>
                <strong>{lead.restaurant || "Okänd restaurang"}</strong>
                <div className={styles.meta}>{[lead.city, lead.name].filter(Boolean).join(" · ")}</div>
                <div className={styles.contacts}>
                  {lead.phone ? <a href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`}><Phone size={13} />{lead.phone}</a> : null}
                </div>
              </div>
              <div className={styles.side}>
                <span className={styles.badge}>Ny</span>
                <button type="button" className={styles.cancel} disabled={mark.isPending} onClick={() => mark.mutate(lead.id)}>Ringd</button>
              </div>
            </article>
          ))}
        </div>
      )}
      {mark.isError ? <p role="alert" className={styles.empty}>Kunde inte spara. Försök igen.</p> : null}
    </section>
  );
}
