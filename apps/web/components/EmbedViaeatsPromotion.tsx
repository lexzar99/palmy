"use client";

/** Ligger efter orderstatusen och öppnar tjänsten utan att stänga spårningen. */
export default function EmbedViaeatsPromotion({ completed }: { completed: boolean }) {
  const placement = completed ? 'tracking_delivered' : 'tracking_waiting';
  const href = `https://www.viaeats.se/restaurants/palmyra-pizzeria-lund?utm_source=palmyra&utm_medium=owned&utm_campaign=upptack_viaeats&utm_content=${placement}#viaeats-deals`;
  return <aside aria-label="Upptäck viaeats" className="mt-6 rounded-2xl p-5" style={{ background: '#0A2340', color: '#FFF8ED' }}>
    <p className="text-xl font-extrabold tracking-tight">viaeats<span className="ml-2 text-xs font-normal opacity-70">Matleverans i Lund</span></p>
    <h2 className="mt-4 text-xl font-bold leading-tight">{completed ? 'Nästa gång du blir hungrig.' : 'Palmyras mat. Träffa viaeats.'}</h2>
    <p className="mt-2 text-sm leading-6 opacity-90">{completed ? 'Se Palmyras utvalda erbjudanden på viaeats. Beställ hem eller välj att hämta.' : 'viaeats är tjänsten bakom din beställning. Hos oss hittar du också Palmyras utvalda erbjudanden och kan beställa direkt.'}</p>
    <a href={href} target="_blank" rel="noopener" className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-bold" style={{ background: '#F04F1A', color: '#fff' }}>{completed ? 'Se erbjudanden på viaeats' : 'Upptäck viaeats'} <span aria-hidden="true" className="ml-2">↗</span></a>
  </aside>;
}
