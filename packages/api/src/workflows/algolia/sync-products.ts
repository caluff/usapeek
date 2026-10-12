import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  createStep,
  createWorkflow,
  StepResponse,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { ALGOLIA_MODULE } from "../../modules/algolia";
import type AlgoliaModuleService from "../../modules/algolia/service";
import { projectSearchProducts } from "./product-projection";

export type SyncSearchProductsInput = { ids?: string[]; configure?: boolean };

export const syncAlgoliaProductsStep = createStep(
  "sync-algolia-products",
  async (input: SyncSearchProductsInput, { container }) => {
    if (!container.hasRegistration(ALGOLIA_MODULE))
      return new StepResponse({ indexed: 0, configured: false });
    const algolia = container.resolve<AlgoliaModuleService>(ALGOLIA_MODULE);
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    // Shared Redis locking prevents a delayed incremental event overwriting a newer
    // full snapshot. The projection is idempotent and can be rebuilt after failure.
    const result = await container.resolve(Modules.LOCKING).execute(
      `algolia:${algolia.indexName()}`,
      async () => {
        if (input.configure) await algolia.configure();
        let indexed = 0;
        if (input.ids) {
          const ids = [...new Set(input.ids)];
          for (let start = 0; start < ids.length; start += 100) {
            const batch = ids.slice(start, start + 100);
            const products = await projectSearchProducts(container, batch);
            const retained = new Set(
              products.map((product) => product.objectID),
            );
            await algolia.batch(products, []);
            await algolia.reconcile(retained, batch);
            indexed += new Set(products.map((product) => product.id)).size;
          }
        } else {
          const validIds = new Set<string>();
          let offset = 0;
          while (true) {
            const { data: products } = await query.graph({
              entity: "product",
              fields: ["id"],
              filters: { status: "published" },
              pagination: { skip: offset, take: 100, order: { id: "ASC" } },
            });
            if (!products.length) break;
            const records = await projectSearchProducts(
              container,
              products.map((product) => product.id),
            );
            await algolia.batch(records, []);
            records.forEach((record) => validIds.add(record.objectID));
            indexed += new Set(records.map((record) => record.id)).size;
            offset += products.length;
          }
          // Also removes hard-deleted products absent from the database, unlike a
          // status-only sweep of the product table in the original registry block.
          await algolia.reconcile(validIds);
        }
        return { indexed, configured: Boolean(input.configure) };
      },
      { timeout: 600 },
    );
    return new StepResponse(result);
  },
);

export const syncAlgoliaProductsWorkflow = createWorkflow(
  "sync-algolia-products",
  function (input: SyncSearchProductsInput) {
    return new WorkflowResponse(syncAlgoliaProductsStep(input));
  },
);
