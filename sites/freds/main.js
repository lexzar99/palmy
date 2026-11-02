import "./style.css";
import { startRestaurant } from "../_kit/restaurant.js";
import { startOrderButtons, startReveals } from "../_kit/order.js";
import site from "./site.config.js";

const FAVORITES = [
  { name: "Freds Special", group: "Oxfilé", img: "/img/menu/freds-special.webp" },
  { name: "Vesuvio", group: "Klassiker", img: "/img/menu/vesuvio.webp" },
  { name: "Hawaii", group: "Klassiker", img: "/img/menu/hawaii.webp" },
  { name: "Nötkebabpizza", group: "Kebab", img: "/img/menu/notkebabpizza.webp" },
  { name: "Las Vegas", group: "Amerikanska", img: "/img/menu/las-vegas.webp" },
  { name: "Amore", group: "Oxfilé", img: "/img/menu/amore.webp" },
];
const MORE = [
  { name: "Kebab", img: "/img/menu/kebabtallrik.webp" },
  { name: "Falafelrulle", img: "/img/menu/falafelrulle.webp" },
  { name: "Hamburgare", img: "/img/menu/hamburgertallrik.webp" },
  { name: "Grekisk sallad", img: "/img/menu/grekisk-sallad.webp" },
];
const PIZZA_COUNT = 80;

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
const mobile = matchMedia("(max-width: 700px)").matches;

document.querySelectorAll('a[href^="#"]').forEach((link) => link.addEventListener("click", (event) => {
  const target = document.querySelector(link.getAttribute("href"));
  if (!target) return;
  event.preventDefault();
  scrollTo({ top: target.getBoundingClientRect().top + scrollY - 70, behavior: reduce ? "auto" : "smooth" });
}));

// Filmen loopar av sig själv. Mobilen får ett eget stående utsnitt.
const film = document.querySelector("[data-film]");
film.poster = mobile ? "/img/poster-mobile.jpg" : "/img/poster.jpg";
if (!reduce) {
  film.src = mobile ? "/film-mobile.mp4" : "/film.mp4";
  film.play().catch(() => {});
  new IntersectionObserver(([entry]) => { if (entry.isIntersecting) film.play().catch(() => {}); else film.pause(); }).observe(film);
}
requestAnimationFrame(() => document.body.classList.add("is-loaded"));

// Orden tonas fram ett i taget
const words = document.querySelector("[data-words]");
let index = 0;
words.innerHTML = [...words.childNodes].map((node) => {
  const wrap = (text, extra = "") => text.split(/(\s+)/).map((word) => (word.trim() ? `<span class="w${extra}" style="--i:${index++}">${word}</span>` : word)).join("");
  return node.nodeType === 3 ? wrap(node.textContent) : wrap(node.textContent, " w--hl");
}).join("");
words.classList.add("reveal-words");

const board = document.querySelector("[data-board]");
board.innerHTML = FAVORITES.map((pizza) => `
  <li class="row" data-img="${pizza.img}">
    <a href="/meny">
      <img class="row__thumb" src="${pizza.img}" alt="" loading="lazy" width="900" height="900" />
      <span class="row__name">${pizza.name}</span>
      <span class="row__group">${pizza.group}</span>
    </a>
  </li>`).join("");

document.querySelector("[data-more]").innerHTML = MORE.map((dish, i) => `
  <li class="dish reveal" style="transition-delay:${i * 90}ms"><img src="${dish.img}" alt="${dish.name}" loading="lazy" width="900" height="900" /><h3>${dish.name}</h3></li>`).join("");

// Dator: bilden följer pekaren över raden. Slingan körs bara medan bilden syns.
const peek = document.querySelector("[data-peek]");
if (finePointer && !reduce) {
  let px = 0, py = 0, tx = 0, ty = 0, showing = false;
  const follow = () => {
    px += (tx - px) * 0.14;
    py += (ty - py) * 0.14;
    peek.style.transform = `translate3d(${px - 150}px, ${py - 150}px, 0)`;
    if (showing) requestAnimationFrame(follow);
  };
  board.querySelectorAll(".row").forEach((row) => {
    row.addEventListener("mouseenter", () => {
      peek.src = row.dataset.img;
      peek.classList.add("is-on");
      if (!showing) { showing = true; requestAnimationFrame(follow); }
    });
    row.addEventListener("mouseleave", () => { showing = false; peek.classList.remove("is-on"); });
  });
  addEventListener("mousemove", (event) => { tx = event.clientX; ty = event.clientY; }, { passive: true });
}

// Räknaren rullar upp när den syns
const count = document.querySelector("[data-count]");
new IntersectionObserver(([entry], observer) => {
  if (!entry.isIntersecting) return;
  observer.disconnect();
  if (reduce) { count.textContent = PIZZA_COUNT; return; }
  const start = performance.now();
  (function tick(now) {
    const k = Math.min(1, (now - start) / 1200);
    count.textContent = Math.round(PIZZA_COUNT * (1 - (1 - k) ** 3));
    if (k < 1) requestAnimationFrame(tick);
  })(start);
}, { threshold: 0.6 }).observe(count);

const top = document.querySelector("[data-top]");
const hero = document.querySelector("[data-hero]");
const solid = () => top.classList.toggle("is-solid", scrollY > hero.offsetHeight - 120);
addEventListener("scroll", solid, { passive: true });
solid();

startReveals(".reveal, .row, .reveal-words");
startOrderButtons();
startRestaurant(site);
