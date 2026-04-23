"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, Clock3, MapPin, RefreshCw, ShieldCheck, Store, Wallet } from "lucide-react";
import { useControlCenter } from "@/lib/use-control-center";
import { useRestaurantStore } from "@/store/restaurantStore";

const currency = (value: number) => `${Math.round(value).toLocaleString("sv-SE")} kr`;

const relativeDate = (value: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

export default function DashboardPage() {
  const { data, loading, error, refresh } = useControlCenter();
  const { selectedRestaurantName } = useRestaurantStore();

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel h-[220px] animate-pulse rounded-[28px]" />
        <div className="panel h-[220px] animate-pulse rounded-[28px]" />
      </div>
    );
  }

  if (!data || error) {
    return (
      <div className="panel flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-[28px] px-6 py-12 text-center">
        <AlertTriangle size={34} className="text-amber-300" />
        <div className="space-y-2">
          <h2 className="text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Kunde inte ladda översikten</h2>
          <p className="max-w-xl text-sm leading-6 text-[var(--text-secondary)]">{error || "Något gick fel när adminpanelen skulle laddas."}</p>
        </div>
        <button type="button" onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-5 py-3 text-[11px] font-black uppercase tracking-[0.24em] text-[#091018]">
          <RefreshCw size={14} /> Försök igen
        </button>
      </div>
    );
  }

  const restaurantsNeedingAttention = [...data.restaurantSnapshots]
    .filter((restaurant) => restaurant.pendingOrders > 0 || !restaurant.hasHours || restaurant.reviewScore < 4.2)
    .sort((left, right) => {
      const leftScore = left.pendingOrders * 10 + (left.hasHours ? 0 : 6) + (left.reviewScore < 4.2 ? 4 : 0);
      const rightScore = right.pendingOrders * 10 + (right.hasHours ? 0 : 6) + (right.reviewScore < 4.2 ? 4 : 0);
      return rightScore - leftScore;
    })
    .slice(0, 6);

  const payoutFocus = data.payoutQueue.slice(0, 6);
  const latestReviews = data.recentReviews.slice(0, 5);

  const summaryCards = [
    {
      label: "Omsattning idag",
      value: currency(data.summary.todayRevenue),
      sub: `${data.summary.todayOrders} ordrar idag`,
    },
    {
      label: "Live-ordrar",
      value: String(data.summary.liveOrders),
      sub: "Pagaende floden just nu",
    },
    {
      label: "Öppna restauranger",
      value: `${data.summary.openRestaurants}/${data.summary.totalRestaurants}`,
      sub: "Schema och manuell status tillsammans",
    },
    {
      label: "Snittorder",
      value: currency(data.summary.avgTicket),
      sub: `Rating ${data.summary.avgRating.toFixed(1)}`,
    },
  ];

  return (
    <div className="space-y-6 pb-16">
      <section className="panel rounded-[28px] px-6 py-6 sm:px-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="control-chip">Ny startsida</span>
              <span className="control-chip">
                <ShieldCheck size={13} /> Enklare floden
              </span>
            </div>
            <div>
                <h2 className="text-3xl font-black tracking-[-0.06em] text-[var(--text-primary)] sm:text-4xl">Admin som går att jobba i.</h2>
              <p className="mt-2 max-w-3xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
                {selectedRestaurantName
                  ? `${selectedRestaurantName} är vald som scope. Du ser bara det som är relevant för den restaurangen.`
                  : "Fokus ligger nu på tydliga arbetsytor: beställningar, restauranger, städer och ekonomi. Onödiga mellanlager är borttagna."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void refresh()} className="control-chip">
              <RefreshCw size={13} /> Uppdatera
            </button>
            <Link href="/orders" className="inline-flex items-center gap-2 rounded-2xl bg-gold-gradient px-4 py-3 text-[11px] font-black uppercase tracking-[0.22em] text-[#091018]">
              Öppna beställningar <ArrowRight size={14} />
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            { href: "/restaurants", label: "Restauranger", description: "All partnerhantering på egna sidor.", icon: Store },
            { href: "/restaurant-ops", label: "Driftkö", description: "Lista över det som behöver uppföljning nu.", icon: ShieldCheck },
            { href: "/cities", label: "Städer & zoner", description: "Här styrs avgift och minimum på riktigt.", icon: MapPin },
            { href: "/finance", label: "Ekonomi", description: "Payouts och ekonomisk kontroll utan brus.", icon: Wallet },
          ].map((entry) => {
            const Icon = entry.icon;
            return (
              <Link key={entry.href} href={entry.href} className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4 transition hover:border-[var(--border-strong)] hover:bg-[rgba(255,255,255,0.04)]">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[rgba(245,191,91,0.12)] text-amber-200">
                  <Icon size={18} />
                </div>
                <p className="mt-4 text-lg font-black tracking-[-0.03em] text-[var(--text-primary)]">{entry.label}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{entry.description}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <article key={card.label} className="metric-card panel-muted">
            <p className="text-[10px] font-black uppercase tracking-[0.26em] text-[var(--text-muted)]">{card.label}</p>
            <p className="mt-3 text-3xl font-black tracking-[-0.05em] text-[var(--text-primary)]">{card.value}</p>
            <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{card.sub}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr_1fr]">
        <div className="panel rounded-[28px] px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Att gora idag</p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Viktigaste signalerna</h3>
            </div>
            <span className="control-chip">{data.alerts.length} totalt</span>
          </div>

          <div className="mt-5 grid gap-3">
            {data.alerts.length === 0 ? (
              <div className="rounded-[22px] border border-emerald-300/20 bg-emerald-300/10 px-4 py-4 text-sm leading-6 text-emerald-100">
                Inga kritiska signaler just nu.
              </div>
            ) : (
              data.alerts.slice(0, 5).map((alert) => (
                <Link
                  key={alert.id}
                  href={alert.restaurantId ? `/restaurants/${alert.restaurantId}` : alert.domain === "finance" ? "/finance" : "/restaurant-ops"}
                  className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4 transition hover:border-[var(--border-strong)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">{alert.domain}</p>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${alert.severity === "high" ? "bg-rose-300/12 text-rose-100" : alert.severity === "medium" ? "bg-amber-300/12 text-amber-100" : "bg-sky-300/12 text-sky-100"}`}>
                      {alert.severity}
                    </span>
                  </div>
                  <p className="mt-3 text-lg font-black tracking-[-0.03em] text-[var(--text-primary)]">{alert.title}</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{alert.description}</p>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="panel rounded-[28px] px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Restauranger</p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Behöver uppföljning</h3>
            </div>
            <Link href="/restaurant-ops" className="control-chip">
              Öppna kö <ArrowRight size={13} />
            </Link>
          </div>

          <div className="mt-5 grid gap-3">
            {restaurantsNeedingAttention.length === 0 ? (
              <div className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4 text-sm leading-6 text-[var(--text-secondary)]">
                Inga restauranger sticker ut just nu.
              </div>
            ) : (
              restaurantsNeedingAttention.map((restaurant) => (
                <Link key={restaurant.id} href={`/restaurants/${restaurant.id}`} className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4 transition hover:border-[var(--border-strong)]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-black tracking-[-0.03em] text-[var(--text-primary)]">{restaurant.name}</p>
                      <p className="mt-1 text-[11px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">{restaurant.city || "Ingen stad"}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${restaurant.isOpen ? "bg-emerald-300/12 text-emerald-100" : "bg-[rgba(255,255,255,0.06)] text-[var(--text-secondary)]"}`}>
                        {restaurant.isOpen ? "Öppet" : "Stängt"}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-[var(--text-secondary)]">
                    <div>{restaurant.pendingOrders} väntande ordrar</div>
                    <div>{restaurant.hasHours ? "Schema finns" : "Schema saknas"}</div>
                    <div>Rating {restaurant.reviewScore.toFixed(1)}</div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="panel rounded-[28px] px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Payouts</p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Kolla innan utbetalning</h3>
            </div>
            <Link href="/finance" className="control-chip">
              Ekonomi <ArrowRight size={13} />
            </Link>
          </div>

          <div className="mt-5 grid gap-3">
            {payoutFocus.length === 0 ? (
              <div className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4 text-sm leading-6 text-[var(--text-secondary)]">
                Inga payouts i kön just nu.
              </div>
            ) : (
              payoutFocus.map((entry) => (
                <div key={entry.restaurantId} className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-black tracking-[-0.03em] text-[var(--text-primary)]">{entry.name}</p>
                      <p className="mt-1 text-[11px] font-black uppercase tracking-[0.22em] text-[var(--text-muted)]">{entry.city || "Ingen stad"}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${entry.readiness === "ready" ? "bg-emerald-300/12 text-emerald-100" : "bg-amber-300/12 text-amber-100"}`}>
                      {entry.readiness === "ready" ? "Klar" : "Kolla"}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-[var(--text-secondary)]">
                    <div>Payout {currency(entry.payout)}</div>
                    <div>{entry.orderCount} ordrar</div>
                    <div>Provision {currency(entry.commission)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="panel rounded-[28px] px-6 py-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Betalsatt</p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Mix just nu</h3>
          </div>
          <div className="mt-5 grid gap-3">
            {data.paymentMix.length === 0 ? (
              <div className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4 text-sm leading-6 text-[var(--text-secondary)]">
                Ingen betaldata tillganglig.
              </div>
            ) : (
              data.paymentMix.map((entry) => (
                <div key={entry.method} className="flex items-center justify-between rounded-[18px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-3 text-sm">
                  <div>
                    <p className="font-black text-[var(--text-primary)]">{entry.method}</p>
                    <p className="text-[var(--text-secondary)]">{entry.count} köp</p>
                  </div>
                  <span className="font-black text-[var(--text-primary)]">{currency(entry.revenue)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel rounded-[28px] px-6 py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-[var(--text-muted)]">Senaste recensioner</p>
              <h3 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--text-primary)]">Vad kunderna sagt</h3>
            </div>
            <span className="control-chip">
              <Clock3 size={13} /> Live snapshot
            </span>
          </div>

          <div className="mt-5 grid gap-3">
            {latestReviews.length === 0 ? (
              <div className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4 text-sm leading-6 text-[var(--text-secondary)]">
                Inga recensioner att visa.
              </div>
            ) : (
              latestReviews.map((review) => (
                <div key={review.id} className="rounded-[22px] border border-[var(--border-subtle)] bg-[var(--panel-muted)] px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">{review.restaurantName || "Okand restaurang"}</p>
                      <p className="mt-2 text-base font-black tracking-[-0.03em] text-[var(--text-primary)]">{review.customerName}</p>
                    </div>
                    <span className="rounded-full bg-amber-300/12 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-amber-100">{review.rating}/5</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">{review.review}</p>
                  <p className="mt-3 text-[11px] font-bold text-[var(--text-muted)]">{relativeDate(review.reviewedAt)}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
