import type { MedusaContainer } from "@medusajs/framework/types";
import { ALGOLIA_MODULE } from "../modules/algolia";
import { syncAlgoliaProductsWorkflow } from "../workflows/algolia/sync-products";

export default async function reconcileSearch(container: MedusaContainer) {
  if (!container.hasRegistration(ALGOLIA_MODULE)) return;
  // Scheduled public price lists / seller closures may change eligibility
  // without emitting a mutation event at their start or end time.
  await syncAlgoliaProductsWorkflow(container).run({ input: {} });
}

export const config = {
  name: "reconcile-algolia-search",
  schedule: "*/15 * * * *",
};
