import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { randomUUID } from "node:crypto";
import {
  acquireLockStep,
  releaseLockStep,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows";
import { deleteOffersWorkflow } from "@mercurjs/core/workflows";

export const archiveProductOffersWorkflow = createWorkflow(
  "archive-product-offers",
  function (input: { product_id: string }) {
    const lock = transform(input, ({ product_id }) => ({
      key: `archive-product-offers:${product_id}`,
      ownerId: randomUUID(),
      timeout: 30,
      ttl: 120,
      executeOnSubWorkflow: true,
    }));
    acquireLockStep(lock);
    const { data: offers } = useQueryGraphStep({
      entity: "offer",
      fields: ["id"],
      filters: { product_id: input.product_id },
      options: { cache: { enable: false } },
    });
    deleteOffersWorkflow.runAsStep({
      input: transform({ offers }, ({ offers }) => ({
        ids: offers.map(({ id }) => id),
      })),
    });
    releaseLockStep(lock);
    return new WorkflowResponse({ success: true });
  },
);
