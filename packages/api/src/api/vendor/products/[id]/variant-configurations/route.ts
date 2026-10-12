import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import type { ProductChangeDTO } from "@mercurjs/types";
import type { CreateCompleteVariant } from "../../../../../lib/catalog/create-complete-variant";
import { createCompleteVariantWorkflow } from "../../../../../workflows/create-complete-variant";

export async function POST(
  req: AuthenticatedMedusaRequest<CreateCompleteVariant>,
  res: MedusaResponse<{ product_change: ProductChangeDTO }>,
) {
  const { result } = await createCompleteVariantWorkflow(req.scope).run({
    input: {
      seller_id: req.seller_context?.seller_id || "",
      member_id: req.auth_context.actor_id,
      product_id: req.params.id,
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
