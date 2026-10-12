import type { HttpTypes } from "@medusajs/types"

export function getCartItemVariantDescription(
  item: Pick<HttpTypes.StoreCartLineItem, "variant" | "variant_title">,
) {
  const optionValues = item.variant?.options
    ?.map((option) => option.value.trim())
    .filter((value) => value && !/^_*default_*$/i.test(value))
  const variantTitle = item.variant_title?.trim()

  return (
    optionValues?.join(" / ") ||
    (variantTitle && !/^(default variant|_*default_*)$/i.test(variantTitle)
      ? variantTitle
      : null)
  )
}
