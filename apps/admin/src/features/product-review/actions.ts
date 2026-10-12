"use server";

import { FetchError } from "@medusajs/js-sdk";
import type { HttpTypes, ProductChangeDTO } from "@mercurjs/types";
import type { DeleteResponse } from "@medusajs/types";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireAdminSdk } from "@/lib/auth-sdk";
import {
  isProductReviewId,
  parseProductReviewDecision,
  type ProductReviewState,
} from "./helpers";

export async function reviewProductAction(
  productId: string,
  _previous: ProductReviewState,
  formData: FormData,
): Promise<ProductReviewState> {
  const decision = parseProductReviewDecision(formData.get("decision"));
  if (!isProductReviewId(productId) || !decision)
    return { status: "error", message: "La operación no es válida." };
  const note =
    typeof formData.get("note") === "string"
      ? String(formData.get("note")).trim()
      : "";
  if (
    note.length > 2000 ||
    ((decision === "reject" || decision === "request_changes") &&
      note.length < 10)
  )
    return {
      status: "error",
      message: "Explica el motivo en entre 10 y 2000 caracteres.",
    };
  try {
    const sdk = await requireAdminSdk();
    if (decision === "confirm_change" || decision === "cancel_change") {
      const changeId = formData.get("change_id");
      const { product_change: change } = await sdk.client.fetch<{
        product_change: ProductChangeDTO | null;
      }>(`/admin/products/${encodeURIComponent(productId)}/preview`, {
        cache: "no-store",
      });
      if (!change || change.id !== changeId || change.status !== "pending")
        return {
          status: "error",
          message:
            "Los cambios ya no están pendientes o pertenecen a otra revisión. Actualiza la página.",
        };
      if (decision === "confirm_change") {
        await sdk.client.fetch<DeleteResponse<"product_change">>(
          `/admin/product-changes/${encodeURIComponent(change.id)}/confirm`,
          { method: "POST", body: note ? { internal_note: note } : {} },
        );
      } else {
        await sdk.client.fetch<{ product_change: ProductChangeDTO }>(
          `/admin/product-changes/${encodeURIComponent(change.id)}/cancel`,
          { method: "POST", body: {} },
        );
      }
    } else {
      const { product } = await sdk.admin.product.retrieve(productId, {
        fields: "id,status,updated_at",
      });
      const expectedUpdatedAt = formData.get("expected_updated_at");
      if (
        product.status !== "proposed" ||
        typeof expectedUpdatedAt !== "string" ||
        !product.updated_at ||
        new Date(product.updated_at).toISOString() !== expectedUpdatedAt
      )
        return {
          status: "error",
          message:
            "El producto cambió o no está propuesto para publicación. Actualiza antes de decidir.",
        };
      const operation =
        decision === "publish"
          ? "confirm"
          : decision === "reject"
            ? "reject"
            : "request-changes";
      await sdk.client.fetch<HttpTypes.AdminProductResponse>(
        `/admin/products/${encodeURIComponent(productId)}/${operation}`,
        {
          method: "POST",
          body:
            decision === "publish"
              ? note
                ? { internal_note: note }
                : {}
              : { message: note },
        },
      );
    }
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/product-review");
    revalidatePath(`/dashboard/product-review/${productId}`);
    return {
      status: "success",
      message:
        "Decisión guardada en Mercur. Actualiza para ver el estado vigente.",
    };
  } catch (error) {
    unstable_rethrow(error);
    const status = error instanceof FetchError ? error.status : undefined;
    return {
      status: "error",
      message:
        status === 403
          ? "Tu cuenta no tiene permisos para moderar este producto."
          : status === 401
            ? "Tu sesión venció. Vuelve a iniciar sesión."
            : "No se pudo completar la decisión. Actualiza y comprueba el estado antes de reintentar.",
    };
  }
}
