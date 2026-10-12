"use client"

import { LoaderCircle, RotateCw } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { claimPendingTrackingOrderAction } from "./account-link-actions"
import { TRACKING_ACCOUNT_PATH, type TrackingAccountLinkResult } from "./account-link"

export function TrackingAccountLinkContent() {
  const router = useRouter()
  const [result, setResult] = useState<TrackingAccountLinkResult | null>(null)
  const [attempt, setAttempt] = useState(0)
  const request = useRef<Promise<TrackingAccountLinkResult> | null>(null)

  useEffect(() => {
    let isActive = true
    // Reuse the promise during Strict Mode's effect replay; the cookie is consumed
    // after success, so a duplicate browser request would lose that result.
    request.current ??= claimPendingTrackingOrderAction()
    request.current.then(
      (nextResult) => {
        if (!isActive) return
        if (nextResult.status === "associated") {
          router.replace(`/account/orders/${nextResult.orderId}`)
        } else {
          setResult(nextResult)
        }
      },
      () => {
        if (isActive) setResult({ status: "unavailable" })
      },
    )
    return () => {
      isActive = false
    }
  }, [attempt, router])

  if (!result) {
    return (
      <p role="status" className="flex items-center gap-3 text-sm text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Estamos añadiendo este pedido a tus compras.
      </p>
    )
  }

  const message =
    result.status === "invalid"
      ? "El enlace no está disponible o el intento de vinculación venció. Abre de nuevo el enlace privado de tu pedido y continúa con Google."
      : result.status === "cannot_link"
        ? "No pudimos vincular este pedido. Abre su enlace privado y usa Google con el mismo correo que usaste al comprar."
        : result.status === "sign_in_required"
          ? "Tu sesión venció. Inicia sesión con Google para continuar."
          : "No pudimos conectar con el servicio de pedidos. Vuelve a intentarlo en unos momentos."

  return (
    <section className="space-y-5">
      <p role="alert" className="max-w-lg text-sm leading-6 text-muted-foreground">
        {message}
      </p>
      <div className="flex flex-wrap gap-3">
        {result.status === "unavailable" ? (
          <Button
            variant="outline"
            onClick={() => {
              request.current = null
              setResult(null)
              setAttempt((value) => value + 1)
            }}
          >
            <RotateCw className="size-4" aria-hidden="true" />
            Volver a intentar
          </Button>
        ) : result.status === "sign_in_required" ? (
          <Button asChild variant="outline">
            <Link href={`/login?next=${encodeURIComponent(TRACKING_ACCOUNT_PATH)}`}>
              Iniciar sesión
            </Link>
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <Link href="/account/orders">Ver mis pedidos</Link>
        </Button>
      </div>
    </section>
  )
}
