"use client"

import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function CheckoutError({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-12">
      <h1 className="text-3xl font-medium tracking-tight">
        No pudimos cargar tu compra
      </h1>
      <p role="alert" className="mt-4 text-sm text-muted-foreground">
        Inténtalo nuevamente. Si ya confirmaste el pago, consulta primero el
        estado de tu pedido.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Button type="button" onClick={reset}>
          Volver a intentar
        </Button>
        <Button asChild variant="outline">
          <Link href="/checkout/return">Consultar estado del pedido</Link>
        </Button>
      </div>
    </div>
  )
}
