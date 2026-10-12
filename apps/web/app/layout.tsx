import type { Metadata } from "next"
import { Geist_Mono, Public_Sans } from "next/font/google"
import type { ReactNode } from "react"
import { ThemeProvider } from "@/components/theme-provider"
import { SiteHeader } from "@/components/site-header"
import { SiteHeaderVisibility } from "@/components/site-header-visibility"
import { Toaster } from "@/components/ui/sonner"
import { CartSheet } from "@/features/cart/components/cart-sheet"
import { CookieConsentProvider } from "@/features/cookie-consent/components/cookie-consent-provider"
import { getSiteUrl } from "@/lib/site-url"
import "./globals.css"

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  display: "swap",
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
})

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: { default: "USAPEEK", template: "%s | USAPEEK" },
  applicationName: "USAPEEK",
  description: "Explora productos y descubre tiendas en USAPEEK.",
  openGraph: { type: "website", siteName: "USAPEEK" },
  twitter: { card: "summary_large_image" },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="es"
      className={`${publicSans.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          storageKey="usapeek-theme"
        >
          <CookieConsentProvider>
            <SiteHeaderVisibility>
              <SiteHeader />
            </SiteHeaderVisibility>
            {children}
            <CartSheet />
            <Toaster />
          </CookieConsentProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
