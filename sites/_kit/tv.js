// TV-meny: en fast tavla (till exempel 1080×1920) som skalas till skärmen, priser live från viaeats
// och en kort paus med reklam med jämna mellanrum. Sajten ritar tavlan, kitet sköter tekniken.
//
// Tavlan:  <main class="board" data-board> … </main>
// Rätt:    <li data-item="Cevapi"> … <b><span data-price>99</span> kr</b></li>   (namnet som i viaeats admin)
//          Bara siffran skrivs, så att sajten själv bestämmer hur "kr" ser ut.
//          data-sizes på en rätt med storlek: priset visas som "39 / 59" (Liten / Stor).
//          Samma rätt får finnas på flera ställen, till exempel i en lista och i en paus.
// Paus:    <section data-break="namn" data-seconds="4"> … </section>, en eller flera.
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
  if (!queue.length) return;
  let next = 0;
  const show = (slide = queue[next]) => {
    if (slide === queue[next]) next = (next + 1) % queue.length;
    const video = slide.querySelector("video");
    if (video) { video.currentTime = 0; video.play().catch(() => {}); }
    slide.classList.add("is-on");
    document.documentElement.classList.add("is-break");
    const seconds = Number(slide.dataset.seconds) || lengthSeconds;
    setTimeout(() => {
      slide.classList.remove("is-on");
      document.documentElement.classList.remove("is-break");
      setTimeout(() => video?.pause(), 600);
    }, seconds * 1000);
  };
  const forced = new URLSearchParams(location.search).get("break");
  if (forced !== null) setTimeout(() => show(byName.get(forced) ?? queue[next]), 1500);
  setInterval(() => show(), everySeconds * 1000);
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

  if (!params.has("nobreak")) startBreaks([...document.querySelectorAll("[data-break]")], breakEvery, breakLength, breakOrder);
  reloadNightly(reloadHour);

  // Skärmen ska inte somna, och muspekaren ska inte synas
  const wake = () => navigator.wakeLock?.request("screen").catch(() => {});
  wake();
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && wake());
  document.documentElement.style.cursor = "none";
}
