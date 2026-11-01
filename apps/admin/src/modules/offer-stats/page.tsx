"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/shared/api/client";
import { PageHeader } from "@/shared/components/ui";
import styles from "./offer-stats.module.css";

type Row = { name: string; visits: number; leads: number };
type OfferStats = {
  visits: number;
  medianSeconds: number;
  averageSeconds: number;
  leads: number;
  leadPercent: number;
  stages: { id: string; label: string; reached: number; reachedPercent: number; left: number; leftPercent: number }[];
  form: { label: string; reached: number; reachedPercent: number }[];
  sources: Row[];
  devices: Row[];
};

const PERIODS = [1, 7, 30, 90];
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** Hur restaurangägarna rör sig genom /erbjudande. Anonymt, en rad per sidvisning. */
export function OfferStatsPage() {
  const [days, setDays] = useState(7);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["offer-stats", days],
    queryFn: () => apiGet<OfferStats>(`/admin/offer-stats?days=${days}`),
    refetchInterval: 60_000,
  });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Erbjudandesidan" />
      <div className={styles.periods}>
        {PERIODS.map((period) => (
          <button key={period} type="button" className={period === days ? styles.on : ""} onClick={() => setDays(period)}>
            {period === 1 ? "Senaste dygnet" : `${period} dagar`}
          </button>
        ))}
      </div>
      {isLoading && <p className={styles.note}>Hämtar</p>}
      {isError && <button type="button" className={styles.note} onClick={() => void refetch()}>Kunde inte hämta. Försök igen</button>}
      {data && (
        <>
          <div className={styles.tiles}>
            <div><b>{data.visits}</b><span>Besök</span></div>
            <div><b>{clock(data.medianSeconds)}</b><span>Typisk tid på sidan</span></div>
            <div><b>{clock(data.averageSeconds)}</b><span>Medeltid</span></div>
            <div><b>{data.leads}</b><span>Anmälningar, {data.leadPercent} %</span></div>
          </div>
          <section className={styles.panel}>
            <h2>Hur långt de kommer och var de lämnar</h2>
            <div className={styles.table}>
              <div className={styles.head}><span>Steg</span><span>Nådde</span><span>Lämnade här</span></div>
              {data.stages.map((stage) => (
                <div key={stage.id} className={styles.row}>
                  <span>{stage.label}<i style={{ width: `${stage.reachedPercent}%` }} /></span>
                  <span>{stage.reached} <small>{stage.reachedPercent} %</small></span>
                  <span className={stage.left ? styles.left : ""}>{stage.left} <small>{stage.leftPercent} %</small></span>
                </div>
              ))}
            </div>
          </section>
          <section className={styles.panel}>
            <h2>Formuläret</h2>
            <div className={styles.table}>
              {data.form.map((step) => (
                <div key={step.label} className={styles.row}>
                  <span>{step.label}<i style={{ width: `${step.reachedPercent}%` }} /></span>
                  <span>{step.reached} <small>{step.reachedPercent} %</small></span>
                  <span />
                </div>
              ))}
            </div>
          </section>
          <section className={styles.panel}>
            <h2>Källor och enheter</h2>
            <div className={styles.table}>
              {[...data.sources, ...data.devices].map((row) => (
                <div key={row.name} className={styles.row}>
                  <span>{row.name}</span>
                  <span>{row.visits} <small>besök</small></span>
                  <span>{row.leads} <small>anmälda</small></span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
