import { TablePagination } from "@/components/table-pagination";
import { Suspense } from "react";
import { FetchError } from "@medusajs/js-sdk";
import { Search } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import { requireAdminSdk } from "@/lib/auth-sdk";
import { AdminAutoRefresh } from "@/features/realtime/auto-refresh";
import { cn } from "@/lib/utils";
import {
  CatalogPermissionRegion,
  CatalogPermissionSkeleton,
} from "./catalog-permission-region";
import { StoreDetails } from "./store-detail";
import { StoreStatusBadge, storeStatusTabClassName } from "./status-badge";
import { listCatalogPermissions, listStores, retrieveStore } from "./data";
import {
  isStoreId,
  parseStoreFilters,
  STORE_STATUS_LABELS,
  storeListHref,
} from "./helpers";

export function StoreRegionSkeleton() {
  return (
    <div aria-label="Cargando tiendas" className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

function StoreReadError({ href }: { href: string }) {
  return (
    <div role="alert" className="space-y-3 rounded-lg border border-border p-6">
      <p className="text-sm text-muted-foreground">
        No pudimos cargar los datos de tiendas. Inténtalo nuevamente.
      </p>
      <Button asChild variant="outline" size="sm">
        <a href={href}>Reintentar</a>
      </Button>
    </div>
  );
}

export function StoreFilters({
  filters,
}: {
  filters: ReturnType<typeof parseStoreFilters>;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <nav
        aria-label="Estados de tiendas"
        className="flex min-w-0 max-w-full self-start gap-1 overflow-x-auto border-b md:self-auto"
      >
        {Object.entries({ all: "Todas", ...STORE_STATUS_LABELS }).map(
          ([value, label]) => (
            <Link
              key={value}
              href={storeListHref(
                { ...filters, status: value as typeof filters.status },
                0,
              )}
              aria-current={filters.status === value ? "page" : undefined}
              className={cn(
                "shrink-0 border-b-2 px-4 py-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                filters.status === value
                  ? storeStatusTabClassName(value)
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {label}
            </Link>
          ),
        )}
      </nav>
      <form
        action="/dashboard/stores"
        method="get"
        role="search"
        className="relative mb-3 w-full shrink-0 md:mb-0 md:w-52 lg:w-64"
      >
        <label className="sr-only" htmlFor="store-search">
          Buscar tienda
        </label>
        <Input
          key={filters.q}
          id="store-search"
          name="q"
          maxLength={100}
          defaultValue={filters.q}
          placeholder="Nombre, email o identificador"
          className="pr-12"
        />
        <input type="hidden" name="status" value={filters.status} />
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          aria-label="Buscar tiendas"
          className="absolute right-1 top-1 size-8"
        >
          <Search aria-hidden="true" strokeWidth={1.5} />
        </Button>
      </form>
    </div>
  );
}

export async function StoreResults({
  filters,
}: {
  filters: ReturnType<typeof parseStoreFilters>;
}) {
  const sdk = await requireAdminSdk();
  let result;
  try {
    result = await listStores(sdk, filters);
  } catch {
    return (
      <AdminAutoRefresh eventName="stores-changed">
        <StoreReadError href={storeListHref(filters, filters.offset)} />
      </AdminAutoRefresh>
    );
  }
  const permissions = result.sellers.length
    ? listCatalogPermissions(
        sdk,
        result.sellers.map((seller) => seller.id),
      ).catch(() => null)
    : Promise.resolve({ catalog_permissions: [] });
  return (
    <AdminAutoRefresh eventName="stores-changed">
      <div>
        {result.sellers.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tienda</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Moneda</TableHead>
                <TableHead>Permiso de catálogo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.sellers.map((seller) => (
                <TableRow key={seller.id} className="relative">
                  <TableCell>
                    <Link
                      href={`/dashboard/stores/${encodeURIComponent(seller.id)}`}
                      aria-label={`Ver ${seller.name}`}
                      className="font-semibold outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
                    >
                      {seller.name}
                    </Link>
                  </TableCell>
                  <TableCell>{seller.email || "Sin email"}</TableCell>
                  <TableCell>
                    <StoreStatusBadge status={seller.status} />
                  </TableCell>
                  <TableCell className="uppercase">
                    {seller.currency_code}
                  </TableCell>
                  <TableCell>
                    <div className="relative z-10">
                      <Suspense fallback={<CatalogPermissionSkeleton />}>
                        <CatalogPermissionRegion
                          seller={seller}
                          permissions={permissions}
                          href={storeListHref(filters, filters.offset)}
                        />
                      </Suspense>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
            No hay tiendas con estos filtros.
          </p>
        )}
        <TablePagination
          label="Páginas de tiendas"
          count={result.count}
          offset={result.offset}
          limit={result.limit}
          itemCount={result.sellers.length}
          hrefForOffset={(offset) => storeListHref(filters, offset)}
        />
      </div>
    </AdminAutoRefresh>
  );
}

export async function StoreDetailRegion({ id }: { id: string }) {
  if (!isStoreId(id)) notFound();
  const sdk = await requireAdminSdk();
  const permissions = listCatalogPermissions(sdk, [id]).catch(() => null);
  let result;
  try {
    result = await retrieveStore(sdk, id);
  } catch (error) {
    if (error instanceof FetchError && error.status === 404) notFound();
    return (
      <StoreReadError href={`/dashboard/stores/${encodeURIComponent(id)}`} />
    );
  }
  return (
    <AdminAutoRefresh eventName="stores-changed">
      <StoreDetails seller={result.seller} permissions={permissions} />
    </AdminAutoRefresh>
  );
}
