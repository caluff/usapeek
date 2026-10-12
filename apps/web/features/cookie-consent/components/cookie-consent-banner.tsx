"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"

export function CookieConsentBanner({
  onChoose,
  onConfigure,
}: {
  onChoose: (googleOneTap: boolean) => void
  onConfigure: (trigger: HTMLElement) => void
}) {
  return (
    <section
      aria-label="Consentimiento de cookies"
      className="fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] overflow-y-auto border-t border-border bg-background text-foreground shadow-[var(--shadow-card)]"
    >
      <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-5 px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6 lg:flex-row lg:items-center lg:gap-8 lg:px-10">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Tú eliges las cookies</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Usamos cookies necesarias para la sesión y el carrito. Tú decides si
            permites el acceso rápido con Google. Puedes cambiar tu elección en
            Preferencias de cookies.{" "}
            <Link
              href="/privacy#cookies"
              className="rounded-sm text-foreground underline underline-offset-4 outline-none hover:text-brand-accent-text focus-visible:ring-2 focus-visible:ring-ring"
            >
              Política de privacidad
            </Link>
          </p>
        </div>
        <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3">
          <Button
            variant="ghost"
            className="col-span-2 h-11 sm:col-span-1"
            onClick={(event) => onConfigure(event.currentTarget)}
          >
            Configurar
          </Button>
          <Button
            variant="outline"
            className="h-11"
            onClick={() => onChoose(false)}
          >
            Solo necesarias
          </Button>
          <Button
            variant="outline"
            className="h-11"
            onClick={() => onChoose(true)}
          >
            Aceptar todas
          </Button>
        </div>
      </div>
    </section>
  )
}
