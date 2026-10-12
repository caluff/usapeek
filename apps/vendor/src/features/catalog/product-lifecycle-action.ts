"use server";

import { revalidatePath } from "next/cache";
import type {
  ProductLifecycleResult,
  ProductLifecycleState,
} from "@usapeek/api/catalog-management-contracts";
import { authorizeVendor, errorMessage } from "../workspace/data";
import { scopedClient } from "../workspace/operations";
import { resourceId, textField } from "../workspace/validation";
import type { MutationState } from "../workspace/presentation";

export type ProductLifecycleMutationState = MutationState & {
  lifecycle?: ProductLifecycleResult;
};

export async function getProductLifecycleState(
  productId: string,
): Promise<{ data?: ProductLifecycleState; error?: string }> {
  try {
    const client = scopedClient(await authorizeVendor());
    return {
      data: await client.get<ProductLifecycleState>(
        `/vendor/product-lifecycle/${resourceId(productId)}`,
      ),
    };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function productLifecycleAction(
  _previous: ProductLifecycleMutationState,
  form: FormData,
): Promise<ProductLifecycleMutationState> {
  try {
    const client = scopedClient(await authorizeVendor());
    const productId = resourceId(textField(form, "product_id", true));
    const operation = textField(form, "operation", true);
    if (!["archive", "deactivate", "activate"].includes(operation))
      throw new Error("Selecciona una acción válida.");
    const lifecycle = await client.post<ProductLifecycleResult>(
      `/vendor/product-lifecycle/${productId}/${operation === "archive" ? "archive" : "visibility"}`,
      operation === "archive" ? {} : { active: operation === "activate" },
    );
    revalidatePath("/seller/catalog", "layout");
    const message = lifecycle.applied
      ? operation === "archive"
        ? "Producto archivado."
        : operation === "deactivate"
          ? "Producto retirado de la tienda. Se conservan sus precios y existencias."
          : "Producto reactivado en la tienda."
      : "Solicitud enviada a revisión. El cambio se aplicará cuando el operador lo apruebe.";
    return { status: "success", message, lifecycle };
  } catch (error) {
    return { status: "error", message: errorMessage(error) };
  }
}
