"use client"

import { useCookieConsent } from "./cookie-consent-provider"

export function CookiePreferencesButton() {
  const { openPreferences } = useCookieConsent()
  return (
    <button
      type="button"
      data-cookie-preferences-trigger
      onClick={(event) => openPreferences(event.currentTarget)}
      className="inline-flex min-h-11 items-center rounded-sm py-2 text-xs text-muted-foreground underline-offset-4 outline-none hover:text-brand-accent-text hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      Preferencias de cookies
    </button>
  )
}
