import Link from "next/link";
import { formatOrderNumber } from "@usapeek/order-reference";
import { TablePagination } from "@/components/table-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import type { HttpTypes } from "@medusajs/types";
import { requireAdminSdk } from "@/lib/auth-sdk";
import { AdminAutoRefresh } from "@/features/realtime/auto-refresh";
import {
  returnQueueHref,
  returnQueueQuery,
  returnQueueReason,
  returnQueueStatus,
  type ReturnQueueRecord,
  type returnQueueInput,
} from "./return-queue";

const HEADERS = ["Devolución", "Pedido", "Origen", "Motivo", "Estado"];

export function ReturnQueueSkeleton() {
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        Cargando devoluciones
      </p>
      <Table aria-hidden="true">
        <TableHeader>
          <TableRow>
            {HEADERS.map((label) => (
              <TableHead key={label}>{label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 5 }, (_, index) => (
            <TableRow key={index}>
              {HEADERS.map((label) => (
                <TableCell key={label}>
                  <Skeleton
                    className={label === "Motivo" ? "h-4 w-40" : "h-4 w-28"}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Skeleton className="mt-5 h-8 w-48" />
    </div>
  );
}

export async function ReturnQueueRegion({
  input,
}: {
  input: ReturnType<typeof returnQueueInput>;
}) {
  const sdk = await requireAdminSdk();
  let result: HttpTypes.AdminReturnsResponse | null = null;
  try {
    result = await sdk.admin.return.list(returnQueueQuery(input));
  } catch {
    result = null;
  }
  const records: ReturnQueueRecord[] = result?.returns ?? [];
  return (
    <AdminAutoRefresh eventName="orders-changed">
      {!result ? (
        <div role="alert" className="space-y-3">
          <p className="text-sm text-muted-foreground">
            No se pudieron cargar las devoluciones.
          </p>
          <Button asChild size="sm" variant="outline">
            <a href={returnQueueHref(input.offset)}>Reintentar</a>
          </Button>
        </div>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                {HEADERS.map((label) => (
                  <TableHead key={label}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length ? (
                records.map((record) => {
                  const details = returnQueueReason(record);
                  const href = `/dashboard/orders/${encodeURIComponent(record.order_id)}#order-returns-title`;
                  return (
                    <TableRow key={record.id}>
                      <TableCell>
                        <Link
                          href={href}
                          className="inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                        >
                          Devolución {record.display_id}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={href}
                          className="inline-flex min-h-11 items-center underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                        >
                          {record.order
                            ? formatOrderNumber(record.order)
                            : "Ver pedido"}
                        </Link>
                      </TableCell>
                      <TableCell>{details.origin}</TableCell>
                      <TableCell className="min-w-48 max-w-sm">
                        <span>{details.reason}</span>
                        {details.note ? (
                          <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">
                            {details.note}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {returnQueueStatus(record)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={HEADERS.length}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {result.count
                      ? "No hay devoluciones en esta página."
                      : "No hay devoluciones pendientes."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <TablePagination
            label="Páginas de devoluciones"
            count={result.count}
            offset={input.offset}
            limit={input.limit}
            itemCount={records.length}
            hrefForOffset={returnQueueHref}
          />
        </>
      )}
    </AdminAutoRefresh>
  );
}
