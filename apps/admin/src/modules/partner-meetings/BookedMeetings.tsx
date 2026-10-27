"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Mail, Phone } from "lucide-react";
import { ConfirmDialog } from "@/shared/components/ui";
import {
  cancelPartnerMeeting,
  fetchPartnerMeetings,
  isNewBooking,
  meetingModeLabel,
  meetingWhen,
  partnerMeetingsKey,
  type PartnerMeeting,
} from "./api";
import styles from "./partner-meetings.module.css";

/**
 * "Bokade möten" — genomgångar som restauranger bokat via viaeats.se/boka.
 * `compact` = kortet på översikten (bara kommande, max 6, länk till hela listan).
 */
export function BookedMeetings({ compact = false }: { compact?: boolean }) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PartnerMeeting | null>(null);
  const query = useQuery({ queryKey: partnerMeetingsKey, queryFn: fetchPartnerMeetings, refetchInterval: 60_000 });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelPartnerMeeting(id),
    onSuccess: () => {
      setPending(null);
      void queryClient.invalidateQueries({ queryKey: partnerMeetingsKey });
    },
  });

  const all = query.data?.bookings ?? [];
  const upcoming = all.filter((m) => !m.isPast);
  const past = all.filter((m) => m.isPast);
  const shown = compact ? upcoming.slice(0, 6) : upcoming;

  return (
    <section className={styles.panel}>
      <header>
        <div>
          <small>FRÅN VIAEATS.SE/BOKA</small>
          <h2>Bokade möten</h2>
          <p>{query.data ? `${upcoming.length} kommande genomgång${upcoming.length === 1 ? "" : "ar"}` : "Genomgångar som restauranger bokat."}</p>
        </div>
        {compact ? <Link href="/partner-meetings">Visa alla <ArrowUpRight size={16} /></Link> : null}
      </header>

      {query.isLoading ? (
        <p role="status" className={styles.empty}>Hämtar bokningar…</p>
      ) : query.isError ? (
        <div role="alert">
          <p className={styles.empty}>Bokningarna kunde inte hämtas.</p>
          <button className={styles.retry} onClick={() => void query.refetch()}>Försök igen</button>
        </div>
      ) : (
        <>
          {shown.length === 0 ? (
            <p className={styles.empty}>Inga kommande möten bokade.</p>
          ) : (
            <div className={styles.list}>{shown.map((m) => <MeetingRow key={m.id} meeting={m} onCancel={() => setPending(m)} />)}</div>
          )}
          {compact && upcoming.length > shown.length ? (
            <p className={styles.empty}>+{upcoming.length - shown.length} till. <Link href="/partner-meetings">Visa alla</Link></p>
          ) : null}
          {!compact && past.length > 0 ? (
            <>
              <p className={styles.divider}>SENASTE 7 DAGARNA</p>
              <div className={styles.list}>{past.map((m) => <MeetingRow key={m.id} meeting={m} onCancel={() => setPending(m)} />)}</div>
            </>
          ) : null}
        </>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        title="Avboka mötet?"
        description={pending ? `${pending.restaurant}, ${meetingWhen(pending)}. Tiden blir ledig på bokningssidan igen. Kontakta ${pending.name || "restaurangen"} själv, inget meddelande skickas automatiskt.` : undefined}
        confirmLabel="Avboka"
        danger
        loading={cancel.isPending}
        onConfirm={() => pending && cancel.mutate(pending.id)}
        onClose={() => { if (!cancel.isPending) setPending(null); }}
      />
      {cancel.isError ? <p role="alert" className={styles.empty}>Mötet kunde inte avbokas. Försök igen.</p> : null}
    </section>
  );
}

function MeetingRow({ meeting: m, onCancel }: { meeting: PartnerMeeting; onCancel: () => void }) {
  const fresh = !m.isPast && isNewBooking(m);
  return (
    <article className={`${styles.item} ${fresh ? styles.fresh : ""} ${m.isPast ? styles.past : ""}`}>
      <div className={styles.when}>
        {meetingWhen(m)}
        <span>Bokad {new Date(m.createdAt).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <div className={styles.who}>
        <strong>{m.restaurant || "Okänd restaurang"}</strong>
        <div className={styles.meta}>{[m.city, m.name].filter(Boolean).join(" · ")}</div>
        <div className={styles.contacts}>
          {m.phone ? <a href={`tel:${m.phone.replace(/[^\d+]/g, "")}`}><Phone size={13} />{m.phone}</a> : null}
          {m.email ? <a href={`mailto:${m.email}`}><Mail size={13} />{m.email}</a> : null}
        </div>
      </div>
      <div className={styles.side}>
        {fresh ? <span className={styles.badge}>Ny</span> : null}
        <span className={styles.mode}>{meetingModeLabel(m.mode)}</span>
        {!m.isPast ? <button type="button" className={styles.cancel} onClick={onCancel}>Avboka</button> : null}
      </div>
    </article>
  );
}
