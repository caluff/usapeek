import { TablePagination } from "@/components/table-pagination";
import type { AdminApplicationListResponse } from "@usapeek/vendor-onboarding-contracts";
import Link from "next/link";
import { ClipboardCheck, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  APPLICATION_STATUS_LABELS,
  applicationDate,
  applicationListHref,
  type parseApplicationFilters,
} from "../helpers";
import { ApplicationStatusBadge } from "./status-badge";

export function ApplicationFilters({
  filters,
}: {
  filters: ReturnType<typeof parseApplicationFilters>;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <nav
        aria-label="Estados de solicitudes"
        className="flex min-w-0 max-w-full self-start gap-1 overflow-x-auto border-b md:self-auto"
      >
        {Object.entries(APPLICATION_STATUS_LABELS).map(([value, label]) => (
          <Link
            key={value}
            href={applicationListHref(
              { ...filters, status: value as typeof filters.status },
              0,
            )}
            aria-current={filters.status === value ? "page" : undefined}
            className={cn(
              "shrink-0 border-b-2 px-4 py-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              filters.status === value
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
      <form
        action="/dashboard/vendor-applications"
        method="get"
        role="search"
        className="relative mb-3 w-full shrink-0 md:mb-0 md:w-52 lg:w-64"
      >
        <label className="sr-only" htmlFor="application-search">
          Buscar solicitante o tienda
        </label>
        <Input
          key={filters.q}
          id="application-search"
          name="q"
          maxLength={100}
          defaultValue={filters.q}
          placeholder="Nombre o correo"
          className="pr-12"
        />
        <input type="hidden" name="status" value={filters.status} />
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          static
          aria-label="Buscar solicitudes"
          className="absolute right-1 top-1 size-8"
        >
          <Search aria-hidden="true" strokeWidth={1.5} />
        </Button>
      </form>
    </div>
  );
}

export function ApplicationList({
  result,
  filters,
}: {
  result: AdminApplicationListResponse;
  filters: ReturnType<typeof parseApplicationFilters>;
}) {
  return (
    <div>
      {result.applications.length ? (
        <Table>
          <TableCaption className="sr-only">
            Solicitudes de vendedores. Fechas en UTC.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Tienda / solicitante</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Enviada (UTC)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.applications.map((application) => (
              <TableRow key={application.id} className="relative">
                <TableCell>
                  <Link
                    href={`/dashboard/vendor-applications/${encodeURIComponent(application.id)}`}
                    aria-label={`Revisar ${application.store_name || application.customer.email}`}
                    className="font-semibold outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
                  >
                    {application.store_name || "Tienda sin nombre"}
                  </Link>
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    {application.customer.email}
                  </p>
                </TableCell>
                <TableCell>
                  {application.business_type === "company"
                    ? "Empresa"
                    : "Individual"}
                </TableCell>
                <TableCell>
                  <ApplicationStatusBadge status={application.status} />
                  {application.approval_state === "processing" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Habilitando tienda…
                    </p>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {applicationDate(application.submitted_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="flex flex-col items-center gap-3 border border-dashed border-border px-6 py-12 text-center">
          <ClipboardCheck
            className="size-8 text-muted-foreground"
            aria-hidden="true"
          />
          <h2 className="font-semibold">
            No hay solicitudes con estos filtros
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Cuando un comprador envíe su solicitud, aparecerá en «En revisión».
          </p>
        </div>
      )}
      <TablePagination
        label="Páginas de solicitudes"
        count={result.count}
        offset={result.offset}
        limit={result.limit}
        itemCount={result.applications.length}
        hrefForOffset={(offset) => applicationListHref(filters, offset)}
      />
    </div>
  );
}
