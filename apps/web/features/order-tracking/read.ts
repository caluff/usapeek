import { FetchError } from "@medusajs/js-sdk"
import type Medusa from "@medusajs/js-sdk"
import type { StoreOrderTrackingResponse } from "@usapeek/api/order-tracking-contracts"
import { isOrderTrackingToken } from "./fragment"

type TrackingResult =
  | { status: "available"; order: StoreOrderTrackingResponse["order"] }
  | { status: "invalid" }
  | { status: "unavailable" }

export async function retrieveOrderTracking(
  client: Pick<Medusa["client"], "fetch"> | undefined,
  token: unknown,
): Promise<TrackingResult> {
  if (!isOrderTrackingToken(token)) {
    return { status: "invalid" }
  }
  if (!client) return { status: "unavailable" }

  try {
    const { order } = await client.fetch<StoreOrderTrackingResponse>(
      "/store/order-tracking",
      {
        method: "POST",
        body: { token },
        cache: "no-store",
        credentials: "omit",
      },
    )
    return { status: "available", order }
  } catch (error) {
    if (
      error instanceof FetchError &&
      [400, 404, 410].includes(error.status ?? 0)
    ) {
      return { status: "invalid" }
    }
    return { status: "unavailable" }
  }
}
