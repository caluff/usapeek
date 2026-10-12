import type { MetadataRoute } from "next"
import { buildSitemapEntries } from "@/features/seo/sitemap"
import { getStorefrontSitemapProducts } from "@/lib/medusa"
import { getSiteUrl } from "@/lib/site-url"

// Read the current public catalog without requiring the backend during builds.
export const dynamic = "force-dynamic"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getStorefrontSitemapProducts()
  return buildSitemapEntries(products, getSiteUrl())
}
