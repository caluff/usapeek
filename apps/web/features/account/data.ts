import { FetchError } from "@medusajs/js-sdk"
import { redirect } from "next/navigation"
import { cache } from "react"

import { createCustomerSdk, getCustomerSessionToken } from "@/lib/auth-sdk"

// Request-scoped only: account layouts and onboarding share one profile lookup.
export const getCustomerAccount = cache(async () => {
  const token = await getCustomerSessionToken()
  if (!token) return null
  const sdk = createCustomerSdk(token)
  if (!sdk) throw new Error("El servicio de cuenta no está disponible.")
  const { customer } = await sdk.store.customer.retrieve()
  return { customer, sdk }
})

export const getAccount = cache(async () => {
  try {
    const account = await getCustomerAccount()
    if (account) return account
  } catch (error) {
    if (error instanceof FetchError && error.status === 401) {
      redirect("/login?reason=expired&next=%2Faccount")
    }
    throw new Error("No pudimos cargar tu cuenta. Vuelve a intentarlo.")
  }
  redirect("/login?next=%2Faccount")
})

export function getPageNumber(value: string | string[] | undefined): number {
  const page = Number(Array.isArray(value) ? value[0] : value)
  return Number.isSafeInteger(page) && page > 0 ? Math.min(page, 10000) : 1
}

export const ACCOUNT_PAGE_SIZE = 12
