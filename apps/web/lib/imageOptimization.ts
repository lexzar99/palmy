const OPTIMIZED_IMAGE_HOSTS = new Set([
  "pub-3aa62f4934014835956fe3777d5b3abd.r2.dev",
  "cdn-bk-se-ordering.azureedge.net",
]);

export function optimizedImageUrl(src: string, width = 640, quality = 45) {
  if (!src) return src;
  try {
    const url = new URL(src);
    if (!OPTIMIZED_IMAGE_HOSTS.has(url.hostname)) return src;
    return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality}`;
  } catch {
    return src;
  }
}
