import type {
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { GET as listProductCategories } from "@mercurjs/core/api/store/product-categories/route";
import { ProductStatus } from "@mercurjs/types";

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const filters = req.filterableFields ?? {};

  // Match the published products in the Store catalog before counting/paging.
  req.filterableFields = {
    ...filters,
    $and: [
      ...(Array.isArray(filters.$and) ? filters.$and : []),
      { products: { status: ProductStatus.PUBLISHED } },
    ],
  };

  return listProductCategories(req, res);
}
