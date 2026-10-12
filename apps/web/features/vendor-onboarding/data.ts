import type {
  ApplicationNotificationsResponse,
  ApplicationOptionsResponse,
  ApplicationResponse,
} from "@usapeek/vendor-onboarding-contracts"
import { FetchError } from "@medusajs/js-sdk"
import type { HttpTypes } from "@medusajs/types"
import { redirect } from "next/navigation"
import { cache } from "react"

import { getCustomerAccount } from "@/features/account/data"
import { createCustomerSdk, getCustomerSessionToken } from "@/lib/auth-sdk"
import { APPLICATION_LOGIN_PATH, applicationNavigation } from "./presentation"

export async function requireApplicant() {
  try {
    const account = await getCustomerAccount()
    if (account) return account
  } catch (error) {
    if (error instanceof FetchError && error.status === 401)
      redirect(APPLICATION_LOGIN_PATH)
    throw error
  }
  redirect(APPLICATION_LOGIN_PATH)
}

const getApplicant = cache(requireApplicant)

const getSessionApplication = cache(async () => {
  const token = await getCustomerSessionToken()
  if (!token) return null
  const sdk = createCustomerSdk(token)
  if (!sdk) throw new Error("El servicio de solicitudes no está disponible.")
  return sdk.client.fetch<ApplicationResponse>("/store/vendor-application", {
    cache: "no-store",
  })
})

export const getApplication = cache(async () => {
  const [, response] = await Promise.all([
    getApplicant(),
    getSessionApplication(),
  ])
  if (!response) redirect(APPLICATION_LOGIN_PATH)
  return response
})

export async function getApplicationNavigation() {
  try {
    return applicationNavigation(await getSessionApplication())
  } catch {
    return { label: "Consultar solicitud", unreadCount: 0 }
  }
}

export async function getApplicationFormData() {
  const { customer, sdk } = await getApplicant()
  const optionsPromise = sdk.client.fetch<ApplicationOptionsResponse>(
    "/store/vendor-application/options",
    { cache: "no-store" },
  )
  const categoriesPromise = (async () => {
    const categories: HttpTypes.StoreProductCategory[] = []
    let count = 1
    while (categories.length < count) {
      const page = await sdk.store.category.list(
        { limit: 100, offset: categories.length },
        { "Cache-Control": "no-cache" },
      )
      categories.push(...page.product_categories)
      count = page.count
      if (!page.product_categories.length) break
    }
    return categories
  })()
  const addressesPromise = (async () => {
    const addresses: HttpTypes.StoreCustomerAddress[] = []
    let count = 1
    while (addresses.length < count) {
      const page = await sdk.store.customer.listAddress({
        limit: 100,
        offset: addresses.length,
      })
      addresses.push(...page.addresses)
      count = page.count
      if (!page.addresses.length) break
    }
    return addresses
  })()
  // The first two steps do not consume these lists. Stream their settled
  // result separately so a slow address/category page cannot block typing.
  const resources = Promise.all([categoriesPromise, addressesPromise]).then(
    ([categories, addresses]) => ({
      status: "ready" as const,
      categories,
      addresses,
    }),
    () => ({ status: "error" as const }),
  )
  const options = await optionsPromise
  return {
    customer: {
      first_name: customer.first_name,
      last_name: customer.last_name,
      phone: customer.phone,
    },
    options,
    resources,
  }
}

export async function getApplicationNotifications(offset = 0) {
  const { sdk } = await getApplicant()
  return sdk.client.fetch<ApplicationNotificationsResponse>(
    "/store/vendor-application/notifications",
    {
      cache: "no-store",
      query: { limit: 20, offset },
    },
  )
}
