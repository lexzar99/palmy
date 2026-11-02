// Restaurangens uppgifter kommer från viaeats. De ändras i admin och visas här utan deploy.
// Sajten räknar aldrig själv ut öppettider: svaret innehåller färdiga tidpunkter.
const STATUS_URL = "https://www.viaeats.se/api/restaurant-status/";
const DAY_NAMES = { monday: "Måndag", tuesday: "Tisdag", wednesday: "Onsdag", thursday: "Torsdag", friday: "Fredag", saturday: "Lördag", sunday: "Söndag" };
const DAY_ORDER = Object.keys(DAY_NAMES);
const STOCKHOLM = "Europe/Stockholm";

const time = (date) => new Intl.DateTimeFormat("sv-SE", { timeZone: STOCKHOLM, hour: "2-digit", minute: "2-digit" }).format(date).replace(":00", "").replace(":", ".");
const shortTime = (value) => (value >= "23:55" ? "24" : value.replace(":00", "").replace(":", "."));
const dayKey = (date) => DAY_ORDER[["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(new Intl.DateTimeFormat("en-GB", { timeZone: STOCKHOLM, weekday: "short" }).format(date))];
const sameDay = (a, b) => new Intl.DateTimeFormat("sv-SE", { timeZone: STOCKHOLM }).format(a) === new Intl.DateTimeFormat("sv-SE", { timeZone: STOCKHOLM }).format(b);

const hoursText = (shifts) => (shifts.length ? shifts.map((s) => `${shortTime(s.open)}–${shortTime(s.close)}`).join(", ") : "Stängt");
const fill = (selector, value) => document.querySelectorAll(selector).forEach((el) => { el.textContent = value; });

function renderWeek(status, now) {
  const today = dayKey(now);
  document.querySelectorAll("[data-week]").forEach((list) => {
    list.innerHTML = status.week.map(({ day, shifts }) =>
      `<div class="${day === today ? "is-today" : ""}"><dt>${DAY_NAMES[day]}</dt><dd>${hoursText(shifts)}</dd></div>`).join("");
  });
  const todayShifts = status.week.find(({ day }) => day === today)?.shifts ?? [];
  fill("[data-today]", hoursText(todayShifts));
}

/** Det enda som ändras med klockan: öppet eller stängt, enligt serverns tidpunkter. */
function renderOpen(status, now) {
  const passed = status.changes.filter((change) => new Date(change.at) <= now).pop();
  const open = passed ? passed.open : status.openNow;
  const next = status.changes.find((change) => new Date(change.at) > now);
  let text = open ? "Öppet nu" : "Stängt just nu";
  if (next) {
    const at = new Date(next.at);
    if (open) text = `Öppet nu · till ${time(at)}`;
    else text = sameDay(at, now) ? `Stängt · öppnar ${time(at)}` : `Stängt · öppnar ${DAY_NAMES[dayKey(at)].toLowerCase()} ${time(at)}`;
  }
  fill("[data-open-text]", text);
  document.querySelectorAll("[data-open-state]").forEach((el) => el.classList.toggle("is-closed", !open));
  return next ? new Date(next.at) : null;
}

function renderDetails(status) {
  if (status.phone) {
    document.querySelectorAll("[data-phone]").forEach((el) => {
      el.textContent = status.phone;
      if (el.tagName === "A") el.href = `tel:${status.phone.replace(/[^\d+]/g, "")}`;
      el.hidden = false;
    });
    document.querySelectorAll("[data-phone-link]").forEach((el) => { el.href = `tel:${status.phone.replace(/[^\d+]/g, "")}`; });
  }
  if (status.address) fill("[data-address]", [status.address, status.city].filter(Boolean).join(", "));
  document.querySelectorAll("[data-delivery-only]").forEach((el) => { el.hidden = !status.delivery; });
  document.querySelectorAll("[data-pickup-only]").forEach((el) => { el.hidden = status.delivery; });
}

/** Strukturerad data för Google, alltid med de aktuella tiderna. */
function renderSeo(status, site) {
  const hours = status.week.flatMap(({ day, shifts }) => shifts.map((s) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: day[0].toUpperCase() + day.slice(1),
    opens: s.open,
    closes: s.close,
  })));
  const tag = document.createElement("script");
  tag.type = "application/ld+json";
  tag.textContent = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: status.name,
    url: location.origin,
    telephone: status.phone || undefined,
    servesCuisine: site.cuisine,
    address: { "@type": "PostalAddress", streetAddress: status.address, addressLocality: status.city, addressCountry: "SE" },
    openingHoursSpecification: hours,
  }).replace(/</g, "\\u003c");
  document.head.appendChild(tag);
}

async function fetchStatus(site) {
  const live = site.notInViaeats ? null : await fetch(STATUS_URL + site.slug).catch(() => null);
  if (live?.ok) return { status: await live.json(), live: true };
  // Svarar inte viaeats visas tiderna från senaste bygget, men inget påstående om öppet just nu.
  const saved = await fetch("/status.json").catch(() => null);
  return saved?.ok ? { status: await saved.json(), live: false } : null;
}

export async function startRestaurant(site) {
  const loaded = await fetchStatus(site);
  if (!loaded) return;
  const { status, live } = loaded;
  const now = new Date();
  renderDetails(status);
  renderWeek(status, now);
  renderSeo(status, site);
  if (!live) return;
  const tick = () => {
    const next = renderOpen(status, new Date());
    if (next) setTimeout(tick, Math.min(next - Date.now() + 1000, 6 * 60 * 60 * 1000));
  };
  tick();
}
