"use client"

import { usePathname, useRouter } from "next/navigation"
import Script from "next/script"
import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import {
  completeCustomerOneTapAction,
  startCustomerOneTapAction,
} from "@/app/google-one-tap-actions"
import { installGoogleOneTapDevDiagnostics } from "@/lib/google-one-tap-diagnostics"
import { useCookieConsent } from "@/features/cookie-consent/components/cookie-consent-provider"

type OneTapConfiguration = NonNullable<
  Awaited<ReturnType<typeof startCustomerOneTapAction>>
>

type GoogleIdentity = {
  initialize: (configuration: {
    client_id: string
    nonce: string
    auto_select: false
    context: "signin"
    itp_support: true
    callback: (response: { credential: string }) => void
  }) => void
  prompt: () => void
  cancel: () => void
}

function getGoogleIdentity() {
  return (
    window as Window & { google?: { accounts?: { id?: GoogleIdentity } } }
  ).google?.accounts?.id
}

function OneTapPrompt() {
  const router = useRouter()
  const [configuration, setConfiguration] =
    useState<OneTapConfiguration | null>(null)
  const [isScriptReady, setIsScriptReady] = useState(false)
  const [isPending, startTransition] = useTransition()
  const isCompleting = useRef(false)
  const transaction = useRef<Promise<OneTapConfiguration | null> | null>(null)

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      installGoogleOneTapDevDiagnostics(console)
    }
    let isActive = true
    transaction.current ??= startCustomerOneTapAction()
    void transaction.current
      .then((result) => {
        if (isActive) setConfiguration(result)
      })
      .catch(() => {
        // One Tap is optional; the account button remains available.
      })
    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    const identity = isScriptReady ? getGoogleIdentity() : undefined
    if (!identity || !configuration) return
    let isActive = true
    try {
      identity.initialize({
        client_id: configuration.client_id,
        nonce: configuration.nonce,
        auto_select: false,
        context: "signin",
        itp_support: true,
        callback: ({ credential }) => {
          if (!isActive || isCompleting.current) return
          isCompleting.current = true
          startTransition(async () => {
            try {
              const result = await completeCustomerOneTapAction(
                credential,
                configuration.nonce,
              )
              if (isActive && result.message) toast.error(result.message)
              if (isActive && result.status === "success") router.refresh()
            } catch {
              if (isActive)
                toast.error(
                  "No pudimos iniciar sesión. Usa el botón Iniciar sesión para volver a intentarlo.",
                )
            }
          })
        },
      })
      identity.prompt()
    } catch {
      isActive = false
      return
    }
    return () => {
      isActive = false
      try {
        identity.cancel()
      } catch {
        // Navigation must remain usable if the optional Google script fails.
      }
    }
  }, [configuration, isScriptReady, router])

  if (!configuration) return null
  return (
    <>
      <Script
        id="google-identity-services"
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => setIsScriptReady(true)}
        onError={() => setIsScriptReady(false)}
      />
      {isPending ? (
        <span role="status" className="sr-only">
          Iniciando sesión…
        </span>
      ) : null}
    </>
  )
}

export function GoogleOneTap() {
  const pathname = usePathname()
  const { canUseGoogleOneTap } = useCookieConsent()
  return pathname === "/" && canUseGoogleOneTap ? <OneTapPrompt /> : null
}
