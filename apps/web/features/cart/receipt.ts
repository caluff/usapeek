import { FetchError } from "@medusajs/js-sdk"
import type Medusa from "@medusajs/js-sdk"
import type { HttpTypes } from "@medusajs/types"

export async function retrieveReceiptOrders(
  client: Pick<Medusa["store"]["order"], "retrieve">,
  value: string | undefined,
  guestClient?: () => Promise<Pick<Medusa["store"]["order"], "retrieve">>,
): Promise<HttpTypes.StoreOrder[]> {
  const receipt = readReceipt(value)
  if (!receipt) return []
  try {
    return await Promise.all(
      receipt.orderIds.map(async (id) =>
        (
          await client.retrieve(
            id,
            {
              fields:
                "+items.thumbnail,+items.variant.product.thumbnail,+items.variant.product.images.url",
            },
            {
              "x-marketplace-cart-id": receipt.cartId,
            },
          )
        ).order,
      ),
    )
  } catch (error) {
    if (error instanceof FetchError && error.status === 404) {
      if (guestClient) {
        return retrieveReceiptOrders(await guestClient(), value)
      }
      return []
    }
    throw error
  }
}

export function readReceipt(value: string | undefined): {
  cartId: string
  orderIds: string[]
} | null {
  if (!value) return null
  try {
    const receipt: unknown = JSON.parse(value)
    if (
      !receipt || typeof receipt !== "object" ||
      !("cartId" in receipt) || typeof receipt.cartId !== "string" ||
      !/^cart_[a-zA-Z0-9]+$/.test(receipt.cartId) ||
      !("orderIds" in receipt) || !Array.isArray(receipt.orderIds) ||
      receipt.orderIds.length === 0 || receipt.orderIds.length > 30 ||
      !receipt.orderIds.every((id): id is string =>
        typeof id === "string" && /^order_[a-zA-Z0-9]+$/.test(id),
      )
    ) return null
    return { cartId: receipt.cartId, orderIds: receipt.orderIds }
  } catch {
    return null
  }
}

export function getReceiptOrderIds(group: unknown, cartId: string): string[] {
  if (
    !group ||
    typeof group !== "object" ||
    !("cart_id" in group) ||
    group.cart_id !== cartId
  ) {
    throw new Error(
      "No pudimos verificar el comprobante de tu carrito. Consulta el estado nuevamente.",
    )
  }
  if (!("orders" in group) || !Array.isArray(group.orders)) {
    throw new Error(
      "No pudimos cargar el comprobante. Consulta el estado nuevamente.",
    )
  }
  const ids = group.orders.map((order: unknown) =>
    order && typeof order === "object" && "id" in order ? order.id : null,
  )
  if (
    !ids.length ||
    ids.length > 30 ||
    !ids.every(
      (id): id is string =>
        typeof id === "string" && /^order_[a-zA-Z0-9]+$/.test(id),
    )
  ) {
    throw new Error(
      "No pudimos recuperar los pedidos. Consulta el estado nuevamente.",
    )
  }
  return ids
}
