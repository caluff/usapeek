import type { OrderDetailDTO } from "@medusajs/types";
import type { VendorOrderCompletionResponse } from "@usapeek/api/order-notification-contracts";
import Link from "next/link";
import { Suspense } from "react";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { DataError } from "../workspace/components";
import { resultOf, workspace } from "../workspace/data";
import { formatDate } from "../workspace/presentation";
import { sellerWarehouse } from "../inventory/data";
import {
  orderCapabilities,
  preparationIssue,
  remainingToPrepare,
} from "./operations";
import { OrderActionForm } from "./order-action-form";
import type { ProductThumbnails } from "./image-data";
import { OrderItemThumbnail } from "./order-images";
import { OrderManagementOption } from "./order-management-option";
import { FulfillmentStatusBadge } from "./fulfillment-status-badge";
import type { readOrderCompletion } from "./completion-read";

async function PreparationForm({
  order,
  products,
  completion,
}: {
  order: OrderDetailDTO;
  products: Promise<ProductThumbnails>;
  completion: VendorOrderCompletionResponse;
}) {
  const groups = completion.preparation_groups
    .map((group) => ({
      ...group,
      items: (order.items ?? []).filter(
        (item) =>
          group.item_ids.includes(item.id) &&
          (remainingToPrepare(item) ?? 0) > 0,
      ),
    }))
    .filter((group) => group.items.length > 0);
  const hasUnassignedItems = (order.items ?? []).some(
    (item) =>
      (remainingToPrepare(item) ?? 0) > 0 &&
      !groups.some((group) => group.item_ids.includes(item.id)),
  );
  if (!groups.length)
    return (
      <DataError message="No se pudo verificar la opción de entrega de los artículos pendientes. Actualiza el pedido; si el problema continúa, contacta al operador." />
    );
  const { client } = await workspace();
  const result = await resultOf(
    sellerWarehouse(client).catch((error: unknown) => {
      if (error instanceof TypeError)
        throw new Error(
          "No se pudo verificar el almacén aprobado. Actualiza la página; si el problema continúa, contacta al operador.",
        );
      throw error;
    }),
  );
  if (!result.data)
    return (
      <DataError
        message={`${result.error} Actualiza la página para volver a intentarlo.`}
      />
    );
  if (result.data.status !== "ready")
    return (
      <p className="text-sm text-muted-foreground">
        No se pudo verificar el almacén aprobado.{" "}
        <Link href="/seller/inventory/locations" className="underline">
          Revisa tu almacén
        </Link>{" "}
        o contacta al operador para poder preparar el pedido.
      </p>
    );
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Almacén: {result.data.location.name}
      </p>
      {hasUnassignedItems ? (
        <DataError message="No se pudo verificar la opción de entrega de algunos artículos pendientes. Actualiza el pedido; si el problema continúa, contacta al operador." />
      ) : null}
      {groups.map((group) => {
        const { items } = group;
        const requiresShipping = group.shipping_option_id !== null;
        return (
          <OrderActionForm
            key={group.shipping_option_id ?? "without-shipping"}
            orderId={order.id}
            action="prepare"
            label={
              group.is_pickup
                ? "Preparar para recogida"
                : requiresShipping
                  ? "Preparar para envío"
                  : "Preparar sin envío"
            }
          >
            {group.shipping_option_id ? (
              <input
                type="hidden"
                name="shipping_option_id"
                value={group.shipping_option_id}
              />
            ) : null}
            <h3 className="text-sm font-semibold">
              {group.is_pickup
                ? "Artículos para recogida"
                : requiresShipping
                  ? "Artículos con envío"
                  : "Artículos sin envío"}
            </h3>
            <p className="text-sm text-muted-foreground">
              Elige cuántas unidades preparar. Usa 0 para dejar un artículo
              pendiente.
            </p>
            <div className="space-y-4">
              {items.map((item) => (
                <div key={item.id} className="space-y-2">
                  <div className="flex items-center gap-3">
                    <OrderItemThumbnail
                      item={item}
                      products={products}
                      className="size-10"
                    />
                    <label htmlFor={`quantity-${item.id}`} className="text-sm">
                      {item.title}
                      <span className="block text-xs text-muted-foreground">
                        {remainingToPrepare(item)} pendientes
                      </span>
                    </label>
                  </div>
                  <Input
                    id={`quantity-${item.id}`}
                    name={`quantity:${item.id}`}
                    type="number"
                    min={0}
                    max={remainingToPrepare(item) ?? 0}
                    step={1}
                    defaultValue={remainingToPrepare(item) ?? 0}
                    required
                    className="h-11"
                  />
                </div>
              ))}
            </div>
          </OrderActionForm>
        );
      })}
    </div>
  );
}

function safeTrackingHref(value: string) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

export function OrderManagement({
  order,
  products,
  completion,
}: {
  order: OrderDetailDTO;
  products: Promise<ProductThumbnails>;
  completion: ReturnType<typeof readOrderCompletion>;
}) {
  return (
    <section className="space-y-3" aria-labelledby="order-management-title">
      <h2
        id="order-management-title"
        className="text-lg font-semibold text-[color-mix(in_oklch,var(--brand-accent)_30%,var(--foreground))]"
      >
        Preparaciones y envíos
      </h2>
      <Suspense
        fallback={
          <Skeleton
            className="h-44 w-full"
            aria-label="Cargando preparaciones y envíos"
          />
        }
      >
        <OrderManagementOptions
          order={order}
          products={products}
          completion={completion}
        />
      </Suspense>
    </section>
  );
}

async function OrderManagementOptions({
  order,
  products,
  completion: completionRequest,
}: {
  order: OrderDetailDTO;
  products: Promise<ProductThumbnails>;
  completion: ReturnType<typeof readOrderCompletion>;
}) {
  const result = await completionRequest;
  if (!result.data) return <DataError message={result.error} />;
  const completion = result.data;
  const capabilities = orderCapabilities(order, completion);
  const pendingUnits = (order.items ?? []).reduce(
    (total, item) => total + (remainingToPrepare(item) ?? 0),
    0,
  );
  return (
    <div>
      {order.status === "pending" && capabilities.prepare ? (
        <OrderManagementOption
          label="Preparar artículos"
          value={`${pendingUnits} ${pendingUnits === 1 ? "unidad pendiente" : "unidades pendientes"}`}
        >
          <Suspense
            fallback={
              <Skeleton
                className="h-40 w-full"
                aria-label="Cargando almacén aprobado"
              />
            }
          >
            <PreparationForm
              order={order}
              products={products}
              completion={completion}
            />
          </Suspense>
        </OrderManagementOption>
      ) : order.status === "pending" && preparationIssue(order) ? (
        <p role="status" className="py-3 text-sm text-muted-foreground">
          {preparationIssue(order)}
        </p>
      ) : null}
      {order.fulfillments?.length ? (
        order.fulfillments.map((fulfillment, index) => {
          const isPickup = completion.pickup_fulfillment_ids.includes(
            fulfillment.id,
          );
          const status = fulfillment.canceled_at
            ? "canceled"
            : fulfillment.delivered_at
              ? "delivered"
              : fulfillment.shipped_at
                ? "shipped"
                : "prepared";
          const items = [
            ...new Map(
              fulfillment.items?.map((item) => {
                const line = order.items?.find(
                  (line) => line.id === item.line_item_id,
                );
                return [
                  item.line_item_id ?? item.id,
                  {
                    id: item.line_item_id ?? item.id,
                    title: line?.title ?? item.title,
                    thumbnail: line?.thumbnail,
                    product_id: line?.product_id,
                  },
                ] as const;
              }),
            ).values(),
          ];
          const itemSummary =
            items.length === 1
              ? items[0].title
              : items.length
                ? `${items.length} artículos`
                : "Artículos no disponibles";
          return (
            <OrderManagementOption
              key={fulfillment.id}
              label={`${isPickup ? "Recogida en tienda" : "Preparación"} ${index + 1}`}
              value={
                <span className="flex flex-wrap items-center justify-end gap-2">
                  <span className="max-w-64 truncate">{itemSummary}</span>
                  <FulfillmentStatusBadge status={status} />
                </span>
              }
            >
              <div className="space-y-5">
                <FulfillmentStatusBadge status={status} />
                <ul className="space-y-3 text-sm">
                  {items.map((item) => (
                    <li key={item.id} className="flex items-center gap-3">
                      <OrderItemThumbnail
                        item={item}
                        products={products}
                        className="size-10"
                      />
                      <span>{item.title}</span>
                    </li>
                  ))}
                </ul>
                {fulfillment.shipped_at ? (
                  <p className="text-sm text-muted-foreground">
                    Enviado el {formatDate(fulfillment.shipped_at)}
                  </p>
                ) : null}
                {fulfillment.delivered_at ? (
                  <p className="text-sm text-muted-foreground">
                    Entregado el {formatDate(fulfillment.delivered_at)}
                  </p>
                ) : null}
                {fulfillment.labels?.map((label) => {
                  const href = safeTrackingHref(label.tracking_url);
                  return (
                    <p key={label.id} className="break-all text-sm">
                      Seguimiento:{" "}
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-primary underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {label.tracking_number}
                          <span className="sr-only">
                            {" "}
                            (abre en una nueva pestaña)
                          </span>
                        </a>
                      ) : (
                        label.tracking_number
                      )}
                    </p>
                  );
                })}
                {order.status === "pending" &&
                !fulfillment.canceled_at &&
                !fulfillment.delivered_at ? (
                  isPickup ? (
                    !fulfillment.shipped_at ? (
                      <OrderActionForm
                        orderId={order.id}
                        fulfillmentId={fulfillment.id}
                        action="cancel_fulfillment"
                        label="Cancelar preparación"
                        confirmation="Confirmo que estos artículos todavía no fueron recogidos."
                        destructive
                      />
                    ) : null
                  ) : fulfillment.shipped_at ? (
                    <OrderActionForm
                      orderId={order.id}
                      fulfillmentId={fulfillment.id}
                      action="deliver"
                      label="Marcar como entregado"
                      confirmation="Confirmo que el cliente recibió estos artículos. Si no quedan artículos pendientes, el pedido se completará automáticamente."
                    />
                  ) : (
                    <>
                      <OrderActionForm
                        orderId={order.id}
                        fulfillmentId={fulfillment.id}
                        action="ship"
                        label="Registrar envío"
                        adjacentAction={
                          <OrderActionForm
                            orderId={order.id}
                            fulfillmentId={fulfillment.id}
                            action="cancel_fulfillment"
                            label="Cancelar preparación"
                            confirmation="Confirmo que estos artículos todavía no fueron enviados."
                            destructive
                          />
                        }
                      >
                        <div className="space-y-2">
                          <label
                            htmlFor={`tracking-${fulfillment.id}`}
                            className="text-sm"
                          >
                            Número de seguimiento (opcional)
                          </label>
                          <Input
                            id={`tracking-${fulfillment.id}`}
                            name="tracking_number"
                            maxLength={200}
                            className="h-11"
                          />
                        </div>
                        <div className="space-y-2">
                          <label
                            htmlFor={`tracking-url-${fulfillment.id}`}
                            className="text-sm"
                          >
                            Enlace de seguimiento (opcional)
                          </label>
                          <Input
                            id={`tracking-url-${fulfillment.id}`}
                            name="tracking_url"
                            type="url"
                            maxLength={2000}
                            placeholder="https://"
                            className="h-11"
                          />
                        </div>
                      </OrderActionForm>
                    </>
                  )
                ) : null}
              </div>
            </OrderManagementOption>
          );
        })
      ) : (
        <p className="py-3 text-sm text-muted-foreground">
          Sin preparaciones registradas.
          {order.status !== "pending" ? ` ${preparationIssue(order)}` : null}
        </p>
      )}
      {capabilities.complete ? (
        <OrderManagementOption
          label="Completar pedido"
          value="Listo para completar"
        >
          <OrderActionForm
            orderId={order.id}
            action="complete"
            label="Completar pedido"
            confirmation="Confirmo que la gestión de este pedido terminó."
          />
        </OrderManagementOption>
      ) : null}
    </div>
  );
}
