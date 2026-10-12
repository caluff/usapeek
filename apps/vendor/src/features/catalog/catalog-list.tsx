import type { HttpTypes } from "@mercurjs/types";
import { Suspense } from "react";
import Link from "next/link";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DataEmpty,
  DataError,
  StatusBadge,
} from "@/features/workspace/components";
import { workspace, resultOf } from "@/features/workspace/data";
import { formatDate } from "@/features/workspace/presentation";
import { CatalogThumbnail } from "./catalog-thumbnail";
import {
  catalogCommerce,
  CatalogPriceCell,
  CatalogStockCell,
  CatalogSaleActions,
} from "./catalog-commerce";
import { ProductRowActions } from "./product-row-actions";
import { catalogListHref, type catalogListInput } from "./parameters";
import { CatalogAutoRefresh } from "./auto-refresh";

const CATALOG_COLUMNS = [
  "Producto",
  "Estado",
  "Precio (USD)",
  "Existencias de tu tienda",
  "Presentaciones",
  "Creado",
  "Acciones",
];

export function CatalogListSkeleton() {
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        Cargando productos
      </p>
      <Table aria-hidden="true">
        <TableHeader>
          <TableRow>
            {CATALOG_COLUMNS.map((label) => (
              <TableHead
                key={label}
                className={label === "Acciones" ? "relative" : undefined}
              >
                <span className={label === "Acciones" ? "sr-only" : undefined}>
                  {label}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 10 }, (_, index) => (
            <TableRow key={index}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Skeleton data-slot="thumbnail" className="size-12 shrink-0" />
                  <Skeleton className="h-4 w-40" />
                </div>
              </TableCell>
              {CATALOG_COLUMNS.slice(1).map((label) => (
                <TableCell key={label}>
                  <Skeleton className="h-4 w-16" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Skeleton className="mt-5 h-8 w-40" />
    </div>
  );
}

export async function CatalogResults({
  input,
}: {
  input: ReturnType<typeof catalogListInput>;
}) {
  const { client, membership } = await workspace();
  const result = await resultOf(
    client.get<HttpTypes.VendorProductListResponse>("/vendor/products", {
      q: input.q || undefined,
      status: input.status === "all" ? undefined : [input.status],
      offset: input.offset,
      limit: input.limit,
      order: "-created_at",
      fields:
        "id,title,handle,thumbnail,images.url,status,created_at,variants.id,changes.status,changes.created_by",
    }),
  );
  const commerce = result.data?.products.length
    ? catalogCommerce(
        client,
        result.data.products.flatMap(
          (product) => product.variants?.map((variant) => variant.id) ?? [],
        ),
      )
    : null;
  return (
    <>
      <CatalogAutoRefresh sellerId={membership.seller.id} />
      {result.data ? (
        <div>
          {result.data.products.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  {CATALOG_COLUMNS.map((label) => (
                    <TableHead
                      key={label}
                      className={label === "Acciones" ? "relative" : undefined}
                    >
                      <span
                        className={label === "Acciones" ? "sr-only" : undefined}
                      >
                        {label}
                      </span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.data.products.map((product) => (
                  <TableRow
                    key={product.id}
                    className="relative cursor-pointer focus-within:bg-muted/45"
                  >
                    <TableCell>
                      <Link
                        href={`/seller/catalog/${product.id}`}
                        className="flex items-center gap-3 font-semibold outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
                      >
                        <CatalogThumbnail
                          key={product.thumbnail || product.images?.[0]?.url}
                          src={product.thumbnail || product.images?.[0]?.url}
                        />
                        {product.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={product.status} />
                      {product.changes?.some(
                        (change) =>
                          change.status === "pending" &&
                          change.created_by === membership.seller.id,
                      ) ? (
                        <Badge variant="warning" className="mt-1 block">
                          Cambio pendiente
                        </Badge>
                      ) : null}
                    </TableCell>
                    {commerce ? (
                      <Suspense
                        fallback={
                          <TableCell>
                            <Skeleton className="h-5 w-24" />
                          </TableCell>
                        }
                      >
                        <CatalogPriceCell
                          data={commerce}
                          variantIds={
                            product.variants?.map((variant) => variant.id) ?? []
                          }
                        />
                      </Suspense>
                    ) : null}
                    {commerce ? (
                      <Suspense
                        fallback={
                          <TableCell>
                            <Skeleton className="h-5 w-24" />
                          </TableCell>
                        }
                      >
                        <CatalogStockCell
                          data={commerce}
                          variantIds={
                            product.variants?.map((variant) => variant.id) ?? []
                          }
                        />
                      </Suspense>
                    ) : null}
                    <TableCell>{product.variants?.length ?? 0}</TableCell>
                    <TableCell>{formatDate(product.created_at)}</TableCell>
                    <TableCell className="relative z-10">
                      <Suspense
                        fallback={
                          <ProductRowActions
                            productId={product.id}
                            title={product.title}
                          />
                        }
                      >
                        {commerce ? (
                          <CatalogSaleActions
                            data={commerce}
                            seller={membership.seller}
                            productId={product.id}
                            title={product.title}
                            variantIds={
                              product.variants?.map((variant) => variant.id) ??
                              []
                            }
                          />
                        ) : null}
                      </Suspense>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="border border-dashed border-border">
              <DataEmpty
                title={
                  input.q || input.status !== "all"
                    ? "No hay productos con estos filtros"
                    : "El catálogo está vacío"
                }
                description="Crea un producto o prueba otro estado o búsqueda."
              />
            </div>
          )}
          <TablePagination
            label="Páginas del catálogo"
            count={result.data.count}
            offset={result.data.offset}
            limit={result.data.limit}
            itemCount={result.data.products.length}
            hrefForOffset={(offset) =>
              catalogListHref(input, offset / input.limit + 1)
            }
          />
        </div>
      ) : (
        <DataError message={result.error} />
      )}
    </>
  );
}
