"use client";
import { useEffect, useRef } from "react";

/** Astronauten håller fram den riktiga beställningssidan över jorden och lyfter i takt med skrollen. */
export default function SpaceBand() {
  const band = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = band.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const paint = () => {
      raf = 0;
      const box = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (window.innerHeight - box.top) / (window.innerHeight + box.height)));
      el.style.setProperty("--rise", `${(0.5 - p) * 70}px`);
      el.style.setProperty("--earth", `${(0.5 - p) * 50}px`);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(paint); };
    paint();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);
  return (
    <section ref={band} data-stat="astronaut" className="sp-band" aria-labelledby="overallt">
      <img className="sp-earth" src="/erbjudande/sida/horisont.webp" alt="" loading="lazy" />
      <div className="sp-band-text">
        <h2 id="overallt">Din meny, var gästen än är.</h2>
        <p>Ingen app att ladda ner. Gästen öppnar din hemsida, väljer och betalar.</p>
      </div>
      <div className="sp-astro">
        <img src="/erbjudande/sida/astronaut.webp" alt="Astronaut som håller fram en telefon med King Kong-pizzan på beställningssidan" loading="lazy" />
        <img className="sp-astro-screen" src="/erbjudande/sida/tillval-1.webp" alt="" loading="lazy" />
      </div>
    </section>
  );
}
