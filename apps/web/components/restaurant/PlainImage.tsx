"use client";

import { useState } from "react";
import { optimizedImageUrl } from "@/lib/imageOptimization";

/**
 * Enkel bild för ve-sidan: vanlig <img> (ingen next/image-hostvalidering)
 * med en ren CSS-intoning (.ve-img) — inget laddningstillstånd i JS, så
 * SSR-renderade bilder som hunnit ladda före hydreringen syns alltid.
 * Trasig bild → renderar `fallback` (eller ingenting).
 */
export default function PlainImage({
  src,
  alt,
  width = 256,
  quality = 82,
  className = "",
  eager = false,
  fallback = null,
  onFail,
}: {
  src?: string | null;
  alt: string;
  width?: number;
  quality?: number;
  className?: string;
  eager?: boolean;
  fallback?: React.ReactNode;
  onFail?: () => void;
}) {
  // Trasig bild kommer ihåg vilken URL som föll — byter src återställs den utan effekt.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const clean = typeof src === "string" ? src.trim() : "";
  if (!clean || failedSrc === clean) return <>{fallback}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={optimizedImageUrl(clean, width, quality)}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={eager ? "high" : "auto"}
      onError={() => { setFailedSrc(clean); onFail?.(); }}
      className={`ve-img ${className}`}
    />
  );
}
