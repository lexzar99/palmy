import "./tv.css";
import { startTvBoard } from "../../_kit/tv.js";
import site from "../site.config.js";

// Tre sekunders paus var tredje minut. Priserna kommer från viaeats.
startTvBoard({ slug: site.slug, width: 1080, height: 1920, breakEvery: 180, breakLength: 3 });
