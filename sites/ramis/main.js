import "./style.css";
import { startJourney, seg } from "../_kit/journey.js";
import { createFrames } from "../_kit/frames.js";
import { startRestaurant } from "../_kit/restaurant.js";
import { startOrderButtons, startReveals } from "../_kit/order.js";
import site from "./site.config.js";

const FRAMES = 97;
const IDLE_FRAMES = 12;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const mobile = matchMedia("(max-width: 700px)").matches;
const stage = document.querySelector("[data-film]");
const tone = document.querySelector("[data-tone]");
const top = document.querySelector("[data-top]");
const hint = document.querySelector("[data-hint]");
const end = document.querySelector("[data-end]");

const film = createFrames(stage, { path: "/film/skar", count: FRAMES, fit: mobile ? "cover" : "contain" });

startJourney({
  length: 1.9,
  // Ett svep räcker: filmen spelas klart och stannar vid Beställ-knappen
  auto: 5,
  // Handen håller rullen, och bilden lever vidare i filmens sista bilder
  live: () => true,
  onLayout: () => film.layout(),
  draw(g, now) {
    if (g >= 0.995 && !reduce) film.idle(now, IDLE_FRAMES);
    else film.show(g / 0.995);
    const last = seg(g, 0.86, 0.98);
    tone.style.opacity = last.toFixed(3);
    end.style.opacity = last.toFixed(3);
    end.style.visibility = last > 0.01 ? "visible" : "hidden";
    end.style.transform = `translate3d(0, ${((1 - last) * 24).toFixed(1)}px, 0)`;
    end.classList.toggle("is-on", g > 0.92);
    hint.style.opacity = g > 0.02 ? 0 : 1;
  },
});

const solid = () => top.classList.toggle("is-solid", scrollY > 40);
addEventListener("scroll", solid, { passive: true });
solid();

startReveals();
startOrderButtons();
startRestaurant(site);
