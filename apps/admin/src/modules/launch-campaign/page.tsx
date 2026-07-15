"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { getLaunchCampaign, launchCampaignQueryKey, setLaunchCouponManualStatus } from "@/modules/dashboard/api";
import { Badge, Button, ErrorPanel, MetricCard, PageHeader, Surface } from "@/shared/components/ui";
import { formatNumber } from "@/shared/utils/format";

const PAGE_SIZE = 50;

export function LaunchCampaignPage() {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [cursor, setCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([]);
  const queryClient = useQueryClient();
  const campaign = useQuery({
    queryKey: launchCampaignQueryKey({ days, cursor, limit: PAGE_SIZE }),
    queryFn: () => getLaunchCampaign({ days, cursor, limit: PAGE_SIZE }),
    refetchInterval: 60_000,
  });
  const markCoupon = useMutation({
    mutationFn: ({ leadId, sent }: { leadId: string; sent: boolean }) =>
      setLaunchCouponManualStatus(leadId, sent),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["launch-campaign"] });
    },
  });

  if (campaign.isLoading) {
    return <div className="page-stack"><PageHeader title="Launch-kampanj" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="metric-card animate-pulse" style={{ minHeight: 140 }} />)}</div></div>;
  }
  if (campaign.isError || !campaign.data) {
    return <div className="page-stack"><PageHeader title="Launch-kampanj" /><ErrorPanel title="Kunde inte hämta launch-leads" action={<div className="flex gap-2">{cursorStack.length > 0 ? <Button variant="secondary" onClick={() => { const previousCursor = cursorStack[cursorStack.length - 1] ?? null; setCursorStack((stack) => stack.slice(0, -1)); setCursor(previousCursor); }}>Föregående sida</Button> : null}<Button variant="primary" onClick={() => { void campaign.refetch(); }}><RefreshCw size={13} /> Försök igen</Button></div>} /></div>;
  }

  const data = campaign.data;
  const currentPage = cursorStack.length + 1;
  const changeDays = (range: 7 | 30 | 90) => {
    setDays(range);
    setCursor(null);
    setCursorStack([]);
  };
  const showPreviousPage = () => {
    const previousCursor = cursorStack[cursorStack.length - 1] ?? null;
    setCursorStack((stack) => stack.slice(0, -1));
    setCursor(previousCursor);
  };
  const showNextPage = () => {
    if (!data.pageInfo.nextCursor) return;
    setCursorStack((stack) => [...stack, cursor]);
    setCursor(data.pageInfo.nextCursor);
  };
  return (
    <div className="page-stack">
      <PageHeader
        title="Launch-kampanj"
        breadcrumb="Tillväxt"
        actions={<><div className="segmented">{([7, 30, 90] as const).map((range) => <button key={range} type="button" onClick={() => changeDays(range)} className={days === range ? "is-active" : ""}>{range} dagar</button>)}</div><Button variant="secondary" onClick={() => { void campaign.refetch(); }}><RefreshCw size={13} /> Uppdatera</Button></>}
      />

      <Surface className="px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="section-title">Uttryckligen registrerade intressen</h2><p className="section-subtitle">Endast leads som lämnat namn, e-post och marknadsföringssamtycke. Ingen besöks- eller klickmätning.</p></div>
          <Badge tone="info">Senaste {days} dagarna</Badge>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Nya leads" value={formatNumber(data.totals.leadsInPeriod)} detail={`${data.totals.averageDailyLeads.toFixed(1)} per dag i perioden`} />
          <MetricCard label="Alla leads" value={formatNumber(data.totals.leads)} detail="Med uttryckligt samtycke" />
          <MetricCard label="Väntar på manuell kontakt" value={formatNumber(data.totals.couponsPending)} detail="Ingen automatisk mejlning sker" />
          <MetricCard label="Manuellt markerade skickade" value={formatNumber(data.totals.couponsSent)} detail="Baserat på registrerad skickat-tid" />
        </div>
      </Surface>

      <Surface className="px-5 py-5">
        <h2 className="section-title">Daglig utveckling</h2><p className="section-subtitle">Nya samtyckande leads per dag</p>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[360px] text-left text-sm"><thead><tr className="border-b border-[var(--border-subtle)] text-xs text-[var(--text-muted)]"><th className="px-3 py-3 font-bold">Datum</th><th className="px-3 py-3 font-bold">Nya leads</th></tr></thead><tbody>{data.daily.slice(-14).reverse().map((row) => <tr key={row.date} className="border-b border-[var(--border-subtle)] last:border-0"><td className="px-3 py-3 font-semibold">{row.date}</td><td className="px-3 py-3 font-black text-[var(--accent-ink)]">{formatNumber(row.leads)}</td></tr>)}</tbody></table></div>
      </Surface>

      <Surface className="px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="section-title">Registrerade leads</h2><p className="section-subtitle">Kupongen reserveras, men kontakt och utskick hanteras manuellt</p></div><Badge tone="warning">{formatNumber(data.totals.couponsPending)} väntar</Badge></div>
        {data.leads.length === 0 ? <p className="mt-6 rounded-2xl bg-[var(--surface-muted)] px-4 py-8 text-center text-sm font-semibold text-[var(--text-secondary)]">Inga registrerade leads ännu.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="border-b border-[var(--border-subtle)] text-xs text-[var(--text-muted)]"><th className="px-3 py-3 font-bold">Namn</th><th className="px-3 py-3 font-bold">E-post</th><th className="px-3 py-3 font-bold">Reserverad kupong</th><th className="px-3 py-3 font-bold">Manuell status</th><th className="px-3 py-3 font-bold">Registrerad</th><th className="px-3 py-3 font-bold text-right">Åtgärd</th></tr></thead><tbody>{data.leads.map((lead) => <tr key={lead.id} className="border-b border-[var(--border-subtle)] last:border-0"><td className="px-3 py-3 font-bold">{lead.name}</td><td className="px-3 py-3 text-[var(--text-secondary)]">{lead.email}</td><td className="px-3 py-3 font-mono text-xs">{lead.couponCode}</td><td className="px-3 py-3"><Badge tone={lead.couponSentAt ? "success" : "warning"}>{lead.couponSentAt ? "Markerad skickad" : "Väntar på kontakt"}</Badge></td><td className="px-3 py-3 text-[var(--text-secondary)]">{new Date(lead.createdAt).toLocaleString("sv-SE")}</td><td className="px-3 py-3 text-right"><Button variant="secondary" disabled={markCoupon.isPending} onClick={() => markCoupon.mutate({ leadId: lead.id, sent: !lead.couponSentAt })}>{lead.couponSentAt ? "Ångra markering" : "Markera manuellt skickad"}</Button></td></tr>)}</tbody></table></div>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-4">
          <p className="text-sm font-semibold text-[var(--text-secondary)]">Sida {currentPage} · {formatNumber(data.leads.length)} leads på sidan · {formatNumber(data.totals.leads)} totalt</p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={cursorStack.length === 0 || campaign.isFetching} onClick={showPreviousPage}>Föregående</Button>
            <Button variant="secondary" disabled={!data.pageInfo.hasNextPage || !data.pageInfo.nextCursor || campaign.isFetching} onClick={showNextPage}>Nästa</Button>
          </div>
        </div>
      </Surface>
    </div>
  );
}
