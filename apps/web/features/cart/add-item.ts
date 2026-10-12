import { FetchError } from "@medusajs/js-sdk"
import type Medusa from "@medusajs/js-sdk"
import type { HttpTypes } from "@medusajs/types"
import { isUsCart } from "./presentation"

const PREFLIGHT_FIELDS = "id,currency_code,completed_at,region.countries.iso_2"
const COUNT_FIELDS = "id,items.quantity"

export type AddCartItemResult =
  | { success: string; cartCount: number; confirmedAt: number; error?: never }
  | { error: string; success?: never; cartCount?: never; confirmedAt?: never }

type AddCartItemContext = {
  sdk: Medusa
  cartId?: string
  getRegion: () => Promise<Pick<HttpTypes.StoreRegion, "id"> | null>
  persistCartId: (id: string) => void
}

export function isSameOriginCartRequest(request: Request) {
  const origin = request.headers.get("origin")
  if (!origin) return false
  try {
    const url = new URL(origin)
    return (
      ["http:", "https:"].includes(url.protocol) &&
      url.host === request.headers.get("host")
    )
  } catch {
    return false
  }
}

export async function addCartItem(
  input: unknown,
  { sdk, cartId, getRegion, persistCartId }: AddCartItemContext,
): Promise<Extract<AddCartItemResult, { success: string }>> {
  if (
    !input ||
    typeof input !== "object" ||
    !("offer_id" in input) ||
    typeof input.offer_id !== "string" ||
    !/^offer_[a-zA-Z0-9]+$/.test(input.offer_id)
  )
    throw new Error("Selecciona una oferta del producto.")
  if (
    !("quantity" in input) ||
    typeof input.quantity !== "number" ||
    !Number.isInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > 99
  )
    throw new Error("Selecciona una cantidad entre 1 y 99.")

  let cart: HttpTypes.StoreCart | undefined
  if (cartId && /^cart_[a-zA-Z0-9]+$/.test(cartId)) {
    try {
      cart = (
        await sdk.store.cart.retrieve(cartId, { fields: PREFLIGHT_FIELDS })
      ).cart
    } catch (error) {
      if (!(error instanceof FetchError && error.status === 404)) throw error
    }
  }
  if (!cart || cart.completed_at) {
    const region = await getRegion()
    if (!region)
      throw new Error(
        "Las compras para Estados Unidos todavía no están disponibles.",
      )
    cart = (
      await sdk.store.cart.create(
        { region_id: region.id },
        { fields: PREFLIGHT_FIELDS },
      )
    ).cart
    persistCartId(cart.id)
  }
  if (!isUsCart(cart))
    throw new Error("Este carrito no corresponde a Estados Unidos y USD.")

  const { cart: updatedCart } =
    await sdk.client.fetch<HttpTypes.StoreCartResponse>(
      `/store/carts/${cart.id}/line-items`,
      {
        method: "POST",
        body: { offer_id: input.offer_id, quantity: input.quantity },
        query: { fields: COUNT_FIELDS },
      },
    )
  return {
    success: "Producto añadido al carrito.",
    confirmedAt: Date.now(),
    cartCount:
      updatedCart.items?.reduce((count, item) => count + item.quantity, 0) ?? 0,
  }
}
