"use client";

import Image from "next/image";

// Endast R2-bucketen är registrerad i next.config images.remotePatterns.
// Bilder därifrån optimeras via next/image (AVIF/WebP + rätt storlek);
// övriga källor (API-servade legacy-paths, externa URL:er) renderas som
// vanlig <img> så optimizern inte kastar "unconfigured host".
const OPTIMIZED_HOST = "pub-3aa62f4934014835956fe3777d5b3abd.r2.dev";

export default function SmartImage({
  src,
  alt,
  sizes,
  className,
  loading,
}: {
  src: string;
  alt: string;
  /** next/image sizes-attribut, t.ex. "(max-width: 768px) 100vw, 25vw" */
  sizes: string;
  className?: string;
  loading?: "eager" | "lazy";
}) {
  if (!src) return null;

  let optimizable = false;
  try {
    optimizable = new URL(src).hostname === OPTIMIZED_HOST;
  } catch {
    optimizable = false;
  }

  if (optimizable) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        className={className}
        priority={loading === "eager"}
      />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading={loading ?? "lazy"} decoding="async" className={className} />;
}
