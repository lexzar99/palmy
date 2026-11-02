// Beställknapparna: svarar direkt på tryck, hämtar menysidan i förväg och göms på mobil när en annan knapp syns.
export function startOrderButtons() {
  document.querySelectorAll("[data-order], [data-order-bar]").forEach((link) => link.addEventListener("click", () => {
    link.classList.add("is-going");
    setTimeout(() => link.classList.remove("is-going"), 4000);
  }));
  addEventListener("pageshow", () => document.querySelectorAll(".is-going").forEach((link) => link.classList.remove("is-going")));
  addEventListener("load", () => {
    const hint = document.createElement("link");
    hint.rel = "prefetch";
    hint.href = "/meny";
    document.head.appendChild(hint);
  });

  const bar = document.querySelector("[data-order-bar]");
  if (!bar) return;
  const seen = new Set();
  const watcher = new IntersectionObserver((entries) => {
    entries.forEach((entry) => (entry.isIntersecting ? seen.add(entry.target) : seen.delete(entry.target)));
    bar.classList.toggle("hide", seen.size > 0);
  });
  document.querySelectorAll("[data-order], .footer").forEach((el) => watcher.observe(el));
}

/** Intoningar som startas en gång när elementet syns. */
export function startReveals(selector = ".reveal") {
  const watcher = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add("is-in");
    watcher.unobserve(entry.target);
  }), { threshold: 0.15 });
  document.querySelectorAll(selector).forEach((el) => watcher.observe(el));
}
