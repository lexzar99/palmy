import "./style.css";
import { startRestaurant } from "../_kit/restaurant.js";
import { startOrderButtons, startReveals } from "../_kit/order.js";
import { startJourney } from "../_kit/journey.js";
import { createScene } from "./scene.js";
import site from "./site.config.js";

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const top = document.querySelector("[data-top]");

// Scenen: omslaget och fyra rätter. Stående skärm får de stående rättbilderna, liggande de breda.
const portrait = matchMedia("(max-aspect-ratio: 1/1)").matches;
const dish = (name) => (portrait ? `/img/dishes/${name}.webp` : `/img/scene/${name}-wide.webp`);
const IMAGES = [{ src: "/img/scene/cover-wide.webp" }, ...["cevapi", "kebabrulle", "smash", "kebabbox"].map((n) => ({ src: dish(n) }))];
const LAST = IMAGES.length - 1;

const canvas = document.querySelector("[data-gl]");
const scene = createScene(canvas, IMAGES);
if (!scene) canvas.hidden = true;
const slides = [...document.querySelectorAll("[data-slide]")];
const dots = [...document.querySelectorAll(".stage__dots li")];
const hint = document.querySelector("[data-hint]");

function draw(g) {
  const at = g * LAST;
  scene?.draw(at);
  slides.forEach((slide, k) => {
    // Texten för en rätt syns när dess bild står still och tonas ut innan nästa glider in
    const w = Math.max(0, 1 - Math.abs(at - k) * 2.6);
    slide.style.opacity = w.toFixed(3);
    slide.style.visibility = w > 0.01 ? "visible" : "hidden";
    slide.style.transform = `translate3d(0, ${((k - at) * 36).toFixed(1)}px, 0)`;
    slide.classList.toggle("is-on", w > 0.5);
  });
  const near = Math.round(at);
  dots.forEach((dot, k) => dot.classList.toggle("is-on", k === near));
  hint.style.opacity = g > 0.03 ? 0 : 1;
  top.classList.toggle("is-solid", g > 0.98 && scrollY > 40);
}

const journey = startJourney({
  length: 3.2,
  draw,
  onLayout: () => scene?.layout(),
});
scene?.onReady(() => journey.wake());

const solid = () => top.classList.toggle("is-solid", scrollY > 40);
addEventListener("scroll", solid, { passive: true });

// Dönerfilmen längre ner laddas och spelas bara när den syns
const film = document.querySelector("[data-film]");
if (film && !reduce) {
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      if (film.preload === "none") { film.preload = "auto"; film.load(); }
      film.play().catch(() => {});
    } else film.pause();
  }, { threshold: 0.2 }).observe(film);
}

startReveals(".reveal");
startOrderButtons();
startRestaurant(site);
