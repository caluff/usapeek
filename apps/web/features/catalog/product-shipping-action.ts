"use server"

import { requestProductShipping } from "./product-shipping-data"

export async function loadProductShipping(offerId: string) {
  try {
    const options = await requestProductShipping(
      offerId,
      AbortSignal.timeout(8_000),
    )
    return { status: "success" as const, options }
  } catch {
    return { status: "error" as const }
  }
}
