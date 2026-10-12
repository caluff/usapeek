import type { ProductDTO } from "@mercurjs/types";
import Link from "next/link";
import { TableCell } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { reviewCommerceSummary, type ReviewCommerce } from "../commerce";

export function ProductReviewCommerceSkeleton() {
  return (
    <>
      <TableCell>
        <Skeleton className="h-5 w-32" aria-label="Cargando tienda" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-5 w-24" aria-label="Cargando precio" />
      </TableCell>
    </>
  );
}

export async function ProductReviewCommerceCells({
  product,
  commerce,
}: {
  product: Pick<ProductDTO, "changes" | "variants">;
  commerce: Promise<ReviewCommerce>;
}) {
  const { store, stores, prices } = reviewCommerceSummary(
    product,
    await commerce,
  );
  return (
    <>
      <TableCell className="relative z-10">
        {stores.length ? (
          <div className="flex flex-col items-start">
            {stores.map((seller) => (
              <Link
                key={seller.id}
                href={`/dashboard/stores/${encodeURIComponent(seller.id)}`}
                className="inline-flex min-h-11 items-center rounded-md font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Ver tienda ${seller.name}`}
              >
                {seller.name}
              </Link>
            ))}
          </div>
        ) : (
          store
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">
        {prices === null
          ? "No disponible"
          : prices.length
            ? prices.map((price) => (
                <span key={price} className="block">
                  {price}
                </span>
              ))
            : "Sin precio"}
      </TableCell>
    </>
  );
}
