import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import Navbar from "@/components/Navbar";
import EmbeddedNav from "@/components/EmbeddedNav";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import Providers from "./providers";

import CookieConsent from "@/components/CookieConsent";
import PlatformBanner from "@/components/PlatformBanner";
import OfflineBanner from "@/components/OfflineBanner";
import DeferredGlobalClients from "@/components/DeferredGlobalClients";
import MetaPixel from "@/components/MetaPixel";

// ViaEats-typografin: mjuk men stadig, med höga vikter för ett appnära uttryck.
//
// Självhostad i stället för next/font/google. Google-varianten hämtar CSS och
// woff2 vid BUILD-tid, och Next cachar den CSS:en. När Google roterade
// Baloo 2:s filnamn pekade den cachade CSS:en på 404:ade URL:er och hela
// Vercel-bygget föll ("Can't resolve @vercel/turbopack-next/internal/font/
// google/font"). Filen nedan är samma latin-subset som Google levererade,
// men som variabel font (vikt 500-800 interpoleras) — bygget blir därmed
// oberoende av deras CDN. Baloo 2 är OFL-licensierad, se OFL.txt.
const baloo = localFont({
  src: "./fonts/Baloo2-latin-variable.woff2",
  weight: "500 800",
  style: "normal",
  display: "swap",
  // Samma fallback-kedja som Google-varianten gav, så layouten inte hoppar
  // om fonten skulle blockeras.
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
});

export const metadata: Metadata = {
  // Basurl för OG-bilder + canonical URLs. Krävs i prod annars fallar
  // sociala medier-previews till http://localhost:3000 vid build.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://viaeats.se"),
  title: "ViaEats | Beställ från dina favoritrestauranger",
  description: "Beställ mat från flera lokala restauranger. Snabb leverans, smidig betalning och ett brett utbud.",
  applicationName: "ViaEats",
  appleWebApp: {
    capable: true,
    // "default" = vit statusbar med mörk text i installerad PWA. Tidigare
    // "black-translucent" gav svart band/synlig cutoff vid dynamic island
    // mot appens vita bakgrund.
    statusBarStyle: "default",
    title: "ViaEats",
  },
  formatDetection: {
    telephone: false,
  },
  // Open Graph + Twitter — bilden kommer från app/opengraph-image.png
  // (byggs av tools/build-og-image.py ur varumärkespaketet i Logotyp/).
  openGraph: {
    type: "website",
    locale: "sv_SE",
    siteName: "ViaEats",
    title: "ViaEats | Mat från lokala favoriter",
    description: "Beställningsplattform som kopplar dig till lokala restauranger. Snabb leverans, säker betalning.",
  },
  twitter: {
    card: "summary_large_image",
    title: "ViaEats | Mat från lokala favoriter",
    description: "Beställ från lokala restauranger. Snabb leverans och säker betalning.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // maximumScale borttagen — accessibility-violation att låsa zoom (WCAG
  // 1.4.4 Resize text). Användare med synskador måste kunna zooma in
  // upp till 200%. iOS Safari zoomar inte automatiskt om viewport-meta
  // är korrekt och input-font-size är ≥16px.
  viewportFit: "cover",
  // Statisk vit default — appen är ljus tills användaren väljer mörkt.
  // Providers synkar sedan taggen mot APPENS tema vid mount/toggle.
  // (Media-baserade värden följde SYSTEMETS tema → mörkt system + ljus app
  // gav svart "boxad" yta vid dynamic island i installerad PWA.)
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const imageBaseUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL
    || "https://pub-3aa62f4934014835956fe3777d5b3abd.r2.dev";
  return (
    <html lang="sv" data-scroll-behavior="smooth">
      <head>
        <link rel="preconnect" href="https://api.viaeats.se" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://js.stripe.com" crossOrigin="anonymous" />
        <link rel="preconnect" href={imageBaseUrl} crossOrigin="anonymous" />
      </head>
      <body className={`${baloo.className} min-h-screen antialiased`}>
        <Providers>
          {/* iOS PWA (standalone): toppen (status bar/notch-ytan) visade svart.
              Denna vita, klick-genomsläppliga remsa täcker safe-area-top på
              alla sidor så toppen alltid är vit. Endast mobil/PWA. */}
          <div
            aria-hidden
            className="md:hidden fixed top-0 left-0 right-0 z-[60] pointer-events-none"
            style={{ height: "env(safe-area-inset-top, 0px)", backgroundColor: "var(--bg-primary)" }}
          />
          <ServiceWorkerRegister />
          <OfflineBanner />
          <PlatformBanner />
          {/* Navbar visas bara på desktop (md+) via egen "hidden md:flex"-logik
              inuti komponenten. Den är fixed top-0, så page-content behöver
              pt-20/lg:pt-24 där det är relevant. */}
          <div className="hidden md:block">
            <Navbar />
          </div>
          <main>{children}</main>
          {/* Kontakt nås nu via ikonen uppe till höger (beställningssidan) och
              "Information"-knappen i profilen → ingen global footer-länk. */}
          <BottomNav />
          <EmbeddedNav />
          <CookieConsent />
          <MetaPixel />
          <DeferredGlobalClients />
        </Providers>
      </body>
    </html>
  );
}
