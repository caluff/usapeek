"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { errorMessage } from "../workspace/data";
import { operateReturn, type ReturnActionState } from "./return-operations";
import { vendorReturnClient } from "./return-client";

export async function orderReturnAction(
  form: FormData,
): Promise<ReturnActionState> {
  const id = form.get("order_id");
  try {
    await operateReturn(await vendorReturnClient(), form);
    return { status: "success", message: "Devolución actualizada." };
  } catch (error) {
    unstable_rethrow(error);
    return { status: "error", message: errorMessage(error) };
  } finally {
    // Native drafts may have been saved before a later request was interrupted.
    if (typeof id === "string" && /^order_[a-zA-Z0-9]+$/.test(id)) {
      revalidatePath(`/seller/orders/${id}`);
      revalidatePath("/seller/orders");
      revalidatePath("/seller/orders/returns");
    }
  }
}
