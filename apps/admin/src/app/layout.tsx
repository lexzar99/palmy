import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/shared/components/app-providers";

const inter = Inter({ subsets: ["latin"] });

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Delívera Admin",
  description: "Control system for restaurants, orders, zones, finance and platform operations.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#11151d",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <head>
        {/* Sätt tema innan paint så det inte blinkar mörkt→ljust vid reload. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{document.documentElement.dataset.theme=localStorage.getItem('admin:theme')==='light'?'light':'dark';}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${inter.className} admin-body`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
