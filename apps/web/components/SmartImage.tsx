"use client";

import Image from "next/image";
import type { ImageProps } from "next/image";

// Dessa hostar är registrerade i next.config images.remotePatterns.
// Bilder därifrån optimeras via next/image (AVIF/WebP + rätt storlek);
// övriga källor (API-servade legacy-paths, okända externa URL:er) renderas som
// vanlig <img> så optimizern inte kastar "unconfigured host".
const OPTIMIZED_HOSTS = new Set([
  "pub-3aa62f4934014835956fe3777d5b3abd.r2.dev",
  "cdn-bk-se-ordering.azureedge.net",
]);
try {
  const configuredR2Base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  if (configuredR2Base) OPTIMIZED_HOSTS.add(new URL(configuredR2Base).hostname);
} catch {
  // Invalid build env falls back to ordinary <img>; launch checks flag it.
}

export default function SmartImage({
  src,
  alt,
  sizes,
  className,
  priority = false,
  fetchPriority,
  loading,
  quality,
}: {
  src: string;
  alt: string;
  /** next/image sizes-attribut, t.ex. "(max-width: 768px) 100vw, 25vw" */
  sizes: string;
  className?: string;
  priority?: boolean;
  fetchPriority?: NonNullable<ImageProps["fetchPriority"]>;
  loading?: "eager" | "lazy";
  quality?: number;
}) {
  if (!src) return null;

  const resolvedLoading = loading ?? (priority ? "eager" : "lazy");
  const resolvedFetchPriority = fetchPriority ?? (priority ? "high" : "auto");

  let optimizable = false;
  try {
    optimizable = OPTIMIZED_HOSTS.has(new URL(src).hostname);
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
        priority={priority}
        loading={priority ? undefined : resolvedLoading}
        fetchPriority={resolvedFetchPriority}
        quality={quality ?? 82}
      />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading={resolvedLoading} decoding="async" fetchPriority={resolvedFetchPriority} className={className} />;
}
