import Link from "next/link"

import { Button } from "@/components/ui/button"
import { getCurrentCustomer } from "@/lib/auth-sdk"
import { googleCallbackUrl } from "@/lib/google-auth"
import { TrackingGoogleLogin } from "./google-login"

const ACCOUNT_ORDERS_PATH = "/account/orders"
const LOGIN_PATH = "/login?next=%2Faccount%2Forders"

export async function TrackingAccountAccess() {
  let customer: Awaited<ReturnType<typeof getCurrentCustomer>>
  try {
    customer = await getCurrentCustomer()
  } catch {
    return (
      <section className="space-y-3" aria-label="Acceso a tu cuenta">
        <p role="alert" className="text-sm text-muted-foreground">
          No pudimos comprobar tu sesión. Puedes volver a intentarlo desde la
          página de inicio de sesión.
        </p>
        <Button asChild variant="outline">
          <Link href={LOGIN_PATH}>Iniciar sesión</Link>
        </Button>
      </section>
    )
  }

  const hasGoogleLogin = Boolean(
    googleCallbackUrl(process.env.NEXT_PUBLIC_GOOGLE_CALLBACK_URL),
  )

  return (
    <section
      aria-label="Acceso a tu cuenta"
      className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="max-w-lg text-sm leading-6 text-muted-foreground">
        Usa Google con el mismo correo que usaste al comprar para añadir este
        pedido a Mis pedidos.
      </p>
      <div className="w-full shrink-0 sm:w-60">
        {hasGoogleLogin ? (
          <TrackingGoogleLogin />
        ) : (
          <Button asChild variant="outline" className="w-full">
            <Link href={LOGIN_PATH}>Iniciar sesión o registrarme</Link>
          </Button>
        )}
        {customer ? (
          <Link
            href={ACCOUNT_ORDERS_PATH}
            className="mt-2 inline-flex min-h-11 w-full items-center justify-center text-sm text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            Ver mis pedidos
          </Link>
        ) : null}
      </div>
    </section>
  )
}
