import { Suspense } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { listProductsForReview } from "../data";
import {
  parseProductReviewFilters,
  PRODUCT_STATUS_LABELS,
  productReviewHref,
} from "../helpers";
import { ProductReviewList } from "./product-list";
import { productStatusTabClassName } from "./status-badge";
import { AdminAutoRefresh } from "@/features/realtime/auto-refresh";

export function ProductReviewSkeleton() {
  return <Skeleton className="h-80 w-full" aria-label="Cargando productos" />;
}

async function ProductReviewResults({
  filters,
}: {
  filters: ReturnType<typeof parseProductReviewFilters>;
}) {
  let result;
  try {
    result = await listProductsForReview(filters);
  } catch (error) {
    unstable_rethrow(error);
    return (
      <AdminAutoRefresh eventName="catalog-changed">
        <div role="alert" className="space-y-3 rounded-lg border p-6">
          <p>
            No pudimos cargar los productos. Comprueba la conexión y los permisos
            de tu cuenta.
          </p>
          <Button asChild variant="outline">
            <a href={productReviewHref(filters, filters.offset)}>Reintentar</a>
          </Button>
        </div>
      </AdminAutoRefresh>
    );
  }
  return (
    <AdminAutoRefresh eventName="catalog-changed">
      <ProductReviewList filters={filters} result={result} />
    </AdminAutoRefresh>
  );
}

export async function ProductReviewBrowser({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseProductReviewFilters(await searchParams);
  return (
    <>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <nav
          aria-label="Estados del catálogo"
          className="flex min-w-0 max-w-full self-start gap-1 overflow-x-auto border-b md:self-auto"
        >
          {Object.entries({ all: "Todos", ...PRODUCT_STATUS_LABELS }).map(
            ([value, label]) => (
              <Link
                key={value}
                href={productReviewHref(
                  { ...filters, status: value as typeof filters.status },
                  0,
                )}
                aria-current={filters.status === value ? "page" : undefined}
                className={cn(
                  "shrink-0 border-b-2 px-4 py-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  filters.status === value
                    ? productStatusTabClassName(value)
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {label}
              </Link>
            ),
          )}
        </nav>
        <form
          action="/dashboard/product-review"
          method="get"
          role="search"
          className="relative mb-3 w-full shrink-0 md:mb-0 md:w-52 lg:w-64"
        >
          <label htmlFor="product-search" className="sr-only">
            Buscar producto
          </label>
          <Input
            key={filters.q}
            id="product-search"
            name="q"
            maxLength={100}
            defaultValue={filters.q}
            placeholder="Título o identificador"
            className="pr-12"
          />
          <input type="hidden" name="status" value={filters.status} />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            static
            aria-label="Buscar productos"
            className="absolute right-1 top-1 size-8"
          >
            <Search aria-hidden="true" strokeWidth={1.5} />
          </Button>
        </form>
      </div>
      <Suspense
        key={`${filters.status}:${filters.q}:${filters.offset}`}
        fallback={<ProductReviewSkeleton />}
      >
        <ProductReviewResults filters={filters} />
      </Suspense>
    </>
  );
}
