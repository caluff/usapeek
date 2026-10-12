import { FetchError } from "@medusajs/js-sdk"
import type Medusa from "@medusajs/js-sdk"
import type { StoreOrderTrackingClaimResponse } from "@usapeek/api/order-tracking-contracts"
import { isOrderTrackingToken } from "./fragment"

export const TRACKING_ACCOUNT_PATH = "/account/orders/claim"
export const TRACKING_ACCOUNT_COOKIE = "mv2_web_order_tracking_claim"
export const TRACKING_ACCOUNT_MAX_AGE = 10 * 60

export type TrackingAccountLinkResult =
  | { status: "associated"; orderId: string }
  | { status: "invalid" | "cannot_link" | "unavailable" | "sign_in_required" }

export async function associateTrackingOrder(
  client: Pick<Medusa["client"], "fetch"> | undefined,
  token: unknown,
): Promise<TrackingAccountLinkResult> {
  if (!isOrderTrackingToken(token)) return { status: "invalid" }
  if (!client) return { status: "unavailable" }

  try {
    const response = await client.fetch<StoreOrderTrackingClaimResponse>(
      "/store/order-tracking/claim",
      {
        method: "POST",
        body: { token },
        cache: "no-store",
        credentials: "omit",
      },
    )
    if (
      response.status !== "associated" ||
      !/^order_[a-zA-Z0-9]+$/.test(response.order_id)
    ) {
      return { status: "unavailable" }
    }
    return { status: "associated", orderId: response.order_id }
  } catch (error) {
    if (error instanceof FetchError) {
      if ([404, 410].includes(error.status ?? 0)) return { status: "invalid" }
      if ([400, 401, 403, 409].includes(error.status ?? 0)) {
        return { status: "cannot_link" }
      }
    }
    return { status: "unavailable" }
  }
}
