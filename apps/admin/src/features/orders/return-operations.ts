import type Medusa from "@medusajs/js-sdk";
import type {
  HttpTypes,
  OrderChangeActionDTO,
  OrderChangeDTO,
  OrderLineItemDTO,
  OrderReturnItemDTO,
  ReturnDTO,
  StockLocationDTO,
} from "@medusajs/types";

export type ReturnRecord = Pick<
  ReturnDTO,
  "id" | "order_id" | "display_id" | "received_at" | "canceled_at"
> & {
  location_id?: ReturnDTO["location_id"] | null;
  requested_at?: ReturnDTO["requested_at"] | null;
  status?: HttpTypes.AdminReturn["status"];
  metadata?: ReturnDTO["metadata"];
  items: Pick<
    OrderReturnItemDTO,
    "id" | "item_id" | "quantity" | "received_quantity" | "damaged_quantity"
  >[];
};
export type ReturnLine = Pick<OrderLineItemDTO, "id" | "title" | "quantity"> & {
  detail?: Partial<
    Pick<
      OrderLineItemDTO["detail"],
      | "fulfilled_quantity"
      | "return_requested_quantity"
      | "return_received_quantity"
      | "return_dismissed_quantity"
    >
  >;
};
export type ReturnLocation = Pick<StockLocationDTO, "id" | "name">;
export type ReturnChange = Pick<
  OrderChangeDTO,
  "id" | "order_id" | "return_id" | "status"
> & { actions?: Pick<OrderChangeActionDTO, "id" | "action" | "details">[] };
export type ReturnActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

type NativeReturnSdk = Medusa["admin"]["return"];
export type ReturnClient = Pick<
  NativeReturnSdk,
  | "initiateRequest"
  | "addReturnItem"
  | "updateRequest"
  | "confirmRequest"
  | "cancelRequest"
  | "cancel"
  | "initiateReceive"
  | "receiveItems"
  | "dismissItems"
  | "confirmReceive"
  | "cancelReceive"
> & {
  retrieve(id: string): Promise<{ return: Omit<ReturnRecord, "metadata"> }>;
  changes(orderId: string): Promise<{ order_changes: ReturnChange[] }>;
};

export const RETURN_FIELDS =
  "id,order_id,display_id,status,location_id,metadata,requested_at,received_at,canceled_at,items.*";
export const RETURN_CHANGE_FIELDS = "id,order_id,return_id,status,actions.*";

export function customerReturnDetails(metadata: ReturnRecord["metadata"]) {
  const customerRequest = metadata?.usapeek_customer_return;
  const request =
    customerRequest &&
    typeof customerRequest === "object" &&
    !Array.isArray(customerRequest)
      ? (customerRequest as Record<string, unknown>)
      : null;
  if (!request) return null;
  return {
    reason:
      request.reason === "damaged" || request.reason === "wrong_item"
        ? request.reason
        : undefined,
    note:
      typeof request.note === "string"
        ? request.note.slice(0, 1000)
        : undefined,
  };
}

export function returnPanelRecord(record: ReturnRecord): ReturnRecord {
  const request = customerReturnDetails(record.metadata);
  return {
    id: record.id,
    order_id: record.order_id,
    display_id: record.display_id,
    location_id: record.location_id,
    requested_at: record.requested_at,
    received_at: record.received_at,
    canceled_at: record.canceled_at,
    status: record.status,
    items: record.items.map((item) => ({
      id: item.id,
      item_id: item.item_id,
      quantity: item.quantity,
      received_quantity: item.received_quantity,
      damaged_quantity: item.damaged_quantity,
    })),
    metadata: request
      ? {
          usapeek_customer_return: request,
        }
      : undefined,
  };
}

export function activeReturnChange(changes: ReturnChange[], returnId: string) {
  return changes.find(
    (change) =>
      change.return_id === returnId &&
      (change.status === "pending" || change.status === "requested"),
  );
}

export function returnActionLines(change: ReturnChange | undefined) {
  return (change?.actions ?? []).flatMap((action) => {
    const itemId = action.details?.reference_id;
    const quantity = Number(action.details?.quantity);
    if (
      ![
        "RETURN_ITEM",
        "RECEIVE_RETURN_ITEM",
        "RECEIVE_DAMAGED_RETURN_ITEM",
      ].includes(action.action) ||
      typeof itemId !== "string" ||
      !Number.isSafeInteger(quantity) ||
      quantity <= 0
    )
      return [];
    return [
      {
        id: action.id,
        itemId,
        quantity,
        damaged: action.action === "RECEIVE_DAMAGED_RETURN_ITEM",
      },
    ];
  });
}

export function returnLabel(record: ReturnRecord, change?: ReturnChange) {
  if (record.canceled_at || record.status === "canceled") return "Cancelada";
  if (record.status === "received") return "Recibida";
  if (!record.requested_at) return "Solicitud pendiente";
  if (change) return "Recepción en borrador";
  return record.status === "partially_received"
    ? "Recibida parcialmente"
    : "Esperando artículos";
}

export function availableReturnQuantity(
  item: ReturnLine,
  records: ReturnRecord[],
) {
  const reserved = records
    .filter((record) => !record.canceled_at && record.status !== "canceled")
    .flatMap((record) => record.items ?? [])
    .filter((line) => line.item_id === item.id)
    .reduce((sum, line) => sum + Number(line.quantity), 0);
  const fulfilled = Number(item.detail?.fulfilled_quantity ?? 0);
  const requested = Number(item.detail?.return_requested_quantity ?? 0);
  const received = Number(item.detail?.return_received_quantity ?? 0);
  const dismissed = Number(item.detail?.return_dismissed_quantity ?? 0);
  const ordered = Number(item.quantity);
  if (
    ![fulfilled, requested, received, dismissed, reserved, ordered].every(
      (quantity) => Number.isSafeInteger(quantity) && quantity >= 0,
    )
  )
    return 0;
  return Math.max(
    0,
    Math.min(ordered, fulfilled) -
      Math.max(requested + received + dismissed, reserved),
  );
}

export function canCancelReturn(record: ReturnRecord, hasActiveChange = false) {
  return (
    Boolean(record.requested_at) &&
    !hasActiveChange &&
    !record.canceled_at &&
    record.status === "requested" &&
    record.items.every(
      (item) =>
        Number(item.received_quantity ?? 0) === 0 &&
        Number(item.damaged_quantity ?? 0) === 0,
    )
  );
}

function resource(form: FormData, field: string, prefix: string) {
  const value = form.get(field);
  if (
    typeof value !== "string" ||
    !new RegExp(`^${prefix}_[a-zA-Z0-9]+$`).test(value)
  )
    throw new Error("El registro no es válido. Actualiza el pedido.");
  return value;
}

export function returnQuantities(form: FormData, prefix: string) {
  const items: { id: string; quantity: number }[] = [];
  const ids = new Set<string>();
  for (const [field, value] of form.entries()) {
    if (!field.startsWith(`${prefix}:`)) continue;
    const id = field.slice(prefix.length + 1);
    const quantity =
      typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
    if (
      !/^orli_[a-zA-Z0-9]+$/.test(id) ||
      ids.has(id) ||
      !Number.isSafeInteger(quantity) ||
      quantity < 0
    )
      throw new Error("Ingresa cantidades enteras válidas.");
    ids.add(id);
    if (quantity > 0) items.push({ id, quantity });
  }
  return items;
}

export async function operateReturn(client: ReturnClient, form: FormData) {
  const orderId = resource(form, "order_id", "order");
  const action = form.get("operation");
  if (
    ![
      "create",
      "add_items",
      "confirm_request",
      "cancel_request",
      "cancel_return",
      "begin_receive",
      "stage_receive",
      "confirm_receive",
      "cancel_receive",
    ].includes(String(action))
  )
    throw new Error("La operación no está disponible.");
  if (
    [
      "confirm_request",
      "cancel_request",
      "cancel_return",
      "confirm_receive",
      "cancel_receive",
    ].includes(String(action)) &&
    form.get("confirmed") !== "yes"
  )
    throw new Error("Confirma la operación antes de continuar.");

  if (action === "create") {
    const items = returnQuantities(form, "quantity");
    if (!items.length)
      throw new Error("Selecciona al menos una unidad para devolver.");
    const locationId = resource(form, "location_id", "sloc");
    const note = form.get("note");
    if (typeof note !== "string" || note.length > 1000)
      throw new Error("El motivo debe tener como máximo 1000 caracteres.");
    const { return: record } = await client.initiateRequest({
      order_id: orderId,
      location_id: locationId,
      internal_note: note.trim() || undefined,
    });
    try {
      await client.addReturnItem(record.id, { items });
    } catch {
      throw new Error(
        "Se creó un borrador, pero no se guardaron todos sus artículos. Actualiza el pedido y revisa la solicitud antes de reintentar.",
      );
    }
    return orderId;
  }

  const returnId = resource(form, "return_id", "return");
  const [{ return: record }, { order_changes: changes }] = await Promise.all([
    client.retrieve(returnId),
    client.changes(orderId),
  ]);
  if (record.order_id !== orderId)
    throw new Error("La devolución no pertenece a este pedido.");
  const change = activeReturnChange(changes, returnId);
  const lines = returnActionLines(change);
  if (action === "add_items") {
    if (record.requested_at || !change || lines.length)
      throw new Error("La solicitud cambió. Actualiza el pedido.");
    const items = returnQuantities(form, "quantity");
    if (!items.length)
      throw new Error("Selecciona al menos una unidad para devolver.");
    await client.addReturnItem(returnId, { items });
  } else if (action === "confirm_request") {
    if (record.requested_at || !change || !lines.length)
      throw new Error("La solicitud debe tener artículos y estar pendiente.");
    const locationId = resource(form, "location_id", "sloc");
    if (record.location_id !== locationId)
      await client.updateRequest(returnId, { location_id: locationId });
    await client.confirmRequest(returnId, {});
  } else if (action === "cancel_request") {
    if (record.requested_at || !change)
      throw new Error("La solicitud ya no está pendiente.");
    await client.cancelRequest(returnId);
  } else if (action === "cancel_return") {
    if (
      !canCancelReturn(
        record,
        changes.some(
          (candidate) =>
            candidate.status === "pending" || candidate.status === "requested",
        ),
      )
    )
      throw new Error(
        "Solo se puede cancelar una devolución aprobada sin recepción iniciada ni unidades recibidas.",
      );
    await client.cancel(returnId);
  } else if (action === "begin_receive") {
    if (
      !record.requested_at ||
      change ||
      record.canceled_at ||
      record.status === "received"
    )
      throw new Error(
        "La devolución ya no está disponible para iniciar una recepción.",
      );
    await client.initiateReceive(returnId, {});
  } else if (action === "stage_receive") {
    if (!record.requested_at || !change || lines.length)
      throw new Error(
        "La recepción tiene cantidades guardadas. Confírmalas o descarta el borrador antes de volver a ingresarlas.",
      );
    const received = returnQuantities(form, "received");
    const damaged = returnQuantities(form, "damaged");
    if (!received.length && !damaged.length)
      throw new Error("Ingresa al menos una unidad recibida.");
    for (const item of [...received, ...damaged]) {
      const returned = record.items.find((line) => line.item_id === item.id);
      const total = [...received, ...damaged]
        .filter((line) => line.id === item.id)
        .reduce((sum, line) => sum + line.quantity, 0);
      if (
        !returned ||
        total >
          Number(returned.quantity) - Number(returned.received_quantity ?? 0)
      )
        throw new Error(
          "Las cantidades superan las unidades pendientes de recibir.",
        );
    }
    if (received.length)
      await client.receiveItems(returnId, { items: received });
    if (damaged.length) await client.dismissItems(returnId, { items: damaged });
  } else if (action === "confirm_receive") {
    if (!record.requested_at || !change || !lines.length)
      throw new Error("Guarda las cantidades recibidas antes de confirmar.");
    await client.confirmReceive(returnId, {});
  } else {
    if (!record.requested_at || !change)
      throw new Error("La recepción ya no tiene un borrador pendiente.");
    await client.cancelReceive(returnId);
  }
  return orderId;
}
