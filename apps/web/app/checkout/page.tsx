import type { Metadata } from "next"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { getCustomerAccount } from "@/features/account/data"
import { listCheckoutAddresses } from "@/features/cart/checkout-address"
import { OrderSummary } from "@/features/cart/components/order-summary"
import {
  getCheckoutCart,
  getPaymentProviders,
  getShippingOptions,
} from "@/features/cart/data"
import { AddressStep } from "@/features/checkout/components/address-step"
import { CheckoutAssurance } from "@/features/checkout/components/checkout-assurance"
import { PaymentStep } from "@/features/checkout/components/payment-step"
import { PaymentReturn } from "@/features/checkout/components/payment-return"
import { RetryCheckout } from "@/features/checkout/components/retry-checkout"
import { ShippingStep } from "@/features/checkout/components/shipping-step"
import { hasEligibleShippingSelection } from "@/features/cart/presentation"

export const metadata: Metadata = {
  title: "Finalizar compra",
  description:
    "Revisa tu carrito, selecciona la dirección y el envío, y completa el pago de tu compra en USAPEEK.",
}

type CheckoutPageProps = {
  searchParams: Promise<{ step?: string | string[] }>
}

export default function CheckoutPage({ searchParams }: CheckoutPageProps) {
  return (
    <>
      <Link
        href="/cart"
        prefetch={false}
        className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Volver al carrito
      </Link>
      <div className="mb-9 flex flex-wrap items-end justify-between gap-4 border-b border-border pb-7">
        <h1 className="text-4xl font-medium tracking-tight sm:text-5xl">
          Finalizar compra
        </h1>
      </div>
      <Suspense fallback={<CheckoutSkeleton />}>
        <CheckoutContent searchParams={searchParams} />
      </Suspense>
    </>
  )
}

async function CheckoutContent({ searchParams }: CheckoutPageProps) {
  const [cart, parameters] = await Promise.all([
    getCheckoutCart(),
    searchParams,
  ])
  if (cart?.completed_at) {
    return (
      <section aria-labelledby="checkout-recovery-title">
        <h2
          id="checkout-recovery-title"
          className="text-2xl font-medium tracking-tight"
        >
          Consultando tu pedido
        </h2>
        <PaymentReturn />
      </section>
    )
  }
  if (!cart?.items?.length) {
    return (
      <div className="py-14 text-center">
        <h2 className="text-2xl font-medium">Tu carrito está vacío</h2>
        <Button asChild className="mt-6">
          <Link href="/search">Explorar el catálogo</Link>
        </Button>
      </div>
    )
  }

  const hasAddress = Boolean(
    cart.email &&
    cart.shipping_address?.address_1 &&
    cart.shipping_address.country_code === "us",
  )
  const hasShipping = hasAddress && Boolean(cart.shipping_methods?.length)
  const requestedStep =
    typeof parameters.step === "string" ? parameters.step : undefined
  const step =
    requestedStep === "address" || !hasAddress
      ? "address"
      : requestedStep === "shipping" || !hasShipping
        ? "shipping"
        : "payment"
  const steps = [
    { key: "address", title: "Dirección", enabled: true },
    { key: "shipping", title: "Entrega", enabled: hasAddress },
    { key: "payment", title: "Pago", enabled: hasShipping },
  ]

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
      <div className="min-w-0">
        <nav aria-label="Pasos de compra" className="mb-9">
          <ol className="grid grid-cols-3 border-b border-border">
            {steps.map((item, index) => (
              <li key={item.key}>
                {item.enabled ? (
                  <Link
                    href={`/checkout?step=${item.key}`}
                    prefetch={false}
                    aria-current={step === item.key ? "step" : undefined}
                    className={`flex min-h-12 items-center gap-2 border-b-2 px-2 text-sm ${step === item.key ? "border-foreground font-semibold" : "border-transparent text-muted-foreground"}`}
                  >
                    <span className="text-xs">0{index + 1}</span>
                    {item.title}
                  </Link>
                ) : (
                  <span className="flex min-h-12 items-center gap-2 px-2 text-sm text-muted-foreground">
                    <span className="text-xs">0{index + 1}</span>
                    {item.title}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        {step === "address" ? (
          <Suspense
            fallback={<StepSkeleton label="Cargando tus direcciones" />}
          >
            <AddressContent cart={cart} />
          </Suspense>
        ) : null}
        {step === "shipping" ? (
          <Suspense
            fallback={<StepSkeleton label="Cargando opciones de envío" />}
          >
            <ShippingContent cart={cart} />
          </Suspense>
        ) : null}
        {step === "payment" ? (
          <Suspense
            fallback={<StepSkeleton label="Cargando métodos de pago" />}
          >
            <PaymentContent cart={cart} />
          </Suspense>
        ) : null}
      </div>
      <aside className="lg:sticky lg:top-24">
        <OrderSummary cart={cart}>
          <CheckoutAssurance />
        </OrderSummary>
      </aside>
    </div>
  )
}

async function AddressContent({
  cart,
}: {
  cart: NonNullable<Awaited<ReturnType<typeof getCheckoutCart>>>
}) {
  let account: Awaited<ReturnType<typeof getCustomerAccount>>
  let addresses: Awaited<ReturnType<typeof listCheckoutAddresses>>
  try {
    account = await getCustomerAccount()
    addresses = account
      ? await listCheckoutAddresses(account.sdk.store.customer)
      : []
  } catch {
    return (
      <LoadError message="No pudimos cargar tu cuenta y tus direcciones. Si tu sesión venció, vuelve a iniciar sesión." />
    )
  }
  return (
    <AddressStep
      key={`${cart.id}_${account?.customer.id ?? "guest"}`}
      cart={cart}
      customer={account?.customer ?? null}
      addresses={addresses}
    />
  )
}

async function ShippingContent({
  cart,
}: {
  cart: NonNullable<Awaited<ReturnType<typeof getCheckoutCart>>>
}) {
  let options: Awaited<ReturnType<typeof getShippingOptions>>
  try {
    options = await getShippingOptions(cart.id)
  } catch {
    return <LoadError message="No pudimos cargar los envíos disponibles." />
  }
  return (
    <ShippingStep
      key={JSON.stringify(cart.shipping_address)}
      cart={cart}
      options={options}
    />
  )
}

async function PaymentContent({
  cart,
}: {
  cart: NonNullable<Awaited<ReturnType<typeof getCheckoutCart>>>
}) {
  let providers: Awaited<ReturnType<typeof getPaymentProviders>>
  let options: Awaited<ReturnType<typeof getShippingOptions>>
  try {
    const result = await Promise.all([
      cart.region_id ? getPaymentProviders(cart.region_id) : Promise.resolve([]),
      getShippingOptions(cart.id),
    ])
    providers = result[0]
    options = result[1]
  } catch {
    return (
      <LoadError message="No pudimos comprobar la entrega y los métodos de pago." />
    )
  }
  if (!hasEligibleShippingSelection(cart, options)) {
    redirect("/checkout?step=shipping")
  }
  return (
    <PaymentStep
      key={`${cart.id}_${cart.total}_${cart.shipping_methods?.map((method) => method.id).join("_")}`}
      cart={cart}
      providers={providers}
      shippingOptions={options}
    />
  )
}

function LoadError({ message }: { message: string }) {
  return (
    <div className="border border-border p-6">
      <p role="alert" className="mb-4 text-sm">
        {message}
      </p>
      <RetryCheckout />
    </div>
  )
}

function StepSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-4">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  )
}

function CheckoutSkeleton() {
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <StepSkeleton label="Cargando tu compra" />
      <Skeleton className="h-80 w-full" />
    </div>
  )
}
