import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { ProductChangeDTO } from "@mercurjs/types";
import type { VariantMediaUpdate } from "../../../../../../../lib/catalog/variant-media";
import { updateVariantMediaWorkflow } from "../../../../../../../workflows/update-variant-media";

export async function POST(
  req: AuthenticatedMedusaRequest<VariantMediaUpdate>,
  res: MedusaResponse<{ product_change: ProductChangeDTO }>,
) {
  const { result } = await updateVariantMediaWorkflow(req.scope).run({
    input: {
      seller_id: req.seller_context?.seller_id || "",
      member_id: req.auth_context.actor_id,
      product_id: req.params.id,
      variant_id: req.params.variant_id,
      body: req.validatedBody,
    },
  });
  const {
    data: [product_change],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph(
    {
      entity: "product_change",
      fields: ["*", "actions.*"],
      filters: { id: result.product_change_id },
    },
    { cache: { enable: false }, throwIfKeyNotFound: true },
  );
  res
    .status(202)
    .json({ product_change: product_change as unknown as ProductChangeDTO });
}
