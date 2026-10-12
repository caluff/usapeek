"use server"

import { FetchError } from "@medusajs/js-sdk"
import type { HttpTypes } from "@medusajs/types"
import { revalidatePath } from "next/cache"

import { createCustomerSdk, getCustomerSessionToken } from "@/lib/auth-sdk"

import type { AccountActionState } from "./types"
import {
  accountFormValues,
  normalizeUsPhone,
  validateAddress,
  validateProfile,
} from "./validation"

async function authenticatedSdk() {
  const token = await getCustomerSessionToken()
  const sdk = token ? createCustomerSdk(token) : null
  if (!sdk) throw new FetchError("Session missing", "Unauthorized", 401)
  return sdk
}

function actionError(
  error: unknown,
  values?: Record<string, string>,
): AccountActionState {
  let message = "No pudimos guardar los cambios. Vuelve a intentarlo."
  if (error instanceof FetchError) {
    if (error.status === 401)
      message = "Tu sesión venció. Vuelve a iniciar sesión."
    if (error.status === 400)
      message =
        "Revisa los datos ingresados. Solo aceptamos direcciones y teléfonos de Estados Unidos."
    if (error.status === 404 || error.status === 403)
      message = "No encontramos ese registro en tu cuenta. Actualiza la página."
    if (error.status === 429)
      message = "Espera un momento antes de volver a intentarlo."
    if (error.status === 409)
      message =
        "Tu cuenta cambió en otra ventana. Actualiza la página e inténtalo de nuevo."
  }
  return { status: "error", message, values }
}

function refreshAccount() {
  revalidatePath("/account", "layout")
  revalidatePath("/", "layout")
}

export async function updateProfileAction(
  _previous: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const values = accountFormValues(formData)
  const fieldErrors = validateProfile(values)
  if (Object.keys(fieldErrors).length) {
    return {
      status: "error",
      message: "Revisa los campos indicados.",
      fieldErrors,
      values,
    }
  }
  try {
    const sdk = await authenticatedSdk()
    await sdk.store.customer.update({
      first_name: values.first_name,
      last_name: values.last_name,
      phone: values.phone ? normalizeUsPhone(values.phone)! : "",
    })
    refreshAccount()
    return {
      status: "success",
      message: "Tu información se guardó correctamente.",
    }
  } catch (error) {
    return actionError(error, values)
  }
}

function addressPayload(
  values: Record<string, string>,
): HttpTypes.StoreCreateCustomerAddress {
  return {
    address_name: values.address_name,
    first_name: values.first_name,
    last_name: values.last_name,
    address_1: values.address_1,
    address_2: values.address_2 ?? "",
    city: values.city,
    province: values.province,
    postal_code: values.postal_code,
    country_code: "us",
    phone: normalizeUsPhone(values.phone)!,
    ...(values.is_default_shipping === "on"
      ? { is_default_shipping: true }
      : {}),
  }
}

async function saveAddress(
  formData: FormData,
  isUpdate: boolean,
): Promise<AccountActionState> {
  const values = accountFormValues(formData)
  const fieldErrors = validateAddress(values)
  if (Object.keys(fieldErrors).length) {
    return {
      status: "error",
      message: "Revisa los campos indicados.",
      fieldErrors,
      values,
    }
  }
  if (isUpdate && !/^cuaddr_[\w-]+$/.test(values.id ?? "")) {
    return { status: "error", message: "La dirección no es válida.", values }
  }
  try {
    const sdk = await authenticatedSdk()
    const payload = addressPayload(values)
    if (isUpdate) {
      await sdk.store.customer.updateAddress(values.id, payload)
    } else {
      const { count } = await sdk.store.customer.listAddress({ limit: 1 })
      await sdk.store.customer.createAddress({
        ...payload,
        ...(count === 0 ? { is_default_shipping: true } : {}),
      })
    }
    refreshAccount()
    return {
      status: "success",
      message: isUpdate ? "Dirección actualizada." : "Dirección añadida.",
    }
  } catch (error) {
    return actionError(error, values)
  }
}

export async function createAddressAction(
  _previous: AccountActionState,
  formData: FormData,
) {
  return saveAddress(formData, false)
}

export async function updateAddressAction(
  _previous: AccountActionState,
  formData: FormData,
) {
  return saveAddress(formData, true)
}

export async function deleteAddressAction(
  _previous: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const id = String(formData.get("id") ?? "")
  if (!/^cuaddr_[\w-]+$/.test(id))
    return { status: "error", message: "La dirección no es válida." }
  try {
    const sdk = await authenticatedSdk()
    await sdk.store.customer.deleteAddress(id)
    refreshAccount()
    return { status: "success", message: "Dirección eliminada." }
  } catch (error) {
    return actionError(error)
  }
}

export async function setDefaultAddressAction(
  _previous: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const id = String(formData.get("id") ?? "")
  if (!/^cuaddr_[\w-]+$/.test(id))
    return { status: "error", message: "La dirección no es válida." }
  try {
    const sdk = await authenticatedSdk()
    await sdk.store.customer.updateAddress(id, { is_default_shipping: true })
    refreshAccount()
    return {
      status: "success",
      message: "Dirección predeterminada actualizada.",
    }
  } catch (error) {
    return actionError(error)
  }
}

export async function setFavoriteAction(
  _previous: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const productId = String(formData.get("product_id") ?? "")
  if (!/^prod_[\w-]+$/.test(productId))
    return { status: "error", message: "El producto no es válido." }
  try {
    const sdk = await authenticatedSdk()
    const saved = formData.get("saved") === "true"
    await sdk.client.fetch<HttpTypes.StoreCustomerResponse>(
      "/store/customers/me/favorites",
      {
        method: "POST",
        body: { product_id: productId, saved },
      },
    )
    refreshAccount()
    return {
      status: "success",
      message: saved
        ? "Producto guardado en favoritos."
        : "Producto quitado de favoritos.",
    }
  } catch (error) {
    return actionError(error)
  }
}
