import type {
  MedusaStoreRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import { ALGOLIA_MODULE } from "../../../../modules/algolia";
import { searchAlgoliaProductsWorkflow } from "../../../../workflows/algolia/search-products";
import type { StoreSearchProductsQuery } from "./validators";
import type { StoreSearchProductsResponse } from "./contracts";

export async function POST(
  req: MedusaStoreRequest<StoreSearchProductsQuery>,
  res: MedusaResponse<StoreSearchProductsResponse | { message: string }>,
) {
  if (!req.scope.hasRegistration(ALGOLIA_MODULE)) {
    res.status(503).json({ message: "Product search is not configured yet." });
    return;
  }
  const { result } = await searchAlgoliaProductsWorkflow(req.scope).run({
    input: {
      ...req.validatedBody,
      sales_channel_ids: req.publishable_key_context?.sales_channel_ids ?? [],
    },
  });
  res.json(result);
}
