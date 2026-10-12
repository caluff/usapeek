import type { Metadata } from "next"
import { CatalogSection } from "@/components/catalog-section"
import { Hero } from "@/components/hero"
import { SiteFooter } from "@/components/site-footer"
import { parseCatalogPage } from "@/features/catalog/catalog-navigation"
import { getCurrentCustomer } from "@/lib/auth-sdk"
import { getStorefrontCatalog } from "@/lib/medusa"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: { absolute: "USAPEEK | Descubre productos de distintas tiendas" },
  description:
    "Explora el catálogo de USAPEEK, descubre productos de distintas tiendas y guarda tus favoritos para volver a encontrarlos cuando quieras.",
}

type HomeProps = {
  searchParams: Promise<{
    category_id?: string | string[]
    page?: string | string[]
  }>
}

export default function Home({ searchParams }: HomeProps) {
  const activeCategoryId = searchParams.then((parameters) =>
    Array.isArray(parameters.category_id)
      ? parameters.category_id[0]
      : parameters.category_id,
  )
  const page = searchParams.then((parameters) => parseCatalogPage(parameters.page))
  const catalog = Promise.all([activeCategoryId, page]).then(([categoryId, page]) =>
    getStorefrontCatalog({ categoryId, page }),
  )
  const customer = getCurrentCustomer()

  return (
    <>
      <main>
        <Hero />
        <CatalogSection
          result={catalog}
          activeCategoryId={activeCategoryId}
          page={page}
          customer={customer}
        />
      </main>
      <SiteFooter />
    </>
  )
}
