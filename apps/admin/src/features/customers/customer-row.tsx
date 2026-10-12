"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { AdminCustomerPurchasesResponse } from "@usapeek/api/customer-contracts";
import { formatPhoneNumber } from "@usapeek/ui/format-phone-number";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  customerAccountLabel,
  customerName,
  customerSpentAmounts,
} from "./helpers";

const CustomerDetails = dynamic(() => import("./customer-details"), {
  loading: () => (
    <div role="status" aria-label="Cargando ficha del cliente">
      <Skeleton className="h-52 w-full" />
    </div>
  ),
});

export function CustomerRow({
  customer,
}: {
  customer: AdminCustomerPurchasesResponse["customers"][number];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const name = customerName(customer);
  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <TableRow
        className={customer.is_deleted ? undefined : "cursor-pointer"}
        onClick={customer.is_deleted ? undefined : () => setIsOpen(true)}
      >
        <TableCell className="h-16 break-words">
          {customer.is_deleted ? (
            <p className="font-medium">{name}</p>
          ) : (
            <SheetTrigger asChild>
              <Button
                variant="link"
                static
                className="h-auto max-w-full justify-start whitespace-normal p-0 text-left text-foreground"
                aria-label={`Ver cliente: ${name}`}
              >
                {name}
              </Button>
            </SheetTrigger>
          )}
          {!customer.is_deleted && customer.email && name !== customer.email ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {customer.email}
            </p>
          ) : null}
        </TableCell>
        <TableCell className="whitespace-nowrap tabular-nums">
          {customer.is_deleted
            ? "No disponible"
            : formatPhoneNumber(customer.phone) || "Sin teléfono"}
        </TableCell>
        <TableCell>
          <Badge variant="outline">{customerAccountLabel(customer)}</Badge>
        </TableCell>
        <TableCell className="text-right font-medium tabular-nums">
          {customer.purchase_count}
        </TableCell>
        <TableCell className="text-right font-medium tabular-nums">
          {customerSpentAmounts(customer.spent_totals).map((amount, index) => (
            <span key={index} className="block">
              {amount}
            </span>
          ))}
        </TableCell>
      </TableRow>
      <SheetContent
        closeLabel="Cerrar ficha del cliente"
        className="h-dvh w-full gap-0 sm:max-w-xl"
      >
        <header className="border-b px-6 py-5 pr-14">
          <SheetTitle className="break-words text-lg">{name}</SheetTitle>
          <SheetDescription className="sr-only">
            Datos de contacto e historial de compras del cliente.
          </SheetDescription>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <CustomerDetails customerId={customer.id} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
