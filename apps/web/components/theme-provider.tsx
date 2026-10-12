"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { ThemeSync } from "@usapeek/theme-sync"

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider {...props}>
      <ThemeSync cookieDomain={process.env.NEXT_PUBLIC_THEME_COOKIE_DOMAIN} />
      {children}
    </NextThemesProvider>
  )
}
