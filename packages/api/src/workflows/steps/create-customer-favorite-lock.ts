import { randomUUID } from "node:crypto";
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk";

export const createCustomerFavoriteLockStep = createStep(
  "create-customer-favorite-lock",
  async ({ customer_id }: { customer_id: string }) => new StepResponse({
    key: `account-favorites:${customer_id}`,
    ownerId: randomUUID(),
  }),
);
