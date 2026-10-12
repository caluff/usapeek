import { randomUUID } from "node:crypto";
import { acquireLockStep, releaseLockStep } from "@medusajs/medusa/core-flows";
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { MedusaError } from "@medusajs/framework/utils";
import {
  productEditUpdateAttributesWorkflow,
  productEditUpdateProductWorkflow,
  productEditUpdateVariantsWorkflow,
  type ProductEditVariantOperation,
} from "@mercurjs/core/workflows";
import type {
  ProductAttributeBatchInput,
  ProductChangeDTO,
} from "@mercurjs/types";
import type { VendorUpdateProductType } from "@mercurjs/core/api/vendor/products/validators";
import { catalogPermissionLock } from "../lib/catalog-permission/read";
import {
  prepareCatalogPermissionStep,
  type CatalogPermissionActor,
} from "./catalog-permission-prepare";
import { confirmCompleteCatalogProductChangeWorkflow } from "./confirm-complete-catalog-product-change";

type Input = CatalogPermissionActor & { product_id: string } & (
    | { mode: "update"; body: VendorUpdateProductType }
    | {
        mode: "variant";
        body: Record<string, unknown>;
        variant_id?: string;
        operations: ProductEditVariantOperation[];
      }
    | { mode: "attributes"; body: ProductAttributeBatchInput }
  );

const selectCatalogProductChangeStep = createStep(
  "select-catalog-product-change",
  async (input: {
    productChange?: ProductChangeDTO;
    variantChange?: ProductChangeDTO;
    attributeChange?: ProductChangeDTO;
  }) => {
    const change =
      input.productChange ?? input.variantChange ?? input.attributeChange;
    if (!change) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "A product change is required.",
      );
    }
    return new StepResponse(change);
  },
);

export const catalogPermissionEditProductWorkflow = createWorkflow(
  "catalog-permission-edit-product",
  function (input: Input) {
    const lock = transform(input, ({ seller_id }) =>
      catalogPermissionLock(seller_id),
    );
    acquireLockStep(lock);
    const productLock = transform(input, ({ product_id }) => ({
      key: `catalog-product-edit:${product_id}`,
      ownerId: randomUUID(),
      timeout: 30,
      ttl: 120,
    }));
    acquireLockStep(productLock).config({
      name: "acquire-catalog-product-edit-lock",
    });
    const permission = prepareCatalogPermissionStep(input);
    const productChange = when(input, (input) => input.mode === "update").then(
      () =>
        productEditUpdateProductWorkflow.runAsStep({
          input: transform(input, (input) => {
            const { additional_data, ...update } =
              input.body as VendorUpdateProductType;
            return {
              product_id: input.product_id,
              created_by: input.seller_id,
              update,
              additional_data,
            };
          }),
        }),
    );
    const variantChange = when(input, (input) => input.mode === "variant").then(
      () =>
        productEditUpdateVariantsWorkflow.runAsStep({
          input: transform(input, (input) => {
            const variantInput = input as Extract<Input, { mode: "variant" }>;
            return {
              product_id: input.product_id,
              created_by: input.seller_id,
              operations: variantInput.operations,
            };
          }),
        }),
    );
    const attributeChange = when(
      input,
      (input) => input.mode === "attributes",
    ).then(() =>
      productEditUpdateAttributesWorkflow.runAsStep({
        input: transform(input, (input) => {
          const body = input.body as ProductAttributeBatchInput;
          return {
            product_id: input.product_id,
            created_by: input.seller_id,
            add: body.add,
            remove: body.remove,
            update: body.update,
          };
        }),
      }),
    );
    const change = selectCatalogProductChangeStep({
      productChange,
      variantChange,
      attributeChange,
    });
    when({ permission }, ({ permission }) => permission.authorized).then(() =>
      confirmCompleteCatalogProductChangeWorkflow.runAsStep({
        input: transform({ change, input }, ({ change, input }) => ({
          id: change.id,
          confirmed_by: input.seller_id,
          internal_note: "Cambio automático: tienda autorizada.",
        })),
      }),
    );
    releaseLockStep(productLock).config({
      name: "release-catalog-product-edit-lock",
    });
    releaseLockStep(lock);
    return new WorkflowResponse(
      transform({ change }, ({ change }) => ({ product_change_id: change.id })),
    );
  },
);
