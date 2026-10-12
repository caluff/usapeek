import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import type { VendorCreateProductType } from "@mercurjs/core/api/vendor/products/validators";
import { enrichProductAttributes } from "@mercurjs/core/api/utils/format-product-attributes";
import type { HttpTypes } from "@mercurjs/types";
import { catalogPermissionCreateProductWorkflow } from "../../../workflows/catalog-permission-create-product";

export { GET } from "@mercurjs/core/api/vendor/products/route";

export async function POST(
  req: AuthenticatedMedusaRequest<VendorCreateProductType>,
  res: MedusaResponse<HttpTypes.VendorProductResponse>,
) {
  const { result } = await catalogPermissionCreateProductWorkflow(
    req.scope,
  ).run({
    input: {
      seller_id: req.seller_context?.seller_id || "",
      member_id: req.auth_context.actor_id,
      product: req.validatedBody,
    },
  });
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [product],
  } = await query.graph(
    {
      entity: "product",
      fields: req.queryConfig.fields,
      filters: { id: result.product_id },
    },
    { cache: { enable: false } },
  );
  if (!product) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product not found.");
  }
  await enrichProductAttributes(req.scope, [product]);
  res.status(201).json({
    product: product as unknown as HttpTypes.VendorProductResponse["product"],
  });
}
