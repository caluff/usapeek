"use server"

import { cookies } from "next/headers"

import { createCustomerSdk, getCustomerSessionToken } from "@/lib/auth-sdk"
import {
  associateTrackingOrder,
  TRACKING_ACCOUNT_COOKIE,
  TRACKING_ACCOUNT_PATH,
  type TrackingAccountLinkResult,
} from "./account-link"

export async function claimPendingTrackingOrderAction(): Promise<TrackingAccountLinkResult> {
  const sessionToken = await getCustomerSessionToken()
  if (!sessionToken) return { status: "sign_in_required" }

  const store = await cookies()
  const result = await associateTrackingOrder(
    createCustomerSdk(sessionToken)?.client,
    store.get(TRACKING_ACCOUNT_COOKIE)?.value,
  )
  if (result.status === "associated" || result.status === "invalid") {
    store.set(TRACKING_ACCOUNT_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: TRACKING_ACCOUNT_PATH,
      maxAge: 0,
    })
  }
  return result
}
