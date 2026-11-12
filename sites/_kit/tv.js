// TV-meny: en fast tavla (till exempel 1080×1920) som skalas till skärmen, priser live från viaeats
// och en kort paus med reklam med jämna mellanrum. Sajten ritar tavlan, kitet sköter tekniken.
//
// Tavlan:  <main class="board" data-board> … </main>
// Rätt:    <li data-item="Cevapi"> … <b><span data-price>99</span> kr</b></li>   (namnet som i viaeats admin)
//          Bara siffran skrivs, så att sajten själv bestämmer hur "kr" ser ut.
//          data-sizes på en rätt med storlek: priset visas som "39 / 59" (Liten / Stor).
//          Samma rätt får finnas på flera ställen, till exempel i en lista och i en paus.
// Paus:    <section data-break="namn" data-seconds="4" data-label="Knapptext"> … </section>, en eller flera.
//          Rör man musen, trycker på skärmen eller en tangent visas knappar för att förhandsvisa varje paus.
//          Piltangenterna bläddrar mellan pauserna, Escape går tillbaka till menyn.
//          breakOrder: ["order", "brand", "order"] bestämmer turordningen, så att en paus kan visas oftare.
//          Utan breakOrder visas pauserna i den ordning de står. data-seconds saknas: breakLength gäller.
//
// Adressflaggor: ?rotate=90 eller 270 om TV:n visar liggande bild på en stående skärm,
//                ?break visar nästa paus direkt (?break=namn en viss), ?nobreak stänger av pauserna.
const API = "https://api.viaeats.se/api/restaurants/";
const num = (n) => String(Math.round(n));

function fitBoard(board, width, height, rotate) {
  const fit = () => {
    const turned = rotate === 90 || rotate === 270;
    const w = turned ? innerHeight : innerWidth;
    const h = turned ? innerWidth : innerHeight;
    const scale = Math.min(w / width, h / height);
    board.style.width = `${width}px`;
    board.style.height = `${height}px`;
    board.style.transform = `translate(-50%, -50%) rotate(${rotate}deg) scale(${scale})`;
  };
  fit();
  addEventListener("resize", fit);
}

/** Hämtar menyn och skriver in aktuella priser. Rätter som tagits bort ur menyn döljs. */
async function updatePrices(slug) {
  const res = await fetch(API + slug, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return false;
  const data = await res.json().catch(() => null);
  if (!data?.menu) return false;
  const byName = new Map(data.menu.flatMap((c) => c.items ?? []).map((p) => [p.name.trim().toLowerCase(), p]));
  document.querySelectorAll("[data-item]").forEach((el) => {
    const product = byName.get(el.dataset.item.trim().toLowerCase());
    el.classList.toggle("is-gone", !product);
    // Rättens eget pris, inte priset på en rätt som ligger inuti (till exempel "fylld med ost" under Pljeskavica)
    const out = [...el.querySelectorAll("[data-price]")].find((p) => p.parentElement.closest("[data-item]") === el);
    if (!product || !out) return;
    if (el.hasAttribute("data-sizes")) {
      const big = (product.extraGroups ?? []).flatMap((g) => g.extras ?? []).find((e) => /^stor$/i.test(e.name));
      out.textContent = big ? `${num(product.price)} / ${num(product.price + (big.priceAddon ?? 0))}` : num(product.price);
    } else {
      out.textContent = num(product.price);
    }
  });
  return true;
}

function startBreaks(slides, everySeconds, lengthSeconds, order) {
  const byName = new Map(slides.map((s) => [s.dataset.break, s]));
  const queue = (order?.length ? order.map((n) => byName.get(n)) : slides).filter(Boolean);
  if (!queue.length) return null;
  let next = 0, current = null, timer = 0;
  const hide = () => {
    clearTimeout(timer);
    if (!current) return;
    const { slide, video } = current;
    slide.classList.remove("is-on");
    document.documentElement.classList.remove("is-break");
    setTimeout(() => video?.pause(), 600);
    current = null;
  };
  const show = (slide = queue[next]) => {
    hide();
    if (slide === queue[next]) next = (next + 1) % queue.length;
    const video = slide.querySelector("video");
    if (video) { video.currentTime = 0; video.play().catch(() => {}); }
    slide.classList.add("is-on");
    document.documentElement.classList.add("is-break");
    current = { slide, video };
    timer = setTimeout(hide, (Number(slide.dataset.seconds) || lengthSeconds) * 1000);
  };
  const forced = new URLSearchParams(location.search).get("break");
  if (forced !== null) setTimeout(() => show(byName.get(forced) ?? queue[next]), 1500);
  setInterval(() => show(), everySeconds * 1000);
  return { slides, show, hide };
}

/** Knappar för att förhandsvisa pauserna. Syns bara en stund när någon rör musen, trycker på skärmen eller en tangent. */
function startControls({ slides, show, hide }) {
  const bar = document.createElement("div");
  bar.setAttribute("aria-label", "Förhandsvisa pauserna");
  Object.assign(bar.style, {
    position: "fixed", right: "16px", bottom: "16px", zIndex: "100", display: "flex", flexWrap: "wrap", gap: "8px",
    maxWidth: "calc(100vw - 32px)", padding: "10px", borderRadius: "14px", background: "rgba(20, 14, 11, 0.86)",
    font: "600 15px/1 system-ui, sans-serif", opacity: "0", pointerEvents: "none", transition: "opacity 0.25s",
  });
  const button = (label, onClick) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    Object.assign(b.style, { padding: "12px 16px", border: "0", borderRadius: "10px", background: "#fff", color: "#1c1411", font: "inherit", cursor: "pointer" });
    b.addEventListener("click", onClick);
    bar.appendChild(b);
  };
  button("Meny", hide);
  slides.forEach((slide) => button(slide.dataset.label || slide.dataset.break || "Paus", () => show(slide)));
  document.body.appendChild(bar);

  let idle = 0;
  const reveal = () => {
    bar.style.opacity = "1";
    bar.style.pointerEvents = "auto";
    document.documentElement.style.cursor = "default";
    clearTimeout(idle);
    idle = setTimeout(() => {
      bar.style.opacity = "0";
      bar.style.pointerEvents = "none";
      document.documentElement.style.cursor = "none";
    }, 5000);
  };
  ["pointermove", "pointerdown", "keydown"].forEach((type) => addEventListener(type, reveal, { passive: true }));
  // Piltangenterna bläddrar mellan pauserna, Escape tillbaka till menyn
  let at = -1;
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") return hide();
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    at = (at + (e.key === "ArrowRight" ? 1 : slides.length - 1)) % slides.length;
    show(slides[at]);
  });
}

/** Laddar om sidan en gång per natt, så att nya versioner och bilder kommer med. Bara om nätet svarar. */
function reloadNightly(hour) {
  const now = new Date();
  const at = new Date(now);
  at.setHours(hour, 30, 0, 0);
  if (at <= now) at.setDate(at.getDate() + 1);
  setTimeout(async () => {
    const ok = await fetch(location.href, { method: "HEAD", cache: "no-store" }).then((r) => r.ok).catch(() => false);
    if (ok) location.reload();
    else reloadNightly(hour);
  }, at - now);
}

export function startTvBoard({ slug, width = 1080, height = 1920, breakEvery = 180, breakLength = 3, breakOrder, reloadHour = 4 }) {
  const params = new URLSearchParams(location.search);
  const rotate = Number(params.get("rotate")) || 0;
  const board = document.querySelector("[data-board]");
  fitBoard(board, width, height, rotate);

  updatePrices(slug);
  setInterval(() => updatePrices(slug), 10 * 60 * 1000);

  if (!params.has("nobreak")) {
    const breaks = startBreaks([...document.querySelectorAll("[data-break]")], breakEvery, breakLength, breakOrder);
    if (breaks) startControls(breaks);
  }
  reloadNightly(reloadHour);

  // Skärmen ska inte somna, och muspekaren ska inte synas
  const wake = () => navigator.wakeLock?.request("screen").catch(() => {});
  wake();
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && wake());
  document.documentElement.style.cursor = "none";
}
