// Hostar som next/image får optimera. Måste hållas i synk med
// next.config.ts images.remotePatterns OCH SmartImage — annars faller
// bakgrundsbilder tillbaka på originalfilen (flera hundra kB) medan
// <img>-korten bredvid får en rätt-storlekad AVIF.
const OPTIMIZED_IMAGE_HOSTS = new Set([
  // Behålls under URL-migreringen; den skarpa domänen kommer från env.
  "pub-3aa62f4934014835956fe3777d5b3abd.r2.dev",
  "cdn-bk-se-ordering.azureedge.net",
]);
try {
  const configuredR2Base = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  if (configuredR2Base) OPTIMIZED_IMAGE_HOSTS.add(new URL(configuredR2Base).hostname);
} catch {
  // Trasig build-env → originalbilden serveras, precis som tidigare.
}

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

// Aktuellt-korten (.swift-promo-card) är som mest 520 px breda → 1080 px
// räcker även på retina. Tidigare begärdes 1800 px (avrundat till 1920) i
// kvalitet 90, vilket gav en fil 3–4 gånger större än kortet behöver på
// startsidans mest synliga yta. Kvaliteten måste finnas i next.config
// images.qualities, annars svarar optimizern 400.
export const PROMO_CARD_IMAGE_WIDTH = 1080;
export const PROMO_CARD_IMAGE_QUALITY = 75;
