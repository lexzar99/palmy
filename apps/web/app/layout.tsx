import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import ShootingStars from "@/components/ShootingStars";
import InstallPWA from "@/components/InstallPWA";


const outfit = Outfit({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Palmyra Delivery | Mat nära dig",
  description: "Foodora-liknande upplevelse: beställ Palmyra eller andra restauranger, spåra leverans och spara favoriter.",
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
      <body className={`${outfit.className} text-white min-h-screen antialiased`} style={{ background: "#050505" }}>
        <ShootingStars />
        <Navbar />
        <main>{children}</main>
        <footer className="border-t border-white/5 py-12 px-6 text-center text-white/40 text-sm relative" style={{ zIndex: 2 }}>
          <p>© {new Date().getFullYear()} Palmyra Lund. Alla rättigheter förbehållna.</p>
          <p className="mt-2">Kiliansgatan 14, 223 50 Lund | 046120612</p>
        </footer>
        <InstallPWA />
      </body>

    </html>
  );
}
