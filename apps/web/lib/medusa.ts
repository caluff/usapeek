import type { HttpTypes, PaginatedResponse } from "@medusajs/types"
import { cache } from "react"
import { createCatalogSdk } from "@/lib/catalog-sdk"
import type { StorefrontOffer } from "@/features/catalog/offers"
import { getLinkedVariantImages } from "@/features/catalog/variant-images"
import {
  CATALOG_PAGE_SIZE,
  parseCatalogPage,
} from "@/features/catalog/catalog-navigation"

import {
  classifyCatalogError,
  getCatalogContentStatus,
  type CatalogFailureStatus,
  withTimeout,
} from "@/lib/catalog-state"
import { validateStorefrontEnvironment } from "@/lib/storefront-config"
import { collectSitemapProducts } from "@/features/seo/sitemap"

const STORE_API_TIMEOUT_MS = 8_000

const storefrontConfiguration = validateStorefrontEnvironment({
  NEXT_PUBLIC_MEDUSA_BACKEND_URL: process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL,
  NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY,
})

export async function getStorefrontSitemapProducts() {
  if (storefrontConfiguration.status !== "valid") {
    throw new Error("Storefront configuration is required to generate the sitemap")
  }
  const config = storefrontConfiguration.config
  return withTimeout((signal) => {
    const sdk = createCatalogSdk(config, signal)
    return collectSitemapProducts((query) => sdk.store.product.list(query))
  }, STORE_API_TIMEOUT_MS)
}

export type StorefrontCatalogResult =
  | {
      status: "products"
      products: HttpTypes.StoreProduct[]
      count: number
      page: number
      offers: StorefrontOffer[]
      hasRegion: boolean
    }
  | { status: "empty"; products: []; count: 0 }
  | { status: "out_of_range"; products: []; count: number; page: number }
  | {
      status: "configuration_missing"
      missing: Array<"backend_url" | "publishable_key">
    }
  | { status: "invalid_backend_url" }
  | { status: "invalid_publishable_key" }
  | { status: CatalogFailureStatus }

function configurationFailure(): StorefrontCatalogResult | null {
  if (storefrontConfiguration.status === "missing") {
    return {
      status: "configuration_missing",
      missing: storefrontConfiguration.missing,
    }
  }

  if (storefrontConfiguration.status === "invalid_backend_url") {
    return { status: "invalid_backend_url" }
  }

  if (storefrontConfiguration.status === "invalid_publishable_key") {
    return { status: "invalid_publishable_key" }
  }

  return null
}

export async function getStorefrontCatalog(options?: {
  categoryId?: string
  page?: number
}): Promise<StorefrontCatalogResult> {
  const invalidConfiguration = configurationFailure()

  if (invalidConfiguration || storefrontConfiguration.status !== "valid") {
    return invalidConfiguration ?? { status: "store_api_error" }
  }

  const categoryId = options?.categoryId?.trim()
  const page = parseCatalogPage(options?.page)
  const deadline = Date.now() + STORE_API_TIMEOUT_MS

  try {
    const region = await getStorefrontRegion()
    const config = storefrontConfiguration.config
    const result = await withTimeout(
      async (signal) => {
        const sdk = createCatalogSdk(config, signal)
        const query: HttpTypes.StoreProductListParams = {
          limit: CATALOG_PAGE_SIZE,
          offset: (page - 1) * CATALOG_PAGE_SIZE,
          order: "id",
          fields:
            "id,title,subtitle,description,handle,thumbnail,*images,images.variants.id,*categories",
        }

        if (region) {
          query.region_id = region.id
        }

        if (categoryId && categoryId.length <= 128) {
          query.category_id = categoryId
        }

        const productResponse = await sdk.store.product.list(query)

        return {
          products: productResponse.products,
          count: productResponse.count,
        }
      },
      Math.max(1, deadline - Date.now()),
    )

    if (getCatalogContentStatus(result.products) === "empty") {
      if (page > 1)
        return {
          status: "out_of_range",
          products: [],
          count: result.count,
          page,
        }
      return {
        status: "empty",
        products: [],
        count: 0,
      }
    }

    return {
      status: "products",
      products: result.products,
      count: result.count,
      page,
      offers: region
        ? await getStorefrontOffers(
            result.products.map((product) => product.id),
            region.id,
          )
        : [],
      hasRegion: Boolean(region),
    }
  } catch (error: unknown) {
    return { status: classifyCatalogError(error) }
  }
}

// Request-scoped reuse only. Admin and Store are independent deployments;
// persistent caching needs a cross-app invalidation contract before adoption.
export const getStorefrontRegion = cache(
  async (): Promise<HttpTypes.StoreRegion | null> => {
    if (storefrontConfiguration.status !== "valid") return null
    const config = storefrontConfiguration.config
    return withTimeout(async (signal) => {
      const { regions } = await createCatalogSdk(
        config,
        signal,
      ).store.region.list({
        limit: 100,
        fields: "id,name,currency_code,*countries",
      })
      return (
        regions.find(
          (region) =>
            region.currency_code.toLowerCase() === "usd" &&
            region.countries?.some(
              (country) => country.iso_2?.toLowerCase() === "us",
            ),
        ) ?? null
      )
    }, STORE_API_TIMEOUT_MS)
  },
)

export async function getStorefrontOffers(
  productIds: string[],
  regionId: string,
): Promise<StorefrontOffer[]> {
  if (!productIds.length || storefrontConfiguration.status !== "valid")
    return []
  const config = storefrontConfiguration.config
  return withTimeout(async (signal) => {
    const sdk = createCatalogSdk(config, signal)
    const offers: StorefrontOffer[] = []
    let count = 0
    do {
      const response = await sdk.client.fetch<
        PaginatedResponse<{ offers: StorefrontOffer[] }>
      >("/store/offers", {
        query: {
          product_id: productIds,
          region_id: regionId,
          country_code: "us",
          fields:
            "+*calculated_price,+inventory_quantity,+manage_inventory,+allow_backorder",
          limit: 100,
          offset: offers.length,
        },
      })
      offers.push(...response.offers)
      count = response.count
      if (!response.offers.length) break
    } while (offers.length < count)
    return offers
  }, STORE_API_TIMEOUT_MS)
}

export const getStorefrontProduct = cache(async (handle: string) => {
  if (storefrontConfiguration.status !== "valid")
    throw new Error("Storefront unavailable")
  const config = storefrontConfiguration.config
  const product = await withTimeout(async (signal) => {
    const { products } = await createCatalogSdk(
      config,
      signal,
    ).store.product.list({
      handle,
      limit: 1,
      fields:
        "id,title,subtitle,description,handle,thumbnail,material,weight,length,width,height,*images,images.variants.id,*categories,*options,*variants,*variants.options",
    })
    const product = products[0]
    return product
      ? {
          ...product,
          variants:
            product.variants?.map((variant) => ({
              ...variant,
              images: getLinkedVariantImages(product.images, variant.id),
            })) ?? null,
        }
      : null
  }, STORE_API_TIMEOUT_MS)
  return {
    product,
  }
})

export const getStorefrontCategories = cache(
  async (): Promise<HttpTypes.StoreProductCategory[]> => {
    if (storefrontConfiguration.status !== "valid") return []
    const config = storefrontConfiguration.config
    try {
      return await withTimeout(async (signal) => {
        const response = await createCatalogSdk(
          config,
          signal,
        ).store.category.list({
          limit: 7,
          parent_category_id: null,
          fields: "id,name,handle,parent_category_id",
        })
        return response.product_categories
      }, STORE_API_TIMEOUT_MS)
    } catch {
      return []
    }
  },
)
