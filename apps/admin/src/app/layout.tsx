import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/shared/components/app-providers";

const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Delívera Admin",
  description: "Control system for restaurants, orders, zones, finance and platform operations.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f7f9",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv" suppressHydrationWarning>
      <head>
        {/* Sätt tema innan paint så det inte blinkar vid reload. Ljust är
            standard; mörkt är ett valfritt alternativ via temaväxlaren. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{document.documentElement.dataset.theme=localStorage.getItem('admin:theme')==='dark'?'dark':'light';}catch(e){}})();`,
          }}
        />
      </head>
      <body className={`${hankenGrotesk.className} admin-body`}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
