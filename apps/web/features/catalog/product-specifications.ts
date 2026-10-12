import type { HttpTypes } from "@medusajs/types"

export type ProductSpecifications = Pick<
  HttpTypes.StoreProduct,
  "material" | "weight" | "length" | "width" | "height" | "options"
>

export function getProductSpecifications(
  product: ProductSpecifications,
  variants: HttpTypes.StoreProductVariant[],
  selectedVariant?: HttpTypes.StoreProductVariant,
): [string, string][] {
  const material = selectedVariant?.material ?? product.material
  const rows: [string, string][] = material ? [["Material", material]] : []
  const measurements = {
    weight: "Peso",
    length: "Largo",
    width: "Ancho",
    height: "Alto",
  }
  for (const field of ["weight", "length", "width", "height"] as const) {
    const value = selectedVariant?.[field] ?? product[field]
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      rows.push([
        measurements[field],
        `${value} ${field === "weight" ? "g" : "mm"}`,
      ])
    }
  }
  for (const option of product.options ?? []) {
    const title = option.title.trim().toLowerCase()
    if (
      ["default option", "__default__"].includes(title) ||
      rows.some(([label]) => label.toLowerCase() === title)
    ) {
      continue
    }
    const values = [
      ...new Set(
        (selectedVariant ? [selectedVariant] : variants).flatMap((variant) =>
          (variant.options ?? [])
            .filter(
              (value) =>
                value.option_id === option.id && value.value !== "__default__",
            )
            .map((value) => value.value),
        ),
      ),
    ]
    if (values.length) rows.push([option.title, values.join(", ")])
  }
  return rows
}
