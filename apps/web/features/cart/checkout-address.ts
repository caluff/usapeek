import type Medusa from "@medusajs/js-sdk"
import type { HttpTypes } from "@medusajs/types"
import { normalizeUsState } from "@usapeek/ui/us-states"

import { normalizeUsPhone, validateAddress } from "../account/validation"

type CustomerClient = Pick<
  Medusa["store"]["customer"],
  "listAddress" | "createAddress"
>

export async function listCheckoutAddresses(
  client: Pick<CustomerClient, "listAddress">,
) {
  const addresses: HttpTypes.StoreCustomerAddress[] = []
  let count = 0
  do {
    const page = await client.listAddress({
      limit: 100,
      offset: addresses.length,
    })
    addresses.push(...page.addresses)
    count = page.count
    if (!page.addresses.length) break
  } while (addresses.length < count)
  return addresses
}

export function checkoutAddressValues(
  address: HttpTypes.StoreCustomerAddress | HttpTypes.StoreCartAddress,
): Record<string, string> {
  return {
    first_name: address.first_name ?? "",
    last_name: address.last_name ?? "",
    address_1: address.address_1 ?? "",
    address_2: address.address_2 ?? "",
    city: address.city ?? "",
    province: normalizeUsState(address.province ?? ""),
    postal_code: address.postal_code ?? "",
    country_code: address.country_code?.toLowerCase() ?? "",
    phone: normalizeUsPhone(address.phone ?? "") ?? address.phone ?? "",
  }
}

export function matchesCheckoutAddress(
  saved: HttpTypes.StoreCustomerAddress,
  address: Record<string, string>,
) {
  return Object.entries(checkoutAddressValues(saved)).every(
    ([key, value]) => value.trim() === (address[key] ?? "").trim(),
  )
}

export async function saveCheckoutAddress({
  values,
  customerClient,
  updateCart,
}: {
  values: Record<string, string>
  customerClient: CustomerClient | null
  updateCart: (body: HttpTypes.StoreUpdateCart) => Promise<unknown>
}) {
  const selectedId = values.address_id
  if ((selectedId || values.customer_id) && !customerClient) {
    throw new Error("Tu sesión venció. Vuelve a ingresar para continuar.")
  }
  const addresses = customerClient
    ? await listCheckoutAddresses(customerClient)
    : []
  const selected = selectedId
    ? addresses.find((address) => address.id === selectedId)
    : null
  if (selectedId && !selected) {
    throw new Error(
      "Esa dirección ya no está en tu cuenta. Actualiza la página y elige otra.",
    )
  }
  const input = selected ? checkoutAddressValues(selected) : values
  const errors = validateAddress({ ...input, address_name: "Entrega" })
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email ?? "") ||
    values.email.length > 254
  ) {
    errors.email = "Ingresa un email válido."
  }
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0])
  const address = {
    first_name: input.first_name,
    last_name: input.last_name,
    address_1: input.address_1,
    address_2: input.address_2 || "",
    city: input.city,
    province: input.province,
    postal_code: input.postal_code,
    country_code: "us",
    phone: normalizeUsPhone(input.phone)!,
  }
  await updateCart({
    email: values.email,
    shipping_address: address,
    billing_address: address,
  })
  if (
    customerClient &&
    !selected &&
    !addresses.some((saved) => matchesCheckoutAddress(saved, address))
  ) {
    try {
      await customerClient.createAddress({
        ...address,
        address_name: "Entrega",
        ...(addresses.length === 0 ? { is_default_shipping: true } : {}),
      })
    } catch {
      throw new Error(
        "La dirección se guardó en el carrito, pero no pudimos guardarla en tu perfil. Vuelve a intentarlo para continuar.",
      )
    }
  }
}
