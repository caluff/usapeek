import type { HttpTypes } from "@medusajs/types"
import type { MetadataRoute } from "next"
import { isValid } from "date-fns/isValid"
import { parseISO } from "date-fns/parseISO"

const SITEMAP_PAGE_SIZE = 100
// Reserve one of the sitemap protocol's 50,000 URLs for the homepage.
const MAX_SITEMAP_PRODUCTS = 49_999

type SitemapProduct = Pick<HttpTypes.StoreProduct, "handle" | "updated_at">
type ListProducts = (
  query: HttpTypes.StoreProductListParams,
) => Promise<HttpTypes.StoreProductListResponse>

export async function collectSitemapProducts(
  listProducts: ListProducts,
): Promise<SitemapProduct[]> {
  const products: SitemapProduct[] = []
  let offset = 0
  let count = 0

  do {
    const response = await listProducts({
      limit: SITEMAP_PAGE_SIZE,
      offset,
      order: "id",
      fields: "id,handle,updated_at",
    })

    if (response.count > MAX_SITEMAP_PRODUCTS) {
      throw new Error(
        "The catalog requires multiple sitemaps before exceeding 50,000 URLs",
      )
    }

    count = response.count
    if (!response.products.length && offset < count) {
      throw new Error("The Store API returned an incomplete sitemap page")
    }

    products.push(...response.products)
    offset += response.products.length
  } while (offset < count)

  return products
}

export function buildSitemapEntries(
  products: SitemapProduct[],
  siteUrl: URL,
): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [{ url: new URL("/", siteUrl).href }]
  const seen = new Set<string>()

  for (const product of products) {
    if (!product.handle?.trim()) continue
    const url = new URL(
      `/products/${encodeURIComponent(product.handle)}`,
      siteUrl,
    ).href
    if (seen.has(url)) continue
    seen.add(url)
    const lastModified =
      product.updated_at && isValid(parseISO(product.updated_at))
        ? product.updated_at
        : undefined
    entries.push({
      url,
      ...(lastModified ? { lastModified } : {}),
    })
  }

  return entries
}
