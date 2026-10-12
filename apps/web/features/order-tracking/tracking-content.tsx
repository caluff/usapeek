"use client"

import { RotateCw } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { readOrderTrackingAction } from "./actions"
import { parseOrderTrackingFragment } from "./fragment"
import { TrackingOrderView } from "./order-view"

type TrackingState =
  | Awaited<ReturnType<typeof readOrderTrackingAction>>
  | { status: "loading" }

export function TrackingContent({
  accountAccess,
}: {
  accountAccess?: ReactNode
}) {
  const [result, setResult] = useState<TrackingState>({ status: "loading" })
  const [requestVersion, setRequestVersion] = useState(0)
  const currentRequest = useRef(0)

  useEffect(() => {
    let isActive = true
    const requestId = ++currentRequest.current
    const token = parseOrderTrackingFragment(window.location.hash)
    const request = token
      ? readOrderTrackingAction(token)
      : Promise.resolve({ status: "invalid" } as const)

    request.then(
      (nextResult) => {
        if (isActive && currentRequest.current === requestId) {
          setResult(nextResult)
        }
      },
      () => {
        if (isActive && currentRequest.current === requestId) {
          setResult({ status: "unavailable" })
        }
      },
    )

    const handleFragmentChange = () => {
      currentRequest.current += 1
      setResult({ status: "loading" })
      setRequestVersion((version) => version + 1)
    }
    window.addEventListener("hashchange", handleFragmentChange)
    return () => {
      isActive = false
      window.removeEventListener("hashchange", handleFragmentChange)
    }
  }, [requestVersion])

  const retry = () => {
    currentRequest.current += 1
    setResult({ status: "loading" })
    setRequestVersion((version) => version + 1)
  }

  if (result.status === "loading") {
    return (
      <div
        role="status"
        aria-label="Cargando seguimiento del pedido"
        className="space-y-8"
      >
        <div className="space-y-3">
          <Skeleton className="h-8 w-64 max-w-full" />
          <Skeleton className="h-5 w-52 max-w-full" />
        </div>
        <Skeleton className="h-96 w-full sm:h-52" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  if (result.status === "invalid") {
    return (
      <section className="space-y-3" aria-labelledby="tracking-error-title">
        <h2 id="tracking-error-title" className="text-xl font-semibold">
          Este enlace no está disponible
        </h2>
        <p className="max-w-lg text-sm leading-6 text-muted-foreground">
          El enlace es inválido o venció. Abre el enlace del correo más reciente
          de este pedido. Si compraste con tu cuenta, también puedes consultarlo
          en Mis pedidos.
        </p>
        <Button asChild variant="outline">
          <Link href="/account/orders">Ver mis pedidos</Link>
        </Button>
      </section>
    )
  }
  if (result.status === "unavailable") {
    return (
      <section className="space-y-4" aria-labelledby="tracking-error-title">
        <div role="alert" className="space-y-3">
          <h2 id="tracking-error-title" className="text-xl font-semibold">
            No pudimos cargar tu pedido
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Revisa tu conexión y vuelve a intentarlo en unos momentos.
          </p>
        </div>
        <Button variant="outline" onClick={retry}>
          <RotateCw className="size-4" aria-hidden="true" />
          Volver a intentar
        </Button>
      </section>
    )
  }

  return (
    <TrackingOrderView order={result.order} accountAccess={accountAccess} />
  )
}
