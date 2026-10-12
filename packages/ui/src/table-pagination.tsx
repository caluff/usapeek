import type { ElementType, ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Pagination, PaginationEllipsis, PaginationLink } from "./pagination";
import { tablePagination } from "./pagination-utils";

export type TablePaginationProps = {
  label: string;
  count: number;
  offset: number;
  limit: number;
  itemCount: number;
  hrefForOffset: (offset: number) => string;
  linkComponent?: ElementType<{
    href: string;
    children: ReactNode;
    rel?: string;
    "aria-label"?: string;
  }>;
};

export function TablePagination({
  label,
  count,
  offset,
  limit,
  itemCount,
  hrefForOffset,
  linkComponent: Link = "a",
}: TablePaginationProps) {
  const { currentPage, pages, previousOffset, nextOffset } = tablePagination({
    count,
    offset,
    limit,
  });

  return (
    <Pagination aria-label={label} className="mt-5">
      <p className="text-xs tabular-nums text-muted-foreground">
        {itemCount
          ? `${offset + 1}–${offset + itemCount} de ${count}`
          : `0 de ${count}`}
      </p>
      <ul className="flex max-w-full flex-wrap items-center gap-1">
        <li>
          {previousOffset === null ? (
            <PaginationLink disabled>
              <ChevronLeft aria-hidden="true" />
              <span className="hidden sm:inline">Anterior</span>
              <span className="sr-only sm:hidden">Anterior</span>
            </PaginationLink>
          ) : (
            <PaginationLink asChild>
              <Link href={hrefForOffset(previousOffset)} rel="prev">
                <ChevronLeft aria-hidden="true" />
                <span className="hidden sm:inline">Anterior</span>
                <span className="sr-only sm:hidden">Anterior</span>
              </Link>
            </PaginationLink>
          )}
        </li>
        {pages.map((page) => (
          <li key={page}>
            {typeof page === "number" ? (
              <PaginationLink asChild isActive={page === currentPage}>
                <Link
                  href={hrefForOffset((page - 1) * limit)}
                  aria-label={`Página ${page}`}
                >
                  {page}
                </Link>
              </PaginationLink>
            ) : (
              <PaginationEllipsis />
            )}
          </li>
        ))}
        <li>
          {nextOffset === null ? (
            <PaginationLink disabled>
              <span className="hidden sm:inline">Siguiente</span>
              <span className="sr-only sm:hidden">Siguiente</span>
              <ChevronRight aria-hidden="true" />
            </PaginationLink>
          ) : (
            <PaginationLink asChild>
              <Link href={hrefForOffset(nextOffset)} rel="next">
                <span className="hidden sm:inline">Siguiente</span>
                <span className="sr-only sm:hidden">Siguiente</span>
                <ChevronRight aria-hidden="true" />
              </Link>
            </PaginationLink>
          )}
        </li>
      </ul>
    </Pagination>
  );
}
