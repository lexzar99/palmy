import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import InstallPWA from "@/components/InstallPWA";
import BottomNav from "@/components/BottomNav";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import Providers from "./providers";

const outfit = Outfit({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MatGo | Beställ från dina favoritrestauranger",
  description: "Beställ mat från flera lokala restauranger i Lund. Snabb leverans, smidig betalning och ett brett utbud.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#18181b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv">
      <body className={`${outfit.className} text-zinc-100 bg-zinc-900 min-h-screen antialiased`}>
        <Providers>
          <ServiceWorkerRegister />
          <main>{children}</main>
          <BottomNav />
          <InstallPWA />
        </Providers>
      </body>
    </html>
  );
}
