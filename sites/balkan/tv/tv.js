import "./tv.css";
import { startTvBoard } from "../../_kit/tv.js";
import site from "../site.config.js";

// En paus var tredje minut. Beställ i mobilen (4 s) varannan gång, logga, ćevapi och Sofra (3 s) däremellan.
// Priserna kommer från viaeats.
startTvBoard({
  slug: site.slug, width: 1080, height: 1920, breakEvery: 180, breakLength: 3,
  breakOrder: ["order", "brand", "order", "cevapi", "order", "sofra"],
});
