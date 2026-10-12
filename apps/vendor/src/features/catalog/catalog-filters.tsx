import Link from "next/link";
import { Plus } from "lucide-react";
import { ListSearch } from "@/components/list-search";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  catalogListHref,
  CATALOG_STATUS_LABELS,
  type catalogListInput,
} from "./parameters";

export function CatalogFilters({
  input,
}: {
  input: ReturnType<typeof catalogListInput>;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <nav
        aria-label="Estados del catálogo"
        className="flex min-w-0 max-w-full self-start gap-1 overflow-x-auto border-b"
      >
        {Object.entries({ all: "Todos", ...CATALOG_STATUS_LABELS }).map(
          ([status, label]) => (
            <Link
              key={status}
              href={catalogListHref({
                ...input,
                status: status as typeof input.status,
              })}
              aria-current={input.status === status ? "page" : undefined}
              className={cn(
                "shrink-0 border-b-2 px-4 py-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                input.status === status
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              {label}
            </Link>
          ),
        )}
      </nav>
      <div className="flex w-full min-w-0 items-center gap-3 md:ml-auto md:w-auto">
        <ListSearch
          q={input.q}
          label="Buscar productos"
          path="/seller/catalog"
          placeholder="Título o identificador"
          hidden={{ status: input.status }}
        />
        <Button asChild>
          <Link href="/seller/catalog/new">
            <Plus aria-hidden="true" />
            <span className="hidden sm:inline">Crear producto</span>
            <span className="sr-only sm:hidden">Crear producto</span>
          </Link>
        </Button>
      </div>
    </div>
  );
}
