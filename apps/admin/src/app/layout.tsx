import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./workspace.css";
import "./panel.css";
import { AppProviders } from "@/shared/components/app-providers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "viaeats admin",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "viaeats",
  },
  description: "Ordrar, restauranger och ekonomi i viaeats.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#141518",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="sv" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Sätt tema innan paint så det inte blinkar vid reload. Mörkt är
            standard; ett sparat val av ljust läge respekteras. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{document.documentElement.dataset.theme=localStorage.getItem('admin:theme')==='light'?'light':'dark';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',document.documentElement.dataset.theme==='dark'?'#141518':'#f5f5f7');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="admin-body">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
