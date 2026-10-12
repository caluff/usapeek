import type { HttpTypes } from "@medusajs/types"
import { Suspense } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { getFavoriteProductIds } from "../favorites"
import { FavoriteButton } from "./favorite-button"

type ProductFavoriteActionProps = {
  customer: Promise<HttpTypes.StoreCustomer | null>
  productId: string
}

export function ProductFavoriteAction(props: ProductFavoriteActionProps) {
  return (
    <Suspense
      fallback={<Skeleton className="size-11" aria-label="Cargando favorito" />}
    >
      <ResolvedProductFavoriteAction {...props} />
    </Suspense>
  )
}

async function ResolvedProductFavoriteAction({
  customer,
  productId,
}: ProductFavoriteActionProps) {
  const account = await customer

  return (
    <FavoriteButton
      productId={productId}
      saved={getFavoriteProductIds(account?.metadata).includes(productId)}
      authenticated={Boolean(account)}
      compact
    />
  )
}
