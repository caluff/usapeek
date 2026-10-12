import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import type {
  ProductAttributeBatchInput,
  ProductChangeDTO,
} from "@mercurjs/types";
import { catalogPermissionEditProductWorkflow } from "../../../../../../workflows/catalog-permission-edit-product";

export async function POST(
  req: AuthenticatedMedusaRequest<ProductAttributeBatchInput>,
  res: MedusaResponse<{ product_change: ProductChangeDTO }>,
) {
  const { result } = await catalogPermissionEditProductWorkflow(req.scope).run({
    input: {
      seller_id: req.seller_context?.seller_id || "",
      member_id: req.auth_context.actor_id,
      product_id: req.params.id,
      mode: "attributes",
      body: req.validatedBody,
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
