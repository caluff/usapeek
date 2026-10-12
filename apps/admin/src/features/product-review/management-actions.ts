"use server";

import { FetchError } from "@medusajs/js-sdk";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireAdminSdk } from "@/lib/auth-sdk";
import { isProductReviewId, type ProductReviewState } from "./helpers";
import {
  parseProductContent,
  parseProductVisibilityAction,
} from "./management";
import {
  productManagementConflict,
  saveManagedProductContent,
  setManagedProductVisibility,
} from "./management-operations";

function revalidateProduct(productId: string) {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/product-review");
  revalidatePath(`/dashboard/product-review/${productId}`);
  revalidatePath(`/dashboard/product-review/${productId}/edit`);
}

function mutationFailure(error: unknown): ProductReviewState {
  unstable_rethrow(error);
  const conflict = productManagementConflict(error);
  if (conflict) return { status: "error", message: conflict };
  const status = error instanceof FetchError ? error.status : undefined;
  return {
    status: "error",
    message:
      status === 403
        ? "Tu cuenta no tiene permisos para gestionar este producto."
        : status === 401
          ? "Tu sesión venció. Vuelve a iniciar sesión."
          : status === 404
            ? "El producto ya no está disponible. Actualiza el catálogo."
            : "No se pudo confirmar el cambio. Actualiza el producto antes de reintentar.",
  };
}

export async function saveProductContentAction(
  productId: string,
  _previous: ProductReviewState,
  formData: FormData,
): Promise<ProductReviewState> {
  const content = parseProductContent(formData);
  const expectedUpdatedAt = formData.get("expected_updated_at");
  if (
    !isProductReviewId(productId) ||
    !content ||
    typeof expectedUpdatedAt !== "string" ||
    !expectedUpdatedAt
  )
    return {
      status: "error",
      message: "Revisa el nombre y la longitud de los campos del producto.",
    };
  try {
    const result = await saveManagedProductContent(
      await requireAdminSdk(),
      productId,
      expectedUpdatedAt,
      content,
    );
    if (result.status === "success") revalidateProduct(productId);
    return result;
  } catch (error) {
    return mutationFailure(error);
  }
}

export async function changeProductVisibilityAction(
  productId: string,
  expectedUpdatedAt: string,
  requestedAction: unknown,
): Promise<ProductReviewState> {
  const action = parseProductVisibilityAction(requestedAction);
  if (
    !isProductReviewId(productId) ||
    typeof expectedUpdatedAt !== "string" ||
    !expectedUpdatedAt ||
    !action
  )
    return {
      status: "error",
      message: "La operación no es válida. Actualiza el catálogo.",
    };
  try {
    const result = await setManagedProductVisibility(
      await requireAdminSdk(),
      productId,
      expectedUpdatedAt,
      action,
    );
    if (result.status === "success") revalidateProduct(productId);
    return result;
  } catch (error) {
    return mutationFailure(error);
  }
}
