import { TablePagination } from "@/components/table-pagination";
import type { HttpTypes } from "@mercurjs/types";
import { Suspense } from "react";
import Link from "next/link";
import { ProductThumbnail } from "@/components/ui/product-thumbnail";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  parseProductReviewFilters,
  productImageUrl,
  productReviewHref,
} from "@/features/product-review/helpers";
import { listProductReviewCommerce } from "../data";
import { productUpdatedAt } from "../management";
import { ProductActionsMenu } from "./product-actions-menu";
import { ProductStatusBadge } from "./status-badge";
import {
  ProductReviewCommerceCells,
  ProductReviewCommerceSkeleton,
} from "./commerce-cells";

export function ProductReviewList({
  filters,
  result,
}: {
  filters: ReturnType<typeof parseProductReviewFilters>;
  result: HttpTypes.AdminProductListResponse;
}) {
  const commerce = listProductReviewCommerce(result.products);
  return (
    <div>
      {result.products.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead>Tienda</TableHead>
              <TableHead>Precio</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Cambios</TableHead>
              <TableHead className="w-14 text-right">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.products.map((product) => (
              <TableRow
                key={product.id}
                className="relative cursor-pointer focus-within:bg-muted/45"
              >
                <TableCell>
                  <Link
                    href={`/dashboard/product-review/${encodeURIComponent(product.id)}`}
                    className="flex items-center gap-3 rounded-md outline-none after:absolute after:inset-0 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ProductThumbnail
                      src={
                        productImageUrl(product.thumbnail) ??
                        product.images
                          ?.map((image) => productImageUrl(image.url))
                          .find((url) => url !== null)
                      }
                    />
                    <span className="font-semibold">{product.title}</span>
                  </Link>
                </TableCell>
                <Suspense fallback={<ProductReviewCommerceSkeleton />}>
                  <ProductReviewCommerceCells
                    product={product}
                    commerce={commerce}
                  />
                </Suspense>
                <TableCell>
                  <ProductStatusBadge status={product.status} />
                </TableCell>
                <TableCell>
                  {product.changes?.some(
                    (change) => change.status === "pending",
                  ) ? (
                    <Badge variant="warning">Pendientes</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="relative z-10 w-14 text-right">
                  <ProductActionsMenu
                    productId={product.id}
                    title={product.title}
                    status={product.status}
                    updatedAt={productUpdatedAt(product.updated_at)}
                    hasPendingChange={
                      product.changes?.some(
                        (change) => change.status === "pending",
                      ) ?? false
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
          No hay productos con estos filtros.
        </p>
      )}
      <TablePagination
        label="Páginas del catálogo"
        count={result.count}
        offset={result.offset}
        limit={result.limit}
        itemCount={result.products.length}
        hrefForOffset={(offset) => productReviewHref(filters, offset)}
      />
    </div>
  );
}
