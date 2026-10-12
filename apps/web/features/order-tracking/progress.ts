import type { StoreOrderTrackingResponse } from "@usapeek/api/order-tracking-contracts"
import { isValid } from "date-fns/isValid"
import { parseISO } from "date-fns/parseISO"

import { getOrderProgress } from "../account/order-progress"

type ProgressOrder = Pick<
  StoreOrderTrackingResponse["order"],
  "status" | "fulfillment_status" | "created_at" | "items" | "fulfillments"
> &
  Partial<Pick<StoreOrderTrackingResponse["order"], "delivery_mode">>

function lastCompletedAt(values: (string | null)[]) {
  let latest: { value: string; timestamp: number } | null = null
  for (const value of values) {
    if (!value) return null
    const date = parseISO(value)
    if (!isValid(date)) return null
    const timestamp = date.getTime()
    if (!latest || timestamp > latest.timestamp) latest = { value, timestamp }
  }
  return latest?.value ?? null
}

export function getTrackingProgress(order: ProgressOrder) {
  const isPickup = order.delivery_mode === "pickup"
  const steps = getOrderProgress(order, isPickup)
  const activePackages = order.fulfillments.filter(
    (fulfillment) => !fulfillment.canceled_at,
  )
  // A milestone is complete for the whole order. Its date belongs to the last
  // active package, and stays unknown if any required timestamp is missing.
  const dates = [
    lastCompletedAt([order.created_at]),
    lastCompletedAt(
      activePackages.map(
        (fulfillment) => fulfillment.packed_at ?? fulfillment.created_at,
      ),
    ),
    ...(!isPickup
      ? [
          lastCompletedAt(
            activePackages.map((fulfillment) => fulfillment.shipped_at),
          ),
        ]
      : []),
    lastCompletedAt(
      activePackages.map((fulfillment) => fulfillment.delivered_at),
    ),
  ]

  return steps.map((step, index) => ({
    ...step,
    completedAt: step.complete ? dates[index] : null,
  }))
}
