// Filmer längre ner på sidan laddas och spelas bara när de syns, och pausas när de skrollats förbi.
// <video muted loop playsinline preload="none" poster="..." data-film>. Med reducerad rörelse visas bara postern.
export function startFilms(selector = "[data-film]") {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const watcher = new IntersectionObserver((entries) => entries.forEach(({ target: film, isIntersecting }) => {
    if (!isIntersecting) return film.pause();
    if (film.preload === "none") { film.preload = "auto"; film.load(); }
    film.play().catch(() => {});
  }), { threshold: 0.2 });
  document.querySelectorAll(selector).forEach((film) => watcher.observe(film));
}
