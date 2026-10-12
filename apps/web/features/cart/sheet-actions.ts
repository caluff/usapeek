"use server"

import { FetchError } from "@medusajs/js-sdk"
import type { HttpTypes } from "@medusajs/types"
import { cookies } from "next/headers"
import { CART_COOKIE, cartSdk } from "./data"
import { failure } from "./server-state"

const SHEET_FIELDS =
  "id,currency_code,completed_at,total,*items,*items.variant,*items.variant.options,*items.variant.product,*items.variant.product.images"

type CartSheetResult =
  | { cart: HttpTypes.StoreCart | null; snapshotAt: number; error?: never }
  | { error: string; cart?: never; snapshotAt?: never }

export async function getCartSheetAction(): Promise<CartSheetResult> {
  const snapshotAt = Date.now()
  const id = (await cookies()).get(CART_COOKIE)?.value
  if (!id || !/^cart_[a-zA-Z0-9]+$/.test(id)) return { cart: null, snapshotAt }
  try {
    const { cart } = await (
      await cartSdk()
    ).store.cart.retrieve(id, {
      fields: SHEET_FIELDS,
    })
    return { cart: cart.completed_at ? null : cart, snapshotAt }
  } catch (error) {
    if (error instanceof FetchError && error.status === 404)
      return { cart: null, snapshotAt }
    return failure(error)
  }
}
