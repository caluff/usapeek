import {
  createOffersWorkflow,
  updateOffersWorkflow,
  batchOfferInventoryItemsWorkflow,
} from "@mercurjs/core/workflows";
import {
  validateOfferCreation,
  validateOfferUpdates,
  validateOfferInventory,
} from "../../lib/catalog/offer-validation";

// Native single and batch routes execute these same workflows.
createOffersWorkflow.hooks.validate(async ({ input }, { container }) => {
  await validateOfferCreation(container, input.offers);
});
updateOffersWorkflow.hooks.validate(async ({ input }, { container }) => {
  await validateOfferUpdates(container, input.offers);
});
batchOfferInventoryItemsWorkflow.hooks.validate(
  async ({ input }, { container }) => {
    await validateOfferInventory(container, input);
  },
);
