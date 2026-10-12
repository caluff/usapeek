import type { StoreOrderCancellationInput } from "@usapeek/api/finance-contracts";

export type CancellationState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export function cancellationPayload(
  form: FormData,
): StoreOrderCancellationInput {
  const note = String(form.get("note") ?? "").trim();
  const requestId = String(form.get("request_id") ?? "");
  if (note.length < 3 || note.length > 500)
    throw new Error("Escribe un motivo de entre 3 y 500 caracteres.");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      requestId,
    )
  )
    throw new Error("La solicitud no es válida. Actualiza el pedido.");
  if (form.get("confirm") !== "yes")
    throw new Error("Confirma la cancelación para continuar.");
  return { note, request_id: requestId, confirm: true };
}

export function cancellationRequest(
  note: string,
  previous: { note: string; id: string } | null,
  createId: () => string,
) {
  const normalizedNote = note.trim();
  return previous?.note === normalizedNote
    ? previous
    : { note: normalizedNote, id: createId() };
}
