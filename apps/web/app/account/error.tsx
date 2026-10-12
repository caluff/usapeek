"use client"

import { CircleAlert, RefreshCw } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function AccountError({ reset }: { reset: () => void }) {
  return (
    <section
      role="alert"
      className="space-y-5 border border-border p-6 sm:p-10"
    >
      <CircleAlert
        className="size-8 text-muted-foreground"
        aria-hidden="true"
      />
      <h1 className="text-2xl">No pudimos cargar esta sección</h1>
      <p className="max-w-lg text-sm leading-6 text-muted-foreground">
        El servicio no respondió como esperábamos. Puedes volver a intentarlo o
        iniciar sesión nuevamente.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={reset}>
          <RefreshCw className="size-4" aria-hidden="true" />
          Reintentar
        </Button>
        <Button asChild variant="outline">
          <Link href="/login?next=%2Faccount">Volver al acceso</Link>
        </Button>
      </div>
    </section>
  )
}
