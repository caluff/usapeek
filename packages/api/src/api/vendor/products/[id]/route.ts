import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import type { VendorUpdateProductType } from "@mercurjs/core/api/vendor/products/validators";
import type { ProductChangeDTO } from "@mercurjs/types";
import { catalogPermissionEditProductWorkflow } from "../../../../workflows/catalog-permission-edit-product";
import { stageLockedVendorProductDeletionWorkflow } from "../../../../workflows/stage-locked-vendor-product-deletion";

export { GET } from "@mercurjs/core/api/vendor/products/[id]/route";

export async function DELETE(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse<{ product_change: ProductChangeDTO }>,
) {
  const { result } = await stageLockedVendorProductDeletionWorkflow(
    req.scope,
  ).run({
    input: {
      product_id: req.params.id,
      created_by: req.seller_context!.seller_id,
    },
  });
  const {
    data: [product_change],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph(
    {
      entity: "product_change",
      fields: ["*", "actions.*"],
      filters: { id: result.id },
    },
    { cache: { enable: false } },
  );
  res.status(202).json({
    product_change: (product_change ?? result) as unknown as ProductChangeDTO,
  });
}

export async function POST(
  req: AuthenticatedMedusaRequest<VendorUpdateProductType>,
  res: MedusaResponse<{ product_change: ProductChangeDTO }>,
) {
  const { result } = await catalogPermissionEditProductWorkflow(req.scope).run({
    input: {
      seller_id: req.seller_context?.seller_id || "",
      member_id: req.auth_context.actor_id,
      product_id: req.params.id,
      mode: "update",
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
