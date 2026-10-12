import type { MedusaContainer } from "@medusajs/framework/types";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import { ProductChangeActionType, ProductChangeStatus } from "@mercurjs/types";
import { readCatalogPermission } from "../catalog-permission/read";
import type {
  ProductLifecycleOperation,
  ProductLifecycleState,
} from "../catalog-management/contracts";

export async function readProductLifecycleState(
  container: MedusaContainer,
  sellerId: string,
  productId: string,
): Promise<ProductLifecycleState> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const [
    { data: products },
    { data: additions },
    { data: otherOffers },
    { data: otherAssignments },
    { data: pending },
    { data: publications },
    permission,
  ] = await Promise.all([
    query.graph(
      {
        entity: "product",
        fields: ["id", "status"],
        filters: { id: productId },
      },
      { cache: { enable: false }, throwIfKeyNotFound: true },
    ),
    query.graph(
      {
        entity: "product_change_action",
        fields: ["id"],
        filters: {
          product_id: productId,
          action: ProductChangeActionType.PRODUCT_ADD,
          product_change: {
            created_by: sellerId,
          },
        },
        pagination: { take: 1 },
      },
      { cache: { enable: false } },
    ),
    query.graph(
      {
        entity: "offer",
        fields: ["id"],
        filters: {
          product_id: productId,
          seller_id: { $ne: sellerId },
        },
        pagination: { take: 1 },
      },
      { cache: { enable: false } },
    ),
    query.graph(
      {
        entity: "product_seller",
        fields: ["seller_id"],
        filters: {
          product_id: productId,
          seller_id: { $ne: sellerId },
        },
        pagination: { take: 1 },
      },
      { cache: { enable: false } },
    ),
    query.graph(
      {
        entity: "product_change",
        fields: ["id"],
        filters: {
          product_id: productId,
          status: ProductChangeStatus.PENDING,
        },
        pagination: { take: 1 },
      },
      { cache: { enable: false } },
    ),
    query.graph(
      {
        entity: "product_change_action",
        fields: ["details"],
        filters: {
          product_id: productId,
          action: ProductChangeActionType.STATUS_CHANGE,
          product_change: { status: ProductChangeStatus.CONFIRMED },
        },
      },
      { cache: { enable: false } },
    ),
    readCatalogPermission(container, sellerId),
  ]);
  const product = products[0];
  if (!product)
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Producto no encontrado.",
    );
  const reason = !additions.length
    ? "Solo puedes gestionar la disponibilidad de los productos creados por tu tienda."
    : otherOffers.length || otherAssignments.length
      ? "Este producto es compartido con otras tiendas. Su disponibilidad la gestiona el operador."
      : pending.length
        ? "Hay cambios pendientes de revisión en este producto."
        : null;
  const wasPublished = publications.some(
    ({ details }) =>
      details &&
      typeof details === "object" &&
      (("status" in details && details.status === "published") ||
        ("previous_status" in details &&
          details.previous_status === "published")),
  );
  return {
    can_manage: reason === null,
    can_activate: reason === null && product.status === "draft" && wasPublished,
    status: product.status,
    requires_review: permission.mode !== "authorized",
    reason,
  };
}

export function assertProductLifecycleOperation(
  state: ProductLifecycleState,
  operation: ProductLifecycleOperation,
) {
  if (!state.can_manage)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      state.reason || "No puedes gestionar este producto.",
    );
  if (operation === "deactivate" && state.status !== "published")
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Solo se puede quitar de la tienda un producto publicado.",
    );
  if (operation === "activate" && !state.can_activate)
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Solo se puede reactivar un producto publicado anteriormente y retirado de la tienda.",
    );
}
