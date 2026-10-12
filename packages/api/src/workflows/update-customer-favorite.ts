import {
  acquireLockStep,
  releaseLockStep,
  updateCustomersWorkflow,
  useQueryGraphStep,
} from "@medusajs/core-flows";
import { createWorkflow, WorkflowResponse } from "@medusajs/framework/workflows-sdk";
import { createCustomerFavoriteLockStep } from "./steps/create-customer-favorite-lock";
import { prepareCustomerFavoriteStep } from "./steps/prepare-customer-favorite";

type UpdateCustomerFavoriteInput = {
  customer_id: string;
  product_id: string;
  saved: boolean;
};

export const updateCustomerFavoriteWorkflow = createWorkflow(
  "update-customer-favorite",
  function (input: UpdateCustomerFavoriteInput) {
    const lock = createCustomerFavoriteLockStep({ customer_id: input.customer_id });
    acquireLockStep({ key: lock.key, ownerId: lock.ownerId, timeout: 10, ttl: 60 });

    const { data: customers } = useQueryGraphStep({
      entity: "customer",
      fields: ["id", "metadata"],
      filters: { id: input.customer_id },
    });
    const { data: products } = useQueryGraphStep({
      entity: "product",
      fields: ["id", "status"],
      filters: { id: input.product_id, status: "published" },
    }).config({ name: "get-favorite-product" });

    const update = prepareCustomerFavoriteStep({
      customer_id: input.customer_id,
      product_id: input.product_id,
      saved: input.saved,
      customers,
      products,
    });
    updateCustomersWorkflow.runAsStep({ input: update });
    releaseLockStep({ key: lock.key, ownerId: lock.ownerId });

    return new WorkflowResponse({ customer_id: input.customer_id });
  },
);
