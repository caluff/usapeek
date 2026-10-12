import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { acquireLockStep, releaseLockStep } from "@medusajs/medusa/core-flows";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import {
  confirmProductChangeWorkflow,
  productEditDeleteProductWorkflow,
  productEditUpdateProductWorkflow,
} from "@mercurjs/core/workflows";
import { ProductChangeStatus, ProductStatus } from "@mercurjs/types";
import { requireVendorAccess } from "../lib/vendor-onboarding/access";
import { catalogPermissionLock } from "../lib/catalog-permission/read";
import { catalogProductEditLock } from "../lib/catalog/product-edit-lock";
import {
  assertProductLifecycleOperation,
  readProductLifecycleState,
} from "../lib/catalog/product-lifecycle";
import type { ProductLifecycleOperation } from "../lib/catalog-management/contracts";
import { archiveProductOffersWorkflow } from "./archive-product-offers";

type Input = {
  seller_id: string;
  member_id: string;
  product_id: string;
  operation: ProductLifecycleOperation;
};
const prepareProductLifecycleStep = createStep(
  "prepare-product-lifecycle",
  async (input: Input, { container }) => {
    await requireVendorAccess(container, input.member_id, input.seller_id);
    const state = await readProductLifecycleState(
      container,
      input.seller_id,
      input.product_id,
    );
    assertProductLifecycleOperation(state, input.operation);
    return new StepResponse(state);
  },
);
const selectProductLifecycleChangeStep = createStep(
  "select-product-lifecycle-change",
  async (input: { archive?: { id: string }; visibility?: { id: string } }) => {
    return new StepResponse((input.archive ?? input.visibility)!.id);
  },
);
const readProductLifecycleChangeStep = createStep(
  "read-product-lifecycle-change",
  async (
    input: { id: string; operation: ProductLifecycleOperation },
    { container },
  ) => {
    const { data: changes } = await container
      .resolve(ContainerRegistrationKeys.QUERY)
      .graph(
        {
          entity: "product_change",
          fields: ["id", "status"],
          filters: { id: input.id },
        },
        { cache: { enable: false }, throwIfKeyNotFound: true },
      );
    return new StepResponse({
      operation: input.operation,
      product_change_id: input.id,
      applied: changes[0]?.status === ProductChangeStatus.CONFIRMED,
    });
  },
);

export const productLifecycleWorkflow = createWorkflow(
  "product-lifecycle",
  function (input: Input) {
    const permissionLock = transform(input, ({ seller_id }) =>
      catalogPermissionLock(seller_id),
    );
    acquireLockStep(permissionLock);
    const productLock = transform(input, ({ product_id }) =>
      catalogProductEditLock(product_id),
    );
    acquireLockStep(productLock).config({
      name: "acquire-product-lifecycle-lock",
    });
    const state = prepareProductLifecycleStep(input);
    const archive = when(
      input,
      ({ operation }) => operation === "archive",
    ).then(() =>
      productEditDeleteProductWorkflow.runAsStep({
        input: transform(input, ({ product_id, seller_id }) => ({
          product_id,
          created_by: seller_id,
        })),
      }),
    );
    const visibility = when(
      input,
      ({ operation }) => operation !== "archive",
    ).then(() =>
      productEditUpdateProductWorkflow.runAsStep({
        input: transform(input, ({ product_id, seller_id, operation }) => ({
          product_id,
          created_by: seller_id,
          update: {
            status:
              operation === "activate"
                ? ProductStatus.PUBLISHED
                : ProductStatus.DRAFT,
          },
        })),
      }),
    );
    const id = selectProductLifecycleChangeStep({ archive, visibility });
    const staged = readProductLifecycleChangeStep({
      id,
      operation: input.operation,
    });
    when(
      { state, staged },
      ({ state, staged }) => !state.requires_review && !staged.applied,
    ).then(() => {
      // Draft deletion is already confirmed by Mercur. Other authorized changes
      // retain the same native confirmation pipeline as product edits.
      confirmProductChangeWorkflow.runAsStep({
        input: transform({ id, input }, ({ id, input }) => ({
          ids: [id],
          confirmed_by: input.seller_id,
          internal_note: "Cambio automático: tienda autorizada.",
        })),
      });
    });
    const result = readProductLifecycleChangeStep({
      id,
      operation: input.operation,
    }).config({ name: "read-final-product-lifecycle-change" });
    when(
      { input, result },
      ({ input, result }) => input.operation === "archive" && result.applied,
    ).then(() =>
      archiveProductOffersWorkflow.runAsStep({
        input: { product_id: input.product_id },
      }),
    );
    releaseLockStep(productLock).config({
      name: "release-product-lifecycle-lock",
    });
    releaseLockStep(permissionLock);
    return new WorkflowResponse(result);
  },
);
