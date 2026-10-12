"use client"

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"
import { toast } from "sonner"
import {
  getCookiePreferencesServerSnapshot,
  getCookiePreferencesSnapshot,
  saveCookiePreferences,
  subscribeToCookiePreferences,
} from "../browser-store"
import { createCookiePreferences, readCookiePreferences } from "../preferences"
import { CookieConsentBanner } from "./cookie-consent-banner"
import { CookiePreferencesDialog } from "./cookie-preferences-dialog"

type CookieConsentContextValue = {
  canUseGoogleOneTap: boolean
  openPreferences: (trigger: HTMLElement) => void
}

const CookieConsentContext = createContext<CookieConsentContextValue | null>(
  null,
)

export function useCookieConsent() {
  const context = useContext(CookieConsentContext)
  if (!context) throw new Error("CookieConsentProvider is required")
  return context
}

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const rawPreferences = useSyncExternalStore(
    subscribeToCookiePreferences,
    getCookiePreferencesSnapshot,
    getCookiePreferencesServerSnapshot,
  )
  const preferences = readCookiePreferences(rawPreferences)
  const [, refreshExpiredConsent] = useReducer(
    (revision: number) => revision + 1,
    0,
  )
  const [isOpen, setIsOpen] = useState(false)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const expiresAt = preferences?.expiresAt
    if (!expiresAt) return
    let timer: ReturnType<typeof setTimeout>
    function scheduleExpiry(deadline: number) {
      // Browser timers cannot exceed roughly 24 days in a single timeout.
      const delay = Math.min(Math.max(0, deadline - Date.now()), 2_147_483_647)
      timer = setTimeout(() => {
        if (Date.now() >= deadline) refreshExpiredConsent()
        else scheduleExpiry(deadline)
      }, delay)
    }
    scheduleExpiry(expiresAt)
    return () => clearTimeout(timer)
  }, [preferences?.expiresAt])

  function openPreferences(trigger: HTMLElement) {
    returnFocusRef.current = trigger
    setIsOpen(true)
  }

  function savePreferences(googleOneTap: boolean) {
    const isPersisted = saveCookiePreferences(
      createCookiePreferences(googleOneTap),
    )
    setIsOpen(false)
    if (!isPersisted) {
      toast.info(
        "Tu elección se aplicará durante esta visita. El navegador no permitió guardarla.",
      )
    }
  }

  return (
    <CookieConsentContext
      value={{
        canUseGoogleOneTap: preferences?.googleOneTap === true,
        openPreferences,
      }}
    >
      {children}
      {rawPreferences !== undefined && !preferences ? (
        <CookieConsentBanner
          onChoose={savePreferences}
          onConfigure={openPreferences}
        />
      ) : null}
      <CookiePreferencesDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        googleOneTap={preferences?.googleOneTap === true}
        onSave={savePreferences}
        returnFocusRef={returnFocusRef}
      />
    </CookieConsentContext>
  )
}
