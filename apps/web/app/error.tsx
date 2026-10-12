"use client"

import { CircleAlert, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function Error() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-16">
      <Card className="w-full max-w-xl bg-background" role="alert">
        <CardHeader className="px-6 py-10 sm:px-10 sm:py-12">
          <CircleAlert
            aria-hidden="true"
            className="size-12 text-brand-accent-text"
            strokeWidth={1.25}
          />
          <CardTitle className="mt-3 text-3xl">
            No pudimos cargar esta página
          </CardTitle>
          <CardDescription className="text-base">
            El servicio puede estar temporalmente fuera de servicio. Intenta
            nuevamente en unos momentos. Si el problema continúa, contacta al
            soporte.
          </CardDescription>
          <div className="mt-5">
            <Button type="button" variant="accent" onClick={() => window.location.reload()}>
              <RefreshCw aria-hidden="true" className="size-4" />
              Volver a intentar
            </Button>
          </div>
        </CardHeader>
      </Card>
    </main>
  )
}
