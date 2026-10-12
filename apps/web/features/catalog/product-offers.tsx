import type { HttpTypes } from "@medusajs/types"
import { Suspense, type ReactNode } from "react"
import { ProductPaymentMethods } from "./product-payment-methods"
import { ProductPurchase } from "@/features/catalog/product-purchase"
import {
  getOfferPrice,
  isOfferAvailable,
  type StorefrontOffer,
} from "@/features/catalog/offers"
import { getStorefrontOffers, getStorefrontRegion } from "@/lib/medusa"

export async function ProductOffers({
  product,
  regionPromise,
  summary,
  overview,
}: {
  product: HttpTypes.StoreProduct
  regionPromise: ReturnType<typeof getStorefrontRegion>
  summary: ReactNode
  overview?: ReactNode
}) {
  let offers: StorefrontOffer[]
  let region: HttpTypes.StoreRegion | null
  try {
    region = await regionPromise
    offers = region ? await getStorefrontOffers([product.id], region.id) : []
  } catch {
    return (
      <>
        <section className="min-w-0">
          {summary}
          <div className="mt-5">{overview}</div>
        </section>
        <p
          role="alert"
          className="border border-border bg-muted p-5 font-sans text-sm md:col-span-2 lg:col-span-1 lg:row-span-2"
        >
          No pudimos consultar el precio y la disponibilidad. Actualiza la
          página para reintentar.
        </p>
      </>
    )
  }
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    description: product.description ?? undefined,
    image: product.images?.map((image) => image.url),
    offers: offers.flatMap((offer) => {
      const price = getOfferPrice(offer)
      return price
        ? [
            {
              "@type": "Offer",
              price: price.amount,
              priceCurrency: "USD",
              availability: isOfferAvailable(offer)
                ? "https://schema.org/InStock"
                : "https://schema.org/OutOfStock",
              seller: { "@type": "Organization", name: offer.seller?.name },
              eligibleRegion: { "@type": "Country", name: "US" },
            },
          ]
        : []
    }),
  }
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
      <ProductPurchase
        offers={offers}
        hasRegion={Boolean(region)}
        summary={summary}
        overview={overview}
        paymentMethods={
          region ? (
            <Suspense
              fallback={
                <p className="mt-5 text-xs text-muted-foreground" role="status">
                  Consultando medios de pago…
                </p>
              }
            >
              <ProductPaymentMethods regionId={region.id} />
            </Suspense>
          ) : null
        }
      />
    </>
  )
}
