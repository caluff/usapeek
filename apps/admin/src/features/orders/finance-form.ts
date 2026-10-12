import type {
  OrderFinanceInput,
  OrderFinanceResponse,
} from "@usapeek/api/finance-contracts";

export type FinanceActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  data?: OrderFinanceResponse;
};

export function availableFinanceOperations(
  finance: Pick<
    OrderFinanceResponse["finance"],
    "capture" | "refund" | "cancellation"
  >,
) {
  const options: Array<{ value: OrderFinanceInput["action"]; label: string }> =
    [];
  if (finance.capture.allowed)
    options.push({ value: "capture", label: "Cobrar compra" });
  if (finance.refund.allowed)
    options.push({ value: "refund", label: "Reembolsar" });
  if (finance.cancellation.allowed)
    options.push({ value: "cancel", label: "Cancelar pedido" });
  return options;
}

export function financePayload(form: FormData): OrderFinanceInput {
  const action = form.get("action");
  const note = String(form.get("note") ?? "").trim();
  const requestId = String(form.get("request_id") ?? "");
  if (action !== "cancel" && action !== "refund" && action !== "capture")
    throw new Error("Operación no disponible.");
  if (form.get("confirm") !== "yes")
    throw new Error("Confirma la operación para continuar.");
  if (note.length < 3 || note.length > 500)
    throw new Error("Escribe un motivo de entre 3 y 500 caracteres.");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      requestId,
    )
  )
    throw new Error("La solicitud no es válida. Actualiza la página.");
  const amount = action === "refund" ? Number(form.get("amount")) : undefined;
  if (action === "refund" && (!Number.isFinite(amount) || amount! <= 0))
    throw new Error("Indica un importe mayor que cero.");
  return {
    action,
    note,
    request_id: requestId,
    confirm: true,
    ...(amount === undefined ? {} : { amount }),
  };
}

// Keep the submitted payload identity across transport failures, including retries.
export function financeRequest(
  form: FormData,
  previous: { fingerprint: string; id: string } | null,
  createId: () => string,
) {
  const fingerprint = JSON.stringify([
    form.get("action"),
    form.get("action") === "refund" ? Number(form.get("amount")) : null,
    String(form.get("note") ?? "").trim(),
    form.get("confirm"),
  ]);
  return previous?.fingerprint === fingerprint
    ? previous
    : { fingerprint, id: createId() };
}
