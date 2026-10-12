"use server";

import type { OrderFinanceResponse } from "@usapeek/api/finance-contracts";
import { FetchError } from "@medusajs/js-sdk";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { authorizeVendor } from "../workspace/data";
import { scopedClient } from "../workspace/operations";
import { resourceId } from "../workspace/validation";
import { financePayload, type FinanceActionState } from "./finance-form";

export async function orderFinanceAction(
  id: string,
  _previous: FinanceActionState,
  form: FormData,
): Promise<FinanceActionState> {
  try {
    const payload = financePayload(form);
    const client = scopedClient(await authorizeVendor());
    resourceId(id);
    const data = await client.post<OrderFinanceResponse>(
      `/vendor/orders/${id}/finance`,
      payload,
    );
    revalidatePath(`/seller/orders/${id}`);
    revalidatePath("/seller/orders");
    revalidatePath("/seller");
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
