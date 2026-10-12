"use server";

import { FetchError } from "@medusajs/js-sdk";
import type { CustomerReturnsResponse } from "@usapeek/api/finance-contracts";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { createCustomerSdk, getCustomerSessionToken } from "@/lib/auth-sdk";
import { returnPayload, type ReturnState } from "./return-form";

export async function requestReturnAction(
  orderId: string,
  form: FormData,
): Promise<ReturnState> {
  let payload: ReturnType<typeof returnPayload>;
  try {
    payload = returnPayload(form);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Revisa la solicitud.",
    };
  }
  const token = await getCustomerSessionToken();
  const sdk = token ? createCustomerSdk(token) : null;
  if (!sdk)
    return {
      status: "error",
      message: "Tu sesión venció. Vuelve a iniciar sesión.",
    };
  if (!/^order_[a-zA-Z0-9]+$/.test(orderId))
    return { status: "error", message: "El pedido no es válido." };
  try {
    const data = await sdk.client.fetch<CustomerReturnsResponse>(
      `/store/orders/${orderId}/returns`,
      { method: "POST", body: payload, cache: "no-store" },
    );
    revalidatePath(`/account/orders/${orderId}`);
    revalidatePath("/account/orders");
    return {
      status: "success",
      message: "Solicitud registrada. Consulta su estado en el pedido.",
      data,
    };
  } catch (error) {
    unstable_rethrow(error);
    return {
      status: "error",
      message:
        error instanceof FetchError &&
        [400, 403, 409].includes(error.status ?? 0)
          ? error.message
          : error instanceof FetchError && error.status === 404
            ? "No encontramos este pedido en tu cuenta."
            : error instanceof FetchError && error.status === 401
              ? "Tu sesión venció. Vuelve a iniciar sesión."
              : "No se pudo confirmar la solicitud. Actualiza el pedido; si reintentas, conserva los mismos artículos, cantidades y motivo.",
    };
  }
}
