const OPTIMIZED_IMAGE_HOSTS = new Set([
  "pub-3aa62f4934014835956fe3777d5b3abd.r2.dev",
  "cdn-bk-se-ordering.azureedge.net",
]);

// Nexts image optimizer accepterar bara bredder som finns i deviceSizes/imageSizes.
// Manuella CSS background-url:er måste därför använda samma tillåtna steg som next/image,
// annars svarar /_next/image med 400 och kortet blir bara grå placeholder.
const NEXT_IMAGE_WIDTHS = [
  16, 32, 48, 64, 96, 128, 256, 384,
  640, 750, 828, 1080, 1200, 1920, 2048, 3840,
];

function nextImageWidth(width: number) {
  const requested = Number.isFinite(width) && width > 0 ? width : 640;
  return NEXT_IMAGE_WIDTHS.find((allowed) => allowed >= requested) ?? NEXT_IMAGE_WIDTHS[NEXT_IMAGE_WIDTHS.length - 1];
}

export function optimizedImageUrl(src: string, width = 640, quality = 82) {
  if (!src) return src;
  try {
    const url = new URL(src);
    if (!OPTIMIZED_IMAGE_HOSTS.has(url.hostname)) return src;
    return `/_next/image?url=${encodeURIComponent(src)}&w=${nextImageWidth(width)}&q=${quality}`;
  } catch {
    return src;
  }
}
