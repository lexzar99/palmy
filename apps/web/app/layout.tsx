import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import Navbar from "@/components/Navbar";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import Providers from "./providers";
import LiveOrderBanner from "@/components/LiveOrderBanner";

import CookieConsent from "@/components/CookieConsent";
import PWAInstallPrompt from "@/components/PWAInstallPrompt";
import PlatformBanner from "@/components/PlatformBanner";
import SupportChat from "@/components/SupportChat";
import OfflineBanner from "@/components/OfflineBanner";

// Inter — lugnare och mer neutral än Outfit; bär "tyst & direkt"-designen.
const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  // Basurl för OG-bilder + canonical URLs. Krävs i prod annars fallar
  // sociala medier-previews till http://localhost:3000 vid build.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://matgo-web-pi.vercel.app"),
  title: "Delívera | Beställ från dina favoritrestauranger",
  description: "Beställ mat från flera lokala restauranger. Snabb leverans, smidig betalning och ett brett utbud.",
  applicationName: "Delívera",
  appleWebApp: {
    capable: true,
    // "default" = vit statusbar med mörk text i installerad PWA. Tidigare
    // "black-translucent" gav svart band/synlig cutoff vid dynamic island
    // mot appens vita bakgrund.
    statusBarStyle: "default",
    title: "Delívera",
  },
  formatDetection: {
    telephone: false,
  },
  // Open Graph + Twitter — använder app/opengraph-image.tsx auto-generated
  openGraph: {
    type: "website",
    locale: "sv_SE",
    siteName: "Delívera",
    title: "Delívera — Mat från dem bästa av dem bästa",
    description: "Beställningsplattform som kopplar dig till lokala restauranger. Snabb leverans, säker betalning.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Delívera — Mat från dem bästa av dem bästa",
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
  return (
    <html lang="sv">
      <body className={`${inter.className} min-h-screen antialiased`}>
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
          <LiveOrderBanner />
          <BottomNav />
          <CookieConsent />
          <PWAInstallPrompt />
          <SupportChat />
        </Providers>
      </body>
    </html>
  );
}
