import { randomUUID } from "node:crypto";
import {
  acquireLockStep,
  releaseLockStep,
  useQueryGraphStep,
} from "@medusajs/medusa/core-flows";
import { updateOffersWorkflow } from "@mercurjs/core/workflows";
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";
import { MedusaError } from "@medusajs/framework/utils";
import {
  prepareConcurrentOfferPriceUpdate,
  type ConcurrentOfferPriceInput,
} from "../lib/catalog/offer-price-concurrency";

const prepareVendorOfferPriceUpdateStep = createStep(
  "prepare-vendor-offer-price-update",
  async ({ input, offers }: { input: ConcurrentOfferPriceInput; offers: unknown[] }) => {
    const offer = offers[0];
    if (!offer)
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        "La oferta no existe o ya no está disponible.",
      );
    return new StepResponse(
      prepareConcurrentOfferPriceUpdate(
        offer as Parameters<typeof prepareConcurrentOfferPriceUpdate>[0],
        input,
      ),
    );
  },
);

export const updateVendorOfferPriceWorkflow = createWorkflow(
  "update-vendor-offer-price",
  function (input: ConcurrentOfferPriceInput) {
    const lock = transform(input, ({ offer_id }) => ({
      key: `vendor-offer-price:${offer_id}`,
      ownerId: randomUUID(),
      timeout: 30,
      ttl: 120,
    }));
    acquireLockStep(lock);

    const { data: offers } = useQueryGraphStep({
      entity: "offer",
      fields: [
        "id",
        "seller_id",
        "sku",
        "shipping_profile_id",
        "prices.id",
        "prices.amount",
        "prices.currency_code",
        "prices.min_quantity",
        "prices.max_quantity",
        "prices.price_rules.attribute",
        "prices.price_rules.value",
      ],
      filters: { id: input.offer_id },
    }).config({ name: "get-vendor-offer-price-state" });

    const update = prepareVendorOfferPriceUpdateStep({ input, offers });
    updateOffersWorkflow.runAsStep({
      input: { offers: [update] },
    });
    const { data: updatedOffers } = useQueryGraphStep({
      entity: "offer",
      fields: ["id", "product_id"],
      filters: { id: input.offer_id },
    }).config({ name: "get-updated-vendor-offer" });
    releaseLockStep(lock);
    return new WorkflowResponse(updatedOffers[0]!);
  },
);
