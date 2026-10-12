import { acquireLockStep, releaseLockStep } from "@medusajs/medusa/core-flows";
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  when,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import {
  cancelProductChangeWorkflow,
} from "@mercurjs/core/workflows";
import type { AdditionalData } from "@medusajs/framework/types";
import { catalogProductEditLock } from "../lib/catalog/product-edit-lock";
import { confirmCompleteCatalogProductChangeWorkflow } from "./confirm-complete-catalog-product-change";

type Input = AdditionalData & {
  change_id: string;
  actor_id: string;
  mode: "confirm" | "cancel";
  internal_note?: string;
};

const resolveCatalogProductChangeStep = createStep(
  "resolve-catalog-product-change",
  async (input: Input, { container }) => {
    const { data } = await container
      .resolve(ContainerRegistrationKeys.QUERY)
      .graph(
        {
          entity: "product_change",
          fields: ["id", "product_id"],
          filters: { id: input.change_id },
        },
        { cache: { enable: false } },
      );
    if (!data[0]?.product_id)
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "Product change not found.",
      );
    return new StepResponse(data[0].product_id);
  },
);

export const resolveAdminCatalogProductChangeWorkflow = createWorkflow(
  "resolve-admin-catalog-product-change",
  function (input: Input) {
    const productId = resolveCatalogProductChangeStep(input);
    const lock = transform(productId, (productId) =>
      catalogProductEditLock(productId),
    );
    acquireLockStep(lock);
    when(input, ({ mode }) => mode === "confirm").then(() =>
      confirmCompleteCatalogProductChangeWorkflow.runAsStep({
        input: transform(input, (input) => ({
          id: input.change_id,
          confirmed_by: input.actor_id,
          internal_note: input.internal_note,
          additional_data: input.additional_data,
        })),
      }),
    );
    when(input, ({ mode }) => mode === "cancel").then(() =>
      cancelProductChangeWorkflow.runAsStep({
        input: transform(input, (input) => ({
          id: input.change_id,
          canceled_by: input.actor_id,
          additional_data: input.additional_data,
        })),
      }),
    );
    releaseLockStep(lock);
    return new WorkflowResponse({ id: input.change_id });
  },
);
