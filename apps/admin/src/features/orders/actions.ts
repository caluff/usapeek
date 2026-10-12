"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireAdminSdk } from "@/lib/auth-sdk";
import { orderActionError, type OrderActionState } from "./helpers";
import { operateOrder } from "./operations";

export async function orderAction(
  _previous: OrderActionState,
  form: FormData,
): Promise<OrderActionState> {
  try {
    const sdk = await requireAdminSdk();
    const id = await operateOrder(sdk, form);
    revalidatePath(`/dashboard/orders/${id}`);
    revalidatePath("/dashboard/orders");
    revalidatePath("/dashboard");
    return { status: "success", message: "Pedido actualizado." };
  } catch (error) {
    unstable_rethrow(error);
    return {
      status: "error",
      message: orderActionError(error),
    };
  }
}
