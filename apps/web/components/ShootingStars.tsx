"use client";

import { useEffect, useRef } from "react";

const ShootingStars = () => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const stars: { el: HTMLDivElement; cleanup: () => void }[] = [];

    const createStar = (index: number) => {
      const el = document.createElement("div");
      el.style.cssText = `
        position: absolute;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent);
        border-radius: 9999px;
        pointer-events: none;
        opacity: 0;
        transform: rotate(-35deg);
        box-shadow: 0 0 6px 1px rgba(255,255,255,0.2);
      `;
      container.appendChild(el);

      const width = Math.random() * 60 + 40;
      const startLeft = Math.random() * 130 + 60; // start off-screen right sometimes
      const startTop = Math.random() * 100;
      const duration = Math.random() * 1000 + 800;
      const delay = Math.random() * 10000;

      el.style.width = `${width}px`;
      el.style.left = `${startLeft}%`;
      el.style.top = `${startTop}%`;

      let timeoutId: ReturnType<typeof setTimeout>;
      let animFrame: number;

      const animate = () => {
        const start = performance.now();
        el.style.opacity = "0";

        const run = (now: number) => {
          const elapsed = now - start;
          const progress = Math.min(elapsed / duration, 1);

          const fadeIn = progress < 0.2 ? progress / 0.2 : progress > 0.8 ? (1 - progress) / 0.2 : 1;
          el.style.opacity = `${fadeIn * 0.9}`;
          el.style.transform = `rotate(-35deg) translateX(${-1400 * progress}px) translateY(${700 * progress}px)`;

          if (progress < 1) {
            animFrame = requestAnimationFrame(run);
          } else {
            el.style.opacity = "0";
            timeoutId = setTimeout(() => {
              el.style.left = `${Math.random() * 130 + 60}%`;
              el.style.top = `${Math.random() * 100}%`;
              el.style.transform = "rotate(-35deg)";
              animate();
            }, Math.random() * 8000 + 2000);
          }
        };
        animFrame = requestAnimationFrame(run);
      };

      timeoutId = setTimeout(animate, delay);

      const cleanup = () => {
        clearTimeout(timeoutId);
        cancelAnimationFrame(animFrame);
        el.remove();
      };
      stars.push({ el, cleanup });
    };

    for (let i = 0; i < 12; i++) {
      createStar(i);
    }

    return () => {
      stars.forEach((s) => s.cleanup());
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 overflow-hidden pointer-events-none"
      style={{ zIndex: 1 }}
      aria-hidden="true"
    />
  );
};

export default ShootingStars;
