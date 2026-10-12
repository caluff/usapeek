"use client"

import {
  getProductSpecifications,
  type ProductSpecifications,
} from "./product-specifications"
import { useProductVariantSelection } from "./product-variant-selection"

export function ProductSpecificationsView({
  product,
}: {
  product: ProductSpecifications
}) {
  const { variants, variantId } = useProductVariantSelection()
  const selectedVariant = variants.find((variant) => variant.id === variantId)
  const specifications = getProductSpecifications(
    product,
    variants,
    selectedVariant,
  )

  return (
    <div aria-live="polite" aria-atomic="true">
      {variants.length > 1 ? (
        <p className="mt-3 font-sans text-xs text-muted-foreground">
          {selectedVariant
            ? `Variante: ${selectedVariant.title}`
            : "Ficha general. Selecciona una variante para ver sus especificaciones."}
        </p>
      ) : null}
      {specifications.length ? (
        <dl className="mt-2 grid gap-x-8 font-sans text-sm sm:grid-cols-2">
          {specifications.map(([label, value], index) => (
            <div
              key={`${label}-${index}`}
              className="grid grid-cols-2 items-baseline gap-4 border-b border-border/60 py-3"
            >
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="break-words text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 font-sans text-sm leading-7 text-muted-foreground">
          La tienda todavía no agregó especificaciones técnicas.
        </p>
      )}
    </div>
  )
}
