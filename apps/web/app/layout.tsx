import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
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

const outfit = Outfit({ subsets: ["latin"] });

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
  // Status-baren följer systemtemat — vit i light, mörk i dark — istället för
  // alltid-mörk (#18181b) som gav fel färg runt notchen i light mode-PWA:n.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv">
      <body className={`${outfit.className} min-h-screen antialiased`}>
        <Providers>
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
          {/* MobileFooterLinks renderas inom enskilda sidor istället (typ
              HomePage) så den hamnar närmare content och inte gömd långt ner
              vid bottom-nav. */}
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
