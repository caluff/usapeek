"use client"

import { Button } from "@/components/ui/button"

export default function Error({ reset }: { reset: () => void }) {
  return (
    <section
      role="alert"
      className="max-w-2xl space-y-5 border border-border p-6"
    >
      <h1 className="text-2xl font-medium">No pudimos cargar tu solicitud</h1>
      <p className="text-sm leading-6 text-muted-foreground">
        El servicio de solicitudes no está disponible en este momento. Vuelve a
        intentarlo para consultar tu estado o continuar el borrador.
      </p>
      <Button onClick={reset}>Volver a intentar</Button>
    </section>
  )
}
