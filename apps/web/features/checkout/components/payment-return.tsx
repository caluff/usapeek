"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { completeCheckoutAction } from "@/features/cart/actions"

export function PaymentReturn() {
  const router = useRouter()
  const started = useRef(false)
  const [pending, setPending] = useState(true)
  const [message, setMessage] = useState<string>()

  const verify = useCallback(async () => {
    setPending(true)
    setMessage(undefined)
    try {
      const result = await completeCheckoutAction()
      if (result.redirectTo) {
        router.replace(result.redirectTo)
      } else {
        setMessage(
          result.error ??
            "Tu pago todavía está en proceso. Vuelve a consultar el estado en unos instantes.",
        )
      }
    } catch {
      setMessage(
        "No pudimos comprobar tu pedido. Consulta el estado nuevamente antes de intentar otro pago.",
      )
    } finally {
      setPending(false)
    }
  }, [router])

  useEffect(() => {
    if (started.current) return
    started.current = true
    void verify()
  }, [verify])

  return (
    <div
      className="mt-8 max-w-xl space-y-5 border border-border p-6 sm:p-8"
      aria-busy={pending}
    >
      {pending ? (
        <p role="status">Estamos comprobando el pago y preparando tu pedido…</p>
      ) : null}
      {message ? (
        <p role="alert" className="text-sm leading-relaxed">
          {message}
        </p>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="button" disabled={pending} onClick={() => void verify()}>
          {pending ? "Comprobando…" : "Consultar estado"}
        </Button>
        {!pending ? (
          <Button asChild variant="outline">
            <Link href="/checkout">Volver a la compra</Link>
          </Button>
        ) : null}
      </div>
    </div>
  )
}
