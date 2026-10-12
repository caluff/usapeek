"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { ArrowDownWideNarrow, ListFilter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { VariantFilter, VariantSort } from "./product-variants-view";

const FILTERS: { value: VariantFilter; label: string }[] = [
  { value: "all", label: "Todas las variantes" },
  { value: "in-stock", label: "Con existencias" },
  { value: "out-of-stock", label: "Sin existencias" },
  { value: "unconfigured", label: "Sin configurar" },
];
const SORTS: { value: VariantSort; label: string }[] = [
  { value: "original", label: "Orden original" },
  { value: "name-asc", label: "Nombre: A–Z" },
  { value: "name-desc", label: "Nombre: Z–A" },
  { value: "price-asc", label: "Precio: menor a mayor" },
  { value: "price-desc", label: "Precio: mayor a menor" },
  { value: "stock-asc", label: "Existencias: menor a mayor" },
  { value: "stock-desc", label: "Existencias: mayor a menor" },
];
const VariantsViewContext = createContext<{
  query: string;
  filter: VariantFilter;
  sort: VariantSort;
  page: number;
  setPage: (page: number) => void;
} | null>(null);

export function useVariantsView() {
  const value = useContext(VariantsViewContext);
  if (!value) throw new Error("La tabla de variantes necesita su card.");
  return value;
}

export function ProductVariantsCard({
  children,
  createAction,
}: {
  children: ReactNode;
  createAction?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<VariantFilter>("all");
  const [sort, setSort] = useState<VariantSort>("original");
  const [page, setPage] = useState(0);
  return (
    <VariantsViewContext.Provider
      value={{ query, filter, sort, page, setPage }}
    >
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 border-b">
          <CardTitle>Variantes</CardTitle>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <div className="relative min-w-40 flex-1 sm:w-60">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                aria-label="Buscar variantes"
                placeholder="Buscar variantes"
                className="pl-9"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(0);
                }}
              />
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Filtrar variantes"
                  title="Filtrar variantes"
                  className={
                    filter !== "all" ? "border-primary text-primary" : undefined
                  }
                >
                  <ListFilter aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Filtrar variantes</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={filter}
                  onValueChange={(value) => {
                    const choice = FILTERS.find(
                      (entry) => entry.value === value,
                    );
                    if (choice) {
                      setFilter(choice.value);
                      setPage(0);
                    }
                  }}
                >
                  {FILTERS.map((entry) => (
                    <DropdownMenuRadioItem
                      key={entry.value}
                      value={entry.value}
                    >
                      {entry.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Ordenar variantes"
                  title="Ordenar variantes"
                  className={
                    sort !== "original"
                      ? "border-primary text-primary"
                      : undefined
                  }
                >
                  <ArrowDownWideNarrow aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Ordenar por</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={sort}
                  onValueChange={(value) => {
                    const choice = SORTS.find((entry) => entry.value === value);
                    if (choice) {
                      setSort(choice.value);
                      setPage(0);
                    }
                  }}
                >
                  {SORTS.map((entry) => (
                    <DropdownMenuRadioItem
                      key={entry.value}
                      value={entry.value}
                    >
                      {entry.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            {createAction}
          </div>
        </CardHeader>
        <CardContent className="p-0">{children}</CardContent>
      </Card>
    </VariantsViewContext.Provider>
  );
}
