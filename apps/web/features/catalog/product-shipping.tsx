"use client"

import { useState } from "react"
import { ArrowRight, LoaderCircle, Truck } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { loadProductShipping } from "./product-shipping-action"

export function ProductShipping({
  offerId,
  sellerName,
}: {
  offerId?: string
  sellerName?: string
}) {
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof loadProductShipping>
  > | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function load() {
    if (!offerId || isLoading) return
    setIsLoading(true)
    try {
      setResult(await loadProductShipping(offerId))
    } catch {
      setResult({ status: "error" })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex gap-3">
      <Truck
        className="mt-0.5 size-5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="font-semibold">Envíos a Estados Unidos</p>
        <Dialog
          onOpenChange={(open) => {
            if (open) void load()
          }}
        >
          <DialogTrigger asChild>
            <button
              type="button"
              disabled={!offerId}
              className="inline-flex min-h-11 items-center gap-2 text-left font-semibold text-brand-accent-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring disabled:text-muted-foreground disabled:no-underline"
            >
              {offerId
                ? "Ver tipos de envío"
                : "Selecciona una tienda para ver los envíos"}
              {offerId ? (
                <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
              ) : null}
            </button>
          </DialogTrigger>
          <DialogContent className="font-sans">
            <DialogHeader>
              <DialogTitle>Tipos de envío</DialogTitle>
              <DialogDescription>
                {sellerName ?? "Tienda seleccionada"} · Estados Unidos
              </DialogDescription>
            </DialogHeader>
            {isLoading ? (
              <p
                className="flex items-center gap-2 text-sm text-muted-foreground"
                role="status"
              >
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />{" "}
                Consultando envíos…
              </p>
            ) : result?.status === "error" ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground" role="alert">
                  No pudimos consultar los envíos de esta tienda.
                </p>
                <Button variant="outline" onClick={() => void load()}>
                  Reintentar
                </Button>
              </div>
            ) : result?.status === "success" ? (
              result.options.length ? (
                <ul className="divide-y divide-border border border-border">
                  {result.options.map((option) => (
                    <li key={option.id} className="p-4">
                      <p className="text-sm font-semibold">{option.name}</p>
                      {option.type?.label &&
                      option.type.label !== option.name ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {option.type.label}
                        </p>
                      ) : null}
                      {option.type?.description ? (
                        <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                          {option.type.description}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground" role="status">
                  La tienda no tiene tipos de envío publicados para este
                  producto y destino.
                </p>
              )
            ) : null}
            <p className="border-t border-border pt-4 text-xs leading-5 text-muted-foreground">
              El costo y las opciones disponibles para tu dirección se
              confirmarán al finalizar la compra.
            </p>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
