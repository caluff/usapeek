import { FetchError } from "@medusajs/js-sdk"
import type Medusa from "@medusajs/js-sdk"
import type { HttpTypes } from "@medusajs/types"

export const CART_COOKIE = "marketplace_cart"
export const RECEIPT_COOKIE = "marketplace_receipt"

type CartCookieStore = {
  get(name: string): { value: string } | undefined
  delete(name: string): unknown
}

export function clearCartSession(store: CartCookieStore) {
  store.delete(CART_COOKIE)
  store.delete(RECEIPT_COOKIE)
}

export async function ensureCustomerCart(
  cartClient: Pick<Medusa["store"]["cart"], "transferCart">,
  cart: HttpTypes.StoreCart,
  customerId: string,
  fields = "id,customer_id",
) {
  if (cart.customer_id === customerId) return cart

  // Native ownership guards reject carts belonging to another registered buyer.
  const { cart: transferred } = await cartClient.transferCart(cart.id, { fields })
  if (transferred.id !== cart.id || transferred.customer_id !== customerId)
    throw new Error("No pudimos asociar tu carrito. Vuelve a intentarlo.")
  return transferred
}

// All completed login paths use this before publishing the new session cookie.
// Transient failures preserve the guest cart so signing in can be retried.
export async function adoptCustomerCart(
  store: CartCookieStore,
  cartClient: Pick<Medusa["store"]["cart"], "retrieve" | "transferCart">,
  customerId: string,
  { preserveReceipt = false }: { preserveReceipt?: boolean } = {},
) {
  const cartId = store.get(CART_COOKIE)?.value
  if (cartId && /^cart_[a-zA-Z0-9]+$/.test(cartId)) {
    try {
      const { cart } = await cartClient.retrieve(cartId, {
        fields: "id,customer_id,completed_at",
      })
      if (cart.completed_at) {
        store.delete(CART_COOKIE)
      } else {
        await ensureCustomerCart(cartClient, cart, customerId)
      }
    } catch (error) {
      if (!(error instanceof FetchError && error.status === 404)) throw error
      store.delete(CART_COOKIE)
    }
  } else if (cartId) {
    store.delete(CART_COOKIE)
  }
  if (!preserveReceipt) store.delete(RECEIPT_COOKIE)
}
