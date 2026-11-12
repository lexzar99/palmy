import "./tv.css";
import { startTvBoard } from "../../_kit/tv.js";
import site from "../site.config.js";

// Menyn står i sex minuter mellan pauserna. Beställ i mobilen (5 s) och loggan (3 s) turas om.
// Priserna kommer från viaeats.
startTvBoard({
  slug: site.slug, width: 1080, height: 1920, breakEvery: 360, breakLength: 3,
  breakOrder: ["order", "brand"],
});
