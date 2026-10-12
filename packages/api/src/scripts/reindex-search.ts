import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils";
import { ALGOLIA_MODULE } from "../modules/algolia";
import { syncAlgoliaProductsWorkflow } from "../workflows/algolia/sync-products";

export default async function reindexSearch({ container }: ExecArgs) {
  if (!container.hasRegistration(ALGOLIA_MODULE))
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Configure ALGOLIA_APP_ID, ALGOLIA_API_KEY and ALGOLIA_PRODUCT_INDEX before indexing.",
    );
  const { result } = await syncAlgoliaProductsWorkflow(container).run({
    input: { configure: true },
  });
  container
    .resolve(ContainerRegistrationKeys.LOGGER)
    .info(`Algolia: indexed ${result.indexed} products.`);
}
