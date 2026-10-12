"use client"

import type { HttpTypes } from "@medusajs/types"
import { createContext, useContext, useState, type ReactNode } from "react"

type VariantSelection = {
  variants: HttpTypes.StoreProductVariant[]
  variantId: string
  selectVariant: (id: string) => void
}

const ProductVariantContext = createContext<VariantSelection | null>(null)

export function ProductVariantSelection({
  variants,
  children,
}: {
  variants: HttpTypes.StoreProductVariant[]
  children: ReactNode
}) {
  const [variantId, selectVariant] = useState(variants[0]?.id ?? "")

  return (
    <ProductVariantContext.Provider
      value={{ variants, variantId, selectVariant }}
    >
      {children}
    </ProductVariantContext.Provider>
  )
}

export function useProductVariantSelection() {
  const selection = useContext(ProductVariantContext)
  if (!selection) {
    throw new Error("Product variant selection requires its product provider.")
  }
  return selection
}
