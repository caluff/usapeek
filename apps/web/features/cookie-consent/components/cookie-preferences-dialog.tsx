"use client"

import { useState, type RefObject } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function CookiePreferencesForm({
  googleOneTap,
  onSave,
}: {
  googleOneTap: boolean
  onSave: (googleOneTap: boolean) => void
}) {
  const [allowGoogleOneTap, setAllowGoogleOneTap] = useState(googleOneTap)
  return (
    <form
      className="grid gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        onSave(allowGoogleOneTap)
      }}
    >
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Necesarias</h3>
          <span className="text-xs text-muted-foreground">Siempre activas</span>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Mantienen la sesión, el carrito y la seguridad, recuerdan el tema que
          eliges y guardan esta elección de privacidad.
        </p>
      </div>
      <div className="border-t border-border pt-4">
        <label
          htmlFor="cookie-google-one-tap"
          className="flex min-h-11 cursor-pointer items-center justify-between gap-4 text-sm font-semibold"
        >
          Acceso rápido con Google
          <Checkbox
            id="cookie-google-one-tap"
            checked={allowGoogleOneTap}
            onCheckedChange={(checked) =>
              setAllowGoogleOneTap(checked === true)
            }
            aria-describedby="cookie-google-one-tap-description"
          />
        </label>
        <p
          id="cookie-google-one-tap-description"
          className="text-sm leading-6 text-muted-foreground"
        >
          Permite cargar Google One Tap en el inicio y contactar con Google
          antes de iniciar sesión. Si lo desactivas, puedes seguir usando el
          botón Iniciar sesión.
        </p>
      </div>
      <p className="text-sm leading-6 text-muted-foreground">
        Guardamos tu elección durante 180 días. Puedes cambiarla desde el pie de
        página.{" "}
        <DialogClose asChild>
          <Link
            href="/privacy#cookies"
            className="rounded-sm text-foreground underline underline-offset-4 outline-none hover:text-brand-accent-text focus-visible:ring-2 focus-visible:ring-ring"
          >
            Política de privacidad
          </Link>
        </DialogClose>
      </p>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancelar</Button>
        </DialogClose>
        <Button type="submit">Guardar preferencias</Button>
      </DialogFooter>
    </form>
  )
}

export function CookiePreferencesDialog({
  isOpen,
  onOpenChange,
  googleOneTap,
  onSave,
  returnFocusRef,
}: {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  googleOneTap: boolean
  onSave: (googleOneTap: boolean) => void
  returnFocusRef: RefObject<HTMLElement | null>
}) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          const trigger = returnFocusRef.current
          const target = trigger?.isConnected
            ? trigger
            : document.querySelector<HTMLElement>(
                "[data-cookie-preferences-trigger]",
              )
          target?.focus({ preventScroll: true })
        }}
      >
        <DialogHeader>
          <DialogTitle>Preferencias de cookies</DialogTitle>
          <DialogDescription>
            Las cookies necesarias permanecen activas. Los servicios opcionales
            se cargan únicamente con tu permiso.
          </DialogDescription>
        </DialogHeader>
        <CookiePreferencesForm
          key={String(googleOneTap)}
          googleOneTap={googleOneTap}
          onSave={onSave}
        />
      </DialogContent>
    </Dialog>
  )
}
