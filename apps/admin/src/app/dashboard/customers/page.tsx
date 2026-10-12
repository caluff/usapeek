import type { Metadata } from "next";
import { Suspense } from "react";
import { Table, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CustomerPagination,
  CustomerRows,
  CustomerRowsSkeleton,
} from "@/features/customers/customer-list";
import { getPurchasingCustomers } from "@/features/customers/data";

export const metadata: Metadata = {
  title: "Clientes",
  description:
    "Consulta los clientes que han comprado en el marketplace y su actividad de compra en USAPEEK Admin.",
};

export default function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const customers = getPurchasingCustomers(searchParams);
  return (
    <div className="w-full min-w-0 space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
      <div>
        <Table aria-label="Clientes que han comprado">
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead className="w-48">Teléfono</TableHead>
              <TableHead className="w-36">Cuenta</TableHead>
              <TableHead className="w-24 text-right">Compras</TableHead>
              <TableHead className="w-40 text-right">Total gastado</TableHead>
            </TableRow>
          </TableHeader>
          <Suspense fallback={<CustomerRowsSkeleton />}>
            <CustomerRows customers={customers} />
          </Suspense>
        </Table>
        <Suspense fallback={null}>
          <CustomerPagination customers={customers} />
        </Suspense>
      </div>
    </div>
  );
}
