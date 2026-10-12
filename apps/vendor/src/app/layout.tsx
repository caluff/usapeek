import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist_Mono, Public_Sans } from "next/font/google";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : "http://localhost:7001"),
  ),
  title: { default: "USAPEEK Vendedores", template: "%s | USAPEEK Vendedores" },
  applicationName: "USAPEEK · Portal vendedor",
  description:
    "Gestiona el catálogo, los pedidos, el inventario y la configuración de tu tienda en el portal de vendedores de USAPEEK.",
  robots: { index: false, follow: false },
  openGraph: { type: "website", siteName: "USAPEEK Vendedores" },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="es"
      className={`${publicSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          storageKey="usapeek-theme"
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
