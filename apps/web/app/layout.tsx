import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";
import Navbar from "@/components/Navbar";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import Providers from "./providers";
import LiveOrderBanner from "@/components/LiveOrderBanner";

import CookieConsent from "@/components/CookieConsent";

const outfit = Outfit({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MatGo | Beställ från dina favoritrestauranger",
  description: "Beställ mat från flera lokala restauranger i Lund. Snabb leverans, smidig betalning och ett brett utbud.",
  applicationName: "MatGo",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MatGo",
  },
  formatDetection: {
    telephone: false,
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
        </Providers>
      </body>
    </html>
  );
}
