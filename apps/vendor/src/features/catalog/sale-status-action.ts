"use server";

import { revalidatePath } from "next/cache";
import { authorizeVendor, errorMessage } from "../workspace/data";
import { scopedClient } from "../workspace/operations";
import { resourceId, textField } from "../workspace/validation";
import type { MutationState } from "../workspace/presentation";

export async function saleStatusAction(
  _previous: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    const client = scopedClient(await authorizeVendor());
    const productId = resourceId(textField(form, "product_id", true));
    const paused = textField(form, "paused", true);
    if (paused !== "true" && paused !== "false")
      throw new Error("Selecciona un estado válido.");
    await client.post("/vendor/product-sale-status", {
      product_id: productId,
      paused: paused === "true",
    });
    revalidatePath("/seller/catalog", "layout");
    return {
      status: "success",
      message:
        paused === "true"
          ? "Venta pausada. Se conservan tus precios y existencias."
          : "Venta reactivada.",
    };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}
