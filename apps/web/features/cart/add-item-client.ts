import type { AddCartItemResult } from "./add-item"

const UNCONFIRMED =
  "No pudimos confirmar el cambio. Consulta el carrito antes de volver a agregar el producto."

export async function submitCartItem(form: FormData): Promise<AddCartItemResult> {
  try {
    // This is the storefront's own cookie-aware handler; it calls Medusa via SDK.
    const response = await fetch("/api/cart/items", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offer_id: form.get("offer_id"),
        quantity: Number(form.get("quantity")),
      }),
      signal: AbortSignal.timeout(35_000),
    })
    const result: unknown = await response.json()
    if (result && typeof result === "object") {
      if ("error" in result && typeof result.error === "string") {
        return { error: result.error }
      }
      if (
        response.ok &&
        "success" in result &&
        typeof result.success === "string" &&
        "cartCount" in result &&
        typeof result.cartCount === "number" &&
        Number.isSafeInteger(result.cartCount) &&
        result.cartCount >= 0 &&
        "confirmedAt" in result &&
        typeof result.confirmedAt === "number" &&
        Number.isSafeInteger(result.confirmedAt) &&
        result.confirmedAt > 0
      ) {
        return {
          success: result.success,
          cartCount: result.cartCount,
          confirmedAt: result.confirmedAt,
        }
      }
    }
    return { error: UNCONFIRMED }
  } catch {
    return { error: UNCONFIRMED }
  }
}
