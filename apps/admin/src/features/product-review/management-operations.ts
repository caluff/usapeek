import type Medusa from "@medusajs/js-sdk";
import { FetchError } from "@medusajs/js-sdk";
import type { HttpTypes } from "@medusajs/types";
import type { AdminCatalogProductManageInput } from "@usapeek/api/catalog-management-contracts";
import type { ProductChangeDTO } from "@mercurjs/types";
import type { ProductReviewState } from "./helpers";
import {
  type ProductContentInput,
  type ProductVisibilityAction,
} from "./management";

export async function readManagedProduct(sdk: Medusa, productId: string) {
  const [result, preview] = await Promise.all([
    sdk.admin.product.retrieve(productId, {
      fields: "id,title,subtitle,description,status,updated_at",
    }),
    sdk.client.fetch<{ product_change: ProductChangeDTO | null }>(
      `/admin/products/${encodeURIComponent(productId)}/preview`,
      { cache: "no-store" },
    ),
  ]);
  return {
    product: result.product,
    hasPendingChange: preview.product_change?.status === "pending",
  };
}

export function productManagementConflict(error: unknown): string | null {
  if (!(error instanceof FetchError) || error.status !== 409) return null;
  switch (error.message) {
    case "catalog_pending_change":
      return "Resuelve primero los cambios pendientes del vendedor en el detalle del producto.";
    case "catalog_status_changed":
      return "El estado del producto cambió. Actualiza el catálogo antes de continuar.";
    default:
      return "El producto cambió. Actualiza la página antes de continuar.";
  }
}

function manageProduct(
  sdk: Medusa,
  productId: string,
  body: AdminCatalogProductManageInput,
) {
  return sdk.client.fetch<HttpTypes.AdminProductResponse>(
    `/admin/catalog-products/${encodeURIComponent(productId)}/manage`,
    { method: "POST", body },
  );
}

export async function saveManagedProductContent(
  sdk: Medusa,
  productId: string,
  expectedUpdatedAt: string,
  content: ProductContentInput,
): Promise<ProductReviewState> {
  const { product } = await manageProduct(sdk, productId, {
    action: "update-content",
    expected_updated_at: expectedUpdatedAt,
    content,
  });
  if (
    product.id !== productId ||
    product.title !== content.title ||
    (product.subtitle || null) !== content.subtitle ||
    (product.description || null) !== content.description
  )
    return {
      status: "error",
      message:
        "No se pudo confirmar lo guardado. Actualiza el producto antes de reintentar.",
    };
  return { status: "success", message: "Producto actualizado." };
}

export async function setManagedProductVisibility(
  sdk: Medusa,
  productId: string,
  expectedUpdatedAt: string,
  action: ProductVisibilityAction,
): Promise<ProductReviewState> {
  const status = action === "withdraw" ? "draft" : "published";
  const { product } = await manageProduct(sdk, productId, {
    action,
    expected_updated_at: expectedUpdatedAt,
  });
  if (product.id !== productId || product.status !== status)
    return {
      status: "error",
      message:
        "No se pudo confirmar el estado. Actualiza el catálogo antes de reintentar.",
    };
  return {
    status: "success",
    message:
      action === "withdraw"
        ? "Producto retirado de la tienda."
        : "Producto publicado en la tienda.",
  };
}
