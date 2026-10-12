import { acquireLockStep, releaseLockStep } from "@medusajs/medusa/core-flows";
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { productEditDeleteProductWorkflow } from "@mercurjs/core/workflows";
import { catalogProductEditLock } from "../lib/catalog/product-edit-lock";

type Input = { product_id: string; created_by: string };

export const stageLockedVendorProductDeletionWorkflow = createWorkflow(
  "stage-locked-vendor-product-deletion",
  function (input: Input) {
    const lock = transform(input, ({ product_id }) =>
      catalogProductEditLock(product_id),
    );
    acquireLockStep(lock);
    const change = productEditDeleteProductWorkflow.runAsStep({ input });
    releaseLockStep(lock);
    return new WorkflowResponse(change);
  },
);
