import type { HttpTypes } from "@medusajs/types"
import Link from "next/link"

import { GoogleLogin } from "@/components/auth/google-login"
import { Button } from "@/components/ui/button"
import { getCurrentCustomer } from "@/lib/auth-sdk"
import { googleCallbackUrl } from "@/lib/google-auth"

export async function OrderFollowUp() {
  let customer: HttpTypes.StoreCustomer | null
  try {
    customer = await getCurrentCustomer()
  } catch {
    return (
      <section
        className="order-first basis-full space-y-4"
        aria-label="Acceso a tus pedidos"
      >
        <p role="alert" className="text-sm text-muted-foreground">
          No pudimos comprobar el acceso a tu cuenta. Puedes volver a intentarlo
          desde la página de inicio de sesión.
        </p>
        <Button asChild variant="outline">
          <Link href="/login?next=%2Fcheckout%2Fconfirmation">
            Iniciar sesión
          </Link>
        </Button>
      </section>
    )
  }

  if (customer) {
    return (
      <Button asChild variant="outline">
        <Link href="/account/orders">Ver mis pedidos</Link>
      </Button>
    )
  }
  const hasGoogleLogin = Boolean(
    googleCallbackUrl(process.env.NEXT_PUBLIC_GOOGLE_CALLBACK_URL),
  )

  return (
    <section
      className="order-first basis-full space-y-4"
      aria-labelledby="order-follow-up-title"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-lg space-y-2">
          <h2 id="order-follow-up-title" className="text-xl font-semibold">
            Sigue tus compras
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Inicia sesión para guardar tus próximas compras y seguirlas desde
            cualquier dispositivo.
          </p>
        </div>
        <div className="w-full shrink-0 sm:w-64">
          {hasGoogleLogin ? (
            <GoogleLogin next="/checkout/confirmation" />
          ) : (
            <Button asChild variant="outline" className="w-full">
              <Link href="/login?next=%2Fcheckout%2Fconfirmation">
                Iniciar sesión
              </Link>
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        También puedes consultar el estado sin iniciar sesión con el enlace
        privado del correo de tu pedido. Si aún no recibiste el correo, puedes
        volver a esta página durante 24 horas desde este mismo navegador.
      </p>
    </section>
  )
}
