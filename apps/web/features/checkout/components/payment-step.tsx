"use client"

import type { HttpTypes } from "@medusajs/types"
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js"
import { loadStripe } from "@stripe/stripe-js"
import { Check, LockKeyhole, MapPin, Truck } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { useEffect, useId, useRef, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  completeCheckoutAction,
  initializePaymentAction,
  type CartActionState,
} from "@/features/cart/actions"
import { formatMoney } from "@/features/cart/presentation"
import {
  pickupAddress,
  type CheckoutShippingOptions,
} from "@/features/cart/shipping"
import {
  paymentBillingDetails,
  storefrontPaymentAppearance,
} from "../payment-presentation"

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
const stripePromise = publishableKey
  ? loadStripe(publishableKey).catch(() => null)
  : null
const ACCEPTED_PAYMENT_STATUSES = [
  "succeeded",
  "requires_capture",
  "processing",
]

export function PaymentStep({
  cart,
  providers,
  shippingOptions,
}: {
  cart: HttpTypes.StoreCart
  providers: HttpTypes.StorePaymentProvider[]
  shippingOptions: CheckoutShippingOptions
}) {
  const deliveryOptions = Object.values(shippingOptions).flat()
  const availableProviders = providers.filter((provider) =>
    provider.id.startsWith("pp_stripe_"),
  )
  const [providerId, setProviderId] = useState(
    availableProviders.length === 1 ? availableProviders[0].id : "",
  )
  const [isStripeUnavailable, setIsStripeUnavailable] = useState(!stripePromise)
  useEffect(() => {
    let active = true
    void stripePromise?.then((stripe) => {
      if (active && !stripe) setIsStripeUnavailable(true)
    })
    return () => {
      active = false
    }
  }, [])
  return (
    <section className="space-y-6" aria-label="Revisar y pagar">
      <div className="divide-y divide-border border border-border text-sm">
        <div className="flex items-start gap-3 px-4 py-3">
          <MapPin
            aria-hidden="true"
            className="mt-1 size-4 shrink-0 text-muted-foreground"
          />
          <div className="min-w-0 flex-1 leading-relaxed">
            <p className="font-medium">
              {cart.shipping_address?.first_name}{" "}
              {cart.shipping_address?.last_name}
            </p>
            <p className="text-muted-foreground">
              {cart.shipping_address?.address_1}
              {cart.shipping_address?.address_2
                ? `, ${cart.shipping_address.address_2}`
                : ""}
              {" · "}
              {cart.shipping_address?.city},{" "}
              {cart.shipping_address?.province?.toUpperCase()}{" "}
              {cart.shipping_address?.postal_code}
            </p>
            <p className="break-all text-muted-foreground">{cart.email}</p>
          </div>
          <Link
            href="/checkout?step=address"
            aria-label="Cambiar dirección"
            className="-my-1 inline-flex min-h-11 shrink-0 items-center underline underline-offset-4"
          >
            Cambiar
          </Link>
        </div>
        <div className="flex items-center gap-3 px-4 py-2">
          <Truck
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          />
          <div className="min-w-0 flex-1 space-y-1">
            {cart.shipping_methods?.map((method) => {
              const option = deliveryOptions.find(
                (entry) => entry.id === method.shipping_option_id,
              )
              const address = option ? pickupAddress(option) : null
              return (
                <div key={method.id}>
                  <p>
                    {method.name} · {formatMoney(method.amount, cart.currency_code)}
                  </p>
                  {address ? (
                    <p className="mt-1 text-muted-foreground">
                      Recogida en tienda: {address}
                    </p>
                  ) : null}
                </div>
              )
            })}
          </div>
          <Link
            href="/checkout?step=shipping"
            aria-label="Cambiar entrega"
            className="inline-flex min-h-11 shrink-0 items-center underline underline-offset-4"
          >
            Cambiar
          </Link>
        </div>
      </div>
      <div className="space-y-5 border border-border p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-medium tracking-tight">Método de pago</h3>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <LockKeyhole aria-hidden="true" className="size-3.5 shrink-0" />
            Pago seguro con Stripe
          </p>
        </div>
        {isStripeUnavailable || !availableProviders.length ? (
          <p
            role="status"
            className="border border-border bg-muted/30 p-5 text-sm"
          >
            El pago no está disponible en este momento. Tu carrito queda
            guardado para que puedas volver a intentarlo.
          </p>
        ) : (
          <>
            {!providerId && availableProviders.length > 1 ? (
              <fieldset className="space-y-3">
                <legend className="mb-3 text-sm font-semibold">
                  Pago seguro con Stripe
                </legend>
                {availableProviders.map((provider, index) => (
                  <label
                    key={provider.id}
                    className="flex min-h-14 cursor-pointer items-center gap-3 border border-border p-4 has-checked:border-foreground"
                  >
                    <input
                      type="radio"
                      name="provider_id"
                      value={provider.id}
                      checked={providerId === provider.id}
                      onChange={() => setProviderId(provider.id)}
                      required
                      className="size-4 accent-brand-accent"
                    />
                    <span className="text-sm font-medium">
                      {availableProviders.length > 1
                        ? `Stripe · opción ${index + 1}`
                        : "Stripe"}
                    </span>
                  </label>
                ))}
              </fieldset>
            ) : null}
            {providerId ? (
              <PreparedPayment
                key={providerId}
                cart={cart}
                providerId={providerId}
              />
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}

function PaymentFormSkeleton() {
  return (
    <div
      role="status"
      aria-label="Cargando formulario de pago seguro"
      className="space-y-4"
    >
      <span className="sr-only">Cargando formulario de pago seguro…</span>
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
      <Skeleton className="h-12 w-full" />
    </div>
  )
}

function PreparedPayment({
  cart,
  providerId,
}: {
  cart: HttpTypes.StoreCart
  providerId: string
}) {
  const { resolvedTheme } = useTheme()
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<CartActionState | null>(null)
  const request = useRef<{
    attempt: number
    promise: Promise<CartActionState>
  } | null>(null)

  useEffect(() => {
    let active = true
    // Share the pending mutation across Strict Mode's effect replay.
    if (!request.current || request.current.attempt !== attempt) {
      const form = new FormData()
      form.set("provider_id", providerId)
      request.current = {
        attempt,
        promise: initializePaymentAction({}, form).catch(() => ({
          error: "No pudimos preparar el pago. Inténtalo nuevamente.",
        })),
      }
    }
    void request.current.promise.then((state) => {
      if (active) setResult(state)
    })
    return () => {
      active = false
    }
  }, [attempt, providerId])

  if (!result) return <PaymentFormSkeleton />
  if (!result.clientSecret)
    return (
      <div className="space-y-4">
        <p role="alert" className="text-sm text-destructive">
          {result.error ?? "No pudimos preparar el pago."}
        </p>
        <Button
          variant="outline"
          onClick={() => {
            setResult(null)
            setAttempt((value) => value + 1)
          }}
        >
          Reintentar carga del formulario
        </Button>
      </div>
    )
  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret: result.clientSecret,
        locale: "es",
        appearance: {
          theme: resolvedTheme === "dark" ? "night" : "stripe",
          variables: { borderRadius: "0px" },
        },
      }}
    >
      <StripePaymentForm cart={cart} clientSecret={result.clientSecret} />
    </Elements>
  )
}

function StripePaymentForm({
  cart,
  clientSecret,
}: {
  cart: HttpTypes.StoreCart
  clientSecret: string
}) {
  const stripe = useStripe()
  const elements = useElements()
  const { resolvedTheme } = useTheme()
  const receiptId = useId()
  const [sendReceipt, setSendReceipt] = useState(true)
  const billingDetails = paymentBillingDetails(cart)
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [hasSubmittedPayment, setHasSubmittedPayment] = useState(false)
  const [message, setMessage] = useState<string>()
  const [verification, setVerification] = useState<
    "loading" | "ready" | "error"
  >("loading")
  const [verificationAttempt, setVerificationAttempt] = useState(0)

  useEffect(() => {
    if (elements) elements.update({ appearance: storefrontPaymentAppearance() })
  }, [elements, resolvedTheme])

  useEffect(() => {
    if (!stripe) return
    let active = true

    async function verifyPayment() {
      try {
        const result = await stripe!.retrievePaymentIntent(clientSecret)
        if (!active) return
        if (result.error) {
          setMessage(
            result.error.message ?? "No pudimos consultar el estado del pago.",
          )
          setVerification("error")
          return
        }
        setHasSubmittedPayment(
          ACCEPTED_PAYMENT_STATUSES.includes(result.paymentIntent.status),
        )
        setVerification("ready")
      } catch {
        if (!active) return
        setMessage(
          "No pudimos consultar el estado del pago. Vuelve a intentarlo antes de pagar.",
        )
        setVerification("error")
      }
    }

    void verifyPayment()
    return () => {
      active = false
    }
  }, [stripe, clientSecret, verificationAttempt])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isPending || verification !== "ready") return
    if (!hasSubmittedPayment && (!stripe || !elements || !isReady)) return
    setIsPending(true)
    setMessage(undefined)

    try {
      if (!hasSubmittedPayment) {
        if (!stripe || !elements) return
        const current = await stripe.retrievePaymentIntent(clientSecret)
        if (current.error) {
          setMessage(
            current.error.message ??
              "No pudimos consultar el estado del pago. Inténtalo nuevamente.",
          )
          return
        }
        const result = ACCEPTED_PAYMENT_STATUSES.includes(
          current.paymentIntent.status,
        )
          ? current
          : await stripe.confirmPayment({
              elements,
              confirmParams: {
                return_url: `${window.location.origin}/checkout/return`,
                payment_method_data: {
                  billing_details: {
                    email: billingDetails.email,
                    phone: billingDetails.phone,
                    address: billingDetails.address,
                  },
                },
                receipt_email: sendReceipt ? (cart.email ?? "") : "",
              },
              redirect: "if_required",
            })
        if (result.error) {
          setMessage(
            result.error.message ??
              "No se pudo confirmar el pago. Revisa los datos e inténtalo nuevamente.",
          )
          return
        }
        if (!ACCEPTED_PAYMENT_STATUSES.includes(result.paymentIntent.status)) {
          setMessage(
            "El pago requiere atención. Revisa el método de pago e inténtalo nuevamente.",
          )
          return
        }
        setHasSubmittedPayment(true)
      }

      const result = await completeCheckoutAction()
      if (result.redirectTo) {
        router.replace(result.redirectTo)
      } else {
        setMessage(
          result.error ??
            "El pago está en proceso. Puedes consultar su estado nuevamente.",
        )
      }
    } catch {
      setMessage(
        "No pudimos comprobar el pedido. Vuelve a consultar el estado antes de intentar otro pago.",
      )
    } finally {
      setIsPending(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-6"
      aria-busy={isPending || verification === "loading"}
    >
      {verification === "loading" ? (
        <PaymentFormSkeleton />
      ) : verification === "ready" && !hasSubmittedPayment ? (
        <>
          {!isReady ? (
            <p role="status" className="text-sm text-muted-foreground">
              Cargando formulario de pago seguro…
            </p>
          ) : null}
          <PaymentElement
            options={{
              layout: { type: "accordion", defaultCollapsed: false },
              paymentMethodOrder: ["card", "link"],
              wallets: { link: "auto", applePay: "auto", googlePay: "auto" },
              fields: {
                billingDetails: {
                  name: "always",
                  email: "never",
                  phone: "never",
                  address: "never",
                },
              },
              defaultValues: { billingDetails },
            }}
            onReady={() => setIsReady(true)}
            onLoadError={() =>
              setMessage(
                "No pudimos cargar el formulario de pago. Recarga la página para intentarlo nuevamente.",
              )
            }
          />
          <div className="space-y-3 border-t border-border pt-4 text-sm">
            <p className="flex items-start gap-3">
              <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              La facturación usa la dirección guardada en este pedido.
            </p>
            <label
              htmlFor={receiptId}
              className="flex min-h-11 cursor-pointer items-start gap-3 py-2"
            >
              <input
                id={receiptId}
                type="checkbox"
                checked={sendReceipt}
                onChange={(event) => setSendReceipt(event.target.checked)}
                disabled={isPending}
                className="mt-0.5 size-4 shrink-0 accent-brand-accent"
              />
              <span>
                Enviarme un recibo del pago por correo electrónico
                <span className="mt-1 block break-all text-xs text-muted-foreground">
                  Stripe lo enviará a {cart.email} cuando se cobre el pago.
                </span>
              </span>
            </label>
          </div>
        </>
      ) : verification === "ready" ? (
        <p className="text-sm text-muted-foreground">
          Estamos verificando la confirmación del pago y la creación de tu
          pedido.
        </p>
      ) : null}
      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
      {verification === "error" ? (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => {
            setMessage(undefined)
            setVerification("loading")
            setVerificationAttempt((attempt) => attempt + 1)
          }}
        >
          Volver a consultar el pago
        </Button>
      ) : (
        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={
            isPending ||
            verification !== "ready" ||
            (!hasSubmittedPayment && (!stripe || !elements || !isReady))
          }
        >
          {isPending
            ? "Procesando…"
            : hasSubmittedPayment
              ? "Consultar estado del pedido"
              : `Pagar ${formatMoney(cart.total, cart.currency_code)}`}
        </Button>
      )}
    </form>
  )
}
