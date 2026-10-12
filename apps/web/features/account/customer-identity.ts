import type { HttpTypes } from "@medusajs/types"

export function getCustomerIdentity(
  {
    first_name,
    last_name,
    email,
  }: Pick<HttpTypes.StoreCustomer, "first_name" | "last_name" | "email">,
  fallbackName?: string | null,
) {
  const names = [first_name, last_name].flatMap((part) =>
    part?.trim() ? [part.trim()] : [],
  )
  return {
    name: names.join(" ") || fallbackName?.trim() || "Mi cuenta",
    initials: (
      names.map((part) => Array.from(part)[0]).join("") ||
      Array.from(email.trim())[0] ||
      "U"
    ).toLocaleUpperCase("es"),
  }
}
