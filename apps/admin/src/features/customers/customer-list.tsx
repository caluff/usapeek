import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/table-pagination";
import type { getPurchasingCustomers } from "./data";
import { customerListHref } from "./helpers";
import { CustomerRow } from "./customer-row";

type CustomerListProps = {
  customers: ReturnType<typeof getPurchasingCustomers>;
};

export function CustomerRowsSkeleton() {
  return (
    <TableBody aria-busy="true" aria-label="Cargando clientes">
      {Array.from({ length: 5 }, (_, index) => (
        <TableRow key={index}>
          <TableCell className="h-16">
            <Skeleton className="h-4 w-48 max-w-full" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-32" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-6 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="ml-auto h-4 w-8" />
          </TableCell>
          <TableCell>
            <Skeleton className="ml-auto h-4 w-24" />
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  );
}

export async function CustomerRows({ customers }: CustomerListProps) {
  const data = await customers;
  if (data.status === "error") {
    return (
      <TableBody>
        <TableRow>
          <TableCell colSpan={5} className="py-8">
            <div role="alert" className="space-y-3">
              <p className="text-sm text-destructive">{data.message}</p>
              {data.isDenied ? null : (
                <Button asChild variant="outline" size="sm">
                  <a
                    href={
                      data.isExpired
                        ? "/login?next=%2Fdashboard%2Fcustomers"
                        : customerListHref(data.pagination.offset)
                    }
                  >
                    {data.isExpired ? "Iniciar sesión" : "Reintentar"}
                  </a>
                </Button>
              )}
            </div>
          </TableCell>
        </TableRow>
      </TableBody>
    );
  }
  if (!data.result.customers.length) {
    return (
      <TableBody>
        <TableRow>
          <TableCell colSpan={5} className="py-8 text-muted-foreground">
            <div className="space-y-3">
              <p>
                {data.result.count
                  ? "No hay clientes en esta página."
                  : "Aquí aparecerán los clientes cuando realicen su primera compra."}
              </p>
              {data.pagination.offset ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/customers">Ver todos</Link>
                </Button>
              ) : null}
            </div>
          </TableCell>
        </TableRow>
      </TableBody>
    );
  }
  return (
    <TableBody>
      {data.result.customers.map((customer) => (
        <CustomerRow key={customer.id} customer={customer} />
      ))}
    </TableBody>
  );
}

export async function CustomerPagination({ customers }: CustomerListProps) {
  const data = await customers;
  if (data.status === "error" || !data.result.count) return null;
  return (
    <TablePagination
      label="Paginación de clientes"
      count={data.result.count}
      limit={data.result.limit}
      offset={data.result.offset}
      itemCount={data.result.customers.length}
      hrefForOffset={customerListHref}
    />
  );
}
