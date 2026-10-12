"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireAdminSdk } from "@/lib/auth-sdk";
import { orderActionError } from "./helpers";
import {
  operateReturn,
  RETURN_CHANGE_FIELDS,
  type ReturnActionState,
} from "./return-operations";

export async function orderReturnAction(
  form: FormData,
): Promise<ReturnActionState> {
  const id = form.get("order_id");
  try {
    const sdk = await requireAdminSdk();
    const native = sdk.admin.return;
    await operateReturn(
      {
        initiateRequest: (...args) => native.initiateRequest(...args),
        addReturnItem: (...args) => native.addReturnItem(...args),
        updateRequest: (...args) => native.updateRequest(...args),
        confirmRequest: (...args) => native.confirmRequest(...args),
        cancelRequest: (...args) => native.cancelRequest(...args),
        cancel: (...args) => native.cancel(...args),
        initiateReceive: (...args) => native.initiateReceive(...args),
        receiveItems: (...args) => native.receiveItems(...args),
        dismissItems: (...args) => native.dismissItems(...args),
        confirmReceive: (...args) => native.confirmReceive(...args),
        cancelReceive: (...args) => native.cancelReceive(...args),
        retrieve: (returnId) =>
          native.retrieve(returnId, { fields: "+items.*" }),
        changes: (orderId) =>
          sdk.admin.order.listChanges(orderId, {
            fields: RETURN_CHANGE_FIELDS,
          }),
      },
      form,
    );
    return { status: "success", message: "Devolución actualizada." };
  } catch (error) {
    unstable_rethrow(error);
    return { status: "error", message: orderActionError(error) };
  } finally {
    if (typeof id === "string" && /^order_[a-zA-Z0-9]+$/.test(id)) {
      revalidatePath(`/dashboard/orders/${id}`);
      revalidatePath("/dashboard/orders");
      revalidatePath("/dashboard/orders/returns");
    }
  }
}
