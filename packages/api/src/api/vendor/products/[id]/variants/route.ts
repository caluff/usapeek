import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import type { VendorAddProductVariantType } from "@mercurjs/core/api/vendor/products/validators";
import type { ProductChangeDTO } from "@mercurjs/types";
import { catalogPermissionEditProductWorkflow } from "../../../../../workflows/catalog-permission-edit-product";

export { GET } from "@mercurjs/core/api/vendor/products/[id]/variants/route";

export async function POST(
  req: AuthenticatedMedusaRequest<VendorAddProductVariantType>,
  res: MedusaResponse<{ product_change: ProductChangeDTO }>,
) {
  const { result } = await catalogPermissionEditProductWorkflow(req.scope).run({
    input: {
      seller_id: req.seller_context?.seller_id || "",
      member_id: req.auth_context.actor_id,
      product_id: req.params.id,
      mode: "variant",
      body: req.validatedBody,
      operations: [
        {
          type: "add",
          variant: { ...req.validatedBody, manage_inventory: false },
        },
      ],
    },
  });
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
  const {
    data: [product_change],
  } = await query.graph(
    {
      entity: "product_change",
      fields: ["*", "actions.*"],
      filters: { id: result.product_change_id },
    },
    { cache: { enable: false } },
  );
  if (!product_change) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "Product change not found.",
    );
  }
  res.status(202).json({
    product_change: product_change as unknown as ProductChangeDTO,
  });
}
