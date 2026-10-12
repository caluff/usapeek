"use client"

import type {
  ApplicationOptionsResponse,
  ApplicationResponse,
  SaveApplicationBody,
  WizardStep,
} from "@usapeek/vendor-onboarding-contracts"
import type { HttpTypes } from "@medusajs/types"
import { normalizeUsState } from "@usapeek/ui/us-states"
import { ArrowLeft, ArrowRight, Check, LoaderCircle, Save } from "lucide-react"
import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { FeedbackToast } from "@/components/feedback-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { cn } from "@/lib/utils"
import { saveApplicationAction, submitApplicationAction } from "../actions"
import {
  initialDraft,
  mutationForPayload,
  STEPS,
  STEP_LABELS,
  validateStep,
} from "../validation"
import type { ApplicationActionResult } from "../types"
import type { getApplicationFormData } from "../data"
import { ApplicationFields } from "./application-fields"
import { ApplicationReview } from "./application-review"
import { VerificationPanel } from "./verification-panel"

const UNAVAILABLE_OPTIONS_FEEDBACK = {
  status: "warning",
  message:
    "Faltan países o monedas habilitadas. Puedes guardar el borrador y continuar cuando estén disponibles.",
}
const RESOURCE_ERROR_FEEDBACK = {
  status: "error",
  message:
    "No pudimos cargar las categorías y direcciones. Tus datos siguen en el formulario; puedes reintentar.",
}

export function ApplicationWizard({
  response,
  customer,
  resources,
  options,
  hasCode,
}: {
  response: ApplicationResponse
  customer: Pick<HttpTypes.StoreCustomer, "first_name" | "last_name" | "phone">
  resources: Awaited<ReturnType<typeof getApplicationFormData>>["resources"]
  options: ApplicationOptionsResponse
  hasCode: boolean
}) {
  const router = useRouter()
  const [formResources, setFormResources] = useState<Awaited<
    typeof resources
  > | null>(null)
  useEffect(() => {
    let active = true
    void resources.then((value) => {
      if (active) setFormResources(value)
    })
    return () => {
      active = false
    }
  }, [resources])
  const categories =
    formResources?.status === "ready" ? formResources.categories : []
  const addresses =
    formResources?.status === "ready" ? formResources.addresses : []
  const [draft, setDraft] = useState(() => {
    const data = response.application?.data ?? initialDraft(customer, options)
    return {
      ...data,
      activity: {
        ...data.activity,
        business_address: {
          ...data.activity.business_address,
          province: normalizeUsState(data.activity.business_address.province),
        },
      },
    }
  })
  const [step, setStep] = useState<WizardStep>(
    response.application?.current_step ?? "responsible",
  )
  const [version, setVersion] = useState(response.application?.version ?? 0)
  const [isVerified, setIsVerified] = useState(
    response.applicant.email_verified,
  )
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<ApplicationActionResult | null>(null)
  const [pending, startTransition] = useTransition()
  const [isDirty, setIsDirty] = useState(false)
  const mutation = useRef<{ fingerprint: string; id: string } | null>(null)
  const feedbackRef = useRef<HTMLDivElement>(null)
  const index = STEPS.indexOf(step)
  const conflicted = result?.status === "conflict"
  const needsResources = step === "activity" || step === "review"
  const resourcesUnavailable =
    needsResources && formResources?.status !== "ready"
  const unavailableOptions =
    !options.currency_codes.length || !options.country_codes.includes("us")

  function showResult(next: ApplicationActionResult) {
    setResult(next)
    if (next.fieldErrors) setErrors(next.fieldErrors)
    if (next.status === "success") toast.success(next.message)
    else if (next.status === "conflict") toast.warning(next.message)
    else toast.error(next.message)
    if (next.status !== "success")
      requestAnimationFrame(() => feedbackRef.current?.focus())
  }

  function save(destination: WizardStep, exit = false) {
    const payload: Omit<SaveApplicationBody, "mutation_id"> = {
      expected_version: version,
      current_step: destination,
      data: draft,
    }
    mutation.current = mutationForPayload(mutation.current, payload, () =>
      crypto.randomUUID(),
    )
    const body: SaveApplicationBody = {
      ...payload,
      mutation_id: mutation.current.id,
    }
    startTransition(async () => {
      try {
        const next = await saveApplicationAction(body)
        showResult(next)
        if (next.status === "success" && next.response?.application) {
          setVersion(next.response.application.version)
          setDraft(next.response.application.data)
          setStep(destination)
          setIsDirty(false)
          setErrors({})
          mutation.current = null
          if (exit) router.push("/account")
        }
      } catch {
        showResult({
          status: "error",
          message:
            "No pudimos confirmar el guardado. Reintenta sin cambiar los datos para recuperar la misma operación.",
          retryable: true,
        })
      }
    })
  }

  function submit() {
    const fieldErrors = validateStep(
      draft,
      "review",
      options,
      categories.map((category) => category.id),
    )
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length || !acceptedTerms || !isVerified) {
      showResult({
        status: "error",
        message:
          "Revisa los datos, verifica tu correo y confirma tu consentimiento antes de enviar.",
      })
      return
    }
    const payload = {
      expected_version: version,
      accepted_terms: true as const,
    }
    mutation.current = mutationForPayload(mutation.current, payload, () =>
      crypto.randomUUID(),
    )
    const body = { ...payload, mutation_id: mutation.current.id }
    startTransition(async () => {
      try {
        const next = await submitApplicationAction(body)
        showResult(next)
        if (next.status === "success") {
          mutation.current = null
        }
      } catch {
        showResult({
          status: "error",
          message:
            "No pudimos confirmar el envío. Reintenta para consultar el resultado de la misma operación.",
          retryable: true,
        })
      }
    })
  }

  return (
    <div className="space-y-6">
      {response.application?.review?.reason ? (
        <section className="border-l-2 border-brand-accent bg-muted/40 p-5">
          <h2 className="font-semibold">Correcciones solicitadas</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
            {response.application.review.reason}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Actualiza esta misma solicitud y vuelve a enviarla.
          </p>
        </section>
      ) : null}
      <ol
        aria-label="Pasos de tu solicitud"
        className="grid grid-cols-4 border-b border-border"
      >
        {STEPS.map((item, itemIndex) => (
          <li
            key={item}
            aria-current={step === item ? "step" : undefined}
            className={cn(
              "flex flex-col gap-2 border-b-2 border-transparent px-1 pb-4 text-xs sm:flex-row sm:items-center sm:gap-3 sm:px-3 sm:text-sm",
              step === item
                ? "border-brand-accent font-semibold"
                : "text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-7 items-center justify-center border border-border text-xs",
                step === item &&
                  "border-brand-accent bg-brand-accent text-brand-accent-foreground",
              )}
            >
              {itemIndex < index ? (
                <Check className="size-3" aria-hidden="true" />
              ) : (
                `0${itemIndex + 1}`
              )}
            </span>
            {STEP_LABELS[item]}
          </li>
        ))}
      </ol>
      {unavailableOptions ? (
        <div>
          <FeedbackToast feedback={UNAVAILABLE_OPTIONS_FEEDBACK} />
          <p
            role="status"
            className="border border-warning/30 bg-warning/10 p-4 text-sm leading-6 text-warning-foreground"
          >
            Faltan países o monedas habilitadas para completar la solicitud.
            Puedes guardar tu borrador y continuar cuando estén disponibles.
          </p>
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="mb-2 text-xs tracking-widest text-muted-foreground uppercase">
                Paso {index + 1} de 4
              </p>
              <h2 className="text-2xl font-medium tracking-tight">
                {STEP_LABELS[step]}
              </h2>
            </div>
            <p
              className="flex items-center gap-2 text-xs text-muted-foreground"
              aria-live="polite"
            >
              <Save className="size-3.5" aria-hidden="true" />
              {pending
                ? "Guardando…"
                : isDirty
                  ? "Cambios sin guardar"
                  : version
                    ? "Borrador guardado"
                    : "Todavía sin guardar"}
            </p>
          </div>
        </CardHeader>
        <CardContent className="pb-6">
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              if (pending || conflicted || resourcesUnavailable) return
              if (step === "review") return submit()
              const fieldErrors = validateStep(
                draft,
                step,
                options,
                categories.map((category) => category.id),
              )
              setErrors(fieldErrors)
              if (Object.keys(fieldErrors).length) {
                showResult({
                  status: "error",
                  message: "Revisa los campos indicados antes de continuar.",
                })
                return
              }
              if (!event.currentTarget.reportValidity()) return
              save(STEPS[index + 1])
            }}
            aria-busy={pending}
          >
            <fieldset
              disabled={pending || conflicted}
              className="min-w-0 space-y-6"
            >
              {resourcesUnavailable ? (
                <div role="status" className="space-y-4">
                  {formResources?.status === "error" ? (
                    <>
                      <FeedbackToast feedback={RESOURCE_ERROR_FEEDBACK} />
                      <p className="text-sm text-destructive">
                        No pudimos cargar las categorías y direcciones. Tus
                        datos siguen guardados en el formulario.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => router.refresh()}
                      >
                        Reintentar
                      </Button>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground">
                        Cargando opciones de este paso…
                      </p>
                      <Skeleton className="h-64 w-full" />
                    </>
                  )}
                </div>
              ) : step === "review" ? (
                <>
                  <ApplicationReview
                    data={draft}
                    email={response.applicant.email}
                    categories={categories}
                    onEdit={(next) => {
                      setStep(next)
                      setErrors({})
                      setResult(null)
                    }}
                  />
                  <VerificationPanel
                    verified={isVerified}
                    email={response.applicant.email}
                    hasCode={hasCode}
                    testMode={response.applicant.email_verification_test_mode}
                    onVerified={() => setIsVerified(true)}
                  />
                  <Field orientation="horizontal">
                    <Checkbox
                      id="application-consent"
                      checked={acceptedTerms}
                      onCheckedChange={(value) =>
                        setAcceptedTerms(value === true)
                      }
                    />
                    <FieldLabel
                      htmlFor="application-consent"
                      className="font-normal leading-6"
                    >
                      Confirmo que los datos son correctos y autorizo a
                      usapeek a revisar esta solicitud y contactarme
                      sobre su resultado. Entiendo que enviarla no habilita
                      automáticamente mi tienda.
                    </FieldLabel>
                  </Field>
                  <p className="text-xs text-muted-foreground">
                    Consentimiento · versión {options.terms_version}
                  </p>
                </>
              ) : (
                <ApplicationFields
                  step={step}
                  draft={draft}
                  email={response.applicant.email}
                  onChange={(next) => {
                    setDraft(next)
                    setIsDirty(true)
                  }}
                  errors={errors}
                  options={options}
                  categories={categories}
                  addresses={addresses}
                />
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
                <div className="flex flex-wrap items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={index === 0}
                    onClick={() => {
                      setStep(STEPS[index - 1])
                      setErrors({})
                      setResult(null)
                    }}
                  >
                    <ArrowLeft aria-hidden="true" className="size-4" />
                    Atrás
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => save(step, true)}
                  >
                    <Save aria-hidden="true" className="size-4" />
                    Guardar y salir
                  </Button>
                </div>
                <Button
                  type="submit"
                  disabled={
                    resourcesUnavailable ||
                    (step === "review" &&
                      (!acceptedTerms || !isVerified || unavailableOptions))
                  }
                >
                  {pending ? (
                    <LoaderCircle
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : null}
                  {step === "review"
                    ? "Enviar solicitud"
                    : "Guardar y continuar"}
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Button>
              </div>
            </fieldset>
            <div ref={feedbackRef} tabIndex={-1} className="mt-5 outline-none">
              {result && result.status !== "success" ? (
                <FieldError>{result.message}</FieldError>
              ) : null}
              {Object.keys(errors).length && step === "review" ? (
                <ul className="mt-3 space-y-2 text-sm">
                  {STEPS.slice(0, 3)
                    .filter((item) =>
                      Object.keys(errors).some((key) => key.startsWith(item)),
                    )
                    .map((item) => (
                      <li key={item}>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setStep(item)}
                        >
                          Revisar {STEP_LABELS[item]}
                        </Button>
                      </li>
                    ))}
                </ul>
              ) : null}
              {conflicted ? (
                <div className="mt-4 space-y-4">
                  <p className="text-sm leading-6 text-muted-foreground">
                    Tus valores siguen visibles arriba. Cargar la versión
                    guardada reemplazará esos valores; cópialos antes si
                    necesitas conservarlos.
                  </p>
                  <details className="border border-border p-4">
                    <summary className="cursor-pointer text-sm font-semibold">
                      Ver y copiar mis datos locales
                    </summary>
                    <div className="mt-5">
                      <ApplicationReview
                        data={draft}
                        email={response.applicant.email}
                        categories={categories}
                      />
                    </div>
                  </details>
                  {result.response?.application ? (
                    <details className="border border-border p-4">
                      <summary className="cursor-pointer text-sm font-semibold">
                        Ver datos guardados · versión{" "}
                        {result.response.application.version}
                      </summary>
                      <div className="mt-5">
                        <ApplicationReview
                          data={result.response.application.data}
                          email={result.response.applicant.email}
                          categories={categories}
                        />
                      </div>
                    </details>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const latest = result.response?.application
                      if (latest?.can_edit) {
                        setDraft(latest.data)
                        setVersion(latest.version)
                        setStep(latest.current_step)
                        setResult(null)
                        setErrors({})
                        setIsDirty(false)
                        mutation.current = null
                      } else router.refresh()
                    }}
                  >
                    Cargar versión guardada
                  </Button>
                </div>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>
      <p className="text-sm leading-6 text-muted-foreground">
        Tu cuenta de comprador, tus órdenes y tus favoritos seguirán
        disponibles. Si se aprueba tu solicitud, accederás al panel de
        vendedores con las mismas credenciales.
      </p>
    </div>
  )
}
