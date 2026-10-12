import { Suspense } from "react";
import Link from "next/link";
import { FetchError } from "@medusajs/js-sdk";
import { unstable_rethrow } from "next/navigation";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/table-pagination";
import { requireAdminSdk } from "@/lib/auth-sdk";
import {
  categoryErrorMessage,
  categoryListHref,
  parseCategoryFilters,
} from "../helpers";
import { listCategories } from "../operations";

export function CategoryListSkeleton({
  showSearch = false,
}: {
  showSearch?: boolean;
}) {
  return (
    <div
      role="status"
      aria-label="Cargando categorías"
      aria-busy="true"
      className="space-y-3"
    >
      {showSearch ? <Skeleton className="h-10 w-64 max-w-full" /> : null}
      <Skeleton className="h-56 w-full" />
      <span className="sr-only">Cargando categorías…</span>
    </div>
  );
}

async function CategoryResults({
  filters,
}: {
  filters: ReturnType<typeof parseCategoryFilters>;
}) {
  let result;
  try {
    const sdk = await requireAdminSdk();
    result = await listCategories(sdk.admin.productCategory, filters);
  } catch (error) {
    unstable_rethrow(error);
    return (
      <div role="alert" className="space-y-3 py-5">
        <p className="text-sm text-destructive">
          {categoryErrorMessage(
            error instanceof FetchError ? error.status : undefined,
          )}
        </p>
        <Button asChild variant="outline">
          <a href={categoryListHref(filters, filters.offset)}>Reintentar</a>
        </Button>
      </div>
    );
  }
  return (
    <div>
      {result.product_categories.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Categoría</TableHead>
              <TableHead className="text-right">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.product_categories.map((category) => (
              <TableRow key={category.id}>
                <TableCell className="break-words font-medium">
                  {category.name}
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant="outline">
                    {category.is_internal
                      ? "Interna"
                      : category.is_active
                        ? "Disponible"
                        : "Inactiva"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="space-y-3 py-8 text-sm text-muted-foreground">
          <p>
            {filters.q
              ? "No hay categorías que coincidan con la búsqueda."
              : result.count
                ? "No hay categorías en esta página."
                : "Todavía no hay categorías. Crea la primera con el formulario de arriba."}
          </p>
          {filters.q || filters.offset ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard/categories">Ver todas</Link>
            </Button>
          ) : null}
        </div>
      )}
      {result.count > 0 ? (
        <TablePagination
          label="Paginación de categorías"
          count={result.count}
          limit={filters.limit}
          offset={filters.offset}
          itemCount={result.product_categories.length}
          hrefForOffset={(offset) => categoryListHref(filters, offset)}
        />
      ) : null}
    </div>
  );
}

export async function CategoryBrowser({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseCategoryFilters(await searchParams);
  return (
    <div className="space-y-4">
      <form
        action="/dashboard/categories"
        method="get"
        role="search"
        aria-label="Buscar categorías"
        className="relative w-full sm:max-w-xs"
      >
        <label htmlFor="category-search" className="sr-only">
          Buscar categoría
        </label>
        <Input
          key={filters.q}
          id="category-search"
          name="q"
          maxLength={100}
          defaultValue={filters.q}
          placeholder="Buscar categoría por nombre"
          className="pr-12"
        />
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          static
          aria-label="Buscar categorías"
          className="absolute right-1 top-1 size-8"
        >
          <Search aria-hidden="true" />
        </Button>
      </form>
      <Suspense
        key={`${filters.q}:${filters.offset}`}
        fallback={<CategoryListSkeleton />}
      >
        <CategoryResults filters={filters} />
      </Suspense>
    </div>
  );
}
