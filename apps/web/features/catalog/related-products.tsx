import type { HttpTypes } from "@medusajs/types"
import { ArrowRight, ImageIcon } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { getStorefrontCatalog } from "@/lib/medusa"
import { catalogHref } from "./catalog-navigation"
import { getProductImage } from "./image"
import { formatPrice, getLowestOfferPrice, groupOffersByProduct } from "./offers"

export async function RelatedProducts({
  product,
}: {
  product: HttpTypes.StoreProduct
}) {
  const category = product.categories?.[0]
  const result = await getStorefrontCatalog({ categoryId: category?.id })
  const products =
    result.status === "products"
      ? result.products.filter((item) => item.id !== product.id).slice(0, 4)
      : []
  const href = catalogHref({ categoryId: category?.id })
  const offersByProduct = groupOffersByProduct(
    result.status === "products" ? result.offers : [],
  )
  return (
    <section
      className="mt-8 border-t border-border pt-6"
      aria-labelledby="related-products-title"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2
          id="related-products-title"
          className="font-sans text-base font-bold"
        >
          También te puede interesar
        </h2>
        <Link
          href={href}
          className="inline-flex min-h-11 items-center gap-2 font-sans text-xs font-semibold text-brand-accent-text"
        >
          Ver catálogo <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
      {products.length && result.status === "products" ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {products.map((item) => {
            const image = getProductImage(
              item.thumbnail ?? item.images?.[0]?.url,
            )
            const price = getLowestOfferPrice(
              offersByProduct.get(item.id) ?? [],
            )
            return (
              <Link
                key={item.id}
                href={`/products/${encodeURIComponent(item.handle ?? item.id)}`}
                className="group flex min-w-0 gap-3 border border-border bg-card p-3 transition-colors hover:border-brand-accent"
              >
                <div className="relative size-20 shrink-0 overflow-hidden bg-muted">
                  {image ? (
                    <Image
                      src={image.source}
                      alt={item.title}
                      fill
                      sizes="80px"
                      loading="lazy"
                      unoptimized={image.unoptimized}
                      className="object-contain"
                    />
                  ) : (
                    <ImageIcon
                      className="m-6 size-8 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <div className="min-w-0 self-center font-sans">
                  <h3 className="line-clamp-2 text-sm font-semibold group-hover:text-brand-accent-text">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm font-bold">
                    {price ? formatPrice(price.amount) : "Precio no disponible"}
                  </p>
                </div>
              </Link>
            )
          })}
        </div>
      ) : (
        <p className="border border-dashed border-border bg-muted/20 p-5 font-sans text-sm text-muted-foreground">
          {result.status === "products" || result.status === "empty"
            ? "Todavía no hay otros productos para mostrar aquí."
            : "No pudimos cargar otros productos en este momento."}
        </p>
      )}
    </section>
  )
}
