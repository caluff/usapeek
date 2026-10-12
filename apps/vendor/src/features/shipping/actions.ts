"use server";

import { revalidatePath } from "next/cache";
import { authorizeVendor, errorMessage } from "../workspace/data";
import type { MutationState } from "../workspace/presentation";
import { shippingOperations } from "./operations";

export async function saveShippingAction(
  _previous: MutationState,
  form: FormData,
): Promise<MutationState> {
  try {
    await shippingOperations(authorizeVendor).save(form);
    revalidatePath("/seller/settings/shipping");
    revalidatePath("/seller/catalog", "layout");
    return { status: "success", message: "Configuración de envío guardada." };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}
