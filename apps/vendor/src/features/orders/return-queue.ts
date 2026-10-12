import type { OrderDTO, ReturnDTO } from "@medusajs/types";
import {
  DEFAULT_TABLE_PAGE_SIZE,
  parseTableOffset,
} from "@usapeek/ui/pagination-utils";
import { customerReturnDetails, type ReturnRecord } from "./return-operations";

export type ReturnQueueRecord = Pick<
  ReturnRecord,
  "id" | "order_id" | "display_id" | "status" | "requested_at" | "metadata"
> &
  Pick<ReturnDTO, "created_at"> & {
    order?: Pick<OrderDTO, "id" | "display_id" | "custom_display_id">;
  };

export function returnQueueInput(
  params: Record<string, string | string[] | undefined>,
) {
  return {
    offset: parseTableOffset(params.offset),
    limit: DEFAULT_TABLE_PAGE_SIZE,
  };
}

export function returnQueueQuery(input: ReturnType<typeof returnQueueInput>) {
  return {
    status: ["open", "requested", "partially_received"],
    fields:
      "id,order_id,display_id,status,metadata,requested_at,created_at,order.id,order.display_id,order.custom_display_id",
    limit: input.limit,
    offset: input.offset,
    order: "-created_at",
  };
}

export function returnQueueHref(offset: number) {
  return (
    "/seller/orders/returns?" + new URLSearchParams({ offset: String(offset) })
  );
}

export function returnQueueReason(record: ReturnQueueRecord) {
  const request = customerReturnDetails(record.metadata);
  return {
    origin: request ? "Cliente" : "Tienda / operador",
    reason:
      request?.reason === "damaged"
        ? "Artículo dañado"
        : request?.reason === "wrong_item"
          ? "Artículo equivocado"
          : "—",
    note: request?.note,
  };
}

export function returnQueueStatus(record: ReturnQueueRecord) {
  if (!record.requested_at) return "Solicitud pendiente";
  return record.status === "partially_received"
    ? "Recibida parcialmente"
    : "Esperando artículos";
}
