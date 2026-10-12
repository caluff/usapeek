import { FetchError } from "@medusajs/js-sdk"

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
}

export function failure(error: unknown): { error: string } {
  if (
    error instanceof Error &&
    ["TimeoutError", "AbortError"].includes(error.name)
  )
    return {
      error:
        "La operación está demorando. Consulta el carrito o el estado del pedido antes de repetirla.",
    }
  if (error instanceof FetchError) {
    if (/cart_customer_transfer_required/i.test(error.message))
      return {
        error: "Vuelve a iniciar sesión para asociar tu carrito antes de pagar. Tus productos se conservan.",
      }
    if (error.status === 401)
      return { error: "Tu sesión venció. Vuelve a ingresar para continuar." }
    if (/stock|inventory/i.test(error.message))
      return {
        error: "No hay stock suficiente. Revisa las cantidades del carrito.",
      }
    if (/shipping|delivery/i.test(error.message))
      return {
        error: "Revisa el envío: debe cubrir todos los productos del carrito.",
      }
    if (
      /payout|sale.readiness|stripe.connect|Stripe setup|seller.*ready|payment.*configured/i.test(
        error.message,
      )
    )
      return {
        error:
          "Un vendedor todavía no está habilitado para cobrar. El carrito se conserva para que puedas intentarlo más tarde.",
      }
    if (/paused|not.*sale|unavailable/i.test(error.message))
      return {
        error:
          "Un producto ya no está disponible para la venta. Revisa el carrito.",
      }
    if (/payment|authorize/i.test(error.message))
      return {
        error:
          "El pago todavía no está confirmado. Comprueba su estado antes de volver a pagar.",
      }
    return {
      error:
        "No pudimos completar la operación. Revisa el carrito y vuelve a intentarlo.",
    }
  }
  return {
    error:
      error instanceof Error
        ? error.message
        : "No pudimos completar la operación.",
  }
}
