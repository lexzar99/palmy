"use client";
import { useState } from "react";
export default function Earnings() {
  const [count, setCount] = useState(1);
  const money = (n: number) => n.toLocaleString("sv-SE");
  return <div className="partner-calculator"><div className="partner-calculator-top"><label htmlFor="partner-count">Om du hjälper <strong>{count} {count === 1 ? "restaurang" : "restauranger"}</strong></label><span>Räkneexempel</span></div><output htmlFor="partner-count" className="partner-total">{money(count * 800)}<span>kr</span></output><input id="partner-count" type="range" min={1} max={20} value={count} onChange={event => setCount(Number(event.target.value))} aria-valuetext={`${count} ${count === 1 ? "restaurang" : "restauranger"}, ${count * 800} kronor före skatt`} /><div className="partner-split"><div><strong>{money(count * 500)} kr</strong><span>efter godkända avtal</span></div><div><strong>{money(count * 300)} kr</strong><span>inom 30 dagar</span></div></div><p className="partner-small">Per restaurang gäller villkoren. Belopp före skatt. För 17-åringar gäller bruttolön; för fakturering gäller belopp exklusive moms och före eventuella avgifter. Exemplet är ingen inkomstgaranti.</p></div>;
}
