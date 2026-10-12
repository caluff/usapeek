import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { VendorGetInventoryItemsParamsType } from "@mercurjs/core/api/vendor/inventory-items/validators";
import type { HttpTypes } from "@mercurjs/types";
import { inventoryIdsByProductName } from "../../../lib/inventory/product-name-search";

export { POST } from "@mercurjs/core/api/vendor/inventory-items/route";

export async function GET(
  req: AuthenticatedMedusaRequest<VendorGetInventoryItemsParamsType>,
  res: MedusaResponse<HttpTypes.VendorInventoryItemListResponse>,
) {
  // Native middleware validates the query and restricts id to seller-owned items.
  const { q, ...filters } = req.filterableFields;
  if (typeof q === "string" && q.trim()) {
    const matchingIds = await inventoryIdsByProductName(
      req.scope,
      req.seller_context!.seller_id,
      q.trim(),
    );
    const ownedIds = new Set(
      Array.isArray(filters.id) ? filters.id : filters.id ? [filters.id] : [],
    );
    filters.id = matchingIds.filter((id) => ownedIds.has(id));
  }

  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const { data: inventory_items, metadata } = await query.graph({
    entity: "inventory_item",
    fields: req.queryConfig.fields,
    filters,
    pagination: req.queryConfig.pagination,
  });
  res.json({
    inventory_items,
    count: metadata?.count ?? 0,
    offset: metadata?.skip ?? 0,
    limit: metadata?.take ?? 0,
  });
}
