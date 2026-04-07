import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import RestaurantShell from "@/components/RestaurantShell";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MatGo Restaurant | Dashboard",
  description: "Live order management for restaurateurs.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen bg-zinc-950 text-white antialiased`}>
        <RestaurantShell>
          {children}
        </RestaurantShell>
      </body>
    </html>
  );
}
