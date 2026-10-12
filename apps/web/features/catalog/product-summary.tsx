import type { HttpTypes } from "@medusajs/types"
import Link from "next/link"
import { catalogHref } from "./catalog-navigation"

export function ProductSummary({
  product,
}: {
  product: HttpTypes.StoreProduct
}) {
  const category = product.categories?.[0]
  return (
    <header>
      {category ? (
        <Link
          href={catalogHref({ categoryId: category.id })}
          className="inline-flex min-h-8 items-center border border-border bg-muted/40 px-2.5 font-sans text-xs font-semibold text-muted-foreground hover:text-brand-accent-text"
        >
          {category.name}
        </Link>
      ) : null}
      <h1 className="mt-3 break-words font-sans text-2xl font-bold leading-tight tracking-tight xl:text-3xl">
        {product.title}
      </h1>
      {product.subtitle ? (
        <p className="mt-3 font-sans text-sm leading-6 text-muted-foreground">
          {product.subtitle}
        </p>
      ) : null}
    </header>
  )
}
