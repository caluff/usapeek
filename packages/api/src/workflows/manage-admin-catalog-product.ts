import {
  acquireLockStep,
  releaseLockStep,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows";
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { catalogProductEditLock } from "../lib/catalog/product-edit-lock";
import {
  prepareAdminCatalogManagementStep,
  type AdminCatalogManagementWorkflowInput,
} from "./steps/prepare-admin-catalog-management";

export const manageAdminCatalogProductWorkflow = createWorkflow(
  "manage-admin-catalog-product",
  function (input: AdminCatalogManagementWorkflowInput) {
    const lock = transform(input, ({ product_id }) =>
      catalogProductEditLock(product_id),
    );
    acquireLockStep(lock);
    const update = prepareAdminCatalogManagementStep(input);
    const products = updateProductsWorkflow.runAsStep({ input: update });
    releaseLockStep(lock);
    return new WorkflowResponse(
      transform({ products }, ({ products }) => ({ product: products[0] })),
    );
  },
);
