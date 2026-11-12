import "./style.css";
import { startRestaurant } from "../_kit/restaurant.js";
import { startOrderButtons, startReveals } from "../_kit/order.js";
import { startWaveStage } from "../_kit/wave-stage.js";
import { startFilms } from "../_kit/films.js";
import site from "./site.config.js";

// Scenen: omslaget och fyra rätter. Stående skärm får de höga bilderna, liggande de breda.
const portrait = matchMedia("(max-aspect-ratio: 1/1)").matches;
const cover = portrait ? "/img/scene/cover-tall.webp" : "/img/scene/cover-wide.webp";
const dish = (name) => (portrait ? `/img/dishes/${name}.webp` : `/img/scene/${name}-wide.webp`);
startWaveStage({
  images: [{ src: cover }, ...["cevapi", "pljeskavica", "burek", "grillmix"].map((n) => ({ src: dish(n) }))],
  length: 3.2,
  top: document.querySelector("[data-top]"),
});

// Grillen och degen längre ner
startFilms("[data-film]");
startReveals(".reveal");
startOrderButtons();
startRestaurant(site);
