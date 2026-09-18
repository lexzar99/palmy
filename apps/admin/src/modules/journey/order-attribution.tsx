"use client";
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/shared/api/client';
import { Surface, SectionHeader, Button } from '@/shared/components/ui';

type Attribution = { surfaceLabel: string; sourceLabel: string; campaign: string | null; adId: string | null };
type Report = {
  totalOrders: number; page: number; pageSize: number;
  groups: { surface: string; source: string; surfaceLabel: string; sourceLabel: string; campaign: string; content: string; adId: string; medium: string; orders: number }[];
  orders: { id: string; orderNumber: string | number; createdAt: string; paymentStatus: string; attribution: Attribution | null }[];
  meta: { active: boolean; enabled: boolean; configured: boolean; delivery: { status: string; count: number }[] };
};
const states: Record<string,string> = { META_PURCHASE_PENDING: 'Väntar / nytt försök', META_PURCHASE_SENT: 'Mottaget av Meta', META_PURCHASE_UNMATCHED: 'Saknar matchnings-id', META_PURCHASE_EXPIRED: 'För gammal / försök slut', META_PURCHASE_SKIPPED: 'Ej längre giltigt köp' };

export function OrderAttribution({ days }: { days: number }) {
  const [page, setPage] = useState(1);
  const report = useQuery({ queryKey: ['order-attribution', days, page], queryFn: () => apiGet<Report>(`/admin/journey/orders?days=${days}&page=${page}`) });
  return <Surface>
    <SectionHeader title="Varifrån kommer de betalda orderna?" description="Alla betalda order i vald skapandeperiod. Räknas en gång per order-id, oberoende av besöksrapportens gräns på 500 sessioner." />
    {report.isLoading ? <p className="mt-4">Läser orderkällor…</p> : report.isError ? <div className="mt-4"><p>Kunde inte läsa orderkällorna.</p><Button onClick={() => report.refetch()}>Försök igen</Button></div> : report.data ? <>
      <p className="mt-4 font-semibold">{report.data.totalOrders} betalda order</p>
      <p className="mt-2 text-sm text-[var(--text-secondary)]">Källa för beställningsbesöket. Tidigare marknadsföringskontakt sparas separat i upp till 30 dagar. Direkt betyder att ingen extern källa identifierades. Källa är inte bevis på att annonsen skapade ett extra köp. Äldre order och besök utan samtycke får okänd källa. Testordrar, annullerade och helt återbetalda köp ingår inte; delvis återbetalda särmarkeras i orderlistan.</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[750px] text-left text-sm responsive-table">
        <thead><tr><th scope="col" className="py-3">Beställningsyta</th><th scope="col">Källa</th><th scope="col">Kampanj / annons</th><th scope="col">Medium</th><th scope="col">Betalda order</th></tr></thead>
        <tbody>{report.data.groups.map((r,i)=><tr key={i} className="border-t border-[var(--border-subtle)]"><td data-label="Beställningsyta" className="py-3">{r.surfaceLabel}</td><td data-label="Källa">{r.sourceLabel}</td><td data-label="Kampanj / annons">{r.campaign || '—'}<span className="block text-xs">{r.adId || r.content}</span></td><td data-label="Medium">{r.medium || 'Okänt'}</td><td data-label="Betalda order">{r.orders}</td></tr>)}</tbody>
      </table></div>
      <p className="mt-5 text-sm font-semibold">Meta från servern: {report.data.meta.active ? 'Aktiverat' : 'Inte aktiverat / saknar konfiguration'}</p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{report.data.meta.delivery.map(r=>`${states[r.status] || r.status}: ${r.count}`).join(' · ') || 'Inga köade köp i perioden.'} Mottaget betyder att Meta accepterat händelsen, inte att ett annonsköp tillskrivits.</p>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm responsive-table">
        <thead><tr><th scope="col" className="py-3">Order / internt id</th><th scope="col">Skapad</th><th scope="col">Yta · källa</th><th scope="col">Kampanj</th><th scope="col">Betalning</th></tr></thead>
        <tbody>{report.data.orders.map(o=><tr key={o.id} className="border-t border-[var(--border-subtle)]"><td data-label="Order / internt id" className="py-3">#{o.orderNumber}<span className="block text-xs font-mono">{o.id}</span></td><td data-label="Skapad">{new Date(o.createdAt).toLocaleString('sv-SE',{timeZone:'Europe/Stockholm',dateStyle:'short',timeStyle:'short'})}</td><td data-label="Yta · källa">{o.attribution ? `${o.attribution.surfaceLabel} · ${o.attribution.sourceLabel}` : 'Äldre order / okänd källa'}</td><td data-label="Kampanj">{o.attribution?.campaign || '—'}</td><td data-label="Betalning">{o.paymentStatus === 'PARTIALLY_REFUNDED' ? 'Delvis återbetald' : 'Betald'}</td></tr>)}</tbody>
      </table></div>
      <div className="mt-3 flex items-center gap-3"><Button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Föregående</Button><span>Sida {page}</span><Button disabled={page*100>=report.data.totalOrders} onClick={()=>setPage(p=>p+1)}>Nästa</Button></div>
    </> : null}
  </Surface>;
}
