import type { HttpTypes } from "@medusajs/types"
import { ProductSpecificationsView } from "./product-specifications-view"

export function ProductDetails({
  product,
}: {
  product: HttpTypes.StoreProduct
}) {
  return (
    <section
      id="product-details"
      aria-labelledby="product-specifications-title"
      className="scroll-mt-24 border-t border-border pt-5 font-sans"
    >
      <h2 id="product-specifications-title" className="text-base font-semibold">
        Ficha técnica
      </h2>
      <ProductSpecificationsView
        product={{
          material: product.material,
          weight: product.weight,
          length: product.length,
          width: product.width,
          height: product.height,
          options: product.options,
        }}
      />
    </section>
  )
}
