// Skrollresan med bildscenen: omslaget och rätterna glider över i varandra (wave-scene.js),
// och texten till varje bild tonas in när bilden står still och ut innan nästa glider in.
// Sidan behöver [data-stage] med canvas [data-gl], en text per bild [data-slide], prickar .stage__dots li och [data-hint].
import { startJourney } from "./journey.js";
import { createScene } from "./wave-scene.js";

/** images: lista med { src } i visningsordning. top: toppraden, som blir mörk när resan är slut. */
export function startWaveStage({ images, length = 3.2, top }) {
  const last = images.length - 1;
  const canvas = document.querySelector("[data-gl]");
  const scene = createScene(canvas, images);
  if (!scene) canvas.hidden = true;
  const slides = [...document.querySelectorAll("[data-slide]")];
  const dots = [...document.querySelectorAll(".stage__dots li")];
  const hint = document.querySelector("[data-hint]");

  function draw(g) {
    const at = g * last;
    scene?.draw(at);
    slides.forEach((slide, k) => {
      const w = Math.max(0, 1 - Math.abs(at - k) * 2.6);
      slide.style.opacity = w.toFixed(3);
      slide.style.visibility = w > 0.01 ? "visible" : "hidden";
      slide.style.transform = `translate3d(0, ${((k - at) * 36).toFixed(1)}px, 0)`;
      slide.classList.toggle("is-on", w > 0.5);
    });
    const near = Math.round(at);
    dots.forEach((dot, k) => dot.classList.toggle("is-on", k === near));
    if (hint) hint.style.opacity = g > 0.03 ? 0 : 1;
    top?.classList.toggle("is-solid", g > 0.98 && scrollY > 40);
  }

  const journey = startJourney({ length, draw, onLayout: () => scene?.layout() });
  scene?.onReady(() => journey.wake());
  addEventListener("scroll", () => top?.classList.toggle("is-solid", scrollY > 40), { passive: true });
  return journey;
}
