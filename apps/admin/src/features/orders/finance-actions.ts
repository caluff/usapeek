"use server";

import type { OrderFinanceResponse } from "@usapeek/api/finance-contracts";
import { FetchError } from "@medusajs/js-sdk";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireAdminSdk } from "@/lib/auth-sdk";
import { isOrderId } from "./helpers";
import { financePayload, type FinanceActionState } from "./finance-form";

export async function orderFinanceAction(
  id: string,
  _previous: FinanceActionState,
  form: FormData,
): Promise<FinanceActionState> {
  try {
    const payload = financePayload(form);
    const sdk = await requireAdminSdk();
    if (!isOrderId(id)) throw new Error("Pedido inválido.");
    const data = await sdk.client.fetch<OrderFinanceResponse>(
      `/admin/orders/${id}/finance`,
      { method: "POST", body: payload, cache: "no-store" },
    );
    revalidatePath(`/dashboard/orders/${id}`);
    revalidatePath("/dashboard/orders");
    revalidatePath("/dashboard");
    return {
      status: "success",
      message: "Solicitud registrada. Revisa el estado en el historial.",
      data,
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      status: "error",
      message:
        error instanceof FetchError && [400, 403, 409].includes(error.status ?? 0)
          ? error.message
          : "No se pudo confirmar la operación. Consulta el historial antes de iniciar otra solicitud; si reintentas, conserva los mismos datos.",
    };
  }
}
