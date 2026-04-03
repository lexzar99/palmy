import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import ShootingStars from "@/components/ShootingStars";
import InstallPWA from "@/components/InstallPWA";
import BottomNav from "@/components/BottomNav";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";

const outfit = Outfit({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MatGo | Beställ från dina favoritrestauranger",
  description: "Beställ mat från flera lokala restauranger i Lund. Snabb leverans, smidig betalning och ett brett utbud.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#050505",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv">
      <body className={`${outfit.className} text-white min-h-screen antialiased`}>
        <ShootingStars />
        <ServiceWorkerRegister />
        <main>{children}</main>
        <BottomNav />
        <InstallPWA />
      </body>
    </html>
  );
}
