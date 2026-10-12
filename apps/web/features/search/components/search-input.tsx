"use client";

import type { StoreSearchProductsResponse } from "@usapeek/api/search-contracts";
import { ArrowUpLeft, LoaderCircle, Search } from "lucide-react";
import Form from "next/form";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { getProductImage } from "@/features/catalog/image";
import { requestProductSearch, requestSearchRegion } from "../client";
import { parseSearchParameters, searchHref } from "../parameters";

export function SearchInput({ query = "" }: { query?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(query);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [response, setResponse] = useState<{
    query: string;
    products: StoreSearchProductsResponse["products"];
    failed: boolean;
  } | null>(null);
  const regionId = useRef<string | null>(null);
  const normalizedQuery = value.trim().replace(/\s+/g, " ");
  const canSuggest = isOpen && normalizedQuery.length >= 2;
  const current = response?.query === normalizedQuery ? response : null;
  const products = current?.products ?? [];
  const isLoading = canSuggest && !current;

  useEffect(() => {
    if (!canSuggest) return;
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(async () => {
      try {
        const signal = AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(8_000),
        ]);
        const region = regionId.current ?? (await requestSearchRegion(signal));
        if (!region) throw new Error("Region unavailable");
        regionId.current = region;
        const result = await requestProductSearch(
          parseSearchParameters({ q: normalizedQuery }),
          region,
          signal,
          6,
        );
        if (active)
          setResponse({
            query: normalizedQuery,
            products: result.products,
            failed: false,
          });
      } catch {
        if (active)
          setResponse({ query: normalizedQuery, products: [], failed: true });
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [canSuggest, normalizedQuery]);

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!canSuggest || !products.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        event.key === "ArrowDown"
          ? (index + 1) % products.length
          : (index <= 0 ? products.length : index) - 1,
      );
    }
    if (event.key === "Enter" && activeIndex >= 0 && products[activeIndex]) {
      event.preventDefault();
      const product = products[activeIndex];
      setIsOpen(false);
      router.push(
        `/products/${encodeURIComponent(product.handle ?? product.id)}`,
      );
    }
  }

  return (
    <div
      className="relative min-w-0 flex-1"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setIsOpen(false);
      }}
    >
      <Form
        action="/search"
        role="search"
        aria-label="Buscar productos"
        onSubmit={() => setIsOpen(false)}
        className="flex h-11 items-center border border-input bg-muted/40 transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring"
      >
        <label htmlFor="store-product-search" className="sr-only">
          Buscar productos
        </label>
        <input
          id="store-product-search"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={canSuggest}
          aria-controls={canSuggest ? "store-search-suggestions" : undefined}
          aria-activedescendant={
            canSuggest && activeIndex >= 0 && products[activeIndex]
              ? `search-suggestion-${products[activeIndex].id}`
              : undefined
          }
          name="q"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setActiveIndex(-1);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={keyDown}
          placeholder="Buscar productos…"
          autoComplete="off"
          maxLength={200}
          className="h-full min-w-0 flex-1 bg-transparent px-4 text-base outline-none placeholder:text-muted-foreground sm:text-sm"
        />
        <button
          type="submit"
          aria-label="Buscar"
          className="flex size-11 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search aria-hidden="true" className="size-5" strokeWidth={1.75} />
        </button>
      </Form>
      {canSuggest ? (
        <div className="absolute inset-x-0 top-full z-50 mt-2 border border-border bg-background shadow-lg">
          <div className="max-h-[min(28rem,60dvh)] overflow-y-auto">
            <ul
              id="store-search-suggestions"
              role="listbox"
              aria-label="Productos sugeridos"
              aria-busy={isLoading}
              className="p-2"
            >
              {products.map((product, index) => {
                const image = getProductImage(
                  product.thumbnail ?? product.images?.[0]?.url,
                );
                return (
                  <li
                    id={`search-suggestion-${product.id}`}
                    key={product.id}
                    role="option"
                    aria-selected={activeIndex === index}
                    className={activeIndex === index ? "bg-muted" : ""}
                  >
                    <Link
                      href={`/products/${encodeURIComponent(product.handle ?? product.id)}`}
                      onClick={() => setIsOpen(false)}
                      className="flex min-h-16 items-center gap-3 px-3 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="relative size-12 shrink-0 overflow-hidden bg-muted">
                        {image ? (
                          <Image
                            src={image.source}
                            alt=""
                            fill
                            sizes="48px"
                            unoptimized={image.unoptimized}
                            className="object-cover"
                          />
                        ) : (
                          <Search
                            aria-hidden="true"
                            className="m-4 size-4 text-muted-foreground"
                          />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="line-clamp-2 font-medium">
                          {product.title}
                        </span>
                        {product.categories?.[0]?.name ? (
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {product.categories[0].name}
                          </span>
                        ) : null}
                      </span>
                      <ArrowUpLeft
                        aria-hidden="true"
                        className="size-4 shrink-0 text-muted-foreground"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
            {isLoading ? (
              <p
                role="status"
                className="flex items-center gap-2 px-5 pb-5 text-sm text-muted-foreground"
              >
                <LoaderCircle
                  aria-hidden="true"
                  className="size-4 animate-spin"
                />
                Buscando…
              </p>
            ) : !products.length ? (
              <p
                role="status"
                className="px-5 pb-5 text-sm text-muted-foreground"
              >
                {current?.failed
                  ? "Las sugerencias no están disponibles."
                  : "No encontramos coincidencias."}
              </p>
            ) : null}
          </div>
          <Link
            href={searchHref(parseSearchParameters({ q: normalizedQuery }))}
            onClick={() => setIsOpen(false)}
            className="flex min-h-12 items-center justify-between gap-3 border-t border-border px-5 py-3 text-sm font-medium hover:bg-muted"
          >
            <span className="truncate">
              Ver resultados para «{normalizedQuery}»
            </span>
            <Search className="size-4 shrink-0" aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
