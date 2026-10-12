import { parsePhoneNumberFromString } from "libphonenumber-js/max"

import { US_STATES } from "./us-states"

export function normalizeUsPhone(value: string): string | null {
  const phone = parsePhoneNumberFromString(value, {
    defaultCountry: "US",
    extract: false,
  })
  return phone?.country === "US" && phone.isValid() && !phone.ext
    ? phone.number
    : null
}

export function accountFormValues(formData: FormData): Record<string, string> {
  return Object.fromEntries(
    [...formData.entries()]
      .filter(
        ([key, value]) => !key.startsWith("$") && typeof value === "string",
      )
      .map(([key, value]) => [key, String(value).trim()]),
  )
}

export function validateProfile(values: Record<string, string>) {
  const errors: Record<string, string> = {}
  for (const field of ["first_name", "last_name"]) {
    if (!values[field] || values[field].length > 100) {
      errors[field] = "Ingresa entre 1 y 100 caracteres."
    }
  }
  if (values.phone && !normalizeUsPhone(values.phone)) {
    errors.phone = "Ingresa un teléfono válido de Estados Unidos (+1)."
  }
  return errors
}

export function validateAddress(values: Record<string, string>) {
  const errors = validateProfile(values)
  for (const field of ["address_name", "address_1", "city"]) {
    if (!values[field] || values[field].length > 200) {
      errors[field] = "Completa este campo (máximo 200 caracteres)."
    }
  }
  if ((values.address_2?.length ?? 0) > 200) {
    errors.address_2 = "Usa como máximo 200 caracteres."
  }
  if (values.country_code !== "us") {
    errors.country_code =
      "Por ahora solo aceptamos direcciones de Estados Unidos."
  }
  if (!US_STATES.some((state) => state.value === values.province)) {
    errors.province = "Selecciona un estado."
  }
  if (!/^\d{5}(-\d{4})?$/.test(values.postal_code ?? "")) {
    errors.postal_code = "Ingresa un ZIP de 5 dígitos o ZIP+4."
  }
  if (!values.phone || !normalizeUsPhone(values.phone)) {
    errors.phone = "Ingresa un teléfono válido de Estados Unidos (+1)."
  }
  return errors
}
