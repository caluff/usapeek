import { randomUUID } from "node:crypto";
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { acquireLockStep, releaseLockStep } from "@medusajs/medusa/core-flows";
import { updateSellersWorkflow } from "@mercurjs/core/workflows";
import {
  ContainerRegistrationKeys,
  MedusaError,
} from "@medusajs/framework/utils";
import { PAUSED_PRODUCTS_KEY, pausedProducts } from "../lib/catalog/sale-pause";

type Input = { seller_id: string; product_id: string; paused: boolean };
const prepareProductSaleStatusStep = createStep(
  "prepare-product-sale-status",
  async (input: Input, { container }) => {
    if (!input.seller_id)
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Seller required.");
    const query = container.resolve(ContainerRegistrationKeys.QUERY);
    const [{ data: sellers }, { data: offers }] = await Promise.all([
      query.graph(
        {
          entity: "seller",
          fields: ["id", "status", "metadata"],
          filters: { id: input.seller_id },
        },
        { cache: { enable: false } },
      ),
      query.graph(
        {
          entity: "offer",
          fields: ["id"],
          filters: { seller_id: input.seller_id, product_id: input.product_id },
          pagination: { take: 1 },
        },
        { cache: { enable: false } },
      ),
    ]);
    const seller = sellers[0];
    if (seller?.status !== "open" || !offers.length)
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Configura este producto en tu tienda antes de cambiar su venta.",
      );
    const ids = new Set(pausedProducts(seller.metadata));
    if (input.paused) ids.add(input.product_id);
    else ids.delete(input.product_id);
    return new StepResponse({
      selector: { id: input.seller_id },
      update: {
        metadata: { ...seller.metadata, [PAUSED_PRODUCTS_KEY]: [...ids] },
      },
    });
  },
);
export const setProductSaleStatusWorkflow = createWorkflow(
  "set-product-sale-status",
  function (input: Input) {
    const lock = transform(input, ({ seller_id }) => ({
      key: `seller-sale-status:${seller_id}`,
      ownerId: randomUUID(),
      ttl: 60,
      timeout: 10,
    }));
    acquireLockStep(lock);
    const update = prepareProductSaleStatusStep(input);
    updateSellersWorkflow.runAsStep({ input: update });
    releaseLockStep(lock);
    return new WorkflowResponse({ success: true });
  },
);
