"use client"

import { useEffect, useState, useTransition } from "react"
import { CheckCircle2, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { useFeedbackToast } from "@/components/feedback-toast"
import { Input } from "@/components/ui/input"
import {
  confirmApplicationVerificationAction,
  requestApplicationVerificationAction,
} from "../actions"
import type { Feedback } from "../types"

export function VerificationPanel({
  verified,
  email,
  hasCode = false,
  testMode = false,
  onVerified,
}: {
  verified: boolean
  email: string
  hasCode?: boolean
  testMode?: boolean
  onVerified?: () => void
}) {
  const [isVerified, setIsVerified] = useState(verified)
  const [code, setCode] = useState("")
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  useFeedbackToast(feedback)
  const [pending, startTransition] = useTransition()
  const [cooldown, setCooldown] = useState(0)
  useEffect(() => {
    if (!cooldown) return
    const timer = setTimeout(
      () => setCooldown((value) => Math.max(0, value - 1)),
      1000,
    )
    return () => clearTimeout(timer)
  }, [cooldown])

  if (isVerified || verified)
    return (
      <p className="flex items-center gap-2 text-sm">
        <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
        Correo verificado: <span className="break-all">{email}</span>
      </p>
    )

  return (
    <section
      className="space-y-4 border border-border bg-muted/40 p-5"
      aria-label="Verificación del correo"
    >
      <h3 className="flex items-center gap-2 font-semibold">
        <Mail className="size-4" aria-hidden="true" />
        Verifica tu correo antes de enviar
      </h3>
      <p className="text-sm leading-6 text-muted-foreground">
        La solicitud requiere verificar{" "}
        <span className="break-all font-medium">{email}</span>. Puedes guardar
        el borrador mientras tanto.{" "}
        {testMode
          ? "En este entorno de prueba puedes generar un código aquí y se completará automáticamente."
          : "El envío de códigos depende de que usapeek tenga habilitado el servicio de correo."}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={pending || cooldown > 0}
          onClick={() =>
            startTransition(async () => {
              try {
                const result = await requestApplicationVerificationAction()
                if (result.status === "success" && result.testCode) {
                  setCode(result.testCode)
                }
                setFeedback(result)
                setCooldown(
                  Math.min(3600, Math.max(0, result.retryAfterSeconds ?? 0)),
                )
              } catch {
                setFeedback({
                  status: "error",
                  message:
                    "No pudimos conectar con el servicio. Vuelve a intentarlo.",
                })
              }
            })
          }
        >
          {cooldown > 0
            ? `Volver a solicitar en ${cooldown}s`
            : pending
              ? "Procesando…"
              : testMode
                ? "Generar código de prueba"
                : "Solicitar código"}
        </Button>
      </div>
      {!hasCode || code ? (
        <Field>
          <FieldLabel htmlFor="application-code">
            Código de verificación
          </FieldLabel>
          <Input
            id="application-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoComplete="one-time-code"
            maxLength={512}
            disabled={pending}
          />
        </Field>
      ) : (
        <p className="text-sm">
          Tu enlace contiene un código. Confírmalo para continuar.
        </p>
      )}
      <Button
        type="button"
        disabled={pending || (!hasCode && !code.trim())}
        onClick={() =>
          startTransition(async () => {
            try {
              const result = await confirmApplicationVerificationAction(code)
              setFeedback(result)
              if (result.status === "success") {
                setIsVerified(true)
                onVerified?.()
              }
            } catch {
              setFeedback({
                status: "error",
                message:
                  "No pudimos confirmar la verificación. Vuelve a intentarlo.",
              })
            }
          })
        }
      >
        {pending ? "Verificando…" : "Confirmar código"}
      </Button>
    </section>
  )
}
