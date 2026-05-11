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

const outfit = Outfit({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MatGo | Beställ från dina favoritrestauranger",
  description: "Beställ mat från flera lokala restauranger. Snabb leverans, smidig betalning och ett brett utbud.",
  applicationName: "MatGo",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MatGo",
  },
  formatDetection: {
    telephone: false,
  },
  // Open Graph + Twitter — använder app/opengraph-image.tsx auto-generated
  openGraph: {
    type: "website",
    locale: "sv_SE",
    siteName: "MatGo",
    title: "MatGo — Mat från dem bästa av dem bästa",
    description: "Beställningsplattform som kopplar dig till lokala restauranger. Snabb leverans, säker betalning.",
  },
  twitter: {
    card: "summary_large_image",
    title: "MatGo — Mat från dem bästa av dem bästa",
    description: "Beställ från lokala restauranger. Snabb leverans och säker betalning.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#18181b",
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
