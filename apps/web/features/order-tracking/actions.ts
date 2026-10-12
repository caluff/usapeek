"use server"

import { createCustomerSdk } from "@/lib/auth-sdk"
import { retrieveOrderTracking } from "./read"

export async function readOrderTrackingAction(token: string) {
  return retrieveOrderTracking(createCustomerSdk()?.client, token)
}
