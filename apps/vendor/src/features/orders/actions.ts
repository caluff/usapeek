"use server";

import { revalidatePath } from "next/cache";
import { authorizeVendor, errorMessage } from "../workspace/data";
import type { MutationState } from "../workspace/presentation";
import { resourceId, textField } from "../workspace/validation";
import { orderOperations } from "./operations";

export async function updateOrderAction(
  _previous: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    await orderOperations(authorizeVendor).execute(form);
    revalidatePath(
      `/seller/orders/${resourceId(textField(form, "order_id", true))}`,
    );
    revalidatePath("/seller/orders");
    revalidatePath("/seller");
    return { status: "success", message: "Pedido actualizado." };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}
