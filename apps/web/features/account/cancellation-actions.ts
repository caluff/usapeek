"use server";

import { FetchError } from "@medusajs/js-sdk";
import type { StoreOrderCancellationResponse } from "@usapeek/api/finance-contracts";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { createCustomerSdk, getCustomerSessionToken } from "@/lib/auth-sdk";
import {
  cancellationPayload,
  type CancellationState,
} from "./cancellation-form";

export async function cancelOrderAction(
  orderId: string,
  form: FormData,
): Promise<CancellationState> {
  let payload: ReturnType<typeof cancellationPayload>;
  try {
    payload = cancellationPayload(form);
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Revisa el motivo de cancelación.",
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
    const result = await sdk.client.fetch<StoreOrderCancellationResponse>(
      `/store/orders/${orderId}/cancellation`,
      {
        method: "POST",
        body: payload,
        cache: "no-store",
      },
    );
    if (!result.canceled)
      return {
        status: "error",
        message:
          "No pudimos confirmar la cancelación. Actualiza el pedido antes de reintentar.",
      };
    revalidatePath(`/account/orders/${orderId}`);
    revalidatePath("/account/orders");
    return { status: "success", message: "Pedido cancelado." };
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
              : "No se pudo confirmar la cancelación. Actualiza el pedido para consultar su estado; si reintentas, conserva el mismo motivo.",
    };
  }
}
