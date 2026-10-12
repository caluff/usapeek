"use server";

import { FetchError } from "@medusajs/js-sdk";
import type { CatalogPermissionResponse } from "@usapeek/api/catalog-permission-contracts";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireAdminSdk } from "@/lib/auth-sdk";
import {
  CATALOG_PERMISSION_LABELS,
  isStoreId,
  parseCatalogReviewMode,
  type CatalogPermissionState,
} from "./helpers";

export async function updateCatalogPermissionAction(
  sellerId: string,
  _previous: CatalogPermissionState,
  formData: FormData,
): Promise<CatalogPermissionState> {
  const mode = parseCatalogReviewMode(formData.get("mode"));
  if (!isStoreId(sellerId) || !mode)
    return { status: "error", message: "El permiso o la tienda no son válidos." };

  try {
    const sdk = await requireAdminSdk();
    const { catalog_permission: permission } =
      await sdk.client.fetch<CatalogPermissionResponse>(
        `/admin/sellers/${encodeURIComponent(sellerId)}/catalog-permission`,
        { method: "POST", body: { mode } },
      );
    if (
      permission.seller_id !== sellerId ||
      parseCatalogReviewMode(permission.mode) !== mode
    )
      return {
        status: "error",
        message:
          "No se pudo confirmar el permiso guardado. Actualiza el estado antes de reintentar.",
      };

    revalidatePath("/dashboard/stores");
    revalidatePath(`/dashboard/stores/${encodeURIComponent(sellerId)}`);
    revalidatePath("/dashboard/product-review");
    return {
      status: "success",
      mode,
      message: `Permiso guardado: ${CATALOG_PERMISSION_LABELS[mode]}.`,
    };
  } catch (error) {
    unstable_rethrow(error);
    const status = error instanceof FetchError ? error.status : undefined;
    return {
      status: "error",
      message:
        status === 403
          ? "Tu cuenta no tiene permisos para gestionar el catálogo de esta tienda."
          : status === 401
            ? "Tu sesión venció. Vuelve a iniciar sesión."
            : status === 404
              ? "La tienda ya no está disponible. Actualiza el estado."
              : "No se pudo confirmar el cambio. Actualiza y comprueba el permiso vigente antes de reintentar.",
    };
  }
}
