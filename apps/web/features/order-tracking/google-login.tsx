"use client"

import { useSyncExternalStore } from "react"

import { GoogleLogin } from "@/components/auth/google-login"
import { Skeleton } from "@/components/ui/skeleton"
import { TRACKING_ACCOUNT_PATH } from "./account-link"
import { parseOrderTrackingFragment } from "./fragment"

function subscribeToFragment(onChange: () => void) {
  window.addEventListener("hashchange", onChange)
  return () => window.removeEventListener("hashchange", onChange)
}

export function TrackingGoogleLogin() {
  const token = useSyncExternalStore(
    subscribeToFragment,
    () => parseOrderTrackingFragment(window.location.hash),
    () => null,
  )

  return token ? (
    <GoogleLogin next={TRACKING_ACCOUNT_PATH} orderTrackingToken={token} />
  ) : (
    <Skeleton className="h-11 w-full" aria-label="Cargando acceso con Google" />
  )
}
