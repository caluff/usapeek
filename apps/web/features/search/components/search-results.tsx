import { ArrowLeft, ArrowRight, Search, SearchX } from "lucide-react";
import Link from "next/link";
import { cache, Suspense } from "react";

import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductFavoriteAction } from "@/features/account/components/product-favorite-action";
import { groupOffersByProduct } from "@/features/catalog/offers";
import { getCurrentCustomer } from "@/lib/auth-sdk";
import { getSearchResults } from "../data";
import {
  clearSearchFilters,
  getSearchPagination,
  parseSearchParameters,
  searchHref,
  type SearchParameters,
  type SearchUrlParameters,
} from "../parameters";
import {
  MobileSearchFilters,
  SearchFilters,
  SearchSortSelect,
} from "./search-filters";

const getSearchCustomer = cache(getCurrentCustomer);

export function SearchResultsSkeleton() {
  return (
    <div
      role="status"
      aria-label="Buscando productos"
      className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]"
    >
      <div className="hidden space-y-6 lg:block">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-36 w-full" />
      </div>
      <div>
        <Skeleton className="mb-5 h-11 w-full" />
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index}>
              <Skeleton className="aspect-[4/5] w-full" />
              <Skeleton className="mt-4 h-6 w-3/4" />
              <Skeleton className="mt-3 h-5 w-1/3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SearchPagination({
  parameters,
  pages,
}: {
  parameters: SearchParameters;
  pages: number;
}) {
  const pagination = getSearchPagination(parameters, pages);
  if (pagination.isOutOfRange || pages <= 1) return null;
  return (
    <nav
      aria-label="Páginas de resultados"
      className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6"
    >
      {pagination.previousHref ? (
        <Button asChild variant="outline">
          <Link href={pagination.previousHref}>
            <ArrowLeft aria-hidden="true" className="size-4" />
            Anterior
          </Link>
        </Button>
      ) : (
        <span />
      )}
      <span className="text-sm tabular-nums text-muted-foreground">
        Página {parameters.page} de {pagination.lastPage}
      </span>
      {pagination.nextHref ? (
        <Button asChild variant="outline">
          <Link href={pagination.nextHref}>
            Siguiente
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      ) : (
        <span />
      )}
    </nav>
  );
}

export async function SearchResults({
  searchParams,
}: {
  searchParams: Promise<SearchUrlParameters>;
}) {
  const parameters = parseSearchParameters(await searchParams);
  return (
    <Suspense fallback={<SearchResultsSkeleton />}>
      <ResolvedSearchResults parameters={parameters} />
    </Suspense>
  );
}

async function ResolvedSearchResults({
  parameters,
}: {
  parameters: SearchParameters;
}) {
  const data = await getSearchResults(parameters);
  if (data.status !== "success") {
    return (
      <section
        role="alert"
        className="border border-border bg-muted/20 px-6 py-12 sm:p-12"
      >
        <Search
          aria-hidden="true"
          className="mb-5 size-8 text-muted-foreground"
        />
        <h2 className="text-2xl">
          La búsqueda no está disponible en este momento
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          {data.status === "region_unavailable"
            ? "No pudimos cargar la región de la tienda. Vuelve a intentarlo en unos instantes."
            : "No pudimos consultar los productos. Puedes reintentar o seguir explorando el catálogo."}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <a href={searchHref(parameters)}>Reintentar</a>
          </Button>
          <Button asChild variant="outline">
            <Link href="/search">Explorar catálogo</Link>
          </Button>
        </div>
      </section>
    );
  }
  const { result, offers } = data;
  const pagination = getSearchPagination(parameters, result.nbPages);
  const offersByProduct = groupOffersByProduct(offers);
  const filters = {
    parameters,
    facets: result.facets,
    priceRange: result.price_range,
  };
  return (
    <div>
      <div className="mb-4 flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <p role="status" className="text-sm text-muted-foreground">
          <span className="font-semibold tabular-nums text-foreground">
            {result.nbHits}
          </span>{" "}
          {result.nbHits === 1 ? "producto" : "productos"}
          {parameters.q ? (
            <>
              {" "}
              para{" "}
              <span className="font-medium text-foreground">
                «{parameters.q}»
              </span>
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <MobileSearchFilters {...filters} />
          <SearchSortSelect parameters={parameters} />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-6">
        <SearchFilters {...filters} />
        <section aria-label="Resultados de productos" className="min-w-0">
          {pagination.isOutOfRange ? (
            <div className="border border-dashed border-border px-6 py-16 text-center">
              <h2 className="text-2xl">Esta página ya no está disponible</h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                Vuelve a la última página disponible para continuar con los
                mismos filtros.
              </p>
              <Button asChild variant="outline" className="mt-6 min-h-11">
                <Link href={pagination.recoveryHref}>
                  Ir a la página {pagination.lastPage}
                </Link>
              </Button>
            </div>
          ) : result.products.length ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-3">
              {result.products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  offers={offersByProduct.get(product.id)}
                  favoriteAction={
                    <ProductFavoriteAction
                      customer={getSearchCustomer()}
                      productId={product.id}
                    />
                  }
                />
              ))}
            </div>
          ) : (
            <div className="border border-dashed border-border px-6 py-16 text-center">
              <SearchX
                aria-hidden="true"
                className="mx-auto mb-6 size-10 text-muted-foreground"
              />
              <h2 className="text-2xl">No encontramos productos</h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                Prueba con otras palabras o quita algunos filtros para ampliar
                la búsqueda.
              </p>
              <Button asChild variant="outline" className="mt-6">
                <Link href={searchHref(clearSearchFilters(parameters))}>
                  Quitar filtros
                </Link>
              </Button>
            </div>
          )}
          <SearchPagination parameters={parameters} pages={result.nbPages} />
        </section>
      </div>
    </div>
  );
}
