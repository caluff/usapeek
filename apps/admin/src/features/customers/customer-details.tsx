"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdminCustomerPurchasesDetailResponse } from "@usapeek/api/customer-contracts";
import { formatOrderNumber } from "@usapeek/order-reference";
import { formatPhoneNumber } from "@usapeek/ui/format-phone-number";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { tablePagination } from "@/lib/pagination";
import { money, orderDate } from "../orders/helpers";
import { OrderStatusBadge } from "../orders/status-badge";
import {
  customerAccountLabel,
  customerCountryName,
  customerSpentAmounts,
} from "./helpers";
import { CustomerDetailReadError, readCustomerDetails } from "./detail-read";

type DetailState = {
  data?: AdminCustomerPurchasesDetailResponse;
  error?: string;
  isUnavailable?: boolean;
  isLoading: boolean;
};

export default function CustomerDetails({
  customerId,
}: {
  customerId: string;
}) {
  const [offset, setOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DetailState>({ isLoading: true });

  useEffect(() => {
    const controller = new AbortController();
    void readCustomerDetails(customerId, offset, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ data, isLoading: false });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const isUnavailable =
          error instanceof CustomerDetailReadError && error.isUnavailable;
        setState((previous) => ({
          data: isUnavailable ? undefined : previous.data,
          error:
            error instanceof CustomerDetailReadError
              ? error.message
              : "No se pudo cargar la ficha del cliente.",
          isUnavailable,
          isLoading: false,
        }));
      },
    );
    return () => controller.abort();
  }, [customerId, offset, attempt]);

  function changePage(nextOffset: number) {
    setState((previous) => ({ data: previous.data, isLoading: true }));
    setOffset(nextOffset);
  }

  function retry() {
    setState((previous) => ({ data: previous.data, isLoading: true }));
    setAttempt((value) => value + 1);
  }

  const result = state.data;
  const pagination = result
    ? tablePagination({ count: result.count, limit: result.limit, offset })
    : null;

  return (
    <div className="space-y-6">
      {result ? (
        <>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Correo</dt>
            <dd className="break-words">
              {result.customer.email ?? "Sin correo"}
            </dd>
            <dt className="text-muted-foreground">Teléfono</dt>
            <dd className="break-words">
              {formatPhoneNumber(result.customer.phone) ?? "Sin teléfono"}
            </dd>
            <dt className="text-muted-foreground">Cuenta</dt>
            <dd>
              <Badge variant="outline">
                {customerAccountLabel({
                  has_account: result.customer.has_account,
                  is_deleted: false,
                })}
              </Badge>
            </dd>
          </dl>
          {result.customer.addresses.length ? (
            <section
              aria-label="Direcciones de entrega"
              className="space-y-2 text-sm"
            >
              <h3 className="font-semibold">Dirección de entrega</h3>
              {result.customer.addresses.map((address, index) => (
                <p key={index} className="break-words text-muted-foreground">
                  {[address.address_1, address.address_2]
                    .filter(Boolean)
                    .join(", ")}
                  <br />
                  {[address.city, address.province, address.postal_code]
                    .filter(Boolean)
                    .join(", ")}
                  {address.country_code ? (
                    <>
                      <br />
                      {customerCountryName(address.country_code)}
                    </>
                  ) : null}
                </p>
              ))}
            </section>
          ) : null}
          <dl className="grid grid-cols-2 gap-4 border-y py-4">
            <div>
              <dt className="text-sm text-muted-foreground">Compras</dt>
              <dd className="mt-1 font-semibold tabular-nums">
                {result.customer.purchase_count}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Total gastado</dt>
              <dd className="mt-1 font-semibold tabular-nums">
                {customerSpentAmounts(result.customer.spent_totals).map(
                  (amount, index) => (
                    <span key={index} className="block">
                      {amount}
                    </span>
                  ),
                )}
              </dd>
            </div>
          </dl>
        </>
      ) : state.isLoading ? (
        <div
          aria-label="Cargando datos del cliente"
          role="status"
          className="space-y-3"
        >
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : null}

      {state.error ? (
        <div role="alert" className="space-y-3">
          <p className="text-sm text-destructive">{state.error}</p>
          {!state.isUnavailable ? (
            <Button variant="outline" size="sm" onClick={retry}>
              Reintentar
            </Button>
          ) : null}
        </div>
      ) : null}

      {!state.isUnavailable ? (
        <section aria-label="Pedidos del cliente">
          <h3 className="font-semibold">Pedidos</h3>
          {state.isLoading ? (
            <div
              role="status"
              aria-label="Cargando pedidos del cliente"
              className="mt-4 space-y-3"
            >
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : result && !state.error ? (
            <>
              {result.orders.length ? (
                result.orders.map((order) => (
                  <article
                    key={order.id}
                    className="space-y-2 border-b py-4 last:border-b-0"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <Link
                          href={`/dashboard/orders/${encodeURIComponent(order.id)}`}
                          className="font-semibold underline-offset-4 hover:underline"
                        >
                          {formatOrderNumber({
                            display_id: order.display_id,
                            custom_display_id:
                              order.custom_display_id ?? undefined,
                          })}
                        </Link>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {orderDate(order.created_at)}
                        </p>
                        {order.seller_name ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {order.seller_name}
                          </p>
                        ) : null}
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums">
                        {money(order.total, order.currency_code)}
                      </p>
                    </div>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {order.items.map((item, index) => (
                        <li key={index}>
                          {item.quantity} × {item.title}
                          {item.variant_title &&
                          !/^variante [uú]nica$/i.test(item.variant_title)
                            ? ` · ${item.variant_title}`
                            : ""}
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap gap-2">
                      <OrderStatusBadge status={order.status} />
                      {order.payment_status ? (
                        <OrderStatusBadge status={order.payment_status} />
                      ) : null}
                    </div>
                  </article>
                ))
              ) : (
                <p className="py-4 text-sm text-muted-foreground">
                  No hay pedidos en esta página.
                </p>
              )}
              {result.count > 0 && pagination ? (
                <nav
                  aria-label="Paginación de pedidos del cliente"
                  className="mt-4 flex flex-wrap items-center justify-between gap-3"
                >
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {result.orders.length
                      ? `${offset + 1}–${offset + result.orders.length} de ${result.count}`
                      : `0 de ${result.count}`}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.previousOffset === null}
                      onClick={() => {
                        if (pagination.previousOffset !== null)
                          changePage(pagination.previousOffset);
                      }}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.nextOffset === null}
                      onClick={() => {
                        if (pagination.nextOffset !== null)
                          changePage(pagination.nextOffset);
                      }}
                    >
                      Siguiente
                    </Button>
                  </div>
                </nav>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
