import type {
  CustomerReturnInput,
  CustomerReturnsResponse,
} from "@usapeek/api/finance-contracts";

export type ReturnState = {
  status: "idle" | "success" | "error";
  message?: string;
  data?: CustomerReturnsResponse;
};

function selectedItems(form: FormData) {
  return [...form.entries()]
    .filter(([key]) => key.startsWith("quantity:"))
    .map(([key, value]) => ({
      id: key.slice("quantity:".length),
      quantity: Number(value),
    }));
}

export function returnPayload(form: FormData): CustomerReturnInput {
  const reason = form.get("reason");
  const note = String(form.get("note") ?? "").trim();
  const requestId = String(form.get("request_id") ?? "");
  const selected = selectedItems(form);
  if (reason !== "damaged" && reason !== "wrong_item")
    throw new Error("Selecciona un motivo de devolución.");
  if (note.length < 3 || note.length > 500)
    throw new Error("Describe el problema en entre 3 y 500 caracteres.");
  if (
    selected.some(
      (item) =>
        !item.id ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 0 ||
        item.quantity > 999,
    )
  )
    throw new Error("Revisa las cantidades de los artículos.");
  const items = selected.filter((item) => item.quantity > 0);
  if (
    !items.length ||
    items.length > 100 ||
    new Set(items.map((item) => item.id)).size !== items.length
  )
    throw new Error(
      "Selecciona los artículos que quieres devolver sin repetirlos.",
    );
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      requestId,
    )
  )
    throw new Error("La solicitud no es válida. Actualiza el pedido.");
  if (form.get("confirm") !== "yes")
    throw new Error("Confirma la solicitud para continuar.");
  return { reason, note, request_id: requestId, items, confirm: true };
}

export function returnRequest(
  form: FormData,
  previous: { fingerprint: string; id: string } | null,
  createId: () => string,
) {
  const fingerprint = JSON.stringify([
    form.get("reason"),
    String(form.get("note") ?? "").trim(),
    selectedItems(form)
      .filter((item) => item.quantity > 0)
      .sort((a, b) => a.id.localeCompare(b.id)),
  ]);
  return previous?.fingerprint === fingerprint
    ? previous
    : { fingerprint, id: createId() };
}
