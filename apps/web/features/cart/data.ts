import { FetchError } from "@medusajs/js-sdk"
import type { HttpTypes } from "@medusajs/types"
import { cookies } from "next/headers"
import { cache } from "react"
import { createCustomerSdk, getCustomerSessionToken } from "@/lib/auth-sdk"
import { readReceipt, retrieveReceiptOrders } from "./receipt"
import { CART_COOKIE, RECEIPT_COOKIE } from "./session"
import type { CheckoutShippingOptions } from "./shipping"

export { CART_COOKIE, RECEIPT_COOKIE } from "./session"
export const CART_FIELDS =
  "*items,*items.variant,*items.variant.options,*items.variant.product,*items.variant.product.images,*items.offer,*items.offer.seller,*region,*region.countries,*shipping_address,*billing_address,*shipping_methods,*payment_collection,*payment_collection.payment_sessions"

export async function cartSdk({
  anonymous = false,
}: { anonymous?: boolean } = {}) {
  const sdk = createCustomerSdk(
    anonymous ? undefined : await getCustomerSessionToken(),
  )
  if (!sdk) throw new Error("La tienda no está disponible en este momento.")
  const transport = sdk.client.fetch_
  sdk.client.fetch_ = async (input, init) => {
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase()
    const deadline = AbortSignal.timeout(method === "GET" ? 30_000 : 90_000)
    const signal = init?.signal
      ? AbortSignal.any([init.signal, deadline])
      : deadline
    // Native handlers can outlast the cart identity lock's acquisition wait.
    // Retry only reads rejected by that lock, within one shared deadline.
    for (let attempt = 0; ; attempt += 1) {
      signal.throwIfAborted()
      try {
        return await transport(input, { ...init, cache: "no-store", signal })
      } catch (error) {
        if (
          method !== "GET" ||
          attempt >= 2 ||
          signal.aborted ||
          !(error instanceof FetchError) ||
          error.status !== 409 ||
          !/^Failed to acquire lock for key "store-cart-owner:cart_[A-Za-z0-9]+"$/.test(
            error.message,
          )
        ) {
          throw error
        }
      }
    }
  }
  return sdk
}

export const getCheckoutCart = cache(
  async (): Promise<HttpTypes.StoreCart | null> => {
    const id = (await cookies()).get(CART_COOKIE)?.value
    if (!id || !/^cart_[a-zA-Z0-9]+$/.test(id)) return null
    try {
      const { cart } = await (
        await cartSdk()
      ).store.cart.retrieve(
        id,
        { fields: CART_FIELDS },
        { "cache-control": "no-cache" },
      )
      return cart
    } catch (error) {
      if (error instanceof FetchError && error.status === 404) return null
      throw error
    }
  },
)

export const getCart = cache(async (): Promise<HttpTypes.StoreCart | null> => {
  const cart = await getCheckoutCart()
  return cart?.completed_at ? null : cart
})

export async function getShippingOptions(cartId: string) {
  const { shipping_options } = await (
    await cartSdk()
  ).client.fetch<{ shipping_options: CheckoutShippingOptions }>(
    "/store/shipping-options",
    { query: { cart_id: cartId } },
  )
  return shipping_options
}

export async function getPaymentProviders(regionId: string) {
  const { payment_providers } = await (
    await cartSdk()
  ).store.payment.listPaymentProviders({ region_id: regionId })
  return payment_providers
}

export async function getReceiptOrders(): Promise<HttpTypes.StoreOrder[]> {
  const value = (await cookies()).get(RECEIPT_COOKIE)?.value
  if (!readReceipt(value)) return []
  const sdk = await cartSdk()
  const hasSession = Boolean(await getCustomerSessionToken())
  return retrieveReceiptOrders(
    sdk.store.order,
    value,
    hasSession
      ? async () => (await cartSdk({ anonymous: true })).store.order
      : undefined,
  )
}
